import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createProject,
  update,
  prepareTurn,
  applyTurn,
  buildContext,
  validateResponse,
  DEMO_BRIEF,
} from '../public/state.mjs';

function project(kind = 'rough') {
  let state = createProject();
  state = update(state, 'brief/text', { text: DEMO_BRIEF });
  state = update(state, 'brief/review', {
    summary: 'A one-week still-image narrative.',
    requirements: [
      { id: 'r-images', text: 'Use 6–8 still images.', quote: '6–8 still images' },
      {
        id: 'r-own',
        text: 'Use your own photographs or illustrations.',
        quote: 'your own photographs or illustrations',
      },
    ],
  });
  state = update(state, 'brief/confirm');
  return update(state, 'entry/select', {
    kind,
    idea: kind === 'rough' ? 'Photograph my daily walk.' : '',
  });
}
function response(state, overrides = {}) {
  return {
    question: {
      id: 'q-next',
      text: 'Which part of the walk matters to you?',
      options: ['Waiting', 'Movement'],
    },
    clues: [],
    ready: false,
    readinessReason: 'One more concrete detail would help.',
    issues: [],
    directions: [],
    memoryNote: '',
    ...overrides,
  };
}
function directions(state) {
  return ['grades', 'interest'].map((priority, index) => ({
    id: `d-${index}`,
    title: `Direction ${index + 1}`,
    priority,
    summary: 'A sequence about an everyday walk.',
    fit: 'Uses the available phone.',
    tradeoff: 'Requires revisiting the same place.',
    sourceIds: state.inputs.filter((item) => item.type === 'starting-idea').map((item) => item.id),
    requirementIds: ['r-images', 'r-own'],
  }));
}
function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const item of Object.values(value)) deepFreeze(item);
  }
  return value;
}

test('latest draft is committed for View directions while prior readiness remains visibly stale', () => {
  let state = project();
  state = applyTurn(
    state,
    response(state, { ready: true, readinessReason: 'Ready to compare.' }),
    state.revision,
    'explore',
  );
  const previouslyReviewed = state.review.revision;
  state = update(state, 'draft/set', {
    field: 'answer',
    value: 'I can revisit the bus stop each morning.',
  });
  state = update(state, 'draft/set', { field: 'choice', value: 'Waiting' });
  state = update(state, 'draft/set', {
    field: 'thought',
    value: 'I only have my phone, and no tripod.',
  });
  assert.equal(state.review.ready, true);
  assert.equal(state.review.revision, previouslyReviewed);
  assert.notEqual(state.review.revision, state.revision);
  const before = JSON.stringify(state);
  deepFreeze(state);
  const turn = prepareTurn(state, 'directions');
  assert.equal(JSON.stringify(state), before);
  assert.equal(turn.request.state.draft.thought, 'I only have my phone, and no tripod.');
  assert.equal(turn.request.revision, turn.state.revision);
  assert.deepEqual(
    turn.state.inputs.slice(-3).map((item) => item.type),
    ['answer', 'choice', 'thought'],
  );
  assert.equal(turn.state.inputs.at(-1).text, state.draft.thought);
  assert.equal(buildContext(turn.state).brief.text, DEMO_BRIEF);
  const next = applyTurn(turn.state, response(turn.state), turn.request.revision, 'directions');
  assert.equal(next.draft.thought, '');
  assert.equal(next.screen, 'explore');
  assert.equal(turn.state.draft.thought, state.draft.thought);
});

test('retry reuses stable input IDs and preserves draft until a successful response', () => {
  let state = project('none');
  state = update(state, 'draft/set', {
    field: 'thought',
    value: 'The light in my kitchen changes all day.',
  });
  const first = prepareTurn(state, 'explore');
  const retry = prepareTurn(first.state, 'explore');
  assert.deepEqual(retry.state, first.state);
  assert.equal(retry.state.inputs.filter((item) => item.type === 'thought').length, 1);
  assert.equal(retry.state.clues.filter((clue) => clue.origin === 'student').length, 1);
  assert.throws(
    () =>
      applyTurn(
        first.state,
        response(first.state, {
          clues: [{ id: 'bad', title: 'Bad', detail: '', sourceIds: ['absent'] }],
        }),
        first.request.revision,
      ),
    /unknown ID/,
  );
  assert.equal(first.state.draft.thought, state.draft.thought);
  const edited = update(first.state, 'draft/set', {
    field: 'thought',
    value: 'Only the morning light is available.',
  });
  assert.notEqual(edited.draft.id, first.state.draft.id);
  assert.equal(edited.inputs.at(-1).text, 'The light in my kitchen changes all day.');
  const latest = prepareTurn(edited, 'explore');
  assert.equal(latest.state.inputs.at(-1).text, 'Only the morning light is available.');
});

