import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewBrief, runTurn, answerQuestion } from '../lib/provider.mjs';
import { PREVIEW_LOCALES } from '../public/preview-locales.mjs';
import { createProject, update, prepareTurn, applyTurn, DEMO_BRIEF } from '../public/state.mjs';

function fakeProvider(results, calls = []) {
  return {
    apiKey: 'test-only-placeholder',
    fetchImpl: async (_url, options) => {
      calls.push(JSON.parse(options.body));
      assert.ok(results.length, 'No additional model request expected');
      return new Response(
        JSON.stringify({
          status: 'completed',
          output: [
            {
              type: 'message',
              role: 'assistant',
              status: 'completed',
              content: [{ type: 'output_text', text: JSON.stringify(results.shift()) }],
            },
          ],
        }),
      );
    },
  };
}

async function readyRequest() {
  let state = update(createProject(), 'brief/text', { text: DEMO_BRIEF });
  state = update(state, 'brief/review', await reviewBrief({ mode: 'preview', text: DEMO_BRIEF }));
  state = update(state, 'brief/confirm');
  state = update(state, 'entry/select', {
    kind: 'rough',
    idea: 'Watch the changing morning light on my desk.',
  });
  state = update(state, 'thought/add', { text: 'I notice a cup moving around my desk.' });
  state = update(state, 'draft/set', {
    field: 'answer',
    value: 'I have one week and a phone for photographs.',
  });
  return prepareTurn(state, 'directions');
}

test('brief extraction preserves decision-critical and advisory uncertainty metadata', async () => {
  const response = {
    summary: 'A six-image assignment.',
    requirements: [
      {
        id: 'r1',
        text: 'Make six images.',
        quote: 'Make six images.',
        category: 'requirements',
        label: 'Image count',
      },
    ],
    uncertainties: [
      { text: 'Are illustrations allowed?', decisive: true },
      { text: 'Is a title recommended?', decisive: false },
    ],
  };
  const result = await reviewBrief(
    { mode: 'live', text: 'Make six images.' },
    fakeProvider([response]),
  );
  assert.deepEqual(result.uncertainties, response.uncertainties);
});

test('an unresolved decisive uncertainty withholds an otherwise-ready preview and live response', async () => {
  const prepared = await readyRequest();
  const candidate = await runTurn({ mode: 'preview', ...prepared.request });
  assert.equal(candidate.ready, true);
  prepared.state.brief.uncertainties = [
    {
      id: 'u1',
      text: 'Are illustrations allowed?',
      status: 'unresolved',
      decisive: true,
      resolution: '',
    },
  ];
  prepared.request.state = prepared.state;
  const original = JSON.stringify(prepared.state);
  for (const mode of ['preview', 'live']) {
    const calls = [];
    const result = await runTurn(
      { mode, ...prepared.request },
      fakeProvider(
        [
          candidate,
          {
            accepted: true,
            purpose: 'Resolve decisive uncertainty',
            problems: [],
            replacement: null,
          },
        ],
        calls,
      ),
    );
    assert.equal(result.ready, false);
    assert.deepEqual(result.directions, []);
    assert.equal(result.question.text, 'Are illustrations allowed?');
    assert.equal(result.issues.at(-1).quote, '');
    assert.equal(result.issues.at(-1).requirementId, null);
    assert.equal(
      calls.length,
      mode === 'live' ? 2 : 0,
      'No direction-review calls for withheld directions',
    );
  }
  assert.equal(JSON.stringify(prepared.state), original);
});

test('resolved, dismissed, and advisory uncertainties allow an otherwise-ready response', async () => {
  for (const [status, decisive] of [
    ['resolved', true],
    ['dismissed', true],
    ['unresolved', false],
  ]) {
    const prepared = await readyRequest();
    prepared.request.state.brief.uncertainties = [
      {
        id: 'u1',
        text: 'Is a title suggested?',
        status,
        decisive,
        resolution: status === 'resolved' ? 'A title is optional.' : '',
      },
    ];
    const result = await runTurn({ mode: 'preview', ...prepared.request });
    assert.equal(result.ready, true, `${status}/${decisive}`);
    assert.equal(result.directions.length, 3);
  }
});

