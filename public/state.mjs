import { connectionGroups } from './connections.mjs';
/** Pure project state shared by the browser and the local server. */
import { BRIEF_CATEGORIES, inferBriefCategory, inferBriefLabel } from './brief-categories.mjs';
export const DEMO_BRIEF =
  'Create a visual narrative in one week using 6–8 still images about an everyday subject. Use your own photographs or illustrations. No video. You have your own phone available.';
const clone = (value) => structuredClone(value);
const uid = () => globalThis.crypto.randomUUID();
const now = () => new Date().toISOString();
const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const clean = (value) => (typeof value === 'string' ? value.trim() : '');
const titleFor = (text) => (text.length > 65 ? `${text.slice(0, 62)}…` : text);
const fail = (message) => {
  throw new Error(message);
};
const needString = (value, label, allowEmpty = false) => {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim()))
    fail(`${label} must be a${allowEmpty ? '' : ' non-empty'} string.`);
  return value;
};
const list = (value, label) => {
  if (!Array.isArray(value)) fail(`${label} must be an array.`);
  return value;
};
const uniqueIds = (items, label) => {
  const seen = new Set();
  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item))
      fail(`${label} entries must be objects.`);
    needString(item.id, `${label}.id`);
    if (seen.has(item.id)) fail(`${label} contains duplicate ID ${item.id}.`);
    seen.add(item.id);
  }
  return seen;
};
const emptyDraft = () => ({ id: uid(), answer: '', choice: '', thought: '' });
const input = (state, type, text, questionText = '', id = uid()) => {
  if (!clean(text)) return null;
  const existing = state.inputs.find((item) => item.id === id);
  if (existing) return existing;
  const item = { id, type, text, questionText, createdAt: now() };
  state.inputs.push(item);
  return item;
};
const snapshotBrief = (state) => {
  if (!state.inputs.some((item) => item.type === 'brief' && item.text === state.brief.text))
    input(state, 'brief', state.brief.text);
};
const event = (state, type, payload) => {
  state.revision += 1;
  state.events.push({
    id: uid(),
    type,
    payload: clone(payload),
    revision: state.revision,
    createdAt: now(),
  });
};
const returnToExploration = (state) => {
  if (['directions', 'chosen'].includes(state.screen)) state.screen = 'explore';
  state.selectedDirectionId = null;
};
const archiveDirections = (state, reason) => {
  if (!state.directions.length) return;
  const legacyCombinations = !Array.isArray(state.combinationHistory);
  state.combinationHistory ??= [];
  if (legacyCombinations && state.links.length) {
    const applied = [...state.events].reverse().find((e) => e.type === 'turn/applied');
    const changed = [...state.events]
      .reverse()
      .find((e) => e.type.startsWith('clue/') && e.type !== 'clue/focus');
    if (applied && (!changed || changed.revision < applied.revision))
      archiveCombination(state, {}, true);
  }
  state.directionHistory ??= [];
  const directions = clone(state.directions);
  const id = state.directionSetId || uid();
  if (!state.directionHistory.some((item) => item.id === id)) {
    state.directionHistory.unshift({
      id,
      directions,
      createdAt: now(),
      revision: state.review.revision ?? state.revision,
      reason,
      valid: false,
    });
    state.directionHistory = state.directionHistory.slice(0, 8);
  }
};
const resetReview = (state, reason = 'information-changed') => {
  archiveDirections(state, reason);
  state.review = {
    ready: false,
    reason: 'The changed information needs another review.',
    revision: null,
    issues: [],
  };
  state.directions = [];
  state.directionSetId = null;
  returnToExploration(state);
};
const studentClue = (state, item, id = uid()) => {
  if (!state.clues.some((clue) => clue.id === id))
    state.clues.push({
      id,
      title: titleFor(item.text),
      detail: item.text,
      origin: 'student',
      sourceIds: [item.id],
      status: 'active',
    });
};
const findClue = (state, id) =>
  state.clues.find((clue) => clue.id === id) || fail(`Unknown clue: ${id}.`);
function withdrawInterpretations(state, seedIds, reason) {
  const dependentsBySource = new Map();
  for (const clue of state.clues) {
    if (clue.origin !== 'ai') continue;
    for (const sourceId of clue.sourceIds) {
      if (!dependentsBySource.has(sourceId)) dependentsBySource.set(sourceId, []);
      dependentsBySource.get(sourceId).push(clue.id);
    }
  }

  const invalidIds = new Set(seedIds);
  const pending = [...invalidIds];
  while (pending.length) {
    const sourceId = pending.pop();
    for (const dependentId of dependentsBySource.get(sourceId) || []) {
      if (invalidIds.has(dependentId)) continue;
      invalidIds.add(dependentId);
      pending.push(dependentId);
    }
  }

  for (const clue of state.clues) {
    if (!invalidIds.has(clue.id)) continue;
    clue.status = 'invalid';
    clue.invalidReason = reason;
  }
  state.links = state.links.filter((link) => !invalidIds.has(link.a) && !invalidIds.has(link.b));
  if (invalidIds.has(state.focusId)) state.focusId = null;
}