test('correction invalidates the AI interpretation and preserves original facts and explicit correction', () => {
  let state = project();
  const sourceId = state.inputs.find((item) => item.type === 'starting-idea').id;
  state = applyTurn(
    state,
    response(state, {
      ready: true,
      clues: [
        {
          id: 'ai-1',
          title: 'Travel documentary',
          detail: 'Travel to new locations.',
          sourceIds: [sourceId],
        },
      ],
    }),
    state.revision,
  );
  const originalInput = structuredClone(state.inputs.find((item) => item.id === sourceId));
  const corrected = update(state, 'clue/correct', {
    id: 'ai-1',
    text: 'I mean my ordinary route, not travel.',
  });
  assert.equal(corrected.clues.find((clue) => clue.id === 'ai-1').status, 'invalid');
  assert.deepEqual(
    corrected.inputs.find((item) => item.id === sourceId),
    originalInput,
  );
  assert.equal(corrected.review.ready, false);
  assert.equal(corrected.corrections[0].text, 'I mean my ordinary route, not travel.');
  const context = buildContext(corrected);
  assert.equal(context.invalidClues[0].id, 'ai-1');
  assert.ok(
    context.activeClues.some(
      (clue) => clue.origin === 'student' && clue.detail === corrected.corrections[0].text,
    ),
  );
  const repeated = applyTurn(
    corrected,
    response(corrected, {
      clues: [
        {
          id: 'ai-1',
          title: 'Revived',
          detail: 'Overwritten',
          sourceIds: [sourceId],
          status: 'active',
        },
      ],
    }),
    corrected.revision,
  );
  assert.equal(repeated.clues.find((clue) => clue.id === 'ai-1').status, 'invalid');
  assert.equal(repeated.clues.find((clue) => clue.id === 'ai-1').title, 'Travel documentary');
});

test('set-aside is reversible, keeps facts, and cannot be undone by a model update', () => {
  let state = project();
  const sourceId = state.inputs.find((item) => item.type === 'starting-idea').id;
  state = applyTurn(
    state,
    response(state, {
      clues: [{ id: 'ai-a', title: 'Waiting', detail: 'Observe waiting.', sourceIds: [sourceId] }],
    }),
    state.revision,
  );
  state = update(state, 'clue/focus', { id: 'ai-a' });
  const savedInputs = structuredClone(state.inputs);
  const aside = update(state, 'clue/aside', { id: 'ai-a' });
  assert.equal(aside.focusId, null);
  assert.equal(buildContext(aside).setAsideClues[0].id, 'ai-a');
  assert.ok(!buildContext(aside).activeClues.some((clue) => clue.id === 'ai-a'));
  const reply = applyTurn(
    aside,
    response(aside, {
      clues: [
        { id: 'ai-a', title: 'AI changed it', detail: 'Still waiting.', sourceIds: [sourceId] },
      ],
    }),
    aside.revision,
  );
  assert.equal(reply.clues.find((clue) => clue.id === 'ai-a').status, 'aside');
  const restored = update(reply, 'clue/restore', { id: 'ai-a' });
  assert.equal(restored.clues.find((clue) => clue.id === 'ai-a').status, 'active');
  assert.deepEqual(restored.inputs, savedInputs);
});

test('stale responses cannot erase edits or apply previously prepared directions', () => {
  const state = update(project(), 'draft/set', { field: 'answer', value: 'Morning.' });
  const pending = prepareTurn(state, 'directions');
  const edited = update(pending.state, 'draft/set', {
    field: 'thought',
    value: 'Actually, I work every morning.',
  });
  const before = JSON.stringify(edited);
  assert.throws(
    () =>
      applyTurn(
        edited,
        response(pending.state, { ready: true, directions: directions(pending.state) }),
        pending.request.revision,
        'directions',
      ),
    /out of date/,
  );
  assert.equal(JSON.stringify(edited), before);
  assert.equal(edited.draft.thought, 'Actually, I work every morning.');
});

