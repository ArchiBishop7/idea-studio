import { generatedTextFields, translatedProject } from './project-translation.mjs';
import { bt as briefText } from './brief-i18n.mjs';
import { readBackup, transferText } from './project-transfer.mjs';
import { PREVIEW_LOCALES } from './preview-locales.mjs';
import { demoBrief, demoQuotes } from './demo-brief.mjs';
import {
  combinationCopy,
  readyMessage,
  pageGuide,
  finishText,
  finishPrompt,
} from './combination-i18n.mjs';
import { connectionGroups, connectionGroupLabel } from './connections.mjs';
import { mountBoard } from './board.mjs';
import { boardText } from './board-i18n.mjs';
import { shelfText } from './shelf-i18n.mjs';
import { clarificationText } from './clarification-i18n.mjs';
import { productText, readinessLabel } from './product-i18n.mjs';
import {
  createProject,
  migrateProject,
  update,
  prepareTurn,
  applyTurn,
  buildContext,
  combinationKey,
} from './state.mjs';
import {
  LANGUAGES,
  getLocale,
  getLanguage,
  setLocale,
  t,
  localize,
  friendlyError,
  applyDocumentLanguage,
} from './i18n.mjs';
import { rt } from './refinement-i18n.mjs';
import { firstTurnText } from './first-turn-i18n.mjs';
import { entryText } from './entry-i18n.mjs';
import { groupedBriefMarkup, createBriefItem, editBriefItem } from './brief-ui.mjs';
import {
  priorityText,
  reviewIssuesMarkup,
  uncertaintyMarkup,
  questionHistoryMarkup,
  directionHistoryMarkup,
} from './refinement-ui.mjs';
const tr = (key, values) => rt(getLocale(), key, values);
const STORAGE = 'idea-studio-project-v1';
const DRAFT_STORAGE = STORAGE + '-draft';
let snapshotId;
let briefEditVersion = 0;
const $ = (s, r = document) => r.querySelector(s),
  $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (v) =>
  String(v ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const colors = ['mint', 'rose', 'lime'],
  arrow = '<span class="arrow" aria-hidden="true">↗</span>';
let state = createProject();
const ui = {
  explanationHistory: {},
  questionDrafts: {},
  mode: 'live',
  status: { ready: false, model: '' },
  busy: false,
  busyText: '',
  notice: '',
  noticeCode: '',
  error: false,
  file: null,
  connecting: null,
  dragging: null,
  dialogKind: null,
  dialogData: null,
  returnFocus: null,
  tourStep: null,
  briefReturn: false,
  fileRevision: 0,
  noticeRaw: false,
  extractedBriefText: '',
  showAllClues: false,
  lastRestoredId: null,
  undoLink: null,
  request: null,
};
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE) || 'null');
  if (
    saved?.project &&
    Array.isArray(saved.project.inputs) &&
    saved.project.brief &&
    saved.project.draft
  ) {
    state = migrateProject(saved.project);
    snapshotId = saved.snapshotId;
    restorePendingDraft();
    ui.contentTranslations = Array.isArray(saved.contentTranslations)
      ? saved.contentTranslations.slice(-4)
      : [];
    ui.questionDrafts = saved.questionDrafts || {};
    ui.explanationHistory = saved.explanationHistory || {};
    ui.mode = saved.mode === 'preview' ? 'preview' : 'live';
    if (saved.fileName) ui.missingFile = saved.fileName;
    if (typeof saved.extractedBriefText === 'string')
      ui.extractedBriefText = saved.extractedBriefText;
  }
} catch {
  ui.notice =
    'The saved project could not be read. A new workspace is open; your previous saved data has not been overwritten.';
  ui.error = true;
}
function restorePendingDraft() {
  if (!snapshotId) return;
  const raw = localStorage.getItem(DRAFT_STORAGE);
  if (!raw) return;
  let pending;
  try {
    pending = JSON.parse(raw);
  } catch {
    return;
  }
  if (
    pending?.snapshotId !== snapshotId ||
    !Number.isSafeInteger(pending.revision) ||
    pending.revision <= state.revision ||
    !['id', 'answer', 'choice', 'thought'].every((key) => typeof pending.draft?.[key] === 'string')
  )
    return;
  state.draft = pending.draft;
  state.revision = pending.revision;
  return true;
}
let needsFullSave = false;
function save(draftOnly = false) {
  try {
    if (
      draftOnly &&
      !needsFullSave &&
      snapshotId &&
      state.screen === 'explore' &&
      !state.selectedDirectionId
    ) {
      localStorage.setItem(
        DRAFT_STORAGE,
        JSON.stringify({ snapshotId, revision: state.revision, draft: state.draft }),
      );
    } else {
      const nextSnapshotId = crypto.randomUUID();
      const snapshot = {
        snapshotId: nextSnapshotId,
        project: state,
        questionDrafts: ui.questionDrafts,
        explanationHistory: ui.explanationHistory,
        mode: ui.mode,
        contentTranslations: ui.contentTranslations || [],
        extractedBriefText: ui.extractedBriefText || '',
        fileName: ui.file?.name || ui.missingFile || null,
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem(STORAGE, JSON.stringify(snapshot));
      snapshotId = nextSnapshotId;
      localStorage.removeItem(DRAFT_STORAGE);
    }
    needsFullSave = false;
    $('#storage-warning').hidden = true;
    $('#save-status').textContent = 'Saved on this browser';
    localize($('#save-status'));
  } catch {
    needsFullSave = true;
    const warning = $('#storage-warning');
    localize(warning);
    warning.hidden = false;
    $('#save-status').textContent = 'Could not save';
    localize($('#save-status'));
  }
}
function syncPreviewSource() {
  if (ui.mode !== 'preview' || state.screen !== 'brief' || state.brief.confirmed) return;
  const brief = state.brief,
    oldQuotes = demoQuotes(brief.text),
    text = demoBrief(getLocale());
  if (!oldQuotes || brief.text === text) return;
  const quotes = demoQuotes(text);
  const templates = Object.values(PREVIEW_LOCALES);
  const target = PREVIEW_LOCALES[getLocale()];
  const requirements = brief.requirements.map((item) => {
    const index = oldQuotes.indexOf(item.quote);
    if (index < 0 || item.id !== 'demo-r' + (index + 1)) return item;
    const wording = (locale) => (index === 4 ? locale.reqSchedule : locale.req[index]);
    return {
      ...item,
      quote: quotes[index],
      text: templates.some((locale) => wording(locale) === item.text) ? wording(target) : item.text,
      label: templates.some((locale) => locale.reqLabels[index] === item.label)
        ? target.reqLabels[index]
        : item.label,
    };
  });
  const summary = templates.some((locale) => locale.brief === brief.summary)
    ? target.brief
    : brief.summary;
  state = update(state, 'brief/text', { text });
  if (summary || requirements.length)
    state = update(state, 'brief/review', { ...brief, summary, requirements });
  save();
}
syncPreviewSource();
function syncExplorationDraft(editedField) {
  if (state.screen !== 'explore' || !restorePendingDraft()) return;
  for (const field of ['answer', 'thought']) {
    const input = document.querySelector('[data-field="' + field + '"]');
    if (field !== editedField && input && input.value !== state.draft[field])
      input.value = state.draft[field];
  }
  for (const option of document.querySelectorAll('[data-choice]')) {
    option.setAttribute('aria-pressed', String(option.dataset.choice === state.draft.choice));
  }
}
function change(type, payload = {}, rerender = true) {
  try {
    if (type === 'draft/set') syncExplorationDraft(payload.field);
    state = update(state, type, payload);
    if (!['clue/disconnect', 'tutorial/seen', 'direction/qa'].includes(type)) ui.undoLink = null;
    save(type === 'draft/set');
    if (rerender) render();
    else refreshPending();
    return true;
  } catch (e) {
    notice(e.message, true);
    return false;
  }
}
function notice(message, error = false, code = '') {
  ui.noticeRaw = false;
  ui.notice = message;
  ui.noticeCode = code;
  ui.error = error;
  renderNotice();
}
function renderNotice() {
  $('#notice').innerHTML = ui.busy
    ? '<div class="notice"><span class="busy-dot" aria-hidden="true"></span><p>' +
      esc(ui.busyText) +
      '</p>' +
      btn('cancel-request', esc(tr('cancelRequest')), '', 'text-button') +
      '</div>'
    : ui.notice
      ? '<div class="notice ' +
        (ui.error ? 'error' : '') +
        '" ' +
        (ui.error ? 'role="alert"' : '') +
        '><p ' +
        (ui.noticeRaw ? 'data-raw' : '') +
        '>' +
        esc(ui.error ? friendlyError(ui.notice, ui.noticeCode) : ui.notice) +
        '</p>' +
        (ui.error && ['api_key_missing', 'demo_only'].includes(ui.noticeCode)
          ? btn('demo', 'Try a guided example', '', 'text-button')
          : '') +
        (ui.undoLink ? btn('undo-disconnect', esc(tr('undo')), '', 'text-button') : '') +
        '<button data-action="dismiss" aria-label="Dismiss message">×</button></div>'
      : '';
  localize($('#notice'));
}
function refreshPending() {
  if (!state.selectedDirectionId) $('[data-chosen-shortcut]')?.remove();
  const el = $('#pending-changes');
  if (el) {
    const pending = state.review.revision !== state.revision;
    el.textContent = tr(pending ? 'pendingInputs' : 'processed');
    el.classList.toggle('is-pending', pending);
  }
  const issues = $('#review-issues');
  if (issues) issues.innerHTML = reviewIssuesMarkup(state, getLocale());
}
function renderMode() {
  const banner = $('#mode-banner');
  banner.hidden = ui.mode !== 'preview';
  banner.innerHTML =
    ui.mode === 'preview'
      ? '<span data-raw>' +
        esc(productText(getLocale(), 3)) +
        '</span>' +
        btn('reset', esc(productText(getLocale(), 4)), 'data-raw', 'text-button')
      : '';
  const settings = $('[data-action="settings"]');
  if (settings) {
    settings.querySelector('span').textContent = productText(getLocale(), 0);
    settings.dataset.rawAttrs = 'aria-label';
    settings.setAttribute('aria-label', productText(getLocale(), 0));
  }
}

function progress() {
  const step = { brief: 0, entry: 1, explore: 2, directions: 3, chosen: 3 }[state.screen] ?? 0;
  $('#progress').innerHTML = ['Your brief', 'Starting point', 'Explore', 'Your direction']
    .map(
      (name, i) =>
        (i ? '<span class="divider" aria-hidden="true"></span>' : '') +
        '<span class="' +
        (i === step && !(state.screen === 'chosen' && state.explorationFinished)
          ? 'current'
          : i <= step
            ? 'done'
            : '') +
        '" ' +
        (i === step ? 'aria-current="step"' : '') +
        '><i aria-hidden="true">' +
        (i < step || (state.screen === 'chosen' && state.explorationFinished) ? '✓' : i + 1) +
        '</i>' +
        name +
        '</span>',
    )
    .join('');
}
function btn(a, text, extra = '', cls = 'button') {
  return '<button class="' + cls + '" data-action="' + a + '" ' + extra + '>' + text + '</button>';
}
function heading(title, subtitle, tools = '') {
  return (
    '<div class="page-heading"><div><span class="eyebrow">' +
    (state.screen === 'chosen' ? 'A direction to make your own' : 'Your idea, taking shape') +
    '</span><h1>' +
    title +
    '</h1><p>' +
    subtitle +
    '</p></div>' +
    tools +
    '</div>'
  );
}

function protectRaw(root = document) {
  const selectors =
    '#question-title,.answer-options [data-choice],.clue-content,.restore-button,.connection>span:not(.connection-mark),.direction-body>h2,.direction-body>p,.chosen-card>h2,.chosen-card>p,.ask-answer,.raw-text';
  for (const el of $$(selectors, root)) {
    el.dataset.raw = '';
    el.setAttribute('dir', 'auto');
  }
}
function syncLanguageButton() {
  const item = LANGUAGES.find((x) => x.code === getLocale()),
    label = $('#current-language');
  if (label) {
    label.textContent = item.name;
    label.lang = item.code;
  }
  const button = $('#language-switch');
  if (button) button.setAttribute('aria-label', t('Switch language'));
}

export function textWithoutAttachmentExcerpt(text, generatedText) {
  return generatedText && text === generatedText ? '' : text;
}
export function isCurrentBriefSource(
  requestRevision,
  requestFileRevision,
  currentRevision,
  currentFileRevision,
) {
  return requestRevision === currentRevision && requestFileRevision === currentFileRevision;
}

function reqs() {
  return state.brief.requirements || [];
}
function renderBriefAccess() {
  const note = $('#brief-access-note');
  if (!note) return;
  const preview = ui.mode === 'preview',
    unconfigured = ui.status.checked && !ui.status.ready;
  if (preview && demoQuotes(state.brief.text) && !ui.file && !ui.missingFile) {
    note.hidden = true;
    note.innerHTML = '';
    return;
  }
  note.hidden = !(preview || unconfigured);
  if (note.hidden) {
    note.innerHTML = '';
    return;
  }
  note.innerHTML =
    '<p>' +
    esc(preview ? productText(getLocale(), 3) : productText(getLocale(), 2)) +
    '</p>' +
    btn('demo', 'Try a guided example', '', 'button');
  localize(note);
  lockBusyControls();
}
function reviewMarkup() {
  if (!state.brief.reviewStarted && !reqs().length && !state.brief.summary) return '';
  return (
    '<section class="review-panel" aria-labelledby="review-title"><div class="review-heading"><div><span class="eyebrow">Check before we begin</span><h2 id="review-title">Here’s what the brief asks for.</h2></div><span class="small">You can edit every line.</span></div><label for="brief-summary">Assignment summary</label><textarea id="brief-summary" class="summary-input" data-field="brief-summary">' +
    esc(state.brief.summary) +
    '</textarea>' +
    groupedBriefMarkup(reqs(), getLocale()) +
    uncertaintyMarkup(state.brief.uncertainties, getLocale()) +
    '<div class="review-confirm">' +
    btn(
      'confirm-brief',
      'Confirm brief ' + arrow,
      ui.busy || !reqs().length ? 'disabled' : '',
      'button primary',
    ) +
    '<span class="small">' +
    (reqs().length
      ? 'Use your assignment as the final source.'
      : esc(briefText(getLocale(), 'emptyList'))) +
    '</span></div></section>'
  );
}
function briefPage() {
  return (
    heading(
      'Start with a little context.',
      'Bring your assignment. We’ll find the requirements, then make room for your own interests.',
    ) +
    (state.explorationFinished && state.selectedDirectionId
      ? '<div class="chosen-actions" data-chosen-shortcut>' +
        btn('reopen', esc(finishText(getLocale(), 2)), 'data-raw', 'button') +
        '</div>'
      : '') +
    '<div class="brief-layout"><section class="paper-panel"><div id="brief-access-note" class="brief-access-note" hidden></div><label for="brief-text">Assignment requirements</label><textarea id="brief-text" class="brief-text" data-field="brief-text" placeholder="Paste the assignment here — include the format, timing, constraints, and anything your instructor will look for.">' +
    esc(state.brief.text) +
    '</textarea><div class="upload-row"><label class="file-label"><span aria-hidden="true">＋</span> Attach your brief<input id="brief-file" type="file" accept=".txt,.md,.pdf,.png,.jpg,.jpeg,text/plain,text/markdown,application/pdf,image/png,image/jpeg"></label><span class="small">TXT, MD, PDF, PNG or JPG · up to 3 MB</span></div>' +
    (ui.file || ui.missingFile
      ? '<p class="file-name"><span data-raw dir="auto">' +
        esc(ui.file?.name || ui.missingFile) +
        '</span>' +
        (ui.missingFile ? ' · attach again to review this file' : ' · attached') +
        ' ' +
        btn('remove-file', 'Remove', '', 'text-button') +
        '</p>'
      : '') +
    '<div class="brief-actions"><span class="small">Your brief stays editable throughout.</span>' +
    btn(
      'review-brief',
      ui.busy ? 'Reviewing…' : 'Review brief ' + arrow,
      ui.busy ? 'disabled' : '',
      'button primary',
    ) +
    '</div><button class="example-button example-mobile" style="display:none" data-action="demo">Try a guided example</button>' +
    reviewMarkup() +
    '</section><aside class="brief-intro"><div class="intro-art" aria-hidden="true"><div class="mini-note"><small>Notice something</small><p>The things you keep coming back to.</p></div><div class="mini-note"><small>Follow a thread</small><p>A question worth exploring…</p></div><div class="mini-note"><small>Make it yours</small><p>One small beginning.</p></div></div><p class="intro-caption">You don’t need an idea yet.</p><p class="intro-copy">A few questions, a handful of clues, and space to discover something you actually want to make.</p><button class="example-button" data-action="demo">Try a guided example <span aria-hidden="true">↗</span></button><p class="intro-copy" style="font-size:11px;margin-top:7px">Explore a sample photography assignment.</p></aside></div>'
  );
}
function entryPage() {
  const start = state.entryEdit?.draft || state.start,
    editing = !!state.entryEdit;
  return (
    '<div class="entry-page">' +
    heading(
      'Where are you starting?',
      'Both are good places to begin. A finished idea is not a prerequisite.',
    ) +
    '<div class="entry-options"><button class="entry-option" data-action="entry-kind" data-kind="none" aria-pressed="' +
    (start.kind === 'none') +
    '"><span class="option-radio" aria-hidden="true"></span><span class="option-art" aria-hidden="true">a blank page…</span><span><h2>I’m starting fresh</h2><p>Let’s notice your interests, experiences, and the small things around you.</p></span></button><button class="entry-option" data-action="entry-kind" data-kind="rough" aria-pressed="' +
    (start.kind === 'rough') +
    '"><span class="option-radio" aria-hidden="true"></span><span class="option-art" aria-hidden="true">a little spark!</span><span><h2>I have a rough idea</h2><p>Bring the unfinished version. We’ll explore what’s interesting about it.</p></span></button></div>' +
    (start.kind === 'rough'
      ? '<div class="rough-area"><label for="rough-idea">What’s the thought you’re starting with?</label><textarea id="rough-idea" data-field="rough-idea" placeholder="It could be a topic, a moment, a question, or something you’ve always wanted to try.">' +
        esc(start.idea) +
        '</textarea><p class="help-line">A sentence or two is enough. It’s okay if it changes.</p></div>'
      : '') +
    '<div class="entry-next">' +
    (editing
      ? btn(
          'entry-resume',
          esc(entryText(getLocale(), 'backToExploration')),
          'data-raw',
          'text-button',
        )
      : btn('brief', 'Review assignment', '', 'text-button')) +
    btn(
      'start',
      (editing ? esc(entryText(getLocale(), 'updateAndContinue')) : 'Start exploring') +
        ' ' +
        arrow,
      (!start.kind || ui.busy ? 'disabled ' : '') + (editing ? 'data-raw' : ''),
      'button primary',
    ) +
    '</div></div>'
  );
}
const questionHelp = new Map();
function currentHelp() {
  const key = JSON.stringify(['clarification', state.id, state.question?.id, state.question?.text]);
  if (!questionHelp.has(key)) {
    questionHelp.set(key, {
      key,
      open: false,
      draft: ui.questionDrafts[key] || '',
      history: ui.explanationHistory[key] || [],
      error: '',
    });
  }
  return questionHelp.get(key);
}
function saveHelpDraft(help, value) {
  help.draft = value;
  if (value) ui.questionDrafts[help.key] = value;
  else delete ui.questionDrafts[help.key];
  save();
}
const helpText = (i) => clarificationText(getLocale(), i);
function helpMarkup() {
  const h = currentHelp();
  return (
    '<div class="question-help" data-raw>' +
    btn(
      'help-toggle',
      esc(helpText(h.open ? 4 : 0)),
      'aria-expanded="' + h.open + '" aria-controls="question-explanation"',
      'text-button',
    ) +
    (h.open
      ? '<section id="question-explanation" class="question-explanation"><div aria-live="polite">' +
        h.history
          .map(
            (x) =>
              '<div class="explanation-turn">' +
              (x.question ? '<p class="explanation-query">' + esc(x.question) + '</p>' : '') +
              '<p class="explanation-answer" dir="auto">' +
              esc(x.answer) +
              '</p></div>',
          )
          .join('') +
        (h.error ? '<p role="alert">' + esc(h.error) + '</p>' : '') +
        '</div><label for="clarification-input">' +
        esc(helpText(1)) +
        '</label><textarea id="clarification-input" rows="2" maxlength="4000">' +
        esc(h.draft) +
        '</textarea>' +
        btn('help-ask', esc(helpText(2)), ui.busy ? 'disabled' : '', 'button') +
        '</section>'
      : '') +
    '</div>'
  );
}
async function explainQuestion() {
  const h = currentHelp();
  h.draft = $('#clarification-input')?.value || '';
  h.error = '';
  ui.busy = true;
  ui.busyText = helpText(3);
  render();
  try {
    const result = await api('/api/explain', {
      mode: ui.mode,
      question: state.question,
      brief: { summary: state.brief.summary, requirements: state.brief.requirements },
      context: buildContext(state),
      query: h.draft,
      history: h.history.slice(-6),
    });
    if (typeof result.answer !== 'string' || !result.answer.trim())
      throw new Error('Something went wrong. Your work is saved. Try again.');
    h.history.push({ question: h.draft, answer: result.answer });
    ui.explanationHistory[h.key] = h.history;
    saveHelpDraft(h, '');
  } catch (e) {
    h.error = e.message;
  } finally {
    ui.busy = false;
    render();
    $('#question-explanation')?.scrollIntoView({ block: 'nearest' });
  }
}
function questionMarkup() {
  const q = state.question;
  if (!q && state.round > 0)
    return (
      '<section id="question-panel" class="question-panel"><h2>' +
      esc(tr('nextReviewTitle')) +
      '</h2><p class="question-context">' +
      esc(tr('nextReviewCopy')) +
      '</p>' +
      btn(
        'continue',
        esc(tr('reviewChanges')) + ' ' + arrow,
        ui.busy ? 'disabled' : '',
        'button primary',
      ) +
      '</section>'
    );
  if (!q)
    return (
      '<section id="question-panel" class="question-panel" aria-busy="' +
      ui.busy +
      '"><span class="eyebrow">A small first step</span><h2' +
      (ui.busy ? ' data-raw' : '') +
      '>' +
      esc(
        ui.busy
          ? firstTurnText(getLocale(), 'preparing')
          : 'Let’s find a useful starting question.',
      ) +
      '</h2><p class="question-context"' +
      (ui.busy ? ' data-raw' : '') +
      '>' +
      esc(
        ui.busy
          ? firstTurnText(getLocale(), 'copy')
          : 'Your confirmed brief and starting point are ready.',
      ) +
      '</p>' +
      btn(
        'continue',
        ui.busy ? esc(firstTurnText(getLocale(), 'preparing')) : 'Find my first question ' + arrow,
        ui.busy ? 'disabled' : '',
        'button primary',
      ) +
      (ui.busy
        ? ''
        : '<p class="help-line">' +
          (ui.mode === 'preview'
            ? 'This example uses a guided set of sample questions.'
            : 'Your confirmed brief and starting point are ready.') +
          '</p>') +
      '</section>'
    );
  const options = (q.options || []).map((o) => (typeof o === 'string' ? o : o.text));
  return (
    '<section id="question-panel" class="question-panel" aria-labelledby="question-title"><span class="eyebrow">A question to follow · ' +
    Math.max(1, state.round) +
    '</span><h2 id="question-title">' +
    esc(q.text) +
    '</h2>' +
    helpMarkup() +
    '<p class="question-context">Choose what feels closest, or answer in your own way.</p><div class="answer-options">' +
    options
      .map(
        (text) =>
          '<button class="answer-option" data-choice="' +
          esc(text) +
          '" aria-pressed="' +
          (state.draft.choice === text) +
          '">' +
          esc(text) +
          '</button>',
      )
      .join('') +
    '</div><div class="alternative-options">' +
    ['Not sure', 'None fit']
      .map(
        (text) =>
          '<button data-fixed-choice data-choice="' +
          esc(text) +
          '" aria-pressed="' +
          (state.draft.choice === text) +
          '">' +
          text +
          '</button>',
      )
      .join('') +
    '</div><label for="answer-text">Or put it in your own words</label><textarea id="answer-text" data-field="answer" placeholder="A memory, an observation, a half-formed thought…">' +
    esc(state.draft.answer) +
    '</textarea><div class="question-bottom"><span id="switch-question-note" class="saved-label">Switching questions keeps your answer with this question.</span>' +
    btn(
      'different-question',
      'Try a different question',
      (ui.busy ? 'disabled ' : '') + 'aria-describedby="switch-question-note"',
      'text-button',
    ) +
    '</div></section>'
  );
}
function clueTitle(id) {
  return state.clues.find((c) => c.id === id)?.title || 'Earlier clue';
}
function connectionResultMarkup(clue, allLinks) {
  if (!clue.connectionIds?.length && !clue.sourceIds?.length) return '';
  const links = allLinks.filter(
    (link) =>
      (clue.connectionIds || []).includes(link.id) ||
      (clue.sourceIds?.includes(link.a) && clue.sourceIds?.includes(link.b)),
  );
  if (!links.length) return '';
  return (
    '<details class="clue-connection-result"><summary>' +
    esc(tr('connectionResult')) +
    '</summary>' +
    links
      .map(
        (link) =>
          '<p data-raw dir="auto">' +
          esc(clueTitle(link.a)) +
          ' + ' +
          esc(clueTitle(link.b)) +
          '</p>',
      )
      .join('') +
    '</details>'
  );
}
const bt = (i) => boardText(getLocale(), i);
function roundIds() {
  return [...new Set(state.links.flatMap((l) => [l.a, l.b]))].filter((id) =>
    state.clues.some((c) => c.id === id && c.status === 'active'),
  );
}
function groupCopy(key, zh, en, n) {
  return combinationCopy(getLocale(), key, zh, en, n);
}

function roundHelp() {
  return groupCopy(
    'help',
    '每轮组合一组线索。拖到当前组合加入；想换一组，请先点“重新组合”。',
    'Explore one combination per round. Drag a clue into the current combination, or reset it to start another.',
  );
}
function repeatedCombinationNotice() {
  const h = (state.combinationHistory || []).findLast((h) => h.key === combinationKey(roundIds()));
  return h
    ? '<aside class="combination-repeat" role="status" data-raw>' +
        groupCopy(
          'repeat',
          '这组线索已经探索过。可以查看历史记录，或继续寻找新的角度。',
          'You have explored this combination before. Review its history, or continue with a new angle.',
        ) +
        '</aside>'
    : '';
}
function combinationHistoryMarkup() {
  const history = state.combinationHistory || [],
    key = combinationKey(roundIds());
  const repeated = history.findLast((h) => h.key === key);
  return (
    (repeated
      ? '<aside class="combination-repeat" role="status" data-raw>' +
        groupCopy(
          'previous',
          '这组线索已在第 {n} 轮探索过。可以查看下方记录，或保留当前组合继续寻找新的角度。',
          'Explored in round {n}. Review the record below, or keep this combination to explore a new angle.',
          repeated.round,
        ) +
        '</aside>'
      : '') +
    '<section class="combination-history" data-raw><h3>' +
    groupCopy('history', '已探索的组合', 'Previously explored combinations') +
    ' <small>' +
    history.length +
    '</small></h3>' +
    (history.length
      ? [...history]
          .reverse()
          .map(
            (h) =>
              '<details><summary>' +
              groupCopy('round', '第 {n} 轮', 'Round {n}', h.round) +
              ' · ' +
              h.clues.map((c) => esc(c.title)).join(' ＋ ') +
              '</summary>' +
              (h.question ? '<p>' + esc(h.question.text) + '</p>' : '') +
              h.results
                .map((c) => '<p><strong>' + esc(c.title) + '</strong> ' + esc(c.detail) + '</p>')
                .join('') +
              btn(
                'reuse-combination',
                groupCopy('reuse', '再次探索这组', 'Explore this combination again'),
                'data-id="' +
                  esc(h.id) +
                  '" ' +
                  (state.links.length ||
                  h.clues.some(
                    (c) => !state.clues.some((n) => n.id === c.id && n.status === 'active'),
                  )
                    ? 'disabled'
                    : ''),
                'button',
              ) +
              '</details>',
          )
          .join('')
      : '<p>' +
        groupCopy(
          'empty',
          '完成一轮组合探索后，记录会保存在这里。',
          'Completed combination explorations will appear here.',
        ) +
        '</p>') +
    '</section>'
  );
}
function roundSummary() {
  const ids = roundIds();
  return (
    '<section class="round-summary" data-raw><div><strong>' +
    (ids.length
      ? groupCopy('count', '本轮探索 · {n} 条线索', 'This round · {n} clues', ids.length)
      : groupCopy('none', '本轮尚未组合线索', 'No combination selected')) +
    '</strong><p>' +
    (ids.length
      ? ids.map((id) => esc(clueTitle(id))).join(' ＋ ')
      : groupCopy(
          'optional',
          '可以直接回答问题，也可以连接线索一起探索。',
          'Answer the question directly, or connect clues to explore together.',
        )) +
    '</p></div>' +
    (ids.length
      ? btn('reset-round', groupCopy('reset', '重新组合', 'Reset combination'), '', 'text-button')
      : '') +
    '</section>'
  );
}
function cardMarkup(c, i, connected, allLinks) {
  return (
    '<article data-raw-attrs="aria-label" class="clue-card ' +
    colors[i % 3] +
    '" data-clue="' +
    esc(c.id) +
    '" data-focused="' +
    (state.focusId === c.id) +
    '" data-connecting="' +
    (ui.connecting === c.id) +
    '" draggable="false" aria-label="' +
    esc(c.title) +
    '"><div class="clue-top" tabindex="0" role="button" data-raw-attrs="aria-label" aria-label="' +
    esc(bt(7)) +
    '"><span>' +
    (c.origin === 'student' ? 'Your own words' : 'Clue summary') +
    '</span>' +
    (state.focusId === c.id ? '<span>· In focus</span>' : '') +
    '<button class="board-pin" data-focus-slot="pin" data-action="connect" data-id="' +
    esc(c.id) +
    '" data-raw-attrs="aria-label" aria-label="' +
    esc(t('Connect') + ' ' + c.title) +
    '"><span aria-hidden="true"></span></button></div><div class="clue-content"><h3>' +
    esc(c.title) +
    '</h3>' +
    (c.detail && c.detail !== c.title ? '<p class="clue-detail">' + esc(c.detail) + '</p>' : '') +
    '</div>' +
    (connected
      ? '<span class="round-member" data-raw>' +
        groupCopy('member', '本轮探索', 'Exploring this round') +
        '</span>'
      : '') +
    connectionResultMarkup(c, allLinks) +
    '<div class="clue-controls">' +
    btn(
      'focus',
      'Focus',
      'data-id="' + esc(c.id) + '" aria-pressed="' + (state.focusId === c.id) + '"',
      '',
    ) +
    btn(
      'connect',
      ui.connecting ? esc(bt(ui.connecting === c.id ? 4 : 5)) : t('Connect'),
      'data-raw data-id="' + esc(c.id) + '" aria-pressed="' + (ui.connecting === c.id) + '"',
      '',
    ) +
    btn('aside', 'Set aside', 'data-id="' + esc(c.id) + '"', '') +
    btn('correct', 'Correct', 'data-id="' + esc(c.id) + '"', '') +
    '</div></article>'
  );
}
const st = (i) => shelfText(getLocale(), i);
function shelfMarkup(aside) {
  return (
    '<section id="aside-shelf" class="aside-shelf" data-drop-shelf data-raw aria-label="' +
    esc(st(0)) +
    '"><header><h3>' +
    esc(st(0)) +
    ' <span class="shelf-count">' +
    aside.length +
    '</span></h3><span class="shelf-icon" aria-hidden="true">↘</span></header><p>' +
    esc(st(1)) +
    '</p><div class="shelf-items">' +
    aside
      .map(
        (c) =>
          '<article class="shelf-item"><strong dir="auto">' +
          esc(c.title) +
          '</strong>' +
          btn(
            'restore',
            esc(st(2)) + ' ↗',
            'data-id="' + esc(c.id) + '" aria-label="' + esc(st(2) + ' ' + c.title) + '"',
            'restore-button',
          ) +
          '</article>',
      )
      .join('') +
    '</div>' +
    (aside.length ? '' : '<div class="shelf-empty">' + esc(st(3)) + '</div>') +
    '</section>'
  );
}
function highlightPlace(selector) {
  const el = $(selector);
  if (!el) return;
  el.scrollIntoView({
    block: 'nearest',
    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
  });
  el.classList.remove('placement-highlight');
  requestAnimationFrame(() => el.classList.add('placement-highlight'));
}
function setAside(id) {
  ui.connecting = null;
  if (change('clue/aside', { id })) {
    ui.noticeRaw = true;
    ui.notice = st(4);
    ui.error = false;
    renderNotice();
    highlightPlace('#aside-shelf');
  }
}
function boardMarkup() {
  const active = state.clues.filter((c) => c.status === 'active'),
    aside = state.clues.filter((c) => c.status === 'aside'),
    ids = new Set(active.map((c) => c.id)),
    links = state.links.filter((l) => ids.has(l.a) && ids.has(l.b));
  const connectedIds = new Set(links.flatMap((link) => [link.a, link.b]));
  const allLinks = state.links.concat(
    (state.combinationHistory || []).flatMap((round) => round.links),
  );
  const recentStart = Math.max(0, active.length - 8);
  const cardItems = [];
  let hiddenCount = 0;
  for (const [index, clue] of active.entries()) {
    const connected = connectedIds.has(clue.id);
    const pinned =
      connected ||
      clue.id === state.focusId ||
      clue.id === ui.connecting ||
      clue.id === ui.lastRestoredId;
    if (index < recentStart && !pinned) {
      hiddenCount++;
      if (!ui.showAllClues) continue;
    }
    cardItems.push(cardMarkup(clue, index, connected, allLinks));
  }
  const cards = cardItems.join('');
  return (
    '<section id="clue-board" class="board" aria-label="Your exploration clues"><div class="board-heading"><span data-raw>' +
    esc(bt(0)) +
    ' <small>· ' +
    active.length +
    ' ' +
    esc(t('active')) +
    '</small></span><div class="board-status"><small>Nothing here is a final decision.</small>' +
    (aside.length
      ? btn('show-shelf', esc(st(0)) + ' · ' + aside.length, 'data-raw', 'shelf-jump')
      : '') +
    '</div></div><div class="board-tools" data-raw><p>' +
    esc(roundHelp()) +
    '</p>' +
    btn('new-clue', '＋ ' + esc(bt(2)), '', 'board-add') +
    (roundIds().length
      ? btn('reset-round', groupCopy('reset', '重新组合', 'Reset combination'), '', 'text-button')
      : '') +
    btn('arrange-clues', esc(bt(8)), '', 'text-button') +
    '</div>' +
    repeatedCombinationNotice() +
    '<div class="clue-grid">' +
    (active.length
      ? cards
      : '<div class="board-empty"><span class="handwritten">A few clues will gather here.</span><p>Start with the question, or add a thought of your own below.</p></div>') +
    '</div><div class="chalk-tray" aria-hidden="true"><span class="board-eraser"></span><span class="chalk-stick chalk-white"></span><span class="chalk-stick chalk-peach"></span></div>' +
    (hiddenCount
      ? btn(
          'toggle-clues',
          esc(tr(ui.showAllClues ? 'showFewerClues' : 'showMoreClues', { count: hiddenCount })),
          'aria-expanded="' + ui.showAllClues + '"',
          'text-button clue-toggle',
        )
      : '') +
    roundSummary() +
    combinationHistoryMarkup() +
    '<p id="board-hint" class="board-hint" data-raw>' +
    (ui.connecting
      ? groupCopy(
          'pick',
          '点击另一张卡上的“连接”。再次点击第一张可取消。',
          'Choose Connect on a second clue. Select the first again to cancel.',
        )
      : roundHelp()) +
    '</p><form id="thought-form" class="add-thought new-clue-note" ' +
    (ui.newClue ? '' : 'hidden') +
    '><input aria-label="Add your own thought" data-field="thought" placeholder="Something else on your mind?" value="' +
    esc(state.draft.thought) +
    '"><button type="submit">Add thought <span aria-hidden="true">＋</span></button></form>' +
    shelfMarkup(aside) +
    '</section>'
  );
}
function explorePage() {
  if (
    ui.connecting &&
    !state.clues.some((clue) => clue.id === ui.connecting && clue.status === 'active')
  ) {
    ui.connecting = null;
  }
  const readyNotice = state.review.ready
    ? '<aside class="ready-notice" role="status"><strong>' +
      esc(t('Ready to compare')) +
      '</strong><p data-raw>' +
      esc(readyMessage(getLocale())) +
      '</p>' +
      btn(
        'directions',
        esc(t('View directions')) + ' ↗',
        ui.busy ? 'disabled' : '',
        'text-button',
      ) +
      '</aside>'
    : '';
  const groupSize = roundIds().length;
  const repeat =
    groupSize > 1 &&
    state.combinationHistory.some((entry) => entry.key === combinationKey(roundIds()));
  const nextHint = repeat
    ? '<p data-raw>' +
      groupCopy(
        'next',
        '点“继续探索”，下一题会结合你这次的回答和选中的 {n} 张卡片，换个角度继续探索。',
        'Choose “Continue exploring” to get a new question from a different angle, based on your latest answer and the {n} cards you selected.',
        groupSize,
      ) +
      '</p>'
    : '<p>Use your answers, card changes, and new thoughts to find the next useful question.</p>';
  const continueArea =
    '<section id="explore-actions" class="next-action continue-next">' +
    nextHint +
    '' +
    btn(
      'continue',
      state.round === 0 && !state.question
        ? ui.busy
          ? esc(firstTurnText(getLocale(), 'preparing'))
          : 'Find my first question ' + arrow
        : 'Continue exploring ' + arrow,
      ui.busy ? 'disabled' : '',
      'button primary',
    ) +
    '<p id="pending-changes" class="pending-changes" role="status" data-raw></p></section>';
  const directionsArea =
    '<section id="directions-action" class="next-action direction-next"><p>Compare possible project directions. Your latest answer and unfinished thought will be included.</p>' +
    btn(
      'directions',
      '<span class="direction-portal-art" aria-hidden="true"><i></i><i></i><i></i></span><span class="direction-portal-title">View directions</span><span class="direction-portal-arrow" aria-hidden="true">↗</span>',
      !state.review.ready || ui.busy ? 'disabled' : '',
      'button direction-portal',
    ) +
    (state.review.ready
      ? '<span class="readiness-pill">Ready to compare</span>'
      : '<details class="readiness-details"><summary data-raw>' +
        esc(readinessLabel(getLocale())) +
        '</summary><div class="readiness-explanation" data-raw dir="auto">' +
        esc(
          (state.review.reason === 'The changed information needs another review.'
            ? tr('changedInformation')
            : state.review.reason) ||
            t('Explore a little first so the directions have something to build on.'),
        ) +
        '</div></details>') +
    '</section>';
  return (
    heading(
      'Let’s follow a few clues.',
      'Notice what resonates. Keep the pieces that feel like you.',
      '<div class="header-actions">' +
        btn(
          'entry-return',
          '<span aria-hidden="true">←</span> ' + esc(entryText(getLocale(), 'backToStartingPoint')),
          'data-raw',
          'quiet',
        ) +
        btn('brief', 'Assignment brief', '', 'quiet') +
        btn('history', esc(tr('history')), '', 'quiet') +
        btn('guide', 'Quick guide', '', 'quiet') +
        '</div>',
    ) +
    '<div class="workspace"><div><div class="question-stack"><div id="review-issues">' +
    reviewIssuesMarkup(state, getLocale()) +
    '</div>' +
    readyNotice +
    questionMarkup() +
    uncertaintyMarkup(
      (state.brief.uncertainties || []).filter((item) => item.status === 'unresolved'),
      getLocale(),
    ) +
    '</div>' +
    continueArea +
    '</div><div>' +
    boardMarkup() +
    directionsArea +
    '</div></div>'
  );
}

function priorityLabel(priority) {
  return priorityText(priority, t);
}
function indexDirectionSources() {
  const inputById = new Map();
  const clueById = new Map();
  const requirementById = new Map();
  for (const input of state.inputs) inputById.set(input.id, input);
  for (const clue of state.clues) clueById.set(clue.id, clue);
  for (const requirement of reqs()) {
    if (!requirementById.has(requirement.id)) requirementById.set(requirement.id, requirement.text);
  }
  return { inputById, clueById, requirementById };
}

function explorationReferences(sourceIds = [], { inputById, clueById }) {
  function labelFor(id) {
    const input = inputById.get(id);
    if (input) return input.text;
    const clue = clueById.get(id);
    return (clue?.origin === 'student' && clue.detail) || clue?.title || '';
  }
  const labelsBySource = new Map();
  for (const id of sourceIds) {
    const clue = clueById.get(id);
    const originalId =
      clue?.origin === 'student' && clue.sourceIds.length === 1 ? clue.sourceIds[0] : id;
    if (labelsBySource.has(originalId)) continue;
    const label = labelFor(originalId) || labelFor(id);
    if (label) labelsBySource.set(originalId, label);
  }
  return [...labelsBySource.values()];
}

function requirementReferences(ids = [], { requirementById }) {
  return ids.map((id) => requirementById.get(id)).filter(Boolean);
}
function sourceMarkup(d, index = indexDirectionSources()) {
  const refs = explorationReferences(d.sourceIds, index),
    requirements = requirementReferences(d.requirementIds, index);
  return (
    '<details class="source-details"><summary>What this draws from</summary><ul>' +
    refs
      .map(
        (s) =>
          '<li><span>Your exploration:</span> <span data-raw dir="auto">' + esc(s) + '</span></li>',
      )
      .join('') +
    requirements
      .map(
        (s) => '<li><span>Assignment:</span> <span data-raw dir="auto">' + esc(s) + '</span></li>',
      )
      .join('') +
    '</ul></details>'
  );
}
function directionsPage() {
  const index = indexDirectionSources();
  return (
    heading(
      'A few directions to grow.',
      'Different ways to use the same discoveries. Pick what feels worth making.',
      '<div class="header-actions">' + btn('brief', 'Assignment brief', '', 'quiet') + '</div>',
    ) +
    '<div class="direction-intro"><p>These are starting points. You can keep exploring or change your mind.</p><span class="small">Each lens has equal weight.</span></div><div class="direction-grid">' +
    state.directions
      .map(
        (d, i) =>
          '<article class="direction-card ' +
          colors[i % 3] +
          '"><div class="direction-lens" data-raw dir="auto">' +
          esc(priorityLabel(d.priority, i)) +
          '</div><div class="direction-body"><h2>' +
          esc(d.title) +
          '</h2><p>' +
          esc(d.summary) +
          '</p><h3>Why it fits</h3><p>' +
          esc(d.fit) +
          '</p><h3>The trade-off</h3><p>' +
          esc(d.tradeoff) +
          '</p>' +
          sourceMarkup(d, index) +
          '</div><div class="direction-bottom">' +
          btn('choose', 'Choose this direction ' + arrow, 'data-id="' + esc(d.id) + '"', 'button') +
          btn('ask', 'Ask about this direction', 'data-id="' + esc(d.id) + '"', 'text-button') +
          '</div></article>',
      )
      .join('') +
    '</div><div class="direction-footer">' +
    btn('keep-exploring', 'Keep exploring', '', 'button') +
    btn('history', esc(tr('history')), '', 'button') +
    btn('none-fit', 'None of these feel right', '', 'button') +
    '</div>'
  );
}
function chosenPage() {
  const d = state.directions.find((x) => x.id === state.selectedDirectionId);
  if (!d) return explorePage();
  return (
    heading(
      'You’ve found a place to begin.',
      'A direction you chose, grounded in your brief and your own discoveries.',
    ) +
    '<div class="chosen-layout"><section class="chosen-card"><span class="eyebrow" data-raw>' +
    esc(t('Your chosen direction · {label}', { label: priorityLabel(d.priority) })) +
    '</span><h2>' +
    esc(d.title) +
    '</h2><p>' +
    esc(d.summary) +
    '</p><h3>Why this fits your project</h3><p>' +
    esc(d.fit) +
    '</p><h3>Keep in mind</h3><p>' +
    esc(d.tradeoff) +
    '</p>' +
    sourceMarkup(d) +
    '<div class="chosen-actions">' +
    btn('export-direction', esc(transferText(getLocale(), 4)), 'data-raw', 'button primary') +
    btn('saved', 'View saved thinking', '', 'button') +
    btn('ask', 'Ask about this direction', 'data-id="' + esc(d.id) + '"', 'button chosen-ask') +
    '</div></section><div class="chosen-followup"><div class="chosen-actions">' +
    btn('finish', esc(finishText(getLocale(), 0)), 'data-raw', 'button') +
    btn('keep-exploring', 'Keep exploring', '', 'button primary') +
    '</div></div></div>'
  );
}
function lockBusyControls() {
  if (!ui.busy) {
    for (const el of $$('[data-busy-disabled]')) {
      el.disabled = false;
      delete el.dataset.busyDisabled;
    }
    $$('.request-cancel').forEach((el) => el.remove());
    return;
  }
  if ($('#dialog').open && !$('.request-cancel', $('#dialog')))
    $('.dialog-inner', $('#dialog'))?.insertAdjacentHTML(
      'beforeend',
      '<div class="request-cancel">' +
        btn('cancel-request', esc(tr('cancelRequest')), '', 'button') +
        '</div>',
    );
  const allowed = new Set([
    'cancel-request',
    'close-dialog',
    'saved',
    'settings',
    'language',
    'set-language',
    'export',
    'dismiss',
  ]);
  for (const el of $$(
    '#main button,#main input,#main textarea,#main select,#dialog button,#dialog input,#dialog textarea,#dialog select',
  )) {
    if (el.tagName === 'BUTTON' && allowed.has(el.dataset.action)) continue;
    if (!el.disabled) {
      el.dataset.busyDisabled = '';
      el.disabled = true;
    }
  }
  for (const card of $$('[draggable]')) card.draggable = false;
}
function render(focusMain = false) {
  document.body.dataset.screen = state.screen;
  applyDocumentLanguage();
  const active = document.activeElement,
    key = active?.id
      ? { id: active.id }
      : active?.dataset?.action
        ? {
            action: active.dataset.action,
            id: active.dataset.id,
            kind: active.dataset.kind,
            slot: active.dataset.focusSlot,
          }
        : null,
    selection =
      (active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement) &&
      typeof active.selectionStart === 'number' &&
      typeof active.selectionEnd === 'number'
        ? { start: active.selectionStart, end: active.selectionEnd }
        : null;
  renderMode();
  progress();
  renderNotice();
  $('#main').innerHTML = withTranslatedView(() =>
    (
      ({
        brief: briefPage,
        entry: entryPage,
        explore: explorePage,
        directions: directionsPage,
        chosen: chosenPage,
      })[state.screen] || briefPage
    )(),
  );
  protectRaw();
  localize(document);
  syncLanguageButton();
  renderBriefAccess();
  refreshPending();
  lockBusyControls();
  mountBoard({
    positions: state.boardPositions || {},
    links: state.links,
    onMove: (id, p) => {
      state.boardPositions ??= {};
      state.boardPositions[id] = p;
      save();
    },
    onConnect: connect,
    onAside: setAside,
    onLeaveGroup: (id) => {
      ui.connecting = null;
      change('clue/leave-group', { id });
    },
    onDisconnect: (id) => {
      const link = state.links.find((l) => l.id === id);
      if (link && change('clue/disconnect', { id })) {
        ui.undoLink = { ...link };
        notice(tr('connectionRemoved'));
      }
    },
  });
  const upload = $('#brief-file');
  if (upload) upload.disabled = ui.busy;
  if (focusMain) {
    $('#main').focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
  } else if (key) {
    const target =
      key.id && !key.action
        ? document.getElementById(key.id)
        : $$('[data-action="' + key.action + '"]').find(
            (e) =>
              (!key.id || e.dataset.id === key.id) &&
              (!key.kind || e.dataset.kind === key.kind) &&
              e.dataset.focusSlot === key.slot,
          );
    if (target) {
      target.focus({ preventScroll: true });
      if (selection && target.setSelectionRange)
        target.setSelectionRange(selection.start, selection.end);
    }
  }
}
async function api(path, body) {
  const controller = new AbortController(),
    request = { controller, canceled: false };
  ui.request = request;
  const timeout = setTimeout(
    () => controller.abort(),
    path === '/api/turn' ? (body.action === 'directions' ? 200000 : 150000) : 60000,
  );
  try {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, language: body.language || getLanguage() }),
      signal: controller.signal,
    });
    let data;
    try {
      data = await response.json();
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      throw new Error(
        'The local server returned an unreadable response. Your work is saved; try again.',
      );
    }
    if (!response.ok) {
      const message =
        typeof data.error === 'string'
          ? data.error
          : data.error?.message ||
            data.message ||
            'The request could not finish. Your work is saved.';
      const error = new Error(friendlyError(message, data.code));
      error.code = typeof data.code === 'string' ? data.code : '';
      throw error;
    }
    return data;
  } catch (e) {
    if (e.name === 'AbortError') {
      const error = new Error(
        request.canceled
          ? tr('requestCanceled')
          : 'The request took too long. Your words are still saved. Try again when the connection is ready.',
      );
      if (!request.canceled) error.code = 'provider_timeout';
      error.canceled = request.canceled;
      throw error;
    }
    if (e instanceof TypeError)
      throw Object.assign(new Error(friendlyError('', 'provider_network')), {
        code: 'provider_network',
      });
    throw e;
  } finally {
    clearTimeout(timeout);
    if (ui.request === request) ui.request = null;
  }
}
async function reviewBrief() {
  if (ui.busy) return;
  if (!state.brief.text.trim() && !ui.file) {
    notice('Paste your assignment or attach a brief first.', true);
    $('#brief-text')?.focus();
    return;
  }
  if (ui.missingFile && !ui.file) {
    notice(
      'Please attach ' +
        ui.missingFile +
        ' again, or remove the attachment and review the pasted text.',
      true,
    );
    return;
  }
  const revision = state.revision,
    fileRevision = ui.fileRevision,
    file = ui.file,
    text = ui.file
      ? textWithoutAttachmentExcerpt(state.brief.text, ui.extractedBriefText)
      : state.brief.text;
  ui.noticeRaw = false;
  ui.busy = true;
  ui.busyText = 'Reviewing the assignment requirements…';
  ui.notice = '';
  try {
    render();
    const result = await api('/api/brief', { mode: ui.mode, text, ...(file ? { file } : {}) });
    if (!isCurrentBriefSource(revision, fileRevision, state.revision, ui.fileRevision))
      throw new Error(
        'Your brief changed while it was being reviewed. Your edits are saved; review the latest version again.',
      );
    if (typeof result.summary !== 'string' || !Array.isArray(result.requirements))
      throw new Error('The brief review was incomplete. Your text is safe; please try again.');
    if (!text.trim() && file) {
      const extracted =
        t('Extracted from {file} (selected requirements, not the full original document)', {
          file: file.name,
        }) +
        '\n' +
        result.requirements.map((r) => r.quote || r.text).join('\n');
      ui.extractedBriefText = extracted;
      change('brief/text', { text: extracted }, false);
    }
    change(
      'brief/review',
      {
        summary: result.summary,
        requirements: result.requirements,
        uncertainties: result.uncertainties || [],
      },
      false,
    );
    ui.notice = 'Check the extracted requirements below. You can correct them before confirming.';
    ui.error = false;
  } catch (e) {
    ui.noticeCode = e.code || '';
    ui.noticeRaw = !!e.canceled;
    ui.notice = e.message;
    ui.error = !e.canceled;
  } finally {
    ui.busy = false;
    render();
    if (!ui.error) {
      $('#review-title')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      $('#brief-summary')?.focus({ preventScroll: true });
    }
  }
}
async function turn(action = 'explore') {
  if (ui.busy) return;
  if (!navigator.locks) return generateTurn(action);
  await navigator.locks.request(
    'idea-studio-turn-' + state.id,
    { ifAvailable: true },
    async (lock) => {
      if (lock) return generateTurn(action);
      notice(firstTurnText(getLocale(), 'otherTab'));
    },
  );
}
async function generateTurn(action) {
  if (ui.busy) return;
  if (action === 'directions' && !state.review.ready) {
    notice('Keep exploring until the current information is ready to compare directions.');
    return;
  }
  const firstQuestion = action === 'explore' && state.round === 0 && !state.question;
  ui.connecting = null;
  ui.undoLink = null;
  ui.busy = true;
  ui.busyText =
    action === 'directions'
      ? 'Reviewing your latest words and comparing possible directions…'
      : firstQuestion
        ? firstTurnText(getLocale(), 'preparing')
        : 'Saving your latest words and finding the next question…';
  ui.notice = '';
  try {
    render();
    const prepared = prepareTurn(state, action);
    state = prepared.state;
    save();
    const response = await api('/api/turn', { mode: ui.mode, ...prepared.request });
    state = applyTurn(state, response, prepared.request.revision, action);
    save();
    ui.noticeRaw = !!(firstQuestion && state.question && state.screen === 'explore');
    ui.notice =
      state.screen === 'directions'
        ? 'Your latest words are included in these directions.'
        : action === 'directions'
          ? 'One more thing needs clarifying before comparing directions.'
          : firstQuestion && state.question
            ? firstTurnText(getLocale(), 'ready')
            : 'Your response is kept. The next question is ready.';
    ui.error = false;
  } catch (e) {
    ui.noticeCode = e.code || '';
    ui.noticeRaw = !!e.canceled;
    ui.notice = e.message;
    ui.error = !e.canceled;
  } finally {
    ui.busy = false;
    render(true);
    if (!ui.error && state.screen === 'explore' && state.question && !state.tutorialSeen)
      startTour();
  }
}
async function demo() {
  state = createProject();
  questionHelp.clear();
  ui.explanationHistory = {};
  ui.questionDrafts = {};
  ui.mode = 'preview';
  ui.extractedBriefText = '';
  ui.file = null;
  ui.missingFile = null;
  ui.briefReturn = false;
  change('brief/text', { text: demoBrief(getLocale()) });
  await reviewBrief();
}
function clearExtractedBrief() {
  const next = textWithoutAttachmentExcerpt(state.brief.text, ui.extractedBriefText);
  ui.extractedBriefText = '';
  if (next !== state.brief.text) change('brief/text', { text: next }, false);
}
function hasWork() {
  return !!(state.brief.text.trim() || state.inputs.length || state.clues.length);
}
function dialogHeading(title) {
  return (
    '<div class="dialog-heading"><h2 id="dialog-title">' +
    title +
    '</h2><button class="icon-button" data-action="close-dialog" aria-label="Close dialog">×</button></div>'
  );
}
function rawMarkup(items) {
  const names = {
    brief: 'Assignment text',
    thought: 'A thought you added',
    'starting-idea': 'Your starting idea',
    correction: 'Your correction',
    'direction-rejection': 'Why directions did not fit',
    'question-request': 'Your request',
  };
  return items.length
    ? '<ul class="saved-list">' +
        items
          .map(
            (x) =>
              '<li><strong ' +
              (x.questionText ? 'data-raw dir="auto"' : '') +
              '>' +
              esc(x.questionText || names[x.type] || 'Your response') +
              '</strong><p class="raw-text" data-raw dir="auto">' +
              esc(x.text) +
              '</p><p class="meta">' +
              esc(x.type) +
              '</p></li>',
          )
          .join('') +
        '</ul>'
    : '<p class="body-copy">Your responses will appear here.</p>';
}