test('direction Q&A receives only its own saved thread without promoting hypothetical questions into facts', async () => {
  const prepared = await readyRequest();
  const result = await runTurn({ mode: 'preview', ...prepared.request });
  const state = applyTurn(prepared.state, result, prepared.request.revision, 'directions');
  const directionId = state.directions[0].id;
  state.directionSetId = 'current-set';
  state.directionQuestions = [
    {
      id: 'qa1',
      directionSetId: 'current-set',
      directionId,
      question: 'What if I had only one day?',
      answer: 'Reduce the scope.',
      appliedInputId: null,
    },
    {
      id: 'qa2',
      directionSetId: 'current-set',
      directionId: state.directions[1].id,
      question: 'Is this a good portfolio piece?',
      answer: 'It depends.',
      appliedInputId: null,
    },
  ];
  const original = JSON.stringify(state);
  const calls = [];
  await answerQuestion(
    { mode: 'live', state, directionId, question: 'How would that affect the images?' },
    fakeProvider([{ answer: 'Keep one familiar location.' }], calls),
  );
  const payload = JSON.parse(calls[0].input[0].content[0].text);
  assert.deepEqual(payload.previousQuestions, [
    {
      question: 'What if I had only one day?',
      answer: 'Reduce the scope.',
      appliedToExploration: false,
    },
  ]);
  assert.ok(
    !payload.context.currentState.inputs.some(
      (item) => item.text === 'What if I had only one day?',
    ),
  );
  assert.equal(payload.studentQuestion, 'How would that affect the images?');
  assert.equal(JSON.stringify(state), original, 'Answering must not mutate project facts');
  const preview = await answerQuestion({
    mode: 'preview',
    state,
    directionId,
    question: 'What if I had only one day?',
  });
  assert.ok(preview.answer.includes(PREVIEW_LOCALES.en.schedules[0]));
  assert.ok(
    !preview.answer.includes(PREVIEW_LOCALES.en.schedules[1]),
    'A hypothetical must not change preview resource facts',
  );
});

test('reused direction IDs do not pull Q&A from earlier direction sets or unscoped legacy records', async () => {
  const prepared = await readyRequest();
  const result = await runTurn({ mode: 'preview', ...prepared.request });
  const state = applyTurn(prepared.state, result, prepared.request.revision, 'directions');
  state.directionSetId = 'new-set';
  const directionId = state.directions[0].id;
  state.directionQuestions = [
    {
      id: 'old',
      directionSetId: 'old-set',
      directionId,
      question: 'How could I animate the old concept?',
      answer: 'Use animation software.',
    },
    {
      id: 'legacy',
      directionId,
      question: 'Can I reuse my old sculpture?',
      answer: 'Ask the teacher.',
    },
    {
      id: 'current',
      directionSetId: 'new-set',
      directionId,
      question: 'Does this use still photographs?',
      answer: 'Yes, original still photographs.',
      appliedInputId: null,
    },
  ];
  const calls = [];
  await answerQuestion(
    { mode: 'live', state, directionId, question: 'What material should I use?' },
    fakeProvider([{ answer: 'Use your own photographs.' }], calls),
  );
  const payload = JSON.parse(calls[0].input[0].content[0].text);
  assert.deepEqual(payload.previousQuestions, [
    {
      question: 'Does this use still photographs?',
      answer: 'Yes, original still photographs.',
      appliedToExploration: false,
    },
  ]);
  assert.ok(!JSON.stringify(payload).includes('How could I animate the old concept?'));
  assert.ok(!JSON.stringify(payload).includes('Can I reuse my old sculpture?'));
});