const normalizeRequirements = (items, previous = []) =>
  items.map((requirement) => {
    const existing = previous.find((item) => item.id === requirement.id);
    const text = needString(requirement.text, 'Requirement text', true);
    const sourceType =
      requirement.sourceType ??
      existing?.sourceType ??
      (clean(requirement.quote) ? 'document' : 'student');
    if (!['document', 'student'].includes(sourceType)) fail('Unknown requirement source type.');
    const quote = needString(requirement.quote ?? '', 'Requirement quote', true);
    const category = requirement.category ?? existing?.category ?? inferBriefCategory(requirement);
    if (!BRIEF_CATEGORIES.includes(category)) fail('Unknown brief category.');
    const label = needString(
      requirement.label ?? existing?.label ?? inferBriefLabel(requirement, category),
      'Brief item label',
      true,
    );
    return {
      ...clone(requirement),
      id: requirement.id || uid(),
      text,
      sourceType,
      category,
      label,
      quote: sourceType === 'student' ? quote || text : quote,
    };
  });
const normalizeUncertainties = (items = [], previous = []) =>
  items.map((value) => {
    const item = typeof value === 'string' ? { text: value } : value;
    if (!item || typeof item !== 'object') fail('Uncertainties must contain text or objects.');
    const text = needString(item.text, 'Uncertainty text');
    const existing = previous.find(
      (entry) => (item.id && entry.id === item.id) || entry.text === text,
    );
    const status = item.status ?? existing?.status ?? 'unresolved';
    if (!['unresolved', 'resolved', 'dismissed'].includes(status))
      fail('Unknown uncertainty status.');
    const resolution = needString(
      item.resolution ?? existing?.resolution ?? '',
      'Uncertainty resolution',
      true,
    );
    if (status === 'resolved' && !clean(resolution))
      fail('Add a clarification before resolving an uncertainty.');
    return {
      id: item.id || existing?.id || uid(),
      text,
      status,
      resolution,
      decisive: item.decisive ?? existing?.decisive ?? false,
    };
  });
const decisiveUncertainties = (state) =>
  (state.brief.uncertainties || []).filter(
    (item) => item.decisive === true && item.status === 'unresolved',
  );

export function createProject() {
  return {
    schemaVersion: 2,
    id: uid(),
    revision: 0,
    screen: 'brief',
    brief: { text: '', summary: '', requirements: [], uncertainties: [], confirmed: false },
    start: { kind: null, idea: '' },
    inputs: [],
    clues: [],
    links: [],
    combinationHistory: [],
    focusId: null,
    draft: emptyDraft(),
    question: null,
    round: 0,
    review: { ready: false, reason: '', revision: null, issues: [] },
    directions: [],
    directionSetId: null,
    directionHistory: [],
    directionQuestions: [],
    lastDisconnected: null,
    selectedDirectionId: null,
    rejections: [],
    corrections: [],
    events: [],
    tutorialSeen: false,
    preferences: [],
  };
}

export const combinationKey = (ids) => [...new Set(ids)].sort().join('|');
function archiveCombination(state, result = {}, recovered = false) {
  const active = new Set(state.clues.filter((c) => c.status === 'active').map((c) => c.id));
  const links = state.links.filter((l) => active.has(l.a) && active.has(l.b));
  const ids = [...new Set(links.flatMap((l) => [l.a, l.b]))];
  if (ids.length < 2) return;
  state.combinationHistory ??= [];
  state.combinationHistory.push({
    id: uid(),
    key: combinationKey(ids),
    round: state.round,
    clues: clone(state.clues.filter((c) => ids.includes(c.id))),
    links: clone(links),
    question: clone(result.question ?? state.question),
    results: clone(result.clues ?? []),
    note: result.memoryNote || '',
    recovered,
    createdAt: new Date().toISOString(),
  });
  state.links = [];
  state.lastDisconnected = null;
}

/** Upgrade saved local projects without treating old defaults as student choices. */
export function migrateProject(original) {
  const state = clone(original);
  const legacyCombinations = !Array.isArray(state.combinationHistory);
  state.combinationHistory ??= [];
  if (legacyCombinations && state.links.length) {
    const applied = [...state.events].reverse().find((e) => e.type === 'turn/applied');
    const changed = [...state.events]
      .reverse()
      .find((e) => e.type.startsWith('clue/') && e.type !== 'clue/focus');
    if (applied && (!changed || changed.revision < applied.revision))
      archiveCombination(state, {}, true);
  }
  state.directionHistory ??= [];
  state.directionQuestions ??= [];
  state.lastDisconnected ??= null;
  for (const clue of state.clues) {
    if (clue.status === 'invalid' && clue.invalidReason === 'connection-removed') {
      const previous = state.lastDisconnected?.affected?.find((c) => c.id === clue.id);
      clue.status = previous?.status === 'aside' ? 'aside' : 'active';
      delete clue.invalidReason;
    }
  }
  // Older projects could retain a connection to a withdrawn starting idea.
  if (
    state.links.length &&
    state.clues.some((clue) => clue.invalidReason === 'starting-point-updated')
  ) {
    const withdrawn = new Set(
      state.clues.filter((clue) => clue.status === 'invalid').map((clue) => clue.id),
    );
    state.links = state.links.filter((link) => !withdrawn.has(link.a) && !withdrawn.has(link.b));
  }
  state.directionSetId = state.directions.length ? state.directionSetId || uid() : null;
  for (const item of state.directionQuestions)
    if (!has(item, 'directionSetId')) {
      const current = state.directions.find(
        (direction) => direction.id === item.directionId && direction.title === item.directionTitle,
      );
      item.directionSetId = current ? state.directionSetId : null;
    }
  state.brief.requirements = normalizeRequirements(state.brief.requirements);
  state.brief.uncertainties = normalizeUncertainties(state.brief.uncertainties);
  if (
    (state.schemaVersion || 1) < 2 &&
    !state.events.some((item) => item.type === 'preferences/set')
  ) {
    if (state.preferences?.length) resetReview(state, 'preferences-not-confirmed');
    state.preferences = [];
  }
  state.preferences ??= [];
  for (const clue of state.clues) {
    if (clue.origin !== 'ai' || clue.status !== 'active' || clue.connectionIds) continue;
    const connectionIds = state.links
      .filter((link) => clue.sourceIds.includes(link.a) && clue.sourceIds.includes(link.b))
      .map((link) => link.id);
    if (connectionIds.length) clue.connectionIds = connectionIds;
  }
  state.schemaVersion = 2;
  return state;
}