function openDialog(kind, data = {}) {
  return withTranslatedView(() => openDialogContent(kind, data));
}
function openDialogContent(kind, data = {}) {
  if (ui.tourStep !== null) endTour();
  ui.returnFocus = document.activeElement;
  ui.dialogKind = kind;
  ui.dialogData = data;
  const dialog = $('#dialog');
  dialog.className = ['saved', 'history'].includes(kind) ? 'side-panel' : '';
  let html = '';
  if (kind === 'restore-backup') {
    const restored = data.backup.project;
    const title = restored.directions.find((d) => d.id === restored.selectedDirectionId)?.title;
    html =
      dialogHeading(esc(transferText(getLocale(), 1))) +
      '<p class="body-copy" data-raw>' +
      esc(transferText(getLocale(), 2)) +
      '</p><div class="dialog-section" data-raw><strong>' +
      esc(t('Your brief')) +
      '</strong><p dir="auto">' +
      esc((restored.brief.summary || restored.brief.text || '—').slice(0, 360)) +
      '</p><p>' +
      esc(t('Clue board')) +
      ' · ' +
      restored.clues.length +
      '</p>' +
      (title ? '<p dir="auto">' + esc(title) + '</p>' : '') +
      '</div><div class="dialog-actions">' +
      btn('close-dialog', 'Cancel', '', 'button') +
      btn('apply-backup', esc(transferText(getLocale(), 0)), 'data-raw', 'button confirm-reset') +
      '</div>';
  } else if (kind === 'finish') {
    html =
      dialogHeading(esc(finishText(getLocale(), 0))) +
      '<p class="body-copy" data-raw>' +
      esc(finishPrompt(getLocale())) +
      '</p><div class="dialog-actions">' +
      btn('close-dialog', 'Cancel', '', 'button') +
      btn('confirm-finish', esc(finishText(getLocale(), 0)), 'data-raw', 'button primary') +
      '</div>';
  } else if (kind === 'page-guide') {
    html =
      dialogHeading('A quick guide') +
      '<p class="body-copy" data-raw>' +
      esc(pageGuide(getLocale(), state.screen === 'directions')) +
      '</p>';
  } else if (kind === 'language') {
    html =
      dialogHeading('Choose your language') +
      '<div class="language-grid">' +
      LANGUAGES.map(
        (lang) =>
          '<button class="language-option" data-action="set-language" data-locale="' +
          lang.code +
          '" aria-pressed="' +
          (lang.code === getLocale()) +
          '"><span data-i18n-skip lang="' +
          lang.code +
          '" dir="auto">' +
          lang.name +
          '</span><span aria-hidden="true">' +
          (lang.code === getLocale() ? '✓' : '') +
          '</span></button>',
      ).join('') +
      '</div>';
  } else if (kind === 'settings') {
    html =
      dialogHeading(productText(getLocale(), 0)) +
      '<div class="dialog-section">' +
      btn('language', 'Choose your language', '', 'button') +
      '</div><div class="dialog-section"><h3>Project on this browser</h3><p class="body-copy">Your brief, exact words, clues, changes, and chosen direction are stored locally. Export a copy to keep them elsewhere.</p><div class="dialog-actions project-file-actions">' +
      btn('export', esc(productText(getLocale(), 1)), 'data-raw', 'button') +
      btn('choose-backup', esc(transferText(getLocale(), 0)), 'data-raw', 'button') +
      btn('saved', 'View what’s saved', '', 'button') +
      btn('reset', 'Start a new project', '', 'button danger') +
      '</div></div>';
  } else if (kind === 'saved') {
    const raw = state.inputs,
      invalid = state.clues.filter((c) => c.status === 'invalid');
    const sourceIndex = indexDirectionSources();
    html =
      dialogHeading('What’s saved') +
      '<div class="dialog-section"><h3>Your assignment</h3><p class="body-copy" data-raw dir="auto" style="white-space:pre-wrap">' +
      esc(state.brief.text || t('No brief added yet.')) +
      '</p><p class="help-line">' +
      (state.brief.confirmed
        ? 'Requirements confirmed by you.'
        : 'Requirements not confirmed yet.') +
      '</p></div><div class="dialog-section"><h3>Your words · ' +
      raw.length +
      ' saved records</h3>' +
      rawMarkup(raw) +
      ([state.draft.choice, state.draft.answer, state.draft.thought].some(Boolean)
        ? '<div class="warning-note"><strong>Current draft · saved, included with your next step</strong><p data-raw dir="auto">' +
          esc(
            [state.draft.choice, state.draft.answer, state.draft.thought]
              .filter(Boolean)
              .join('\n'),
          ) +
          '</p></div>'
        : '') +
      '</div><div class="dialog-section"><h3>Clues · ' +
      state.clues.length +
      '</h3><ul class="saved-list">' +
      state.clues
        .map(
          (c) =>
            '<li><strong data-raw dir="auto" class="' +
            (c.status === 'invalid' ? 'invalid' : '') +
            '">' +
            esc(c.title) +
            '</strong><p data-raw dir="auto">' +
            esc(c.detail) +
            '</p><p class="meta">' +
            (c.origin === 'student' ? 'Your own words' : 'Clue summary') +
            ' · <span>' +
            esc(c.status) +
            '</span> · <span>' +
            (c.sourceIds?.length || 0) +
            ' source reference(s)</span></p>' +
            ((c.sourceIds || []).length
              ? '<details class="source-details"><summary>See source words</summary><ul>' +
                explorationReferences(c.sourceIds, sourceIndex)
                  .map((s) => '<li data-raw dir="auto">' + esc(s) + '</li>')
                  .join('') +
                '</ul></details>'
              : '') +
            '</li>',
        )
        .join('') +
      '</ul>' +
      (!state.clues.length
        ? '<p class="body-copy">Your clues will appear here as you explore.</p>'
        : '') +
      '</div><div class="dialog-section"><h3>Your changes</h3><p class="body-copy">' +
      state.corrections.length +
      ' corrections · ' +
      state.rejections.length +
      ' rejected sets of directions · ' +
      state.links.length +
      ' connections saved.</p>' +
      (invalid.length
        ? '<p class="help-line">' +
          invalid.length +
          ' corrected interpretation(s) retained for traceability and excluded from active exploration.</p>'
        : '') +
      '</div><div class="dialog-actions">' +
      btn('export', 'Export project', '', 'button') +
      btn('close-dialog', 'Done', '', 'button primary') +
      '</div>';
  } else if (kind === 'history') {
    html =
      dialogHeading(esc(tr('history'))) +
      directionHistoryMarkup(state.directionHistory, getLocale());
  } else if (kind === 'correct') {
    const clue = state.clues.find((c) => c.id === data.id);
    html =
      dialogHeading('Let’s get this right.') +
      '<p class="body-copy" data-raw dir="auto">' +
      esc(
        t(
          'Correct “{text}”. The earlier interpretation will be marked invalid, and your correction becomes a new clue in your own words.',
          { text: clue?.title },
        ),
      ) +
      '</p><label for="correction-text" style="margin-top:20px">What should we understand instead?</label><textarea id="correction-text" placeholder="For example: I’m interested in photography, but I haven’t done a project like this before."></textarea><div class="dialog-actions">' +
      btn('close-dialog', 'Cancel', '', 'button') +
      btn('save-correction', 'Save correction', '', 'button primary') +
      '</div>';
  } else if (kind === 'reject') {
    html =
      dialogHeading('Let’s find another way in.') +
      '<p class="body-copy">These directions are not a commitment. Tell us what feels off, or simply keep exploring.</p><label for="rejection-reason" style="margin-top:20px">What isn’t fitting? <span class="muted">(optional)</span></label><textarea id="rejection-reason" placeholder="Too ambitious, not personal enough, the wrong medium…"></textarea><div class="dialog-actions">' +
      btn('close-dialog', 'Cancel', '', 'button') +
      btn('reject-directions', 'Explore another way ' + arrow, '', 'button primary') +
      '</div>';
  } else if (kind === 'ask') {
    const d = state.directions.find((x) => x.id === data.id);
    html =
      dialogHeading('A closer look') +
      '<p class="body-copy"><strong data-raw dir="auto">' +
      esc(d?.title) +
      '</strong></p><label for="direction-question" style="margin-top:20px">What would you like to know?</label><textarea id="direction-question" placeholder="What would a small first version look like? What might be difficult?">' +
      esc(ui.questionDrafts[questionDraftKey(data.id)] || '') +
      '</textarea><div id="ask-output">' +
      questionHistoryMarkup(
        (state.directionQuestions || []).filter(
          (item) => item.directionId === data.id && item.directionSetId === state.directionSetId,
        ),
        getLocale(),
      ) +
      '</div><div class="dialog-actions">' +
      btn('ask-send', 'Ask about this direction ' + arrow, '', 'button primary') +
      '</div>';
  } else if (kind === 'reset' || kind === 'demo') {
    html =
      dialogHeading(kind === 'demo' ? 'Open the guided example?' : 'Start a fresh project?') +
      '<p class="body-copy">This will replace the project saved in this browser. Export a copy first if you want to keep your current work.</p><div class="dialog-actions">' +
      btn('export', 'Export current project', '', 'button') +
      btn('close-dialog', 'Keep current project', '', 'button') +
      btn(
        kind === 'demo' ? 'confirm-demo' : 'confirm-reset',
        kind === 'demo' ? 'Open example' : 'Start fresh',
        '',
        kind === 'demo' ? 'button primary' : 'button confirm-reset',
      ) +
      '</div>';
  }
  $('#dialog-content').innerHTML = '<div class="dialog-inner">' + html + '</div>';
  protectRaw(dialog);
  localize(dialog);
  if (!dialog.open) dialog.showModal();
  lockBusyControls();
  requestAnimationFrame(() => {
    if (!dialog.open || ui.dialogKind !== kind) return;
    const asksForConfirmation = ['finish', 'restore-backup', 'reset', 'demo'].includes(kind);
    const initialControl = asksForConfirmation
      ? dialog.querySelector('.dialog-actions [data-action="close-dialog"]')
      : dialog.querySelector('textarea, input, button:not([data-action="close-dialog"])');
    (initialControl || dialog.querySelector('button'))?.focus();
  });
}
function questionDraftKey(id) {
  return JSON.stringify([state.directionSetId, id]);
}
function closeDialog() {
  const target = ui.returnFocus;
  $('#dialog').close();
  ui.dialogKind = null;
  ui.dialogData = null;
  requestAnimationFrame(() => {
    if (target?.isConnected) target.focus({ preventScroll: true });
    else $('#main').focus({ preventScroll: true });
  });
}
function dialogError(message, localized = false) {
  let node = $('.dialog-error', $('#dialog'));
  if (!node) {
    node = document.createElement('p');
    node.className = 'dialog-error';
    node.setAttribute('role', 'alert');
    $('.dialog-inner').append(node);
  }
  node.textContent = localized ? message : friendlyError(message);
  localize(node);
}
async function askDirection() {
  if (ui.busy) return;
  const question = $('#direction-question')?.value.trim();
  if (!question) {
    dialogError('Write a question first.');
    $('#direction-question')?.focus();
    return;
  }
  const id = ui.dialogData?.id,
    projectId = state.id,
    revision = state.revision,
    directionSetId = state.directionSetId;
  ui.busy = true;
  ui.busyText = 'Looking at this direction…';
  ui.notice = '';
  try {
    render();
    $('.dialog-error')?.remove();
    const result = await api('/api/ask', { mode: ui.mode, state, directionId: id, question });
    if (typeof result.answer !== 'string' || !result.answer.trim())
      throw new Error('The answer was incomplete. Please try again.');
    if (state.id !== projectId || state.revision !== revision)
      throw new Error('The latest changes need another review before you can continue.');
    if (
      !change(
        'direction/qa',
        { directionSetId, directionId: id, question, answer: result.answer },
        false,
      )
    )
      return;
    delete ui.questionDrafts[questionDraftKey(id)];
    save();
    ui.notice = tr('qaSaved');
    ui.noticeRaw = true;
    ui.error = false;
    if (ui.dialogKind === 'ask' && ui.dialogData?.id === id) {
      $('#direction-question').value = '';
      $('#ask-output').innerHTML = questionHistoryMarkup(
        state.directionQuestions.filter(
          (item) => item.directionId === id && item.directionSetId === state.directionSetId,
        ),
        getLocale(),
      );
    }
  } catch (e) {
    ui.noticeCode = e.code || '';
    ui.notice = e.message;
    ui.noticeRaw = !!e.canceled;
    ui.error = !e.canceled;
    if (!e.canceled && ui.dialogKind === 'ask') dialogError(e.message);
  } finally {
    ui.busy = false;
    render();
    for (const el of $$('#dialog button,#dialog input,#dialog textarea')) el.disabled = false;
  }
}
function downloadFile(content, type, name) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportProject() {
  const backup = {
    application: 'Idea Studio',
    exportedAt: new Date().toISOString(),
    mode: ui.mode,
    project: state,
    questionDrafts: ui.questionDrafts,
    explanationHistory: ui.explanationHistory,
    extractedBriefText: ui.extractedBriefText,
    fileName: ui.file?.name || ui.missingFile || null,
  };
  downloadFile(
    JSON.stringify(backup, null, 2),
    'application/json',
    'idea-studio-project-' + new Date().toISOString().slice(0, 10) + '.json',
  );
  notice('A project copy has been prepared for download.');
}
function exportDirection() {
  const d = state.directions.find((item) => item.id === state.selectedDirectionId);
  if (!d) return;
  const sections = [
    d.title,
    priorityLabel(d.priority),
    d.summary,
    t('Why this fits your project') + '\n' + d.fit,
    t('Keep in mind') + '\n' + d.tradeoff,
  ];
  const index = indexDirectionSources();
  const refs = [
    ...explorationReferences(d.sourceIds, index).map((text) => t('Your exploration:') + ' ' + text),
    ...requirementReferences(d.requirementIds, index).map((text) => t('Assignment:') + ' ' + text),
  ];
  if (refs.length)
    sections.push(t('What this draws from') + '\n' + refs.map((text) => '• ' + text).join('\n'));
  downloadFile(
    '\uFEFF' + sections.join('\n\n'),
    'text/plain;charset=utf-8',
    'Idea Studio - ' + d.title.replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ').slice(0, 80) + '.txt',
  );
}
async function chooseBackup() {
  const picker = document.createElement('input');
  picker.type = 'file';
  picker.accept = '.json,application/json';
  picker.onchange = async () => {
    const file = picker.files[0];
    if (!file) return;
    try {
      if (file.size > 24 * 1024 * 1024) throw Error();
      const backup = readBackup(await file.text());
      openDialog('restore-backup', { backup });
    } catch (error) {
      dialogError(transferText(getLocale(), error?.code === 'invalid_connections' ? 6 : 3), true);
    }
  };
  picker.click();
}