test('references are checked and directions require explicit request, readiness, no issues, and two choices', () => {
  const state = project();
  assert.throws(
    () =>
      validateResponse(
        state,
        response(state, {
          clues: [{ id: 'x', title: 'Guess', detail: '', sourceIds: ['missing'] }],
        }),
      ),
    /unknown ID/,
  );
  const unknownRequirement = directions(state);
  unknownRequirement[0].requirementIds = ['not-in-brief'];
  assert.throws(
    () =>
      validateResponse(state, response(state, { directions: unknownRequirement }), 'directions'),
    /unknown ID/,
  );
  assert.throws(
    () =>
      validateResponse(
        state,
        response(state, {
          issues: [{ id: 'i', message: 'Check this.', requirementId: 'missing', quote: '' }],
        }),
      ),
    /unknown requirement/,
  );
  for (const [action, ready, issues, options] of [
    ['explore', true, [], directions(state)],
    ['directions', false, [], directions(state)],
    [
      'directions',
      true,
      [
        {
          id: 'i',
          message: 'Confirm your own images.',
          requirementId: 'r-own',
          quote: 'your own photographs or illustrations',
        },
      ],
      directions(state),
    ],
    ['directions', true, [], directions(state).slice(0, 1)],
  ]) {
    const next = applyTurn(
      state,
      response(state, { question: null, ready, issues, directions: options }),
      state.revision,
      action,
    );
    assert.equal(next.screen, 'explore');
    assert.equal(next.directions.length, 0);
    assert.ok(next.question?.text);
  }
  const shown = applyTurn(
    state,
    response(state, { question: null, ready: true, directions: directions(state) }),
    state.revision,
    'directions',
  );
  assert.equal(shown.screen, 'directions');
  assert.equal(shown.directions.length, 2);
  const chosen = update(shown, 'direction/select', { id: shown.directions[0].id });
  assert.equal(chosen.screen, 'chosen');
  assert.equal(chosen.review.revision, chosen.revision);
  const rejected = update(shown, 'directions/reject', {
    reason: 'Both need more time than I have.',
  });
  assert.equal(buildContext(rejected).rejections[0].reason, 'Both need more time than I have.');
  assert.equal(rejected.review.ready, false);
});

test('direction rejection accepts an omitted or empty reason without inventing raw input', () => {
  const base = project();
  const shown = applyTurn(
    base,
    response(base, { question: null, ready: true, directions: directions(base) }),
    base.revision,
    'directions',
  );
  for (const payload of [{}, { reason: '' }]) {
    const next = update(shown, 'directions/reject', payload);
    assert.equal(next.screen, 'explore');
    assert.equal(next.review.ready, false);
    assert.equal(next.rejections.at(-1).reason, '');
    assert.equal(next.rejections.at(-1).inputId, null);
    assert.equal(next.rejections.at(-1).directions.length, 2);
    assert.deepEqual(next.inputs, shown.inputs);
    assert.equal(shown.screen, 'directions');
  }
});

test('brief typing is draft-only, reviewed snapshots deduplicate, and fresh edits require another review', () => {
  let state = createProject();
  for (const text of ['C', 'Cr', 'Create', DEMO_BRIEF])
    state = update(state, 'brief/text', { text });
  assert.equal(state.brief.text, DEMO_BRIEF);
  assert.equal(state.inputs.length, 0);
  assert.equal(state.events.length, 0);
  assert.equal(state.revision, 4);
  assert.throws(() => update(state, 'brief/confirm'), /Review the brief/);
  const review = {
    summary: 'Still-image narrative.',
    requirements: [
      { id: 'r-own', text: 'Own images.', quote: 'your own photographs or illustrations' },
    ],
  };
  state = update(state, 'brief/review', review);
  assert.equal(state.inputs.filter((item) => item.type === 'brief').length, 1);
  assert.equal(state.inputs[0].text, DEMO_BRIEF);
  state = update(state, 'brief/confirm');
  state = update(state, 'brief/review', review);
  state = update(state, 'brief/confirm');
  assert.equal(state.inputs.filter((item) => item.type === 'brief').length, 1);
  assert.ok(state.events.some((item) => item.type === 'brief/review'));
  const eventCount = state.events.length;
  state = update(state, 'brief/text', { text: `${DEMO_BRIEF} Present next Friday.` });
  assert.equal(state.brief.confirmed, false);
  assert.equal(state.brief.summary, '');
  assert.deepEqual(state.brief.requirements, []);
  assert.equal(state.events.length, eventCount);
  assert.equal(state.inputs.filter((item) => item.type === 'brief').length, 1);
  assert.throws(() => update(state, 'brief/confirm'), /Review the brief/);
  state = update(state, 'brief/review', review);
  assert.equal(state.inputs.filter((item) => item.type === 'brief').length, 2);
  assert.equal(state.inputs.at(-1).text, state.brief.text);
  assert.throws(
    () => update(update(state, 'brief/review', { summary: '', requirements: [] }), 'brief/confirm'),
    /Review the brief/,
  );
});

