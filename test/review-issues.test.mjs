import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { reviewIssuesMarkup } from '../public/refinement-ui.mjs';
import { rt } from '../public/refinement-i18n.mjs';
import { LANGUAGES } from '../public/i18n.mjs';
import { createProject, update, prepareTurn, applyTurn } from '../public/state.mjs';

function reviewedProject() {
  let state = update(createProject(), 'brief/text', { text: 'Use still images. No video.' });
  state = update(state, 'brief/review', {
    summary: 'A sequence of still images.',
    requirements: [
      { id: 'r1', text: 'No video.', quote: 'No video.', sourceType: 'document' },
      {
        id: 'r2',
        text: 'Submit a PDF.',
        quote: 'My teacher clarified: submit a PDF.',
        sourceType: 'student',
      },
    ],
    uncertainties: [],
  });
  state = update(state, 'brief/confirm');
  state = update(state, 'entry/select', { kind: 'none' });
  state = update(state, 'draft/set', {
    field: 'answer',
    value: 'I will submit a ten-second video and skip the PDF.',
  });
  const prepared = prepareTurn(state, 'explore');
  return applyTurn(
    prepared.state,
    {
      question: { id: 'q1', text: 'Would you adapt the idea to still images?', options: [] },
      clues: [],
      ready: false,
      readinessReason: 'The format needs an adjustment.',
      directions: [],
      memoryNote: 'Internal record.',
      issues: [
        {
          id: 'issue-1',
          message: 'A ten-second video conflicts with the still-image requirement.',
          requirementId: 'r1',
          quote: 'No video.',
        },
        {
          id: 'issue-2',
          message: 'Skipping the PDF conflicts with the submission format.',
          requirementId: 'r2',
          quote: 'My teacher clarified: submit a PDF.',
        },
      ],
    },
    prepared.request.revision,
    'explore',
  );
}

test('current conflicts show each problem and exact confirmed source with a route to correct the brief', () => {
  const state = reviewedProject();
  for (const { code } of LANGUAGES) {
    const html = reviewIssuesMarkup(state, code);
    assert.match(html, /role="alert"/);
    for (const issue of state.review.issues) assert.ok(html.includes(issue.message));
    for (const requirement of state.brief.requirements) assert.ok(html.includes(requirement.quote));
    for (const key of [
      'documentSource',
      'studentSource',
      'reviewIssuesTitle',
      'reviewIssuesHelp',
      'reviewIssuesBrief',
    ])
      assert.ok(html.includes(rt(code, key)), code + ': ' + key);
    assert.match(html, /data-action="brief"/);
    assert.equal((html.match(/class="review-issue"/g) || []).length, 2);
    assert.ok(
      !html.includes(state.question.text),
      'The existing question remains the next-step prompt.',
    );
    assert.ok(!html.includes('Internal record.'));
  }
});

test('issue rendering escapes model and source content and never cites an unconfirmed quote', () => {
  const state = reviewedProject();
  state.review.issues[0].message = '<img src=x onerror="bad"> conflicts with the brief.';
  state.review.issues[0].quote = 'Invented replacement quote';
  state.brief.requirements[0].quote = 'No <video> & "animation".';
  state.review.issues.push({
    id: 'general',
    message: 'The available time needs clarification.',
    requirementId: null,
    quote: 'Invented source',
  });
  const html = reviewIssuesMarkup(state, 'en');
  assert.doesNotMatch(
    html,
    /<img|<video>|onerror="bad"|Invented replacement quote|Invented source/,
  );
  assert.ok(html.includes('&lt;img src=x onerror=&quot;bad&quot;&gt;'));
  assert.ok(html.includes('No &lt;video&gt; &amp; &quot;animation&quot;.'));
  assert.match(html, /<blockquote class="quote" data-raw dir="auto">/);
  assert.equal(
    (html.match(/<blockquote/g) || []).length,
    2,
    'General issues must not acquire a fabricated assignment citation.',
  );
});

test('empty and stale reviews have no current-conflict banner, including after an unsent correction', async () => {
  assert.equal(reviewIssuesMarkup(createProject(), 'en'), '');
  const state = reviewedProject();
  assert.ok(reviewIssuesMarkup(state, 'en'));
  const empty = structuredClone(state);
  empty.review.issues = [];
  assert.equal(reviewIssuesMarkup(empty, 'en'), '');
  const changed = update(state, 'draft/set', {
    field: 'answer',
    value: 'I will use six still images and submit the PDF.',
  });
  assert.notEqual(changed.review.revision, changed.revision);
  assert.ok(changed.review.issues.length, 'Old results remain recorded until the next review.');
  assert.equal(reviewIssuesMarkup(changed, 'en'), '');

  // Draft input refreshes the existing DOM without a full page render.
  const source = await readFile(new URL('../public/app.mjs', import.meta.url), 'utf8');
  const refresh = source.match(/function refreshPending\(\)\s*\{[\s\S]*?\}(?=\r?\nfunction )/)?.[0];
  assert.ok(refresh);
  const container = { innerHTML: reviewIssuesMarkup(state, 'en') };
  const pending = { textContent: '', classList: { toggle() {} } };
  new Function(
    'state',
    '$',
    'tr',
    'reviewIssuesMarkup',
    'getLocale',
    refresh + ';refreshPending();',
  )(
    changed,
    (selector) =>
      selector === '#review-issues' ? container : selector === '#pending-changes' ? pending : null,
    (key) => rt('en', key),
    reviewIssuesMarkup,
    () => 'en',
  );
  assert.equal(
    container.innerHTML,
    '',
    'Typing a correction must remove the outdated visible conclusion immediately.',
  );
});