const tours = [
  {
    target: '#question-panel',
    title: '先回答一个问题',
    enTitle: 'Start with a question',
    copy: '可以选答案、自由输入，或选择“还不确定”“都不合适”。看不懂时点“解释一下”，也可以换一个问题。',
    en: 'Choose an answer, write your own, or choose Not sure / None fit. Use Explain for help, or try a different question.',
  },
  {
    target: '#clue-board .clue-grid',
    title: '每轮一起探索一组',
    enTitle: 'One combination per round',
    copy: '把一张卡拖到另一张上，或依次点击两张卡的“连接”。本轮组合会出现粉笔框和红线。连接是可选的，直接回答也能继续。',
    en: 'Drag one card onto another, or use Connect on two cards. A chalk frame and red threads mark this round’s combination. Connecting is optional.',
  },
  {
    target: '#clue-board .clue-grid',
    title: '加入当前组，或重新组合',
    enTitle: 'Add to this combination, or reset',
    copy: '把其他卡片拖进粉笔框即可加入。每轮只保留一组，框外两张卡不能另建一组；想换一组，请点“重新组合”。卡片全部保留。',
    en: 'Drop another card inside the chalk frame to add it. Only one combination is active: two outside cards cannot start another. Use Reset combination to start fresh; all cards remain.',
  },
  {
    target: '#clue-board',
    title: '线索可以调整和恢复',
    enTitle: 'Adjust and recover clues',
    copy: '双击红线断开该连接，双击红钉移出该卡；卡片保留。点“暂时放下”后，卡片进入下方暂放区，可以随时恢复。“纠正”可修改线索摘要。',
    en: 'Double-click a thread to disconnect it, or a pin to remove that card’s connections. Cards remain. Set aside moves a card to the shelf below; restore it anytime. Correct edits an interpretation.',
  },
  {
    target: '#explore-actions',
    title: '继续探索',
    enTitle: 'Continue exploring',
    copy: '回答或操作卡片后，点击这里处理本轮内容、提出下一个问题。成功后组合会存入“已探索的组合”，本轮选择清空，卡片保留。重复组合会提示你查看记录或探索新角度。',
    en: 'After answering or working with clues, use this button to process the round and get the next question. After success, the combination moves to Previously explored combinations and the current selection clears. Cards remain. Repeated combinations show a reminder.',
  },
  {
    target: '#directions-action',
    title: '查看方向',
    enTitle: 'View directions',
    copy: '信息充分时，这个入口会亮起。点击后生成多个侧重点不同的方向，也会考虑最新输入。你可以继续探索，自己决定何时查看结果。',
    en: 'When enough context is available, this entrance becomes active. It generates directions with different priorities and includes your latest input. You can keep exploring and decide when to view the results.',
  },
];
function startTour() {
  if (state.screen !== 'explore') return;
  ui.returnFocus = document.activeElement;
  ui.tourStep = 0;
  paintTour();
}
const tourLabels = {
  en: [
    'Tutorial',
    'Next tip →',
    'Finish tutorial · Start using',
    'Highlighted area: preview only during the tutorial.',
  ],
  'zh-CN': [
    '操作教程',
    '下一条说明 →',
    '结束教程，开始使用',
    '圈内为说明区域，请先结束教程再操作。',
  ],
  'zh-TW': [
    '操作教學',
    '下一則說明 →',
    '結束教學，開始使用',
    '圈內為說明區域，請先結束教學再操作。',
  ],
  ja: [
    '操作ガイド',
    '次の説明 →',
    'ガイドを終了して使う',
    'ガイド中は囲まれた部分を操作できません。',
  ],
  ko: [
    '사용 안내',
    '다음 설명 →',
    '안내를 마치고 시작',
    '강조 영역은 안내를 마친 후 사용할 수 있습니다.',
  ],
  es: [
    'Tutorial',
    'Siguiente explicación →',
    'Terminar tutorial y empezar',
    'El área resaltada se puede usar al terminar el tutorial.',
  ],
  fr: [
    'Tutoriel',
    'Explication suivante →',
    'Terminer et commencer',
    'La zone surlignée sera utilisable après le tutoriel.',
  ],
  de: [
    'Anleitung',
    'Nächster Hinweis →',
    'Anleitung beenden und starten',
    'Der markierte Bereich ist nach der Anleitung bedienbar.',
  ],
  pt: [
    'Tutorial',
    'Próxima explicação →',
    'Concluir tutorial e começar',
    'A área destacada fica disponível após o tutorial.',
  ],
  ru: [
    'Обучение',
    'Следующая подсказка →',
    'Завершить обучение и начать',
    'Выделенная область доступна после завершения обучения.',
  ],
  it: [
    'Tutorial',
    'Prossima spiegazione →',
    'Termina il tutorial e inizia',
    'L’area evidenziata è utilizzabile al termine del tutorial.',
  ],
  ar: [
    'شرح الاستخدام',
    'الشرح التالي ←',
    'إنهاء الشرح وبدء الاستخدام',
    'يمكن استخدام المنطقة المحددة بعد إنهاء الشرح.',
  ],
};
function tourTarget() {
  const step = ui.tourStep;
  return $(tours[step].target) || $(step === 0 ? '#question-panel' : '#clue-board');
}
function tourRect() {
  return tourTarget().getBoundingClientRect();
}
function paintTour() {
  const target = tourTarget();
  if (!target) {
    endTour();
    return;
  }
  const step = tours[ui.tourStep],
    overlay = $('#tutorial'),
    labels = tourLabels[getLocale()] || tourLabels.en;
  overlay.hidden = false;
  $('#main').inert = true;
  overlay.innerHTML =
    '<div class="tour-blocker" data-action="tour-hint"></div><div class="tour-ring" aria-hidden="true"></div><svg class="tour-leader" aria-hidden="true"><path/><circle r="3"/></svg><section class="tour-popover" role="dialog" aria-modal="true" aria-labelledby="tour-title"><div class="tour-badge" data-raw><span class="tour-number">0' +
    (ui.tourStep + 1) +
    '</span><span>' +
    esc(labels[0]) +
    '<small>' +
    (ui.tourStep + 1) +
    ' / ' +
    tours.length +
    '</small></span></div><h2 id="tour-title" data-raw>' +
    esc(groupCopy('tourTitle' + ui.tourStep, step.title, step.enTitle)) +
    '</h2><p data-raw>' +
    esc(groupCopy('tourBody' + ui.tourStep, step.copy, step.en)) +
    '</p><p class="tour-instruction" data-raw>' +
    esc(labels[3]) +
    '</p><div class="tour-actions">' +
    btn(
      'tour-next',
      esc(labels[ui.tourStep === tours.length - 1 ? 2 : 1]),
      'data-raw',
      'tour-advance',
    ) +
    btn('tour-skip', 'Skip guide', '', 'tour-dismiss') +
    '</div></section>';
  overlay.querySelector('.tour-blocker').addEventListener('click', () => {
    const panel = $('.tour-popover');
    panel
      .querySelector('.tour-advance')
      .animate([{ boxShadow: '0 0 0 4px #ffffff70' }, { boxShadow: '0 0 0 8px transparent' }], {
        duration: 650,
      });
    $('[data-action="tour-next"]')?.focus({ preventScroll: true });
  });

  localize(overlay);
  target.scrollIntoView({ behavior: 'instant', block: 'center' });
  requestAnimationFrame(() => {
    positionTour();
    $('[data-action="tour-next"]')?.focus({ preventScroll: true });
  });
}
function positionTour() {
  if (ui.tourStep === null) return;
  const target = tourTarget(),
    popover = $('.tour-popover'),
    ring = $('.tour-ring');
  if (!target || !popover || !ring) return;
  const r = tourRect(),
    gap = 38,
    pad = 8,
    vw = window.innerWidth,
    vh = window.innerHeight;
  Object.assign(ring.style, {
    left: r.left - pad + 'px',
    top: r.top - pad + 'px',
    width: r.width + pad * 2 + 'px',
    height: r.height + pad * 2 + 'px',
  });
  const w = popover.offsetWidth,
    h = popover.offsetHeight;
  const candidates = [
    { left: r.right + gap, top: r.top },
    { left: r.left - w - gap, top: r.top },
    { left: r.left, top: r.bottom + gap },
    { left: r.left, top: r.top - h - gap },
  ];
  let pos = candidates.find(
    (p) => p.left >= 12 && p.left + w <= vw - 12 && p.top >= 12 && p.top + h <= vh - 12,
  );
  if (!pos) {
    // On narrow screens, keep the annotation above or below the actual control.
    const roomBelow = vh - r.bottom,
      roomAbove = r.top;
    pos = {
      left: Math.max(12, Math.min(r.left, vw - w - 12)),
      top: roomBelow >= roomAbove ? r.bottom + gap : r.top - h - gap,
    };
    if (pos.top < 12 || pos.top + h > vh - 12) {
      const desiredTop = h + gap + 12;
      window.scrollBy({ top: r.top - desiredTop, behavior: 'instant' });
      const moved = tourRect();
      ring.style.top = moved.top - pad + 'px';
      pos.top = Math.max(12, moved.top - h - gap);
    }
  }
  popover.style.left = pos.left + 'px';
  popover.style.top = pos.top + 'px';
  const box = tourRect(),
    leader = $('.tour-leader');
  let x1, y1, x2, y2;
  if (pos.left >= box.right) {
    x1 = box.right + pad;
    y1 = Math.min(box.bottom, Math.max(box.top, pos.top + 24));
    x2 = pos.left - 8;
    y2 = pos.top + 24;
  } else if (pos.left + w <= box.left) {
    x1 = box.left - pad;
    y1 = Math.min(box.bottom, Math.max(box.top, pos.top + 24));
    x2 = pos.left + w + 8;
    y2 = pos.top + 24;
  } else if (pos.top + h <= box.top) {
    x1 = Math.max(box.left + 20, Math.min(box.right - 20, pos.left + 24));
    y1 = box.top - pad;
    x2 = pos.left + 24;
    y2 = pos.top + h + 8;
  } else {
    x1 = Math.max(box.left + 20, Math.min(box.right - 20, pos.left + 24));
    y1 = box.bottom + pad;
    x2 = pos.left + 24;
    y2 = pos.top - 8;
  }
  leader.setAttribute('viewBox', '0 0 ' + vw + ' ' + vh);
  leader.querySelector('path').setAttribute('d', 'M ' + x1 + ' ' + y1 + ' L ' + x2 + ' ' + y2);
  leader.querySelector('circle').setAttribute('cx', x1);
  leader.querySelector('circle').setAttribute('cy', y1);
}
function endTour() {
  if (ui.tourStep === null) return;
  ui.tourStep = null;
  $('#main').inert = false;
  $('#tutorial').hidden = true;
  $('#tutorial').innerHTML = '';
  $$('.tour-highlight').forEach((x) => x.classList.remove('tour-highlight'));
  change('tutorial/seen', {}, false);
  if (ui.returnFocus?.isConnected) ui.returnFocus.focus({ preventScroll: true });
}
function connect(a, b) {
  if (a === b) return;
  const members = roundIds();
  ui.connecting = null;
  if (members.length && !members.includes(a) && !members.includes(b)) {
    ui.notice = groupCopy(
      'blocked',
      '本轮已有探索组合。请加入当前组，或先点击“重新组合”。',
      'A combination is already active. Join it, or reset the combination first.',
    );
    ui.noticeRaw = true;
    ui.error = false;
    render();
    return;
  }
  if (
    state.links.some((link) => (link.a === a && link.b === b) || (link.a === b && link.b === a))
  ) {
    ui.noticeRaw = true;
    ui.notice = bt(3);
    ui.error = false;
    render();
    highlightPlace('.connection-list');
    return;
  }
  if (change('clue/connect', { a, b }))
    notice('Connection saved. Continue exploring to follow this relationship.');
}
function addThought() {
  if (ui.busy) return;
  const text = state.draft.thought.trim();
  if (!text) {
    notice('Write a thought before adding it.');
    $('[data-field="thought"]')?.focus();
    return;
  }
  if (change('thought/add', { text }, false)) {
    change('draft/set', { field: 'thought', value: '' });
    notice('Your thought is saved in your own words.');
    $('[data-field="thought"]')?.focus();
  }
}
async function handleClick(button) {
  const a = button.dataset.action,
    id = button.dataset.id;
  if (!a) return;
  if (
    ui.busy &&
    ![
      'cancel-request',
      'saved',
      'settings',
      'language',
      'set-language',
      'close-dialog',
      'dismiss',
      'export',
    ].includes(a)
  )
    return;
  switch (a) {
    case 'reuse-combination':
      ui.connecting = null;
      change('clue/reuse-combination', { id });
      break;
    case 'reset-round':
      ui.connecting = null;
      change('clue/reset-round');
      break;
    case 'leave-group':
      change('clue/leave-group', { id });
      break;
    case 'dissolve-group':
      change('clue/dissolve-group', { id });
      break;
    case 'help-toggle':
      currentHelp().open = !currentHelp().open;
      render();
      break;
    case 'help-ask':
      await explainQuestion();
      break;
    case 'dismiss':
      ui.notice = '';
      ui.undoLink = null;
      renderNotice();
      break;
    case 'saved':
      openDialog('saved');
      break;
    case 'cancel-request':
      if (ui.request) {
        ui.request.canceled = true;
        ui.request.controller.abort();
      }
      break;
    case 'history':
      openDialog('history');
      break;
    case 'history-revisit':
      if (
        change('direction/revisit', { historyId: button.dataset.historyId, directionId: id }, false)
      ) {
        closeDialog();
        render(true);
        notice(tr('restoredDirection'));
      }
      break;
    case 'qa-apply':
      if (change('direction/qa-apply', { id }, false)) {
        closeDialog();
        render(true);
        notice(tr('qaApplied'));
      }
      break;
    case 'toggle-clues':
      ui.lastRestoredId = null;
      ui.showAllClues = !ui.showAllClues;
      render();
      break;
    case 'disconnect': {
      const link = state.links.find((item) => item.id === id);
      if (link && change('clue/disconnect', { id })) {
        ui.undoLink = { ...link };
        notice(tr('connectionRemoved'));
      }
      break;
    }
    case 'undo-disconnect': {
      const link = ui.undoLink;
      ui.undoLink = null;
      if (link && change('clue/undo-disconnect', { id: link.id }))
        notice('Connection saved. Continue exploring to follow this relationship.');
      break;
    }
    case 'uncertainty-resolve': {
      const text = $('[data-uncertainty-draft="' + CSS.escape(id) + '"]')?.value.trim();
      if (text) change('brief/uncertainty', { id, status: 'resolved', resolution: text });
      else $('[data-uncertainty-draft="' + CSS.escape(id) + '"]')?.focus();
      break;
    }
    case 'uncertainty-reopen':
      change('brief/uncertainty', { id, status: 'unresolved', resolution: '' });
      break;
    case 'settings':
      openDialog('settings');
      break;
    case 'language':
      openDialog('language');
      break;
    case 'set-language':
      await switchProjectLanguage(button.dataset.locale);
      break;
    case 'close-dialog':
      closeDialog();
      break;
    case 'review-brief':
      await reviewBrief();
      break;
    case 'remove-file':
      ui.fileRevision++;
      clearExtractedBrief();
      ui.file = null;
      ui.missingFile = null;
      change(
        'brief/review',
        { summary: '', requirements: [], uncertainties: [], reviewStarted: false },
        false,
      );
      save();
      render();
      break;
    case 'add-requirement': {
      const item = createBriefItem(
        button.dataset.category || $('#brief-add-category')?.value,
        getLocale(),
      );
      change('brief/review', { summary: state.brief.summary, requirements: [...reqs(), item] });
      $('[data-requirement="' + CSS.escape(item.id) + '"]')?.focus();
      break;
    }
    case 'remove-requirement':
      change('brief/review', {
        summary: state.brief.summary,
        requirements: reqs().filter((r) => r.id !== id),
      });
      break;
    case 'confirm-brief': {
      const nodes = $$('[data-requirement]');
      if (nodes.some((x) => !x.value.trim())) {
        notice('Fill in or remove the empty requirement before confirming.', true);
        nodes.find((x) => !x.value.trim()).focus();
        break;
      }
      if (change('brief/confirm', {}, false)) {
        ui.notice = '';
        ui.error = false;
        if (ui.briefReturn && state.start.kind) {
          change('entry/select', { kind: state.start.kind, idea: state.start.idea }, false);
          ui.briefReturn = false;
          notice(
            'Updated requirements confirmed. Continue exploring to review them with your ideas.',
          );
        }
        render(true);
      }
      break;
    }
    case 'entry-return':
      endTour();
      if (change('entry/return', {}, false)) {
        ui.notice = '';
        ui.error = false;
        render(true);
      }
      break;
    case 'entry-resume':
      endTour();
      if (change('entry/resume', {}, false)) {
        ui.notice = '';
        ui.error = false;
        render(true);
      }
      break;
    case 'entry-kind':
      change('entry/draft', { kind: button.dataset.kind });
      if (button.dataset.kind === 'rough') $('#rough-idea')?.focus();
      break;
    case 'start': {
      endTour();
      const start = state.entryEdit?.draft || state.start,
        editing = !!state.entryEdit,
        revision = state.revision;
      if (start.kind === 'rough' && !start.idea.trim()) {
        notice('Add a few words about your rough idea, or choose “I’m starting fresh”.', true);
        $('#rough-idea')?.focus();
        break;
      }
      if (
        change(
          'entry/select',
          { kind: start.kind, idea: start.kind === 'rough' ? start.idea : '' },
          false,
        )
      ) {
        ui.notice = '';
        ui.error = false;
        render(true);
        if (!editing || state.revision !== revision) await turn();
      }
      break;
    }
    case 'brief':
      ui.briefReturn = state.screen !== 'brief' && state.screen !== 'entry';
      change('brief/return', {}, false);
      ui.noticeRaw = false;
      ui.notice =
        'Your original brief and requirements remain editable. Confirm them again when you’re ready.';
      ui.error = false;
      render(true);
      break;
    case 'continue':
      await turn();
      break;
    case 'different-question':
      change('question/different', {}, false);
      await turn();
      break;
    case 'directions':
      await turn('directions');
      break;
    case 'focus':
      change('clue/focus', { id: state.focusId === id ? null : id });
      notice(
        state.focusId
          ? 'Focus saved for your next exploration step.'
          : 'Focus cleared. All active clues remain available.',
      );
      break;
    case 'new-clue':
      ui.newClue = !ui.newClue;
      render();
      if (ui.newClue) $('#thought-form input')?.focus();
      break;
    case 'arrange-clues':
      state.boardPositions = {};
      save();
      render();
      break;
    case 'connect':
      ui.notice = '';
      if (ui.connecting && ui.connecting !== id) connect(ui.connecting, id);
      else {
        ui.connecting = ui.connecting === id ? null : id;
        render();
      }
      break;
    case 'show-shelf':
      highlightPlace('#aside-shelf');
      break;
    case 'aside':
      setAside(id);
      break;
    case 'restore':
      if (!change('clue/restore', { id }, false)) break;
      ui.lastRestoredId = id;
      render();
      notice('Clue restored to active exploration.');
      highlightPlace('[data-clue="' + CSS.escape(id) + '"]');
      $('[data-action="focus"][data-id="' + CSS.escape(id) + '"]')?.focus({ preventScroll: true });
      break;
    case 'correct':
      openDialog('correct', { id });
      break;
    case 'save-correction': {
      const text = $('#correction-text').value.trim();
      if (!text) {
        dialogError('Write a correction before saving.');
        break;
      }
      const clueId = ui.dialogData.id;
      if (change('clue/correct', { id: clueId, text }, false)) {
        closeDialog();
        render();
        notice(
          'Your correction is saved. The earlier interpretation will not be reused as a fact.',
        );
      }
      break;
    }
    case 'finish':
      openDialog('finish');
      break;
    case 'confirm-finish':
      closeDialog();
      ui.notice = '';
      if (change('direction/finish', {}, false)) render(true);
      break;
    case 'reopen':
      ui.notice = '';
      if (change('direction/reopen', {}, false)) render(true);
      break;
    case 'choose':
      if (change('direction/select', { id }, false)) {
        render(true);
        notice('Your chosen direction is saved. You can return to exploring anytime.');
      }
      break;
    case 'keep-exploring':
      ui.notice = '';
      ui.error = false;
      change('exploration/return', {}, false);
      render(true);
      break;
    case 'none-fit':
      openDialog('reject');
      break;
    case 'reject-directions': {
      const reason = $('#rejection-reason').value.trim();
      if (change('directions/reject', { reason }, false)) {
        closeDialog();
        render(true);
        await turn();
      }
      break;
    }
    case 'ask':
      openDialog('ask', { id });
      break;
    case 'ask-send':
      await askDirection();
      break;
    case 'guide':
      if (state.screen === 'explore') startTour();
      else openDialog('page-guide');
      break;
    case 'tour-next':
      if (ui.tourStep < tours.length - 1) {
        ui.tourStep++;
        paintTour();
      } else endTour();
      break;
    case 'tour-skip':
      endTour();
      break;
    case 'export-direction':
      exportDirection();
      break;
    case 'choose-backup':
      chooseBackup();
      break;
    case 'apply-backup':
      if (ui.dialogKind !== 'restore-backup' || !ui.dialogData?.backup) break;
      try {
        localStorage.setItem(STORAGE, JSON.stringify(ui.dialogData.backup));
        location.reload();
      } catch {
        dialogError(transferText(getLocale(), 5), true);
      }
      break;
    case 'export':
      exportProject();
      break;
    case 'reset':
      openDialog('reset');
      break;
    case 'confirm-reset':
      closeDialog();
      state = createProject();
      questionHelp.clear();
      ui.explanationHistory = {};
      ui.questionDrafts = {};
      ui.mode = 'live';
      ui.extractedBriefText = '';
      ui.file = null;
      ui.missingFile = null;
      ui.notice = '';
      ui.briefReturn = false;
      save();
      render(true);
      break;
    case 'demo':
      if ($('#dialog').open) closeDialog();
      if (hasWork()) openDialog('demo');
      else await demo();
      break;
    case 'confirm-demo':
      closeDialog();
      await demo();
      break;
  }
}
if (typeof document !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === DRAFT_STORAGE && event.newValue) syncExplorationDraft();
    if (event.key !== STORAGE || !event.newValue || state.screen !== 'explore') return;
    const latest = JSON.parse(event.newValue).project;
    if (
      latest.id === state.id &&
      (latest.screen === 'directions' ||
        (latest.screen === 'explore' &&
          (latest.round !== state.round || latest.question?.id !== state.question?.id)))
    ) {
      location.reload();
    }
  });
  document.addEventListener('click', (event) => {
    const choice = event.target.closest('[data-choice]');
    if (choice) {
      if (ui.tourStep !== null || ui.busy) return;
      const value = state.draft.choice === choice.dataset.choice ? '' : choice.dataset.choice;
      change('draft/set', { field: 'choice', value }, false);
      $$('[data-choice]').forEach((b) =>
        b.setAttribute('aria-pressed', String(b.dataset.choice === value)),
      );
      return;
    }
    const button = event.target.closest('button[data-action]');
    if (!button || button.disabled || button.closest('[data-suppress-click]')) return;
    handleClick(button).catch((e) => notice(e.message, true));
  });
  document.addEventListener('input', (event) => {
    const el = event.target,
      field = el.dataset.field;
    if (ui.busy) return;
    if (el.id === 'direction-question') {
      const key = questionDraftKey(ui.dialogData.id);
      if (el.value) ui.questionDrafts[key] = el.value;
      else delete ui.questionDrafts[key];
      save();
      return;
    }
    if (el.id === 'clarification-input') {
      saveHelpDraft(currentHelp(), el.value);
      return;
    }
    if (el.dataset.uncertaintyDraft) {
      change(
        'brief/uncertainty',
        { id: el.dataset.uncertaintyDraft, status: 'unresolved', resolution: el.value },
        false,
      );
      return;
    }
    if (field === 'brief-text') {
      briefEditVersion++;
      ui.extractedBriefText = '';
      change('brief/text', { text: el.value }, false);
      $('.review-panel')?.remove();
    } else if (field === 'rough-idea') change('entry/draft', { idea: el.value }, false);
    else if (['answer', 'thought'].includes(field))
      change('draft/set', { field, value: el.value }, false);
    else if (field === 'brief-summary')
      change('brief/review', { summary: el.value, requirements: reqs() }, false);
    else if (el.dataset.requirementLabel) {
      change(
        'brief/review',
        {
          summary: state.brief.summary,
          requirements: editBriefItem(reqs(), el.dataset.requirementLabel, 'label', el.value),
        },
        false,
      );
      const field = el.closest('.requirement-row')?.querySelector('textarea');
      if (field) field.setAttribute('aria-label', el.value);
    } else if (el.dataset.requirement) {
      change(
        'brief/review',
        {
          summary: state.brief.summary,
          requirements: editBriefItem(reqs(), el.dataset.requirement, 'text', el.value),
        },
        false,
      );
    }
  });
  document.addEventListener('submit', (event) => {
    if (event.target.id === 'thought-form') {
      event.preventDefault();
      addThought();
    }
  });
  document.addEventListener('change', async (event) => {
    if (event.target.dataset.requirementCategory) {
      if (ui.busy) return;
      change('brief/review', {
        summary: state.brief.summary,
        requirements: editBriefItem(
          reqs(),
          event.target.dataset.requirementCategory,
          'category',
          event.target.value,
        ),
      });
      return;
    }
    if (event.target.id !== 'brief-file') return;
    if (ui.busy) {
      event.target.value = '';
      return;
    }
    const fileVersion = ++ui.fileRevision;
    const projectId = state.id;
    const isCurrentUpload = () => projectId === state.id && fileVersion === ui.fileRevision;
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      notice('Please use a file under 3 MB.', true);
      event.target.value = '';
      return;
    }
    if (!/\.(txt|md|pdf|png|jpe?g)$/i.test(file.name)) {
      notice('Use TXT, MD, PDF, PNG, or JPG for your brief.', true);
      return;
    }
    try {
      if (/\.(txt|md)$/i.test(file.name)) {
        const editVersionAtSelection = briefEditVersion;
        const text = await file.text();
        if (!isCurrentUpload() || editVersionAtSelection !== briefEditVersion) return;
        const attachmentRemoved = Boolean(ui.file || ui.missingFile);
        ui.extractedBriefText = '';
        ui.file = null;
        ui.missingFile = null;
        change('brief/text', { text, attachmentRemoved });
        notice('Text loaded. Review the brief when you’re ready.');
      } else {
        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(',')[1]);
          reader.onerror = () =>
            reject(new Error('This file could not be read. Please try attaching it again.'));
          reader.readAsDataURL(file);
        });
        if (!isCurrentUpload()) return;
        clearExtractedBrief();
        ui.file = {
          name: file.name,
          mediaType:
            file.type ||
            (/\.pdf$/i.test(file.name)
              ? 'application/pdf'
              : /\.png$/i.test(file.name)
                ? 'image/png'
                : 'image/jpeg'),
          base64,
        };
        ui.missingFile = null;
        change(
          'brief/review',
          { summary: '', requirements: [], uncertainties: [], reviewStarted: false },
          false,
        );
        save();
        render();
        notice('');
      }
    } catch (e) {
      if (isCurrentUpload()) notice(e.message, true);
    }
  });
  $('#dialog').addEventListener('cancel', (event) => {
    event.preventDefault();
    closeDialog();
  });
  document.addEventListener('keydown', (event) => {
    if (ui.tourStep === null) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      endTour();
      return;
    }
    if (event.key === 'Tab') {
      const controls = $$('button', $('#tutorial')),
        first = controls[0],
        last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (!$('#tutorial').contains(document.activeElement)) {
        event.preventDefault();
        first?.focus();
      }
    }
  });
  window.addEventListener('resize', positionTour);
  window.addEventListener('scroll', positionTour, { passive: true });

  render();
  fetch('/api/status')
    .then(async (response) => {
      if (!response.ok) throw new Error();
      ui.status = { ...(await response.json()), checked: true };
      renderMode();
      renderBriefAccess();
    })
    .catch(() => {
      ui.status = { ready: false, model: '' };
      renderMode();
      notice(
        'The local server status is unavailable. Your saved workspace is still accessible.',
        true,
      );
    });
}