export function update(original, type, payload = {}) {
  const state = migrateProject(original);
  switch (type) {
    case 'brief/text': {
      needString(payload.text, 'Brief text', true);
      if (state.brief.text === payload.text && !payload.attachmentRemoved) return state;
      state.brief = {
        text: payload.text,
        summary: '',
        requirements: [],
        uncertainties: [],
        confirmed: false,
      };
      state.screen = 'brief';
      resetReview(state);
      // Typing is a draft change, not a succession of submitted user statements.
      state.revision += 1;
      return state;
    }
    case 'brief/review': {
      needString(payload.summary, 'Brief summary', true);
      list(payload.requirements, 'Requirements');
      const requirements = normalizeRequirements(payload.requirements, state.brief.requirements);
      uniqueIds(requirements, 'Requirements');
      state.brief.reviewStarted = payload.reviewStarted !== false;
      state.brief.summary = payload.summary;
      state.brief.requirements = requirements;
      if (has(payload, 'uncertainties'))
        state.brief.uncertainties = normalizeUncertainties(
          list(payload.uncertainties, 'Uncertainties'),
          state.brief.uncertainties,
        );
      uniqueIds(state.brief.uncertainties, 'Uncertainties');
      state.brief.confirmed = false;
      snapshotBrief(state);
      resetReview(state);
      break;
    }
    case 'brief/uncertainty': {
      const item =
        state.brief.uncertainties.find((entry) => entry.id === payload.id) ||
        fail('Unknown uncertainty.');
      const normalized = normalizeUncertainties([{ ...item, ...payload }])[0];
      Object.assign(item, normalized);
      if (normalized.status === 'resolved') {
        const record = input(state, 'brief-clarification', normalized.resolution, normalized.text);
        record.uncertaintyId = item.id;
      }
      resetReview(state, 'brief-clarified');
      break;
    }
    case 'brief/confirm':
      if (!clean(state.brief.text)) fail('Add a brief before confirming it.');
      if (!clean(state.brief.summary) || !state.brief.requirements.length)
        fail('Review the brief and identify its requirements before confirming it.');
      if (state.brief.requirements.some((requirement) => !clean(requirement.text)))
        fail('Fill in or remove every blank requirement before confirming the brief.');
      snapshotBrief(state);
      state.brief.confirmed = true;
      state.screen = 'entry';
      break;
    case 'brief/return':
      state.brief.confirmed = false;
      state.screen = 'brief';
      resetReview(state);
      break;
    case 'entry/return':
      if (!state.brief.confirmed) fail('Confirm the brief before exploring.');
      state.entryEdit ??= { returnScreen: state.screen, draft: clone(state.start) };
      state.screen = 'entry';
      return state;
    case 'entry/resume':
      if (state.entryEdit) state.screen = state.entryEdit.returnScreen;
      delete state.entryEdit;
      return state;
    case 'entry/draft':
    case 'entry/select': {
      const current = state.entryEdit?.draft || state.start;
      const kind = has(payload, 'kind') ? payload.kind : current.kind;
      if (kind !== null && !['none', 'rough'].includes(kind))
        fail('Choose either none or rough as the starting point.');
      if (type === 'entry/select' && !kind) fail('Choose a starting point.');
      const draftIdea = has(payload, 'idea')
        ? needString(payload.idea, 'Starting idea', true)
        : current.idea;
      const idea = type === 'entry/select' && kind === 'none' ? '' : draftIdea;
      if (type === 'entry/select' && kind === 'rough' && !clean(idea)) {
        fail('Add a few words about your rough idea.');
      }
      if (state.entryEdit && type === 'entry/draft') {
        state.entryEdit.draft = { kind, idea };
        return state;
      }
      if (state.entryEdit && type === 'entry/select') {
        if (kind === state.start.kind && idea === state.start.idea) {
          state.screen = state.entryEdit.returnScreen;
          delete state.entryEdit;
          return state;
        }
        const oldIds = state.inputs
          .filter((item) => item.type === 'starting-idea')
          .map((item) => item.id);
        const oldClues = state.clues
          .filter((clue) => clue.sourceIds.some((id) => oldIds.includes(id)))
          .map((clue) => clue.id);
        withdrawInterpretations(state, [...oldIds, ...oldClues], 'starting-point-updated');
        resetReview(state, 'starting-point-updated');
        delete state.entryEdit;
        state.start = { kind, idea };
        state.screen = 'explore';
        if (clean(idea)) studentClue(state, input(state, 'starting-idea', idea));
        break;
      }
      if (type === 'entry/draft' && kind === state.start.kind && idea === state.start.idea)
        return state;
      state.start = { kind, idea };
      if (type === 'entry/select') {
        if (!state.brief.confirmed) fail('Confirm the brief before exploring.');
        state.screen = 'explore';
        if (
          clean(idea) &&
          !state.inputs.some((item) => item.type === 'starting-idea' && item.text === idea)
        ) {
          const item = input(state, 'starting-idea', idea);
          studentClue(state, item);
        }
      } else {
        state.screen = 'entry';
        // Autosave the current starting point; entry/select records its submitted snapshot.
        state.revision += 1;
        return state;
      }
      break;
    }
    case 'draft/set': {
      if (!['answer', 'choice', 'thought'].includes(payload.field)) fail('Unknown draft field.');
      needString(payload.value, 'Draft value', true);
      if (state.draft[payload.field] === payload.value) return state;
      if (payload.field === 'thought') delete state.draft.thoughtDraftId;
      const previousDraftId = state.draft.id;
      const submittedFields = state.inputs.filter((item) =>
        item.id.startsWith(previousDraftId + ':'),
      );
      if (submittedFields.length) {
        // Retain the original submission in history. The retry will use the current form values.
        state.draft.replacedAnswerIds = submittedFields
          .filter((item) => item.type === 'answer' || item.type === 'choice')
          .map((item) => item.id);
        if (
          payload.field !== 'thought' &&
          submittedFields.some((item) => item.type === 'thought')
        ) {
          state.draft.thoughtDraftId = previousDraftId;
        }
        state.draft.id = uid();
      }
      state.draft[payload.field] = payload.value;
      returnToExploration(state);
      // prepareTurn records the complete submitted input once, rather than each keystroke.
      state.revision += 1;
      return state;
    }
    case 'clue/focus':
      if (payload.id !== null && findClue(state, payload.id).status !== 'active')
        fail('Only an active clue can be focused.');
      state.focusId = payload.id;
      break;
    case 'clue/reuse-combination': {
      const previous =
        state.combinationHistory.find((h) => h.id === payload.id) || fail('Unknown combination.');
      if (state.links.length) fail('Reset the current combination first.');
      if (
        previous.clues.some(
          (c) => !state.clues.some((now) => now.id === c.id && now.status === 'active'),
        )
      )
        fail('Restore or revise the unavailable clues before reusing this combination.');
      state.links = previous.links.map((l) => ({ ...l, id: uid() }));
      returnToExploration(state);
      break;
    }
    case 'clue/reset-round':
      state.links = [];
      state.lastDisconnected = null;
      returnToExploration(state);
      break;
    case 'clue/connect': {
      const members = new Set(state.links.flatMap((l) => [l.a, l.b]));
      if (members.size && !members.has(payload.a) && !members.has(payload.b))
        fail('Join the current combination, or reset it before starting another.');
      if (payload.a === payload.b) fail('Choose two different clues to connect.');
      if (
        [findClue(state, payload.a), findClue(state, payload.b)].some(
          (clue) => clue.status !== 'active',
        )
      )
        fail('Only active clues can be connected.');
      const existingIndex = state.links.findIndex(
        (link) =>
          (link.a === payload.a && link.b === payload.b) ||
          (link.a === payload.b && link.b === payload.a),
      );
      if (existingIndex >= 0) state.links.push(state.links.splice(existingIndex, 1)[0]);
      else state.links.push({ id: uid(), a: payload.a, b: payload.b });
      returnToExploration(state);
      break;
    }
    case 'clue/leave-group':
    case 'clue/dissolve-group': {
      const group = connectionGroups(state.clues, state.links).find((g) =>
        g.clueIds.includes(payload.id),
      );
      if (!group) return state;
      const dissolve = type === 'clue/dissolve-group';
      const removed = state.links.filter(
        (l) =>
          group.connectionIds.includes(l.id) &&
          (dissolve || l.a === payload.id || l.b === payload.id),
      );
      state.links = state.links.filter((l) => !removed.includes(l));
      // Disconnecting changes relationships, never the cards themselves.
      state.lastDisconnected = null;
      returnToExploration(state);
      break;
    }
    case 'clue/disconnect': {
      const index = state.links.findIndex((link) =>
        payload.id
          ? link.id === payload.id
          : (link.a === payload.a && link.b === payload.b) ||
            (link.a === payload.b && link.b === payload.a),
      );
      if (index < 0) return state;
      const [removed] = state.links.splice(index, 1);
      const focusId = state.focusId;
      const affected = [];
      state.lastDisconnected = { link: removed, affected, focusId, revision: state.revision + 1 };
      returnToExploration(state);
      break;
    }
    case 'clue/undo-disconnect': {
      const previous = state.lastDisconnected;
      if (!previous || previous.link.id !== payload.id || previous.revision !== state.revision)
        fail(
          'This connection can no longer be restored with Undo because the project has changed.',
        );
      state.links.push(clone(previous.link));
      for (const saved of previous.affected) {
        const index = state.clues.findIndex((clue) => clue.id === saved.id);
        if (index >= 0) state.clues[index] = clone(saved);
      }
      state.focusId = previous.focusId;
      state.lastDisconnected = null;
      returnToExploration(state);
      break;
    }
    case 'clue/aside': {
      const clue = findClue(state, payload.id);
      if (clue.status === 'invalid')
        fail('An invalid interpretation cannot be set aside or restored.');
      if (clue.status === 'aside') return state;
      clue.status = 'aside';
      if (state.focusId === clue.id) state.focusId = null;
      returnToExploration(state);
      break;
    }
    case 'clue/restore': {
      const clue = findClue(state, payload.id);
      if (clue.status === 'invalid')
        fail('An invalid interpretation cannot be restored. Add a new thought instead.');
      if (clue.status === 'active') return state;
      clue.status = 'active';
      returnToExploration(state);
      break;
    }
    case 'clue/correct': {
      const clue = findClue(state, payload.id);
      const text = needString(payload.text, 'Correction');
      const item = input(state, 'correction', text);
      state.corrections.push({
        id: uid(),
        clueId: clue.id,
        inputId: item.id,
        text,
        previous: clone(clue),
        createdAt: now(),
      });
      withdrawInterpretations(state, [clue.id], 'student-correction');
      studentClue(state, item);
      resetReview(state);
      break;
    }
    case 'thought/add': {
      const text = needString(payload.text, 'Thought');
      const thoughtDraftId = state.draft.thoughtDraftId || state.draft.id;
      const pendingId = `${thoughtDraftId}:thought`;
      const pending = state.inputs.find(
        (item) => item.id === pendingId && clean(item.text) === clean(text),
      );
      const item = pending || input(state, 'thought', text);
      studentClue(state, item, pending ? `${thoughtDraftId}:thought-clue` : uid());
      returnToExploration(state);
      break;
    }
    case 'question/different': {
      const requestId = 'different:' + state.round + ':' + (state.question?.id || 'initial');
      if (state.inputs.some((item) => item.id === requestId)) return state;
      input(
        state,
        'question-request',
        'Ask a different question.',
        state.question?.text || '',
        requestId,
      );
      returnToExploration(state);
      break;
    }
    case 'directions/reject': {
      const reason = needString(
        payload.reason ?? '',
        'Reason for rejecting these directions',
        true,
      );
      const item = input(state, 'direction-rejection', reason);
      state.rejections.push({
        id: uid(),
        reason,
        inputId: item?.id ?? null,
        directionIds: state.directions.map((direction) => direction.id),
        directions: clone(state.directions),
        createdAt: now(),
      });
      resetReview(state, 'directions-rejected');
      state.screen = 'explore';
      break;
    }
    case 'direction/qa': {
      const directionSetId = payload.directionSetId ?? state.directionSetId;
      const candidates =
        directionSetId === state.directionSetId
          ? state.directions
          : state.directionHistory.find((item) => item.id === directionSetId)?.directions || [];
      const direction = candidates.find((item) => item.id === payload.directionId);
      if (!direction) fail(`Unknown direction: ${payload.directionId}.`);
      const id = payload.id || uid();
      if (state.directionQuestions.some((item) => item.id === id)) return state;
      state.directionQuestions.push({
        id,
        directionSetId,
        directionId: direction.id,
        directionTitle: direction.title,
        question: needString(payload.question, 'Direction question'),
        answer: needString(payload.answer, 'Direction answer'),
        createdAt: now(),
        appliedInputId: null,
      });
      // A question may be hypothetical. Saving it alone does not change reviewed facts.
      return state;
    }
    case 'direction/qa-apply': {
      const item =
        state.directionQuestions.find((entry) => entry.id === payload.id) ||
        fail('Unknown direction question.');
      if (item.appliedInputId) return state;
      const text = needString(payload.text ?? item.question, 'Information to use in exploration');
      const record = input(state, 'direction-followup', text, item.directionTitle);
      item.appliedInputId = record.id;
      item.appliedAt = now();
      resetReview(state, 'direction-followup');
      state.screen = 'explore';
      break;
    }
    case 'direction/revisit': {
      const previous =
        state.directionHistory.find((item) => item.id === payload.historyId) ||
        fail('Unknown direction history.');
      const direction =
        previous.directions.find((item) => item.id === payload.directionId) ||
        fail('Unknown archived direction.');
      input(
        state,
        'direction-revisit',
        `Revisit this previous direction: ${direction.title}\n${direction.summary}`,
        'Review this previous suggestion against the current confirmed requirements and information.',
      );
      resetReview(state, 'direction-revisit');
      state.screen = 'explore';
      break;
    }
    case 'direction/finish':
    case 'direction/reopen':
      if (
        !state.selectedDirectionId ||
        (type === 'direction/finish' ? state.screen !== 'chosen' : !state.explorationFinished)
      )
        fail('Choose a direction first.');
      state.explorationFinished = type === 'direction/finish';
      state.screen = state.explorationFinished ? 'brief' : 'chosen';
      break;
    case 'direction/select':
      if (
        !state.review.ready ||
        state.review.revision !== state.revision ||
        state.review.issues.length ||
        state.directions.length < 2 ||
        decisiveUncertainties(state).length
      )
        fail('Review the latest information before choosing a direction.');
      if (!state.directions.some((direction) => direction.id === payload.id))
        fail(`Unknown direction: ${payload.id}.`);
      state.explorationFinished = false;
      state.selectedDirectionId = payload.id;
      state.screen = 'chosen';
      break;
    case 'exploration/return':
      state.screen = 'explore';
      state.selectedDirectionId = null;
      break;
    case 'tutorial/seen':
      state.tutorialSeen = true;
      break;
    case 'preferences/set': {
      const values = list(payload.values, 'Preferences');
      if (
        values.some((value) => typeof value !== 'string' || !clean(value)) ||
        new Set(values.map((value) => value.trim())).size !== values.length
      )
        fail('Preferences must contain unique non-empty priorities.');
      state.preferences = [...values];
      returnToExploration(state);
      break;
    }
    default:
      fail(`Unknown state action: ${type}.`);
  }
  if (state.links.length && (type === 'clue/aside' || type === 'clue/correct')) {
    const activeClueIds = new Set();
    for (const clue of state.clues) {
      if (clue.status === 'active') activeClueIds.add(clue.id);
    }
    state.links = state.links.filter(
      (link) => activeClueIds.has(link.a) && activeClueIds.has(link.b),
    );
  }
  const reviewWasCurrent = state.review.revision === state.revision;
  const canUndo = state.lastDisconnected?.revision === state.revision;
  const eventPayload =
    type === 'brief/review' ? { ...payload, sourceText: state.brief.text } : payload;
  const previousEvent = state.events.at(-1);
  if (
    type === 'brief/review' &&
    previousEvent?.type === type &&
    previousEvent.payload.sourceText === state.brief.text
  ) {
    state.revision += 1;
    state.events[state.events.length - 1] = {
      ...previousEvent,
      payload: clone(eventPayload),
      revision: state.revision,
      updatedAt: now(),
    };
  } else event(state, type, eventPayload);
  // Navigation and display-only choices do not change the reviewed material.
  if (
    reviewWasCurrent &&
    [
      'direction/select',
      'direction/finish',
      'direction/reopen',
      'exploration/return',
      'tutorial/seen',
    ].includes(type)
  )
    state.review.revision = state.revision;
  if (
    canUndo &&
    [
      'direction/select',
      'direction/finish',
      'direction/reopen',
      'exploration/return',
      'tutorial/seen',
    ].includes(type)
  )
    state.lastDisconnected.revision = state.revision;
  return state;
}

