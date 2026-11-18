import test from 'node:test';
import assert from 'node:assert/strict';
import {
  priorityText,
  uncertaintyMarkup,
  questionHistoryMarkup,
  directionHistoryMarkup,
} from '../public/refinement-ui.mjs';
import { rt } from '../public/refinement-i18n.mjs';

test('custom priority meanings survive instead of being classified by keyword or position', () => {
  const translated = [];
  const translate = (text) => {
    translated.push(text);
    return 'translated:' + text;
  };
  for (const label of [
    'Portfolio development',
    'Learning a new technique',
    'Not prioritizing grades',
    '作品集发展',
    '成绩不是我的首要目标',
    'تعلّم أسلوب جديد',
    'Intérêt personnel',
  ]) {
    assert.equal(priorityText(label, translate), label);
  }
  assert.deepEqual(
    translated,
    [],
    'Custom labels must never pass through standard-priority translation.',
  );
});

test('only complete recognized priority identifiers and labels use standard translations', () => {
  const translate = (text) =>
    ({
      'High grades': '争取高分',
      'Easier completion': '更容易完成',
      'Personal interest': '个人兴趣',
    })[text];
  for (const label of ['grades', 'High grades', 'HIGH GRADES'])
    assert.equal(priorityText(label, translate), '争取高分');
  for (const label of ['ease', 'Easier completion'])
    assert.equal(priorityText(label, translate), '更容易完成');
  for (const label of ['interest', 'Personal interest'])
    assert.equal(priorityText(label, translate), '个人兴趣');
  assert.equal(
    priorityText('Easier completion is not important', translate),
    'Easier completion is not important',
  );
});

const direction = (id, title) => ({
  id,
  title,
  summary: 'Summary for ' + title,
  priority: 'Portfolio development',
  fit: 'Fits the confirmed assignment.',
  tradeoff: 'Requires some refinement.',
});

test('history retains every candidate and routes reused direction IDs through their own set', () => {
  const sets = [
    {
      id: 'new-set',
      createdAt: '2026-10-25T20:00:00Z',
      directions: [direction('d1', 'New first'), direction('d2', 'New second')],
    },
    {
      id: 'old-set',
      createdAt: '2026-10-24T20:00:00Z',
      directions: [
        direction('d1', 'Old first'),
        direction('d2', 'Old second'),
        direction('d3', 'Old third'),
      ],
    },
  ];
  const html = directionHistoryMarkup(sets, 'zh-CN');
  for (const set of sets) {
    for (const candidate of set.directions) {
      assert.ok(html.includes(candidate.title));
      assert.ok(html.includes('data-id="' + candidate.id + '" data-history-id="' + set.id + '"'));
    }
  }
  assert.equal((html.match(/data-action="history-revisit"/g) || []).length, 5);
  assert.equal((html.match(/class="history-direction"/g) || []).length, 5);
  assert.ok(html.includes(rt('zh-CN', 'historyStale')));
  assert.ok(html.includes(rt('zh-CN', 'historyReview')));
  assert.doesNotMatch(
    html,
    /data-action="(?:choose|direction\/select|select)"/,
    'Old directions must be reviewed before selection.',
  );
});