test('directions cannot justify themselves with excluded clues, while historical raw facts remain accessible', () => {
  let state = project();
  const rawId = state.inputs.find((item) => item.type === 'starting-idea').id;
  state = applyTurn(
    state,
    response(state, {
      clues: [
        { id: 'aside-clue', title: 'Waiting', detail: 'Observe waiting.', sourceIds: [rawId] },
        { id: 'wrong-clue', title: 'Travel', detail: 'Visit a distant place.', sourceIds: [rawId] },
      ],
    }),
    state.revision,
  );
  state = update(state, 'clue/aside', { id: 'aside-clue' });
  state = update(state, 'clue/correct', { id: 'wrong-clue', text: 'I cannot travel.' });
  for (const excluded of ['aside-clue', 'wrong-clue']) {
    const options = directions(state);
    options[0].sourceIds = [excluded];
    assert.throws(
      () =>
        validateResponse(
          state,
          response(state, { ready: true, directions: options }),
          'directions',
        ),
      /excluded clue/,
    );
    // A repeated model clue cannot silently reactivate an excluded identifier.
    assert.throws(
      () =>
        validateResponse(
          state,
          response(state, {
            ready: true,
            clues: [{ id: excluded, title: 'Again', detail: 'Again', sourceIds: [rawId] }],
            directions: options,
          }),
          'directions',
        ),
      /excluded clue/,
    );
  }
  const withRaw = directions(state);
  withRaw[0].sourceIds = [rawId];
  assert.doesNotThrow(() =>
    validateResponse(state, response(state, { ready: true, directions: withRaw }), 'directions'),
  );
  assert.equal(buildContext(state).corrections[0].text, 'I cannot travel.');
  assert.ok(buildContext(state).inputs.some((item) => item.id === rawId));
});

test('typing long entry and exploration drafts stays compact and commits complete raw snapshots', () => {
  let state = createProject();
  state = update(state, 'brief/text', { text: DEMO_BRIEF });
  state = update(state, 'brief/review', {
    summary: 'Still-image narrative.',
    requirements: [
      { id: 'r-own', text: 'Own images.', quote: 'your own photographs or illustrations' },
    ],
  });
  state = update(state, 'brief/confirm');
  const initialEventCount = state.events.length;
  const entryText = 'Every morning I notice a familiar object changing. '.repeat(15).slice(0, 600);
  const initialRevision = state.revision;
  for (let length = 1; length <= entryText.length; length += 1)
    state = update(state, 'entry/draft', { kind: 'rough', idea: entryText.slice(0, length) });
  assert.equal(state.start.idea, entryText);
  assert.equal(state.revision, initialRevision + entryText.length);
  assert.equal(state.events.length, initialEventCount);
  assert.equal(state.inputs.filter((item) => item.type === 'starting-idea').length, 0);
  assert.ok(JSON.stringify(state).length < 25_000);
  state = update(state, 'entry/select', { kind: 'rough', idea: state.start.idea });
  const startingInput = state.inputs.find((item) => item.type === 'starting-idea');
  assert.equal(startingInput.text, entryText);
  const draftText = 'I only have one day and want to observe changing light in my kitchen. '
    .repeat(12)
    .slice(0, 600);
  const committedEventCount = state.events.length;
  const beforeTyping = state.revision;
  for (let length = 1; length <= draftText.length; length += 1)
    state = update(state, 'draft/set', { field: 'thought', value: draftText.slice(0, length) });
  assert.equal(state.draft.thought, draftText);
  assert.equal(state.revision, beforeTyping + draftText.length);
  assert.equal(state.events.length, committedEventCount);
  assert.ok(JSON.stringify(state).length < 25_000);
  const turn = prepareTurn(state, 'explore');
  assert.equal(turn.state.inputs.find((item) => item.type === 'thought').text, draftText);
  assert.equal(turn.state.inputs.find((item) => item.id === startingInput.id).text, entryText);
  assert.equal(turn.state.events.at(-1).type, 'turn/prepare');
  assert.equal(turn.state.events.length, committedEventCount + 1);
  assert.equal(turn.state.draft.thought, draftText);
  assert.ok(JSON.stringify(turn.state).length < 25_000);
  assert.deepEqual(prepareTurn(turn.state, 'explore').state, turn.state);
});