function withTranslatedView(renderContent) {
  const canonical = state,
    fields = generatedTextFields(canonical);
  // Match each unchanged source field, so a new answer does not discard older translations.
  const available = new Map();
  for (const cached of ui.contentTranslations || []) {
    if (cached?.language !== getLocale()) continue;
    try {
      const sources = JSON.parse(cached.signature);
      const translated = new Map(cached.translations.map((x) => [x.key, x.text]));
      for (const field of sources)
        if (translated.has(field.key))
          available.set(JSON.stringify([field.key, field.text]), translated.get(field.key));
    } catch {
      continue;
    }
  }
  const sources = fields.filter((f) => available.has(JSON.stringify([f.key, f.text])));
  if (!sources.length) return renderContent();
  const translations = sources.map((f) => ({
    key: f.key,
    text: available.get(JSON.stringify([f.key, f.text])),
  }));
  try {
    state = translatedProject(canonical, sources, translations);
    return renderContent();
  } finally {
    state = canonical;
  }
}
async function switchProjectLanguage(code) {
  if (ui.busy || code === getLocale()) {
    if (!ui.busy) closeDialog();
    return;
  }
  const language = LANGUAGES.find((x) => x.code === code);
  if (!language) return;
  const drafts = $$('[data-requirement]').map((el) => [el.dataset.requirement, el.value]);
  const fields = generatedTextFields(state),
    signature = JSON.stringify(fields),
    projectId = state.id,
    revision = state.revision;
  const previous = getLocale();
  ui.contentTranslations ??= [];
  const existing = ui.contentTranslations.find(
    (x) => x.signature === signature && x.language === code,
  );
  ui.busy = true;
  ui.busyText = previous.startsWith('zh')
    ? '正在翻译已有 AI 内容…'
    : 'Translating existing AI content…';
  closeDialog();
  render();
  try {
    const result =
      existing ||
      (await api('/api/translate', {
        mode: ui.mode,
        fields,
        language: { code, label: language.label },
      }));
    if (state.id !== projectId || state.revision !== revision)
      throw new Error('The project changed. Please switch language again.');
    translatedProject(state, fields, result.translations);
    if (!existing)
      ui.contentTranslations.push({ signature, language: code, translations: result.translations });
    ui.contentTranslations = ui.contentTranslations.slice(-4);
    setLocale(code);
    syncPreviewSource();
    save();
    ui.notice = 'Language saved on this browser.';
    ui.error = false;
  } catch (error) {
    ui.notice = error.message;
    ui.error = true;
  } finally {
    ui.busy = false;
    render();
    for (const [id, value] of drafts) {
      const el = $('[data-requirement="' + CSS.escape(id) + '"]');
      if (el) el.value = value;
    }
  }
}