test('history escapes direction content and both routing IDs', () => {
  const malicious = '<script>alert("x")</script>';
  const html = directionHistoryMarkup(
    [
      {
        id: 'set" onclick="bad',
        createdAt: '2026-10-25T20:00:00Z',
        directions: [
          {
            id: 'd" onclick="bad',
            title: malicious,
            summary: malicious,
            priority: malicious,
            fit: malicious,
            tradeoff: malicious,
          },
        ],
      },
    ],
    'en',
  );
  assert.doesNotMatch(html, /<script>| onclick="/);
  assert.ok(html.includes('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;'));
  assert.ok(html.includes('data-id="d&quot; onclick=&quot;bad"'));
  assert.ok(html.includes('data-history-id="set&quot; onclick=&quot;bad"'));
  assert.match(html, /<h4 data-raw dir="auto">/);
});

test('saved questions remain visible and only unapplied questions offer an apply action', () => {
  const items = [
    {
      id: 'question-one',
      question: 'Could this work in one day?',
      answer: 'Here is the scope to reconsider.',
      appliedInputId: null,
    },
    {
      id: 'question-two',
      question: 'I now have two days.',
      answer: 'We can review that schedule.',
      appliedInputId: 'input-two',
    },
  ];
  const html = questionHistoryMarkup(items, 'zh-CN');
  assert.equal((html.match(/class="question-record"/g) || []).length, 2);
  for (const item of items) {
    assert.ok(html.includes(item.question));
    assert.ok(html.includes(item.answer));
  }
  assert.ok(html.includes('data-action="qa-apply" data-id="question-one"'));
  assert.ok(!html.includes('data-id="question-two"'));
  assert.equal((html.match(/data-action="qa-apply"/g) || []).length, 1);
  assert.ok(html.includes(rt('zh-CN', 'qaApplied')));
  assert.ok(html.includes(rt('zh-CN', 'qaApplyHint')));
});

test('question history displays raw text safely and escapes the apply target', () => {
  const html = questionHistoryMarkup(
    [
      {
        id: 'q" onclick="bad',
        question: '<img src=x onerror=bad>',
        answer: '</div><script>bad</script>',
        appliedInputId: null,
      },
    ],
    'ar',
  );
  assert.doesNotMatch(html, /<img|<script>| onclick="/);
  assert.ok(html.includes('&lt;img src=x onerror=bad&gt;'));
  assert.ok(html.includes('&lt;/div&gt;&lt;script&gt;bad&lt;/script&gt;'));
  assert.ok(html.includes('data-id="q&quot; onclick=&quot;bad"'));
  assert.ok(html.includes(rt('ar', 'qaHistory')));
  assert.ok(html.includes(rt('ar', 'qaApply')));
  assert.match(html, /data-raw dir="auto"/);
});

test('unresolved uncertainty offers an editable clarification and the exact save target', () => {
  const html = uncertaintyMarkup(
    [
      {
        id: 'u1',
        text: 'Are illustrations allowed?',
        status: 'unresolved',
        resolution: 'The instructor said ',
        decisive: true,
      },
    ],
    'zh-CN',
  );
  assert.ok(html.includes('data-uncertainty-draft="u1"'));
  assert.ok(html.includes('data-action="uncertainty-resolve" data-id="u1"'));
  assert.ok(html.includes('The instructor said '));
  assert.ok(html.includes(rt('zh-CN', 'uncertaintyResolve')));
  assert.ok(html.includes(rt('zh-CN', 'uncertaintyResolution')));
  assert.doesNotMatch(html, /data-action="uncertainty-reopen"/);
});

test('resolved uncertainty retains the clarification with reopen access and no editable draft', () => {
  const html = uncertaintyMarkup(
    [
      {
        id: 'u2',
        text: 'Are illustrations allowed?',
        status: 'resolved',
        resolution: 'Yes, illustrations are allowed.',
        decisive: true,
      },
    ],
    'fr',
  );
  assert.ok(html.includes('Yes, illustrations are allowed.'));
  assert.ok(html.includes('data-action="uncertainty-reopen" data-id="u2"'));
  assert.ok(html.includes(rt('fr', 'uncertaintyResolved')));
  assert.doesNotMatch(html, /<textarea|data-action="uncertainty-resolve"/);
});

test('uncertainty text, clarification, and control identifiers cannot inject markup', () => {
  const html = uncertaintyMarkup(
    [
      {
        id: 'u" onfocus="bad',
        text: '<svg onload=bad>',
        status: 'unresolved',
        resolution: '</textarea><script>bad</script>',
      },
    ],
    'en',
  );
  assert.doesNotMatch(html, /<svg|<script>| onfocus="/);
  assert.ok(html.includes('&lt;svg onload=bad&gt;'));
  assert.ok(html.includes('&lt;/textarea&gt;&lt;script&gt;bad&lt;/script&gt;'));
  assert.ok(html.includes('data-id="u&quot; onfocus=&quot;bad"'));
});

test('empty collections give appropriate localized empty states', () => {
  assert.equal(uncertaintyMarkup([], 'en'), '');
  assert.equal(questionHistoryMarkup([], 'en'), '');
  assert.ok(directionHistoryMarkup([], 'de').includes(rt('de', 'historyEmpty')));
});
