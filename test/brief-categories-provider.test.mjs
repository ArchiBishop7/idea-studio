import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewBrief, runTurn } from '../lib/provider.mjs';
import { PREVIEW_LOCALES } from '../public/preview-locales.mjs';
import {
  createProject,
  update,
  prepareTurn,
  validateResponse,
  DEMO_BRIEF,
} from '../public/state.mjs';

const brief =
  '用6—8张原创静态图像讲述一个日常故事。提交按顺序编排的PDF和150—200字创作说明，不得提交视频。一周内完成。评分：叙事清晰度35%，视觉表达30%，概念20%，完成度15%。';
const extracted = {
  summary: '一周内完成原创图像故事，提交PDF与创作说明。',
  requirements: [
    {
      id: 'r1',
      text: '使用6—8张静态图像。',
      quote: '用6—8张原创静态图像',
      category: 'requirements',
      label: '图像数量',
    },
    {
      id: 'r2',
      text: '提交按顺序编排的PDF。',
      quote: '提交按顺序编排的PDF',
      category: 'submission',
      label: 'PDF文件',
    },
    {
      id: 'r3',
      text: '提交150—200字创作说明。',
      quote: '150—200字创作说明',
      category: 'submission',
      label: '创作说明',
    },
    {
      id: 'r4',
      text: '一周内完成。',
      quote: '一周内完成。',
      category: 'schedule',
      label: '截止时间',
    },
    {
      id: 'r5',
      text: '叙事清晰度35%，视觉表达30%，概念20%，完成度15%。',
      quote: '评分：叙事清晰度35%，视觉表达30%，概念20%，完成度15%。',
      category: 'assessment',
      label: '评分权重',
    },
    {
      id: 'r6',
      text: '不得提交视频。',
      quote: '不得提交视频。',
      category: 'submission',
      label: '禁止视频',
    },
    {
      id: 'r7',
      text: '图像必须原创。',
      quote: '原创静态图像',
      category: 'requirements',
      label: '原创要求',
    },
    {
      id: 'r8',
      text: '讲述一个日常故事。',
      quote: '讲述一个日常故事。',
      category: 'requirements',
      label: '故事主题',
    },
  ],
  uncertainties: [],
};
function mocked(results, requests = []) {
  return {
    apiKey: 'test-placeholder',
    fetchImpl: async (_url, options) => {
      requests.push(JSON.parse(options.body));
      assert.ok(results.length, 'Unexpected extra request');
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

test('live brief schema requires a valid category and meaningful heading for every source-backed item', async () => {
  const requests = [];
  const output = await reviewBrief(
    { mode: 'live', text: brief, language: { code: 'zh-CN' } },
    mocked([extracted], requests),
  );
  assert.deepEqual(output, extracted);
  const schema = requests[0].text.format.schema.properties.requirements.items;
  assert.equal(requests[0].text.format.strict, true);
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.required, ['id', 'text', 'quote', 'category', 'label']);
  assert.deepEqual(schema.properties.category.enum, [
    'requirements',
    'submission',
    'assessment',
    'schedule',
  ]);
  assert.match(requests[0].instructions, /Classify by function/);
  assert.match(
    requests[0].instructions,
    /Keep scoring weights together in a separate assessment item/,
  );
  assert.match(
    requests[0].instructions,
    /split statements that span categories into separate items/,
  );
  assert.match(
    requests[0].instructions,
    /one independently checkable constraint per item, even within the same category/,
  );
  assert.match(
    requests[0].instructions,
    /Keep different deliverables and delivery restrictions in separate items/,
  );
  assert.match(requests[0].instructions, /headings and number of items are not a fixed template/);
  assert.match(requests[0].instructions, /Preserve alternatives as alternatives/);
  assert.deepEqual(
    output.requirements.filter((item) => item.category === 'submission').map((item) => item.label),
    ['PDF文件', '创作说明', '禁止视频'],
  );
  assert.equal(output.requirements.filter((item) => item.category === 'assessment').length, 1);
  assert.ok(output.requirements.every((item) => brief.includes(item.quote)));
});

test('malformed live categories or missing headings are rejected instead of silently misgrouped', async () => {
  for (const mutation of [
    (item) => {
      delete item.category;
    },
    (item) => {
      item.category = 'general';
    },
    (item) => {
      delete item.label;
    },
  ]) {
    const result = structuredClone(extracted);
    mutation(result.requirements[0]);
    await assert.rejects(
      reviewBrief({ mode: 'live', text: brief }, mocked([result])),
      (error) => error.code === 'provider_invalid_shape',
    );
  }
  const result = structuredClone(extracted);
  result.requirements[0].label = '   ';
  await assert.rejects(
    reviewBrief({ mode: 'live', text: brief }, mocked([result])),
    (error) => error.code === 'brief_label_invalid',
  );
});

test('all preview languages split the deadline, preserve source quotes and stable IDs, and use specific localized headings', async () => {
  for (const code of Object.keys(PREVIEW_LOCALES)) {
    const result = await reviewBrief({ mode: 'preview', text: DEMO_BRIEF, language: { code } });
    assert.deepEqual(
      result.requirements.map((item) => item.id),
      ['demo-r1', 'demo-r2', 'demo-r3', 'demo-r4', 'demo-r5'],
      code,
    );
    assert.deepEqual(
      result.requirements.map((item) => item.category),
      ['requirements', 'requirements', 'submission', 'requirements', 'schedule'],
      code,
    );
    assert.deepEqual(
      result.requirements.map((item) => item.label),
      PREVIEW_LOCALES[code].reqLabels,
      code,
    );
    assert.ok(
      result.requirements.every(
        (item) => item.label.trim() && item.text.trim() && DEMO_BRIEF.includes(item.quote),
      ),
      code,
    );
    assert.equal(result.requirements[4].text, PREVIEW_LOCALES[code].reqSchedule, code);
    assert.equal(result.requirements[4].quote, 'in one week');
    assert.ok(
      !result.requirements.some((item) => item.category === 'assessment'),
      'The sample supplies no grading rubric',
    );
  }
});

test('all four brief categories retain their IDs and constraints in generation and independent review', async () => {
  let state = update(createProject(), 'brief/text', { text: brief });
  state = update(state, 'brief/review', extracted);
  state = update(update(state, 'brief/confirm'), 'entry/select', {
    kind: 'rough',
    idea: '用手机记录一周里桌面上同一个杯子的变化。',
  });
  const prepared = prepareTurn(state, 'directions');
  const sourceIds = prepared.state.inputs
    .filter((item) => item.type === 'starting-idea')
    .map((item) => item.id);
  const candidate = {
    question: null,
    clues: [],
    ready: true,
    readinessReason: '可以比较。',
    issues: [],
    memoryNote: '',
    directions: [
      {
        id: 'd1',
        title: '一周的杯子',
        priority: '个人兴趣',
        summary: '用图像表现杯子的日常变化。',
        fit: '日常故事，使用原创静态图像。',
        tradeoff: '需要持续观察。',
        sourceIds,
        requirementIds: ['r1', 'r2', 'r3', 'r4', 'r5'],
      },
      {
        id: 'd2',
        title: '桌面的一天',
        priority: '容易完成',
        summary: '围绕一天中的桌面变化组织图像。',
        fit: '单一场景，完成后编排成PDF。',
        tradeoff: '需要明确的视觉转折。',
        sourceIds,
        requirementIds: ['r1', 'r2', 'r3', 'r4', 'r5'],
      },
    ],
  };
  const requests = [];
  const output = await runTurn(
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
      requests,
    ),
  );
  validateResponse(prepared.state, output, 'directions');
  assert.equal(requests.length, 2);
  for (const request of requests) {
    const context = JSON.parse(request.input[0].content[0].text).context;
    assert.deepEqual(context.currentState.brief.requirements, prepared.state.brief.requirements);
    assert.deepEqual(
      new Set(context.currentState.brief.requirements.map((item) => item.category)),
      new Set(['requirements', 'submission', 'schedule', 'assessment']),
    );
    assert.match(request.instructions, /every group remains part of the confirmed assignment/);
    assert.match(request.instructions, /category never weakens a mandatory constraint/);
  }
});