/** Commit the exact draft used for a request. Retrying this result is idempotent. */
export function prepareTurn(original, action = 'explore') {
  if (!['explore', 'directions'].includes(action)) fail(`Unknown AI action: ${action}.`);
  if (!original.brief.confirmed) fail('Confirm the brief before asking the AI.');
  const state = migrateProject(original);
  if (state.draft.replacedAnswerIds?.length) {
    const replaced = new Set(state.draft.replacedAnswerIds);
    for (const item of state.inputs) {
      if (replaced.has(item.id)) item.superseded = true;
    }
    delete state.draft.replacedAnswerIds;
  }
  const committedIds = [];
  for (const field of ['answer', 'choice', 'thought']) {
    const text = state.draft[field];
    const draftId =
      field === 'thought' ? state.draft.thoughtDraftId || state.draft.id : state.draft.id;
    const id = `${draftId}:${field}`;
    if (!clean(text) || state.inputs.some((item) => item.id === id)) continue;
    const item = input(
      state,
      field,
      text,
      field === 'thought' ? '' : state.question?.text || '',
      id,
    );
    committedIds.push(id);
    if (field === 'thought') studentClue(state, item, `${draftId}:thought-clue`);
  }
  if (committedIds.length) event(state, 'turn/prepare', { action, inputIds: committedIds });
  return { state, request: { action, state: clone(state), revision: state.revision } };
}

