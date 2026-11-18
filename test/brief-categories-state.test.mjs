import test from 'node:test';
import assert from 'node:assert/strict';
import { inferBriefCategory, inferBriefLabel } from '../public/brief-categories.mjs';
import {
  createProject,
  update,
  migrateProject,
  buildContext,
  validateResponse,
} from '../public/state.mjs';

const texts = [
  '完成期限为一周内。',
  '使用6—8张原创静态图像。',
  '讲述围绕日常事物展开的完整故事，并有清楚的变化或转折。',
  '可使用自己的摄影、插画或拼贴，但表现形式必须保持一致。',
  '提交一个按顺序排列图像的PDF。',
  '提交150—200字的创作说明。',
  '不得用视频代替。',
  '评分权重：叙事清晰度35%、视觉表达30%、概念20%、完成度15%。',
];

test('migrates the existing eight-item brief into meaningful categories without changing evidence or project state', () => {
  const old = createProject();
  old.brief = {
    text: texts.join('\n'),
    summary: '视觉叙事',
    confirmed: true,
    uncertainties: [],
    requirements: texts.map((text, index) => ({
      id: 'r' + (index + 1),
      text,
      quote: text,
      sourceType: 'document',
    })),
  };
  old.revision = 12;
  old.screen = 'explore';
  old.review = { ready: true, reason: 'Ready', revision: 12, issues: [] };
  const before = structuredClone(old);
  const migrated = migrateProject(old);
  assert.deepEqual(old, before, 'Migration must not mutate the original');
  assert.deepEqual(
    migrated.brief.requirements.map((x) => x.category),
    [
      'schedule',
      'requirements',
      'requirements',
      'requirements',
      'submission',
      'submission',
      'submission',
      'assessment',
    ],
  );
  assert.deepEqual(
    migrated.brief.requirements.map((x) => x.label),
    [
      '完成期限',
      '图像数量',
      '叙事内容',
      '表现形式',
      '提交文件',
      '创作说明',
      '格式限制',
      '评分权重',
    ],
  );
  assert.deepEqual(
    migrated.brief.requirements.map(({ category, label, ...rest }) => rest),
    old.brief.requirements,
  );
  assert.equal(migrated.revision, 12);
  assert.deepEqual(migrated.review, old.review);
  assert.equal(migrated.screen, old.screen);
  assert.equal(migrated.brief.confirmed, true);
  assert.deepEqual(
    migrateProject(migrated),
    migrated,
    'Classification must be stable across reloads',
  );
});

test('English legacy records classify by purpose and do not mistake a creative deadline topic for a schedule', () => {
  const cases = [
    ['Submit a PDF.', 'submission', 'Submission file'],
    ['No video.', 'submission', 'Format restrictions'],
    ['Include a 150-word craft reflection.', 'submission', 'Written statement'],
    ['Assessment: narrative clarity 35%, expression 30%.', 'assessment', 'Assessment weights'],
    ['Assessment: explain the relationship between images.', 'assessment', 'Assessment criteria'],
    ['Deadline: one week.', 'schedule', 'Deadline'],
    ['Tell a story about missing a deadline.', 'requirements', 'Narrative content'],
  ];
  for (const [text, category, label] of cases) {
    assert.equal(inferBriefCategory({ text }), category);
    assert.equal(inferBriefLabel({ text }, category), label);
  }
});