test('editing a reviewed summary coalesces draft events while retaining the reviewed source and requirements', () => {
  let state = project();
  state = update(state, 'brief/return');
  const text = 'A personal visual narrative about ordinary life. '.repeat(20).slice(0, 600);
  const requirements = structuredClone(state.brief.requirements);
  const initialRevision = state.revision;
  for (let i = 1; i <= text.length; i += 1)
    state = update(state, 'brief/review', { summary: text.slice(0, i), requirements });
  assert.equal(state.brief.summary, text);
  assert.deepEqual(state.brief.requirements, requirements);
  assert.equal(state.revision, initialRevision + text.length);
  assert.equal(state.inputs.filter((item) => item.type === 'brief').length, 1);
  assert.equal(state.events.filter((item) => item.type === 'brief/review').length, 2);
  assert.equal(state.events.at(-1).payload.summary, text);
  assert.ok(JSON.stringify(state).length < 25_000);
  const editedRequirements = requirements.map((item) => ({
    ...item,
    text: item.text + ' A clarified detail.',
  }));
  state = update(state, 'brief/review', { summary: text, requirements: editedRequirements });
  assert.equal(state.events.filter((item) => item.type === 'brief/review').length, 2);
  assert.deepEqual(state.events.at(-1).payload.requirements, editedRequirements);
  assert.equal(update(state, 'brief/confirm').brief.confirmed, true);
});

test('adding a thought after a failed prepared turn reuses its existing raw input and card', () => {
  let state = update(project('none'), 'draft/set', {
    field: 'thought',
    value: '  I notice the light in my kitchen.  ',
  });
  state = prepareTurn(state, 'explore').state;
  const inputId = state.inputs.find((item) => item.type === 'thought').id;
  const cardId = state.clues.find((clue) => clue.sourceIds.includes(inputId)).id;
  state = update(state, 'thought/add', { text: state.draft.thought.trim() });
  state = update(state, 'draft/set', { field: 'thought', value: '' });
  assert.equal(state.inputs.filter((item) => item.type === 'thought').length, 1);
  assert.equal(
    state.inputs.find((item) => item.id === inputId).text,
    '  I notice the light in my kitchen.  ',
  );
  assert.equal(state.clues.filter((clue) => clue.sourceIds.includes(inputId)).length, 1);
  assert.equal(state.clues.find((clue) => clue.sourceIds.includes(inputId)).id, cardId);
  assert.equal(state.draft.thought, '');
  assert.equal(prepareTurn(state).state.inputs.filter((item) => item.type === 'thought').length, 1);
});

test('reselecting an existing connection records the latest intention without duplicating links', () => {
  let state = project('none');
  for (const text of ['Morning light', 'Waiting for a bus', 'A familiar cup'])
    state = update(state, 'thought/add', { text });
  const [a, b, c] = state.clues;
  state = update(state, 'clue/connect', { a: a.id, b: b.id });
  const originalLinkId = state.links[0].id;
  state = update(state, 'clue/connect', { a: b.id, b: c.id });
  state = update(state, 'clue/focus', { id: c.id });
  assert.equal(buildContext(state).latestExplorationIntent.type, 'clue/focus');
  const previousRevision = state.revision;
  state = update(state, 'clue/connect', { a: b.id, b: a.id });
  assert.equal(state.revision, previousRevision + 1);
  assert.equal(state.links.length, 2);
  assert.equal(state.links.at(-1).id, originalLinkId);
  assert.deepEqual(buildContext(state).latestExplorationIntent.payload, { a: b.id, b: a.id });
  assert.equal(buildContext(state).latestExplorationIntent.type, 'clue/connect');
  state = update(state, 'clue/aside', { id: a.id });
  assert.equal(buildContext(state).latestExplorationIntent.type, 'clue/aside');
  assert.ok(buildContext(state).links.every((link) => link.a !== a.id && link.b !== a.id));
});