export function buildContext(original) {
  const state = migrateProject(original);
  const currentStartingIdea =
    state.start.kind === 'rough'
      ? state.inputs.findLast(
          (item) => item.type === 'starting-idea' && item.text === state.start.idea,
        )?.id
      : null;
  const activeClues = state.clues.filter((clue) => clue.status === 'active');
  const activeIds = new Set(activeClues.map((clue) => clue.id));
  const links = state.links.filter((l) => activeIds.has(l.a) && activeIds.has(l.b));
  const group = links.length
    ? {
        clueIds: [...new Set(links.flatMap((l) => [l.a, l.b]))],
        connectionIds: links.map((l) => l.id),
      }
    : null;
  const intent = [...state.events]
    .reverse()
    .find(
      (item) =>
        [
          'clue/aside',
          'clue/restore',
          'clue/correct',
          'clue/reset-round',
          'clue/disconnect',
          'clue/leave-group',
          'clue/dissolve-group',
          'clue/reuse-combination',
        ].includes(item.type) ||
        (item.type === 'clue/focus' &&
          (item.payload.id === null || activeIds.has(item.payload.id))) ||
        (item.type === 'clue/connect' &&
          links.some(
            (l) =>
              (l.a === item.payload.a && l.b === item.payload.b) ||
              (l.a === item.payload.b && l.b === item.payload.a),
          )),
    );
  const resolved = (state.brief.uncertainties || []).filter((item) => item.status === 'resolved');
  const resolutionById = new Map(resolved.map((item) => [item.id, item.resolution]));
  // Older projects recorded the question and answer without an uncertainty ID.
  const legacyResolutions = new Set(
    resolved.map((item) => JSON.stringify([item.text, item.resolution])),
  );
  const currentInputs = state.inputs.filter((item) => {
    if (item.superseded) return false;
    if (item.type === 'brief') return item.text === state.brief.text;
    if (item.type === 'brief-clarification') {
      return item.uncertaintyId
        ? resolutionById.get(item.uncertaintyId) === item.text
        : legacyResolutions.has(JSON.stringify([item.questionText, item.text]));
    }
    if (item.type === 'starting-idea') return item.id === currentStartingIdea;
    return true;
  });
  return {
    projectId: state.id,
    revision: state.revision,
    brief: {
      ...state.brief,
      uncertainties: (state.brief.uncertainties || []).map((item) =>
        item.status === 'resolved' ? item : { ...item, resolution: '' },
      ),
    },
    start: state.start,
    inputs: currentInputs,
    corrections: state.corrections,
    rejections: state.rejections,
    activeClues,
    setAsideClues: state.clues.filter((clue) => clue.status === 'aside'),
    invalidClues: state.clues.filter((clue) => clue.status === 'invalid'),
    links,
    focusId: activeIds.has(state.focusId) ? state.focusId : null,
    question: state.question,
    round: state.round,
    preferences: state.preferences,
    connectionGroups: group ? [group] : [],
    latestConnectionGroup: group,
    exploredCombinations: state.combinationHistory,
    excludedSourceContext: state.clues
      .filter((c) => c.status !== 'active')
      .map((c) => ({ id: c.id, status: c.status, title: c.title, sourceIds: c.sourceIds })),
    latestExplorationIntent: intent
      ? { type: intent.type, payload: clone(intent.payload), revision: intent.revision }
      : null,
    review: state.review,
    provenance:
      'Student inputs are raw records. Clues with origin ai are interpretations, not established student facts. Set-aside clues remain available but are not active. Invalid clues must not be reused as facts. Requirements preserve a sourceType of document or student; student sources are student-reported clarifications. Resolved brief uncertainties include the student clarification. Direction-revisit inputs request reconsideration of a previous AI suggestion, not an established fact about the student. Only explicitly applied direction follow-ups enter inputs; saved hypothetical Q&A does not.',
  };
}