test('edited categories and labels survive later text edits and all groups remain in AI context and reference validation', () => {
  let state = update(createProject(), 'brief/text', { text: texts.join('\n') });
  state = update(state, 'brief/review', {
    summary: 'Test',
    requirements: texts.map((text, index) => ({ id: 'r' + (index + 1), text, quote: text })),
  });
  const requirements = state.brief.requirements.map((item) =>
    item.id === 'r6' ? { ...item, category: 'submission', label: 'Written statement' } : item,
  );
  state = update(state, 'brief/review', { summary: 'Test', requirements });
  state = update(state, 'brief/review', {
    summary: 'Test',
    requirements: state.brief.requirements.map((item) =>
      item.id === 'r6' ? { ...item, text: 'Submit a 150-word statement.' } : item,
    ),
  });
  assert.equal(state.brief.requirements[5].label, 'Written statement');
  assert.equal(state.brief.requirements[5].category, 'submission');
  const context = buildContext(state);
  assert.equal(context.brief.requirements.length, 8);
  const response = {
    question: { id: 'q', text: 'Please check the quoted requirement.', options: [] },
    clues: [],
    ready: false,
    readinessReason: 'Conflict',
    directions: [],
    memoryNote: '',
    issues: [
      {
        id: 'i1',
        message: 'The submission format conflicts.',
        requirementId: 'r7',
        quote: texts[6],
      },
      {
        id: 'i2',
        message: 'The scoring criteria need review.',
        requirementId: 'r8',
        quote: texts[7],
      },
    ],
  };
  assert.doesNotThrow(() => validateResponse(state, response));
  assert.throws(
    () =>
      update(state, 'brief/review', {
        summary: 'Test',
        requirements: [{ id: 'bad', text: 'Bad', quote: 'Bad', category: 'unknown' }],
      }),
    /Unknown brief category/,
  );
});

test('cross-disciplinary content words do not become grading, submission, schedule, or visual-art requirements', () => {
  const cases = [
    [
      'Use quotation marks around all string literals.',
      'Use quotation marks around all string literals',
    ],
    [
      'Save the trained model weights in a separate file.',
      'Save the trained model weights in a separate file',
    ],
    ['Implement PDF export in your application.', 'Implement PDF export in your application'],
    [
      'Implement a reminder when a task deadline approaches.',
      'Implement a reminder when a task deadline approaches',
    ],
    ['Build your own command-line program.', 'Build your own command-line program'],
    ['整理3—5张数据表。', '整理3—5张数据表'],
    ['撰写一篇比较两种社会学理论的论文。', '撰写一篇比较两种社会学理论的论文'],
  ];
  for (const [text, heading] of cases) {
    assert.equal(inferBriefCategory({ text }), 'requirements', text);
    assert.equal(inferBriefLabel({ text }), heading, text);
  }
});

test('mixed older records remain intact with a source-based heading instead of forcing one partial category', () => {
  const mixed = [
    '进行5分钟的口头汇报，不提交文件。',
    '11月12日前上传源代码。',
    'Submit your Python source by Friday.',
  ];
  const old = createProject();
  old.brief.requirements = mixed.map((text, index) => ({
    id: 'mixed-' + index,
    text,
    quote: text,
    sourceType: 'document',
  }));
  const migrated = migrateProject(old);
  for (const [index, item] of migrated.brief.requirements.entries()) {
    assert.equal(item.category, 'requirements');
    assert.equal(item.label, mixed[index].replace(/[。.]+$/u, ''));
    assert.equal(item.id, old.brief.requirements[index].id);
    assert.equal(item.text, mixed[index]);
    assert.equal(item.quote, mixed[index]);
  }
});

test('actual administrative instructions keep their purpose and non-format restrictions get accurate headings', () => {
  const cases = [
    ['Upload your JavaScript source files to Blackboard.', 'submission', 'Submission file'],
    ['Deadline: Friday.', 'schedule', 'Deadline'],
    [
      'Assessment: explain the argument, use supporting evidence.',
      'assessment',
      'Assessment criteria',
    ],
    ['本作业不单独评分。', 'assessment', '评分安排'],
    ['This assignment is not separately graded.', 'assessment', 'Grading arrangements'],
    ['提交代码时不得包含API密钥。', 'submission', '提交代码时不得包含API密钥'],
  ];
  for (const [text, category, heading] of cases) {
    assert.equal(inferBriefCategory({ text }), category, text);
    assert.equal(inferBriefLabel({ text }, category), heading, text);
  }
  assert.equal(
    inferBriefLabel({
      text: '撰写一篇比较两种社会学理论的论文，并利用课程指定的阅读材料分析两者的异同以及适用条件。',
    }),
    '作业要求',
  );
  assert.equal(
    inferBriefLabel({ text: 'Rédigez une analyse des deux théories.' }),
    '',
    'Other languages retain the localized UI fallback',
  );
});
