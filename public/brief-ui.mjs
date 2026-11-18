import { BRIEF_CATEGORIES } from './brief-categories.mjs';
import { bt } from './brief-i18n.mjs';
import { rt } from './refinement-i18n.mjs';
import { escapeHtml } from './refinement-ui.mjs';

const categoryOf = (record) =>
  BRIEF_CATEGORIES.includes(record?.category) ? record.category : 'requirements';
const defaultKeys = {
  requirements: 'newRequirements',
  submission: 'newSubmission',
  assessment: 'newAssessment',
  schedule: 'newSchedule',
};
const itemLabel = (record, locale) =>
  typeof record.label === 'string' &&
  record.label.trim() &&
  !/^(?:requirement|要求)\s*#?\d+$/iu.test(record.label.trim())
    ? record.label
    : bt(locale, defaultKeys[categoryOf(record)]);
const choices = (selected, locale) =>
  BRIEF_CATEGORIES.map(
    (category) =>
      `<option value="${category}"${category === selected ? ' selected' : ''}>${escapeHtml(bt(locale, category))}</option>`,
  ).join('');

export function createBriefItem(category, locale, id = globalThis.crypto.randomUUID()) {
  const selected = BRIEF_CATEGORIES.includes(category) ? category : 'requirements';
  return {
    id,
    category: selected,
    label: bt(locale, defaultKeys[selected]),
    text: '',
    quote: '',
    sourceType: 'student',
  };
}

/** Preserve source records when editing presentation metadata or extracted text. */
export function editBriefItem(items, id, field, value) {
  if (!['label', 'text', 'category'].includes(field) || typeof value !== 'string')
    throw new Error('Invalid assignment item edit.');
  if (field === 'category' && !BRIEF_CATEGORIES.includes(value))
    throw new Error('Invalid assignment section.');
  return items.map((item) =>
    item.id === id
      ? {
          ...item,
          [field]: value,
          ...(field === 'text' && item.sourceType === 'student' ? { quote: value } : {}),
        }
      : item,
  );
}

export function groupedBriefMarkup(items, locale) {
  const groups = BRIEF_CATEGORIES.map((category) => ({
    category,
    items: items
      .map((record, index) => ({ record, index }))
      .filter(({ record }) => categoryOf(record) === category),
  }));
  return `<div class="brief-groups" data-i18n-skip>${groups
    .filter((group) => group.items.length)
    .map(
      (group) =>
        `<section class="brief-group" data-brief-category="${group.category}" aria-labelledby="brief-group-${group.category}"><h3 id="brief-group-${group.category}" data-raw>${escapeHtml(bt(locale, group.category))}</h3><ul class="requirement-list">${group.items
          .map(({ record, index }) => {
            const label = itemLabel(record, locale),
              id = escapeHtml(record.id);
            return `<li class="requirement-row"><div class="brief-item-head"><input class="brief-item-label" id="brief-label-${index}" type="text" data-requirement-label="${id}" data-raw dir="auto" aria-label="${escapeHtml(bt(locale, 'itemLabel'))}" value="${escapeHtml(label)}"><select class="brief-item-category" id="brief-category-${index}" data-requirement-category="${id}" aria-label="${escapeHtml(bt(locale, 'category'))}">${choices(group.category, locale)}</select></div><label class="visually-hidden" for="requirement-${index}" data-raw>${escapeHtml(label)}</label><textarea id="requirement-${index}" rows="2" data-requirement="${id}" data-raw dir="auto">${escapeHtml(record.text)}</textarea><p class="source-type">${escapeHtml(rt(locale, record.sourceType === 'student' ? 'studentSource' : 'documentSource'))}</p>${record.quote && record.sourceType !== 'student' ? `<p class="quote" data-raw dir="auto">${escapeHtml(record.quote)}</p>` : ''}<button type="button" class="text-button" data-action="remove-requirement" data-id="${id}">${escapeHtml(bt(locale, 'removeItem'))}</button></li>`;
          })
          .join(
            '',
          )}</ul><button type="button" class="text-button brief-add-item" data-action="add-requirement" data-category="${group.category}">＋ ${escapeHtml(bt(locale, 'addItem'))}</button></section>`,
    )
    .join(
      '',
    )}<div class="brief-add-row"><select id="brief-add-category" aria-label="${escapeHtml(bt(locale, 'category'))}">${choices('requirements', locale)}</select><button type="button" class="text-button" data-action="add-requirement">＋ ${escapeHtml(bt(locale, 'addItem'))}</button></div></div>`;
}