/** Structural and reference checks only; this does not verify semantic truth. */
export function validateResponse(state, original, action = 'explore') {
  state = migrateProject(state);
  if (!['explore', 'directions'].includes(action)) fail(`Unknown AI action: ${action}.`);
  if (!original || typeof original !== 'object' || Array.isArray(original))
    fail('AI response must be an object.');
  const response = clone(original);
  const clues = list(response.clues, 'Response clues');
  const issues = list(response.issues, 'Response issues');
  const directions = list(response.directions, 'Response directions');
  const newClueIds = uniqueIds(clues, 'Response clues');
  uniqueIds(issues, 'Response issues');
  uniqueIds(directions, 'Response directions');
  if (typeof response.ready !== 'boolean') fail('Response ready must be a boolean.');
  needString(response.readinessReason, 'Readiness reason', true);
  response.memoryNote = needString(response.memoryNote ?? '', 'Memory note', true);
  if (has(response, 'answer')) needString(response.answer, 'Response answer', true);
  const requirementIds = new Set(state.brief.requirements.map((requirement) => requirement.id));
  const inputIds = new Set(buildContext(state).inputs.map((item) => item.id));
  const excludedClueIds = new Set(
    state.clues.filter((clue) => clue.status !== 'active').map((clue) => clue.id),
  );
  const sourceIds = new Set([...inputIds, ...state.clues.map((clue) => clue.id), ...newClueIds]);
  const checkRefs = (ids, valid, label) => {
    list(ids, label);
    if (new Set(ids).size !== ids.length) fail(`${label} contains duplicate references.`);
    for (const id of ids) {
      needString(id, label);
      if (!valid.has(id)) fail(`${label} references unknown ID ${id}.`);
    }
  };
  for (const clue of clues) {
    if (inputIds.has(clue.id) || requirementIds.has(clue.id))
      fail(`Clue ID ${clue.id} conflicts with an input or requirement.`);
    needString(clue.title, 'Clue title');
    needString(clue.detail, 'Clue detail', true);
    checkRefs(clue.sourceIds, sourceIds, 'Clue sourceIds');
    for (const id of clue.sourceIds)
      if (excludedClueIds.has(id))
        fail(
          `Clue sourceIds references excluded clue ${id}. Use active clues or original student inputs.`,
        );
    if (clue.sourceIds.includes(clue.id)) fail('A clue cannot cite itself.');
    if (has(clue, 'origin') && !['student', 'ai'].includes(clue.origin))
      fail('Unknown clue origin.');
    if (has(clue, 'status') && !['active', 'aside', 'invalid'].includes(clue.status))
      fail('Unknown clue status.');
  }
  for (const issue of issues) {
    needString(issue.message, 'Issue message');
    needString(issue.quote, 'Issue quote', true);
    if (issue.requirementId != null && !requirementIds.has(issue.requirementId))
      fail(`Issue references unknown requirement ${issue.requirementId}.`);
    const normalizedQuote = (value) => value.normalize('NFKC').replace(/\s+/gu, ' ').trim();
    if (issue.requirementId != null) {
      const requirement = state.brief.requirements.find((item) => item.id === issue.requirementId);
      if (
        !normalizedQuote(issue.quote) ||
        normalizedQuote(issue.quote) !== normalizedQuote(requirement.quote)
      )
        fail(
          `Issue quote does not match the confirmed source quote for requirement ${issue.requirementId}.`,
        );
    } else if (normalizedQuote(issue.quote))
      fail('An issue without a requirement reference must have an empty quote.');
  }
  for (const direction of directions) {
    for (const field of ['title', 'summary', 'fit', 'tradeoff'])
      needString(direction[field], `Direction ${field}`);
    if (typeof direction.priority !== 'string' && typeof direction.priority !== 'number')
      fail('Direction priority must be a string or number.');
    checkRefs(direction.sourceIds, sourceIds, 'Direction sourceIds');
    for (const id of direction.sourceIds) {
      if (excludedClueIds.has(id))
        fail(
          `Direction sourceIds references excluded clue ${id}. Use active clues as justification.`,
        );
    }
    checkRefs(direction.requirementIds, requirementIds, 'Direction requirementIds');
  }
  if (response.question != null) {
    const question = response.question;
    if (typeof question !== 'object' || Array.isArray(question))
      fail('Question must be an object or null.');
    needString(question.id, 'Question ID');
    needString(question.text, 'Question text');
    list(question.options, 'Question options');
    for (const option of question.options) {
      if (typeof option === 'string') needString(option, 'Question option');
      else if (option && typeof option === 'object') {
        needString(option.id, 'Question option ID');
        needString(option.text, 'Question option text');
      } else fail('Question options must be strings or objects with id and text.');
    }
  } else response.question = null;
  return response;
}

