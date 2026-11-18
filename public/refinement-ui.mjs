import { rt } from './refinement-i18n.mjs';

export const escapeHtml = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );

/** Translate known identifiers only. A custom priority belongs to the student/model. */
export function priorityText(priority, translate = (value) => value) {
  const value = String(priority ?? '').trim();
  const known = {
    grades: 'High grades',
    'high grades': 'High grades',
    ease: 'Easier completion',
    'easier completion': 'Easier completion',
    interest: 'Personal interest',
    'personal interest': 'Personal interest',
  };
  return known[value.toLowerCase()] ? translate(known[value.toLowerCase()]) : value;
}

const button = (action, label, attrs = '') =>
  `<button type="button" class="button" data-action="${action}" ${attrs}>${escapeHtml(label)}</button>`;

/** Only the current review can identify a current conflict. Quotes come from confirmed sources. */
export function reviewIssuesMarkup(state, locale) {
  const review = state?.review;
  if (
    !Number.isInteger(review?.revision) ||
    review.revision !== state.revision ||
    !review.issues?.length
  )
    return '';
  const tr = (key) => rt(locale, key);
  const requirements = state.brief?.requirements || [];
  return `<section class="review-issues" role="alert" aria-labelledby="review-issues-title"><h3 id="review-issues-title">${escapeHtml(tr('reviewIssuesTitle'))}</h3>${review.issues
    .map((issue) => {
      const requirement = requirements.find((item) => item.id === issue.requirementId);
      const quote = typeof requirement?.quote === 'string' ? requirement.quote : '';
      return `<article class="review-issue"><p data-raw dir="auto">${escapeHtml(issue.message)}</p>${quote.trim() ? `<p class="source-type">${escapeHtml(tr(requirement.sourceType === 'student' ? 'studentSource' : 'documentSource'))}</p><blockquote class="quote" data-raw dir="auto">${escapeHtml(quote)}</blockquote>` : ''}</article>`;
    })
    .join(
      '',
    )}<p class="help-line">${escapeHtml(tr('reviewIssuesHelp'))}</p>${button('brief', tr('reviewIssuesBrief'))}</section>`;
}

export function uncertaintyMarkup(uncertainties, locale) {
  if (!uncertainties?.length) return '';
  const tr = (key, values) => rt(locale, key, values);
  return `<section class="uncertainty-panel" aria-label="${escapeHtml(tr('uncertainty'))}"><h3>${escapeHtml(tr('uncertainty'))}</h3><p class="help-line">${escapeHtml(tr('uncertaintyHelp'))}</p>${uncertainties
    .map((item) => {
      const resolved = item.status !== 'unresolved';
      return `<div class="uncertainty-item" data-uncertainty="${escapeHtml(item.id)}"><p data-raw dir="auto">${escapeHtml(item.text)}</p>${resolved ? `<p class="uncertainty-resolution"><span>${escapeHtml(tr('uncertaintyResolved'))}</span> · <span data-raw dir="auto">${escapeHtml(item.resolution)}</span></p>${button('uncertainty-reopen', tr('uncertaintyReopen'), `data-id="${escapeHtml(item.id)}"`)}` : `<label for="uncertainty-${escapeHtml(item.id)}">${escapeHtml(tr('uncertaintyResolution'))}</label><textarea id="uncertainty-${escapeHtml(item.id)}" data-uncertainty-draft="${escapeHtml(item.id)}" rows="2">${escapeHtml(item.resolution || '')}</textarea>${button('uncertainty-resolve', tr('uncertaintyResolve'), `data-id="${escapeHtml(item.id)}"`)}`}</div>`;
    })
    .join('')}</section>`;
}

export function questionHistoryMarkup(items, locale) {
  if (!items?.length) return '';
  const tr = (key) => rt(locale, key);
  return `<section class="question-history"><h3>${escapeHtml(tr('qaHistory'))}</h3>${items.map((item) => `<article class="question-record"><p class="question-record-title" data-raw dir="auto">${escapeHtml(item.question)}</p><div class="ask-answer" data-raw dir="auto">${escapeHtml(item.answer)}</div>${item.appliedInputId ? `<p class="help-line">${escapeHtml(tr('qaApplied'))}</p>` : `<p class="help-line">${escapeHtml(tr('qaApplyHint'))}</p>${button('qa-apply', tr('qaApply'), `data-id="${escapeHtml(item.id)}"`)}`}</article>`).join('')}</section>`;
}

export function directionHistoryMarkup(sets, locale) {
  const tr = (key, values) => rt(locale, key, values);
  if (!sets?.length) return `<p class="body-copy">${escapeHtml(tr('historyEmpty'))}</p>`;
  return `<p class="body-copy">${escapeHtml(tr('historyIntro'))}</p><div class="direction-history">${sets.map((set, index) => `<section class="history-set"><h3>${escapeHtml(tr('historySet', { number: sets.length - index }))}</h3><p class="help-line">${escapeHtml(tr('historyStale'))} · <time datetime="${escapeHtml(set.createdAt)}">${escapeHtml(new Date(set.createdAt).toLocaleString(locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }))}</time></p>${set.directions.map((direction) => `<article class="history-direction"><h4 data-raw dir="auto">${escapeHtml(direction.title)}</h4><p data-raw dir="auto">${escapeHtml(direction.summary)}</p><details><summary>${escapeHtml(priorityText(direction.priority))}</summary><p data-raw dir="auto">${escapeHtml(direction.fit)}</p><p data-raw dir="auto">${escapeHtml(direction.tradeoff)}</p></details>${button('history-revisit', tr('historyReview'), `data-id="${escapeHtml(direction.id)}" data-history-id="${escapeHtml(set.id)}"`)}</article>`).join('')}</section>`).join('')}</div>`;
}