test('issues must quote the cited confirmed requirement and reference arrays cannot repeat IDs', () => {
  const state = project();
  const issue = {
    id: 'i-quote',
    message: 'Check the image ownership.',
    requirementId: 'r-own',
    quote: 'your own photographs or illustrations',
  };
  assert.doesNotThrow(() =>
    validateResponse(
      state,
      response(state, {
        issues: [{ ...issue, quote: '  your own\nphotographs or illustrations  ' }],
      }),
    ),
  );
  assert.throws(
    () =>
      validateResponse(
        state,
        response(state, { issues: [{ ...issue, quote: 'You must use stock photographs.' }] }),
      ),
    /quote does not match/,
  );
  assert.throws(
    () => validateResponse(state, response(state, { issues: [{ ...issue, quote: '' }] })),
    /quote does not match/,
  );
  assert.throws(
    () => validateResponse(state, response(state, { issues: [{ ...issue, requirementId: null }] })),
    /empty quote/,
  );
  assert.doesNotThrow(() =>
    validateResponse(
      state,
      response(state, { issues: [{ ...issue, requirementId: null, quote: '' }] }),
    ),
  );
  const options = directions(state);
  options[0].requirementIds = ['r-own', 'r-own'];
  assert.throws(
    () =>
      validateResponse(state, response(state, { ready: true, directions: options }), 'directions'),
    /duplicate references/,
  );
  const sourceId = state.inputs[0].id;
  assert.throws(
    () =>
      validateResponse(
        state,
        response(state, {
          clues: [
            {
              id: 'clue-dupe',
              title: 'Repeated references',
              detail: '',
              sourceIds: [sourceId, sourceId],
            },
          ],
        }),
      ),
    /duplicate references/,
  );
});

test('cleared requirement text persists as a draft through reload but blocks confirmation until fixed', () => {
  const original = project();
  const requirements = original.brief.requirements.map((requirement, index) =>
    index === 0 ? { ...requirement, text: '' } : requirement,
  );
  const cleared = update(original, 'brief/review', {
    summary: original.brief.summary,
    requirements,
  });
  assert.equal(cleared.brief.confirmed, false);
  assert.equal(cleared.brief.requirements[0].text, '');
  assert.notEqual(original.brief.requirements[0].text, '');
  assert.equal(cleared.brief.requirements[0].quote, original.brief.requirements[0].quote);
  const reloaded = JSON.parse(JSON.stringify(cleared));
  assert.equal(reloaded.brief.requirements[0].text, '');
  assert.throws(() => update(reloaded, 'brief/confirm'), /blank requirement/);
  assert.throws(() => prepareTurn(reloaded), /Confirm the brief/);
  const whitespace = update(reloaded, 'brief/review', {
    summary: reloaded.brief.summary,
    requirements: reloaded.brief.requirements.map((requirement, index) =>
      index === 0 ? { ...requirement, text: '   ' } : requirement,
    ),
  });
  assert.throws(() => update(whitespace, 'brief/confirm'), /blank requirement/);
  const repaired = update(reloaded, 'brief/review', {
    summary: reloaded.brief.summary,
    requirements: original.brief.requirements,
  });
  assert.equal(update(repaired, 'brief/confirm').brief.confirmed, true);
  const removed = update(reloaded, 'brief/review', {
    summary: reloaded.brief.summary,
    requirements: reloaded.brief.requirements.slice(1),
  });
  assert.equal(update(removed, 'brief/confirm').brief.confirmed, true);
});

test('editing an answer after an unsuccessful turn keeps history but sends only the revised answer', () => {
  let state = update(project('none'), 'draft/set', { field: 'answer', value: 'Photography only' });
  state = prepareTurn(state).state;
  state = update(state, 'draft/set', { field: 'answer', value: 'Drawing only' });
  state = prepareTurn(JSON.parse(JSON.stringify(state))).state;
  assert.deepEqual(
    state.inputs.filter((item) => item.type === 'answer').map((item) => item.text),
    ['Photography only', 'Drawing only'],
  );
  assert.deepEqual(
    buildContext(state)
      .inputs.filter((item) => item.type === 'answer')
      .map((item) => item.text),
    ['Drawing only'],
  );
});

test('retrying a revised answer preserves the existing card for an unchanged thought', () => {
  for (const thought of ['只有周六能拍摄', 'I can only shoot on Saturday']) {
    let state = update(project('none'), 'draft/set', { field: 'thought', value: thought });
    state = update(state, 'draft/set', { field: 'answer', value: 'Photography' });
    state = prepareTurn(state).state;
    const originalCard = state.clues.find((clue) => clue.detail === thought);
    state = update(state, 'draft/set', { field: 'answer', value: 'Drawing' });
    state = prepareTurn(JSON.parse(JSON.stringify(state))).state;
    assert.deepEqual(
      state.clues.filter((clue) => clue.detail === thought),
      [originalCard],
    );
    assert.equal(
      state.inputs.filter((item) => item.type === 'thought' && item.text === thought).length,
      1,
    );
  }
});
