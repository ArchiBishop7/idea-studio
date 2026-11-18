import test from 'node:test';
import assert from 'node:assert/strict';
import { explainQuestion } from '../lib/provider.mjs';
test('clarification uses current question and history without mutating inputs', async () => {
  const params = {
    mode: 'live',
    language: { code: 'zh-CN' },
    question: { id: 'q5', text: '像拍连拍一样画图是什么意思？', options: ['简单物品', '人物'] },
    query: '连拍是什么？',
    brief: { summary: '视觉叙事' },
    history: [{ question: '这什么意思', answer: '之前的解释' }],
  };
  const original = structuredClone(params);
  let request;
  const result = await explainQuestion(params, {
    apiKey: 'test-only',
    fetchImpl: async (_, options) => {
      request = JSON.parse(options.body);
      return new Response(
        JSON.stringify({
          status: 'completed',
          output: [
            {
              type: 'message',
              role: 'assistant',
              status: 'completed',
              content: [
                {
                  type: 'output_text',
                  text: JSON.stringify({
                    answer: '连拍就是连续拍下几个瞬间。这里是比喻连续画面。',
                  }),
                },
              ],
            },
          ],
        }),
        { status: 200 },
      );
    },
  });
  assert.match(result.answer, /连续/);
  assert.deepEqual(params, original);
  const input = JSON.parse(request.input[0].content[0].text);
  assert.deepEqual(input.currentQuestion, params.question);
  assert.equal(input.studentClarification, params.query);
  assert.deepEqual(input.previousExplanations, params.history);
  assert.match(request.instructions, /Do not choose an answer/);
});
test('invalid question is rejected before contacting provider', async () => {
  let called = false;
  await assert.rejects(
    explainQuestion(
      { mode: 'live', query: 'help', language: { code: 'en' } },
      {
        fetchImpl: () => {
          called = true;
        },
      },
    ),
  );
  assert.equal(called, false);
});
