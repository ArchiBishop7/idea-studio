import test from 'node:test';
import assert from 'node:assert/strict';
import { runTurn } from '../lib/provider.mjs';
import { createProject, update, prepareTurn } from '../public/state.mjs';
function project() {
  let s = update(createProject(), 'brief/text', {
    text: 'Write a short essay about a topic of your choice.',
  });
  s = update(s, 'brief/review', {
    summary: 'Essay',
    requirements: [{ id: 'r1', text: s.brief.text, quote: s.brief.text }],
    uncertainties: [],
  });
  s = update(s, 'brief/confirm');
  s = update(s, 'entry/select', { kind: 'none' });
  return prepareTurn(s, 'explore').request;
}
const bad = {
  question: { id: 'q1', text: 'What difficulty is easy for you?', options: ['People', 'Objects'] },
  clues: [],
  ready: false,
  readinessReason: 'Explore interests',
  issues: [],
  directions: [],
  memoryNote: '',
};
const fixed = {
  id: 'replacement',
  text: 'Which of these makes you curious?',
  options: ['A rule that seems unfair', 'An everyday habit that changed'],
};
const pass = {
  accepted: true,
  purpose: 'Elicit a concrete reaction',
  problems: [],
  replacement: null,
};
function config(results, seen = []) {
  return {
    apiKey: 'test',
    fetchImpl: async (_, options) => {
      seen.push(JSON.parse(options.body));
      assert.ok(results.length);
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
test('misaligned question is repaired then independently rechecked before display', async () => {
  const seen = [];
  const result = await runTurn(
    { mode: 'live', ...project() },
    config(
      [
        bad,
        {
          accepted: false,
          purpose: 'unclear',
          problems: ['Subject categories do not answer difficulty'],
          replacement: fixed,
        },
        pass,
      ],
      seen,
    ),
  );
  assert.equal(seen.length, 3);
  assert.equal(result.question.text, fixed.text);
  assert.deepEqual(result.question.options, fixed.options);
  assert.equal(result.question.id, 'q1');
  assert.deepEqual(result.clues, []);
  assert.match(seen[1].instructions, /recent exploration history/);
  assert.match(seen[2].input[0].content[0].text, /Which of these makes you curious/);
});
test('repeated reviewer rejection never displays the rejected question', async () => {
  await assert.rejects(
    runTurn(
      { mode: 'live', ...project() },
      config([
        bad,
        { accepted: false, purpose: 'unclear', problems: ['Mismatch'], replacement: fixed },
        { ...pass, accepted: false, problems: ['Still unsuitable'] },
      ]),
    ),
    (e) => e.code === 'question_quality',
  );
});
test('reviewer receives prior unanswered questions and rejects repeated production probing by policy', async () => {
  const req = project();
  req.state.inputs.push(
    { id: 'i1', type: 'answer', text: 'Not sure', questionText: 'Which production method?' },
    { id: 'i2', type: 'answer', text: 'None fit', questionText: 'Which complexity?' },
  );
  const seen = [];
  await runTurn({ mode: 'live', ...req }, config([{ ...bad, question: fixed }, pass], seen));
  const context = JSON.parse(seen[1].input[0].content[0].text).context;
  assert.equal(context.currentState.inputs.at(-1).text, 'None fit');
  assert.match(seen[1].instructions, /medium plus subject/);
  assert.match(seen[1].instructions, /not detailed execution/);
});
