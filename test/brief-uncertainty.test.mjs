import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewBrief } from '../lib/provider.mjs';

test('brief extraction distinguishes real gaps from the explicit UI confirmation', async () => {
  const brief = '用六张原创静态图片讲述一个完整故事，一周后提交 PDF。';
  const result = {
    summary: '六张图片的故事。',
    requirements: [
      {
        id: 'r1',
        text: '用六张原创静态图片讲述一个完整故事。',
        quote: '用六张原创静态图片讲述一个完整故事',
        category: 'requirements',
        label: '图像故事',
      },
      {
        id: 'r2',
        text: '提交 PDF。',
        quote: '提交 PDF',
        category: 'submission',
        label: '文件格式',
      },
      { id: 'r3', text: '一周后提交。', quote: '一周后', category: 'schedule', label: '截止时间' },
    ],
    uncertainties: [],
  };
  let prompt;
  const config = {
    apiKey: 'test-placeholder',
    fetchImpl: async (_url, options) => {
      prompt = JSON.parse(options.body).instructions;
      return new Response(
        JSON.stringify({
          status: 'completed',
          output: [
            {
              type: 'message',
              role: 'assistant',
              status: 'completed',
              content: [{ type: 'output_text', text: JSON.stringify(result) }],
            },
          ],
        }),
      );
    },
  };
  assert.deepEqual(
    (await reviewBrief({ mode: 'live', text: brief, language: { code: 'zh-CN' } }, config))
      .uncertainties,
    [],
  );
  assert.match(prompt, /specific missing, unreadable, ambiguous, or conflicting detail/);
  assert.match(prompt, /complete, unambiguous brief, return uncertainties:\[\]/);
  assert.match(prompt, /Never add a generic request to verify accuracy or completeness/);
  assert.match(prompt, /teacher has any unknown additional requirements/);
  assert.match(prompt, /interface already asks the student to review and explicitly confirm/);
  result.uncertainties = [
    { text: '正文要求六张图片，但附表写八张，应采用哪个数量？', decisive: true },
  ];
  assert.deepEqual(
    (await reviewBrief({ mode: 'live', text: brief, language: { code: 'zh-CN' } }, config))
      .uncertainties,
    result.uncertainties,
    'Specific ambiguities remain available; this is not a blanket uncertainty filter',
  );
});
