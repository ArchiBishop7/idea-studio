import test from 'node:test';
import assert from 'node:assert/strict';
import { groupedBriefMarkup, createBriefItem, editBriefItem } from '../public/brief-ui.mjs';
import { BRIEF_CATEGORIES } from '../public/brief-categories.mjs';
import { BRIEF_MESSAGES, bt } from '../public/brief-i18n.mjs';
import { LANGUAGES } from '../public/i18n.mjs';

const records = [
  {
    id: 'r1',
    category: 'requirements',
    label: '图像数量',
    text: '6—8张原创静态图像。',
    quote: '6—8张原创静态图像。',
    sourceType: 'document',
  },
  {
    id: 'r2',
    category: 'submission',
    label: '提交文件',
    text: '提交一个PDF。',
    quote: '提交一个PDF。',
    sourceType: 'document',
  },
  {
    id: 'r3',
    category: 'assessment',
    label: '评分权重',
    text: '叙事35%、视觉30%、概念20%、完成度15%。',
    quote: '评分：叙事35%、视觉30%、概念20%、完成度15%。',
    sourceType: 'document',
  },
];

test('requirements, submission and assessment are separate sections with concrete labels and preserved weight text', () => {
  const original = structuredClone(records);
  const html = groupedBriefMarkup(records, 'zh-CN');
  for (const [category, title] of [
    ['requirements', '要求'],
    ['submission', '提交形式'],
    ['assessment', '评分要求'],
  ]) {
    assert.ok(html.includes(`<h3 id="brief-group-${category}" data-raw>${title}</h3>`));
    assert.ok(html.includes(`data-action="add-requirement" data-category="${category}"`));
  }
  assert.equal((html.match(/<section class="brief-group"/g) || []).length, 3);
  assert.ok(
    !html.includes('<h3 id="brief-group-schedule"'),
    'Empty sections must not appear as empty review content.',
  );
  assert.ok(html.includes('value="评分权重"'));
  assert.ok(html.includes('叙事35%、视觉30%、概念20%、完成度15%。'));
  assert.doesNotMatch(html, /Requirement\s+\d|要求\s*\d|Remove this requirement/);
  for (const item of records) {
    assert.ok(html.includes(`data-requirement="${item.id}"`));
    assert.ok(html.includes(`data-requirement-label="${item.id}"`));
    assert.ok(html.includes(`data-requirement-category="${item.id}"`));
    assert.ok(html.includes(item.text));
    assert.ok(html.includes(item.quote));
  }
  assert.match(html, /class="brief-groups" data-i18n-skip/);
  assert.match(html, /data-requirement-label="r3" data-raw dir="auto"/);
  assert.deepEqual(records, original, 'Rendering must not modify the saved brief.');
});

test('schedule has its own section when present, and legacy numbered labels become neutral labels', () => {
  const html = groupedBriefMarkup(
    [
      ...records,
      {
        id: 'r4',
        category: 'schedule',
        label: '完成期限',
        text: '一周内完成。',
        quote: '一周内完成。',
        sourceType: 'document',
      },
    ],
    'zh-CN',
  );
  assert.ok(html.includes('<h3 id="brief-group-schedule" data-raw>时间安排</h3>'));
  assert.ok(html.includes('value="完成期限"'));
  const legacy = groupedBriefMarkup(
    [
      {
        id: 'old',
        label: 'Requirement 8',
        text: 'Use still images.',
        quote: '',
        sourceType: 'student',
      },
    ],
    'en',
  );
  assert.doesNotMatch(legacy, /Requirement 8/);
  assert.ok(legacy.includes('value="Additional requirement"'));
});

test('item text, labels, IDs and original quotes are escaped without losing their source data', () => {
  const item = {
    id: 'r" onclick="bad',
    category: 'submission',
    label: '<img src=x onerror="bad">',
    text: '</textarea><script>bad</script>',
    quote: '<source> & "exact"',
    sourceType: 'document',
  };
  const html = groupedBriefMarkup([item], 'en');
  assert.doesNotMatch(html, /<img|<script>|<source>|onclick="bad"/);
  assert.ok(html.includes('data-requirement="r&quot; onclick=&quot;bad"'));
  assert.ok(html.includes('&lt;/textarea&gt;&lt;script&gt;bad&lt;/script&gt;'));
  assert.ok(html.includes('&lt;source&gt; &amp; &quot;exact&quot;'));
  assert.equal(item.quote, '<source> & "exact"');
});

test('correcting classification or a label retains IDs, exact quotes and source types; text edits retain document evidence', () => {
  const classified = editBriefItem(records, 'r1', 'category', 'submission');
  assert.equal(classified[0].category, 'submission');
  for (const key of ['id', 'label', 'text', 'quote', 'sourceType'])
    assert.equal(classified[0][key], records[0][key]);
  const relabeled = editBriefItem(classified, 'r1', 'label', '表现形式');
  assert.equal(relabeled[0].label, '表现形式');
  for (const key of ['id', 'category', 'text', 'quote', 'sourceType'])
    assert.equal(relabeled[0][key], classified[0][key]);
  const edited = editBriefItem(relabeled, 'r1', 'text', '6到8张自己拍摄的照片。');
  assert.equal(edited[0].quote, records[0].quote);
  assert.equal(edited[0].category, 'submission');
  assert.deepEqual(edited.slice(1), records.slice(1));
  assert.deepEqual(records[0], {
    id: 'r1',
    category: 'requirements',
    label: '图像数量',
    text: '6—8张原创静态图像。',
    quote: '6—8张原创静态图像。',
    sourceType: 'document',
  });
  assert.throws(() => editBriefItem(records, 'r1', 'category', 'unknown'));
});

test('manual additions stay in their selected section with a short non-numbered editable label', () => {
  for (const category of BRIEF_CATEGORIES) {
    const item = createBriefItem(category, 'zh-CN', 'manual-' + category);
    assert.equal(item.category, category);
    assert.equal(item.sourceType, 'student');
    assert.equal(item.text, '');
    assert.equal(item.quote, '');
    assert.ok(item.label);
    assert.doesNotMatch(item.label, /\d/);
    const edited = editBriefItem([item], item.id, 'text', '老师补充的具体说明。')[0];
    assert.equal(
      edited.quote,
      edited.text,
      'A student-supplied clarification remains its own source.',
    );
    assert.equal(edited.label, item.label);
    assert.equal(edited.category, category);
    assert.ok(groupedBriefMarkup([edited], 'zh-CN').includes(`data-brief-category="${category}"`));
  }
});

test('all twelve languages have complete grouped-review controls without translating original labels or requirements', () => {
  assert.deepEqual(
    Object.keys(BRIEF_MESSAGES),
    LANGUAGES.map(({ code }) => code),
  );
  const keys = Object.keys(BRIEF_MESSAGES.en).sort();
  for (const { code } of LANGUAGES) {
    assert.deepEqual(Object.keys(BRIEF_MESSAGES[code]).sort(), keys);
    for (const key of keys) {
      assert.ok(bt(code, key).trim());
      if (code !== 'en') assert.notEqual(bt(code, key), bt('en', key), code + ': ' + key);
    }
    const html = groupedBriefMarkup(records, code);
    for (const item of records) {
      assert.ok(html.includes(item.label));
      assert.ok(html.includes(item.text));
      assert.ok(html.includes(item.quote));
    }
    assert.ok(html.includes(bt(code, 'removeItem')));
    assert.ok(html.includes(bt(code, 'addItem')));
  }
  assert.equal(bt('unknown', 'assessment'), 'Assessment');
});
