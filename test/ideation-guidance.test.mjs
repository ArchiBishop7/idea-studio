import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewBrief, runTurn, answerQuestion } from '../lib/provider.mjs';
import { createProject, update, prepareTurn, applyTurn, DEMO_BRIEF } from '../public/state.mjs';

async function fixture() {
  let state = update(createProject(), 'brief/text', { text: DEMO_BRIEF });
  state = update(state, 'brief/review', await reviewBrief({ mode: 'preview', text: DEMO_BRIEF }));
  state = update(update(state, 'brief/confirm'), 'entry/select', {
    kind: 'rough',
    idea: 'Show how morning light changes an ordinary cup on my desk.',
  });
  const prepared = prepareTurn(
    update(state, 'draft/set', {
      field: 'answer',
      value: 'I have one week and a phone for photographs.',
    }),
    'directions',
  );
  const candidate = await runTurn({ mode: 'preview', ...prepared.request });
  return {
    prepared,
    candidate,
    shown: applyTurn(prepared.state, candidate, prepared.request.revision, 'directions'),
  };
}
function mocked(results, prompts) {
  return {
    apiKey: 'test-placeholder',
    fetchImpl: async (_url, options) => {
      prompts.push(JSON.parse(options.body).instructions);
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

test('generation and independent review both require useful student priorities', async () => {
  const { prepared, candidate } = await fixture();
  const prompts = [];
  await runTurn(
    { mode: 'live', ...prepared.request },
    mocked(
      [
        candidate,
        {
          accepted: true,
          repairDirectionIds: [],
          needsStudentInput: false,
          issues: [],
          question: null,
        },
      ],
      prompts,
    ),
  );
  assert.equal(prompts.length, 2);
  for (const prompt of prompts) {
    assert.match(prompt, /priority must name\s+a student-facing desired benefit or tradeoff/);
    assert.match(prompt, /perspective, or format is not a priority/);
    assert.match(prompt, /fit and tradeoff must substantiate the named priority/);
    assert.match(prompt, /When empty, offer contrasting useful comparison lenses/);
    assert.match(prompt, /This stage ends at what to pursue/);
  }
  assert.match(
    prompts[1],
    /Repair mislabeled priorities without requiring the student to supply a preference/,
  );
});

test('direction Q&A is instructed to answer directly without restarting exploration', async () => {
  const { shown } = await fixture();
  const before = structuredClone(shown);
  const prompts = [];
  const result = await answerQuestion(
    {
      mode: 'live',
      state: shown,
      directionId: shown.directions[0].id,
      question: 'Could I do this in one day?',
    },
    mocked(
      [
        {
          answer:
            'With only one day, narrow it to a single location and a short period of changing light.',
        },
      ],
      prompts,
    ),
  );
  assert.match(prompts[0], /optional student-led Q&A after directions/);
  assert.match(prompts[0], /do not append a follow-up question/);
  assert.match(prompts[0], /state the relevant condition, assumption, or information gap/);
  assert.deepEqual(shown, before, 'A hypothetical Q&A must not change the current project');
  assert.match(result.answer, /only one day/);
});