test('student-supplied requirement provenance and custom priorities reach generation unchanged', async () => {
  const prepared = await readyRequest();
  prepared.request.state.preferences = ['Portfolio development', '学习一种新媒介'];
  prepared.request.state.brief.requirements.push({
    id: 'teacher-extra',
    text: 'Use only black and white.',
    quote: '老师说只能使用黑白。',
    sourceType: 'student',
    category: 'requirements',
    label: 'Color palette',
  });
  const calls = [];
  const response = {
    question: { id: 'q1', text: 'Which everyday object interests you?', options: [] },
    clues: [],
    ready: false,
    readinessReason: 'Explore the subject.',
    issues: [],
    directions: [],
    memoryNote: '',
  };
  await runTurn(
    { mode: 'live', ...prepared.request, action: 'explore' },
    fakeProvider(
      [response, { accepted: true, purpose: 'Explore interests', problems: [], replacement: null }],
      calls,
    ),
  );
  const context = JSON.parse(calls[0].input[0].content[0].text).context.currentState;
  assert.deepEqual(context.preferences, prepared.request.state.preferences);
  assert.deepEqual(
    context.brief.requirements.at(-1),
    prepared.request.state.brief.requirements.at(-1),
  );
});

test('a connection receives one concise question, then its answer advances exploration in every locale', async () => {
  for (const [code, locale] of Object.entries(PREVIEW_LOCALES)) {
    const prepared = await readyRequest();
    let state = prepared.state;
    state = update(state, 'thought/add', {
      text: 'A very long observation about everyday routines, sunlight, movement, and personal objects on the desk.',
    });
    const [a, b] = state.clues;
    state = update(state, 'clue/connect', { a: a.id, b: b.id });
    const first = prepareTurn(state);
    const response = await runTurn({ mode: 'preview', ...first.request, language: { code } });
    assert.equal(response.question.text, locale.connect);
    assert.ok(response.question.text.length < 90, code + ' connection question stays compact');
    state = applyTurn(first.state, response, first.request.revision);
    state = update(state, 'draft/set', {
      field: 'answer',
      value: 'They share a familiar place, and I could show its small changes.',
    });
    const next = prepareTurn(state);
    const advanced = await runTurn({ mode: 'preview', ...next.request, language: { code } });
    assert.notEqual(
      advanced.question.text,
      locale.connect,
      code + ' answers must move beyond the connection question',
    );
    assert.equal(next.state.links.length, 0, 'Completed combination clears');
    assert.equal(next.state.combinationHistory.length, 1, 'History preserves the exploration');
  }
});

test('a focus question is consumed by the next response, while explicitly focusing again reopens it', async () => {
  let { state } = await readyRequest();
  const id = state.clues[0].id;
  state = update(state, 'clue/focus', { id });
  let prepared = prepareTurn(state);
  const first = await runTurn({ mode: 'preview', ...prepared.request });
  assert.ok(first.question.text.includes(state.clues[0].title.slice(0, 30)));
  state = applyTurn(prepared.state, first, prepared.request.revision);
  state = update(state, 'draft/set', {
    field: 'answer',
    value: 'A before-and-after view would reveal the change.',
  });
  prepared = prepareTurn(state);
  const next = await runTurn({ mode: 'preview', ...prepared.request });
  assert.notEqual(next.question.text, first.question.text);
  state = applyTurn(prepared.state, next, prepared.request.revision);
  state = update(state, 'clue/focus', { id });
  prepared = prepareTurn(state);
  const refocused = await runTurn({ mode: 'preview', ...prepared.request });
  assert.equal(refocused.question.text, first.question.text);
});

test('revisiting an old direction neither becomes a student clue nor overwrites current resource facts', async () => {
  const prepared = await readyRequest();
  const state = prepared.request.state;
  state.inputs.push({
    id: 'current-time',
    type: 'answer',
    text: 'I now have only one day and no camera.',
  });
  state.inputs.push({
    id: 'history-request',
    type: 'direction-revisit',
    text: 'Revisit this previous direction: An old idea. Take phone photographs with a full week available.',
  });
  const response = await runTurn({ mode: 'preview', ...prepared.request });
  assert.ok(response.clues.every((clue) => !clue.sourceIds.includes('history-request')));
  assert.equal(response.directions.length, 3);
  for (const direction of response.directions) {
    assert.ok(direction.summary.includes(PREVIEW_LOCALES.en.schedules[1]));
    assert.ok(direction.summary.includes(PREVIEW_LOCALES.en.materials[1]));
    assert.ok(!direction.sourceIds.includes('history-request'));
  }
});
