import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createProject, update, prepareTurn, applyTurn } from '../public/state.mjs';
import { LANGUAGES, setLocale, t, getLocale } from '../public/i18n.mjs';
import { firstTurnText } from '../public/first-turn-i18n.mjs';

// Exercise the actual turn handler with its UI shell stubbed; state transitions stay real.
const source = await readFile(new URL('../public/app.mjs', import.meta.url), 'utf8');
const handler = source.match(
  /async function turn\([\s\S]*?\r?\n\}(?=\r?\nasync function demo)/,
)?.[0];
assert.ok(handler, 'The real turn handler must remain available for the notice regression test.');
const run = new Function(
  'prepareTurn',
  'applyTurn',
  'initialState',
  'response',
  'action',
  'firstTurnText',
  'getLocale',
  `
  const navigator = {};
  let state = initialState;
  const ui = { busy:false, mode:'live', noticeRaw:true, notice:'', error:false };
  const saved = [];
  function save() { saved.push(structuredClone(state)); }
  function render() {}
  function startTour() { throw new Error('Fixture should already have seen the tutorial.'); }
  function notice(message) { ui.notice = message; }
  async function api() { return structuredClone(response); }
  ${handler}
  return turn(action).then(() => ({ ui, state, saved }));
`,
);

function project() {
  let state = update(createProject(), 'brief/text', { text: 'Create six original images.' });
  state = update(state, 'brief/review', {
    summary: 'Create six images.',
    requirements: [
      { id: 'r1', text: 'Create six original images.', quote: 'Create six original images.' },
    ],
    uncertainties: [],
  });
  state = update(state, 'brief/confirm');
  state = update(state, 'entry/select', { kind: 'none' });
  state = update(state, 'draft/set', {
    field: 'answer',
    value: 'I notice how sunlight moves across my desk.',
  });
  state.tutorialSeen = true;
  state.round = 1;
  state.question = { id: 'existing-question', text: 'What have you noticed?', options: [] };
  state.review.ready = true;
  return state;
}

test('turn notices keep internal memory in saved state without displaying it, across exploration and direction outcomes', async () => {
  const internal = 'brief.confirmed=true; currentState.review.ready=false; internal-only-marker';
  const base = {
    question: { id: 'q1', text: 'Which change in the light stood out?', options: [] },
    clues: [],
    ready: false,
    readinessReason: 'A little more detail will help.',
    issues: [],
    directions: [],
    memoryNote: internal,
  };
  const directions = ['d1', 'd2'].map((id) => ({
    id,
    title: 'Direction ' + id,
    priority: 'Personal interest',
    summary: 'A short visual sequence.',
    fit: 'Uses your own images.',
    tradeoff: 'Needs careful image selection.',
    sourceIds: [],
    requirementIds: ['r1'],
  }));
  const cases = [
    ['explore', base, 'Your response is kept. The next question is ready.'],
    ['directions', base, 'One more thing needs clarifying before comparing directions.'],
    [
      'directions',
      { ...base, ready: true, question: null, directions },
      'Your latest words are included in these directions.',
    ],
  ];
  try {
    for (const [action, response, expected] of cases) {
      const result = await run(
        prepareTurn,
        applyTurn,
        project(),
        response,
        action,
        firstTurnText,
        getLocale,
      );
      assert.equal(result.ui.error, false);
      assert.equal(result.ui.notice, expected);
      assert.equal(
        result.ui.noticeRaw,
        false,
        'Stable notices must follow the selected interface language.',
      );
      assert.doesNotMatch(result.ui.notice, /brief\.confirmed|currentState|internal-only-marker/);
      assert.equal(result.state.events.at(-1).payload.memoryNote, internal);
      assert.equal(
        result.saved.at(-1).events.at(-1).payload.memoryNote,
        internal,
        'The internal record must still survive saving.',
      );
      for (const { code } of LANGUAGES) {
        setLocale(code);
        assert.ok(t(result.ui.notice));
        if (code !== 'en')
          assert.notEqual(
            t(result.ui.notice),
            result.ui.notice,
            code + ': notice should be translated',
          );
      }
    }
  } finally {
    setLocale('en');
  }
});