export function applyTurn(original, rawResponse, requestRevision, action = 'explore') {
  if (requestRevision !== original.revision)
    fail('This response is out of date. Your latest edits are safe; request a new response.');
  const response = validateResponse(original, rawResponse, action);
  const state = migrateProject(original);
  for (const proposed of response.clues) {
    const connectionIds = state.links
      .filter((link) => proposed.sourceIds.includes(link.a) && proposed.sourceIds.includes(link.b))
      .map((link) => link.id);
    const index = state.clues.findIndex((clue) => clue.id === proposed.id);
    if (index >= 0) {
      const previous = state.clues[index];
      // The model may revise its active interpretation, never the student's words or exclusions.
      if (previous.origin === 'student' || previous.status !== 'active') continue;
      state.clues[index] = {
        ...previous,
        title: proposed.title,
        detail: proposed.detail,
        sourceIds: clone(proposed.sourceIds),
        connectionIds,
      };
    } else
      state.clues.push({
        id: proposed.id,
        title: proposed.title,
        detail: proposed.detail,
        sourceIds: clone(proposed.sourceIds),
        origin: 'ai',
        status: 'active',
        connectionIds,
      });
  }
  state.round += 1;
  state.draft = emptyDraft();
  state.selectedDirectionId = null;
  const unresolved = decisiveUncertainties(state);
  const canShowDirections =
    action === 'directions' &&
    response.ready &&
    !response.issues.length &&
    !unresolved.length &&
    response.directions.length >= 2;
  archiveDirections(state, action === 'explore' ? 'continued-exploring' : 'directions-updated');
  state.directions = canShowDirections ? clone(response.directions) : [];
  state.directionSetId = canShowDirections ? uid() : null;
  state.screen = canShowDirections ? 'directions' : 'explore';
  state.question = response.question;
  if (!canShowDirections && !state.question) {
    state.question = {
      id: uid(),
      text:
        unresolved[0]?.text ||
        response.issues[0]?.message ||
        (action === 'directions'
          ? 'What should we clarify before comparing at least two possible directions?'
          : 'What would you like to add or explore next?'),
      options: [],
    };
  }
  state.review = {
    ready: response.ready && response.issues.length === 0 && !unresolved.length,
    reason: unresolved.length ? unresolved[0].text : response.readinessReason,
    revision: null,
    issues: clone(response.issues),
  };
  if (!response.issues.length) archiveCombination(state, response);
  event(state, 'turn/applied', {
    action,
    requestRevision,
    memoryNote: response.memoryNote,
    ...(has(response, 'answer') ? { answer: response.answer } : {}),
  });
  state.review.revision = state.revision;
  return state;
}
