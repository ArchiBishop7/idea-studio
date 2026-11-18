import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createProject,
  migrateProject,
  update,
  applyTurn,
  buildContext,
  validateResponse,
  prepareTurn,
} from '../public/state.mjs';

function project(uncertainties = []) {
  let state = update(createProject(), 'brief/text', {
    text: 'Make a poster. Use original images.',
  });
  state = update(state, 'brief/review', {
    summary: 'Make an original poster.',
    requirements: [
      { id: 'r-poster', text: 'Make a poster.', quote: 'Make a poster.' },
      { id: 'r-original', text: 'Use original images.', quote: 'Use original images.' },
    ],
    uncertainties,
  });
  state = update(state, 'brief/confirm');
  return update(state, 'entry/select', { kind: 'none', idea: '' });
}
function response(overrides = {}) {
  return {
    clues: [],
    issues: [],
    directions: [],
    ready: false,
    readinessReason: '',
    memoryNote: '',
    question: { id: 'next', text: 'What caught your attention?', options: [] },
    ...overrides,
  };
}
function showDirections(state, sequence = 0) {
  const directions = ['A photograph of a daily object', 'An illustrated scene'].map(
    (title, index) => ({
      id: `d-${sequence}-${index}`,
      title,
      priority: index ? 'Learning a new technique' : 'Portfolio development',
      summary: `${sequence}: ${title}`,
      fit: 'Uses original images in a poster.',
      tradeoff: 'Time to develop the composition.',
      sourceIds: [],
      requirementIds: ['r-poster', 'r-original'],
    }),
  );
  return applyTurn(state, response({ ready: true, directions }), state.revision, 'directions');
}

test('priorities start unconfirmed, accept custom goals, and migrate only explicit legacy choices', () => {
  assert.deepEqual(createProject().preferences, []);
  let state = update(project(), 'preferences/set', { values: ['作品集', 'Learning a new medium'] });
  assert.deepEqual(buildContext(state).preferences, ['作品集', 'Learning a new medium']);
  assert.throws(
    () => update(state, 'preferences/set', { values: ['Interest', ' Interest '] }),
    /unique non-empty/,
  );
  assert.throws(() => update(state, 'preferences/set', { values: [''] }), /unique non-empty/);
  const legacy = {
    ...showDirections(project()),
    schemaVersion: 1,
    preferences: ['grades', 'ease', 'interest'],
  };
  const migrated = migrateProject(legacy);
  assert.deepEqual(migrated.preferences, []);
  assert.equal(migrated.review.ready, false);
  assert.equal(migrated.directionHistory.length, 1);
  assert.equal(legacy.directions.length, 2);
  state.schemaVersion = 1;
  assert.deepEqual(migrateProject(state).preferences, state.preferences);
  assert.deepEqual(migrateProject(migrated), migrated);
});

test('brief uncertainties survive edits and reload, and decisive ones block premature output', () => {
  let state = project([{ id: 'u-media', text: 'Are illustrations allowed?', decisive: true }]);
  assert.equal(state.brief.confirmed, true);
  assert.equal(buildContext(state).brief.uncertainties[0].status, 'unresolved');
  state = update(state, 'brief/review', {
    summary: state.brief.summary,
    requirements: state.brief.requirements,
  });
  assert.equal(state.brief.uncertainties[0].id, 'u-media');
  state = update(state, 'brief/confirm');
  state = showDirections(JSON.parse(JSON.stringify(state)));
  assert.equal(state.review.ready, false);
  assert.equal(state.screen, 'explore');
  assert.equal(state.directions.length, 0);
  assert.throws(
    () => update(state, 'brief/uncertainty', { id: 'u-media', status: 'resolved' }),
    /clarification/,
  );
  state = update(state, 'brief/uncertainty', {
    id: 'u-media',
    status: 'resolved',
    resolution: 'The professor confirmed illustrations are allowed.',
  });
  assert.equal(state.brief.uncertainties[0].resolution, state.inputs.at(-1).text);
  state = showDirections(state);
  assert.equal(state.review.ready, true);
  assert.equal(state.directions.length, 2);
  state = update(state, 'brief/uncertainty', { id: 'u-media', status: 'unresolved' });
  assert.equal(state.review.ready, false);
  assert.equal(state.directionHistory.length, 1);
});

test('advisory uncertainty does not block useful directions and duplicate parsing retains identity', () => {
  let state = project(['Confirm the preferred submission label.']);
  const id = state.brief.uncertainties[0].id;
  state = update(state, 'brief/review', {
    summary: state.brief.summary,
    requirements: state.brief.requirements,
    uncertainties: ['Confirm the preferred submission label.'],
  });
  assert.equal(state.brief.uncertainties[0].id, id);
  state = update(state, 'brief/confirm');
  state = showDirections(state);
  assert.equal(state.review.ready, true);
});

test('teacher clarifications retain exact student source and support valid conflict citations', () => {
  let state = project();
  state = update(state, 'brief/review', {
    summary: state.brief.summary,
    requirements: [
      ...state.brief.requirements,
      {
        id: 'r-black',
        text: '  The professor said black and white only.  ',
        quote: '',
        sourceType: 'student',
      },
    ],
  });
  state = update(state, 'brief/confirm');
  const supplement = state.brief.requirements.find((item) => item.id === 'r-black');
  assert.equal(supplement.quote, '  The professor said black and white only.  ');
  assert.equal(supplement.sourceType, 'student');
  const issue = {
    id: 'conflict',
    requirementId: supplement.id,
    quote: supplement.quote,
    message: 'A full-color proposal conflicts with the black-and-white requirement.',
  };
  assert.doesNotThrow(() => validateResponse(state, response({ issues: [issue] })));
  assert.throws(
    () => validateResponse(state, response({ issues: [{ ...issue, quote: 'Color is allowed.' }] })),
    /quote does not match/,
  );
  state = update(state, 'brief/review', {
    summary: state.brief.summary,
    requirements: state.brief.requirements.map((item) =>
      item.id === supplement.id ? { ...item, text: 'Use only black and white.' } : item,
    ),
  });
  assert.equal(state.brief.requirements.at(-1).quote, supplement.quote);
  assert.equal(state.brief.requirements[0].sourceType, 'document');
  assert.equal(state.brief.requirements[0].quote, 'Make a poster.');
});

test('disconnect removes intent while retaining all generated and original clues', () => {
  let state = project();
  for (const text of ['Morning light', 'A familiar cup', 'Reflections'])
    state = update(state, 'thought/add', { text });
  const [a, b, c] = state.clues;
  state = update(state, 'clue/focus', { id: c.id });
  state = update(state, 'clue/connect', { a: a.id, b: b.id });
  const link = state.links[0];
  state = applyTurn(
    state,
    response({
      clues: [
        {
          id: 'combined',
          title: 'Light in the cup',
          detail: 'An association to explore.',
          sourceIds: [a.id, b.id],
        },
        {
          id: 'descendant',
          title: 'A longer sequence',
          detail: 'Develop the association.',
          sourceIds: ['combined'],
        },
        {
          id: 'other',
          title: 'Surface reflections',
          detail: 'Another possibility.',
          sourceIds: [c.id],
        },
      ],
    }),
    state.revision,
  );
  state = update(state, 'clue/disconnect', { id: link.id });
  const context = buildContext(JSON.parse(JSON.stringify(state)));
  assert.equal(context.links.length, 0);
  assert.equal(context.latestExplorationIntent.type, 'clue/focus');
  assert.ok(context.activeClues.some((item) => item.id === a.id));
  assert.ok(context.activeClues.some((item) => item.id === b.id));
  assert.ok(context.activeClues.some((item) => item.id === 'other'));
  assert.deepEqual(context.invalidClues, []);
  assert.ok(context.activeClues.some((item) => item.id === 'combined'));
  assert.ok(context.activeClues.some((item) => item.id === 'descendant'));
  state = update(state, 'clue/connect', { a: a.id, b: b.id });
  assert.notEqual(state.links[0].id, link.id);
  assert.equal(state.clues.find((item) => item.id === 'combined').status, 'active');
  state = update(state, 'clue/disconnect', { a: b.id, b: a.id });
  assert.equal(state.links.length, 0);
});

test('earlier direction sets remain recoverable and reusing one requires review', () => {
  let state = showDirections(project());
  const originalDirections = structuredClone(state.directions);
  state = update(state, 'exploration/return');
  state = update(state, 'draft/set', { field: 'answer', value: 'I have one day now.' });
  state = prepareTurn(state).state;
  state = applyTurn(state, response(), state.revision);
  state = applyTurn(state, response(), state.revision);
  assert.deepEqual(state.directionHistory[0].directions, originalDirections);
  assert.equal(state.directionHistory[0].valid, false);
  assert.equal(state.directionHistory[0].reason, 'continued-exploring');
  state = update(state, 'direction/revisit', {
    historyId: state.directionHistory[0].id,
    directionId: originalDirections[0].id,
  });
  assert.equal(state.screen, 'explore');
  assert.equal(state.review.ready, false);
  assert.equal(state.inputs.at(-1).type, 'direction-revisit');
  assert.match(state.inputs.at(-1).text, /A photograph of a daily object/);
  assert.throws(
    () => update(state, 'direction/select', { id: originalDirections[0].id }),
    /Review the latest/,
  );
  for (let index = 1; index <= 12; index += 1) state = showDirections(state, index);
  assert.equal(state.directionHistory.length, 8);
  assert.equal(state.directionHistory[0].directions[0].id, 'd-11-0');
});

test('saved direction questions remain hypothetical until student explicitly applies them', () => {
  let state = showDirections(project());
  const originalRevision = state.revision;
  const originalInputs = structuredClone(state.inputs);
  state = update(state, 'direction/qa', {
    id: 'qa-1',
    directionId: state.directions[0].id,
    question: 'What if I had only one day?',
    answer: 'That would require a smaller scope.',
  });
  assert.equal(state.revision, originalRevision);
  assert.deepEqual(state.inputs, originalInputs);
  assert.equal(buildContext(state).directionQuestions, undefined);
  state = migrateProject(JSON.parse(JSON.stringify(state)));
  assert.equal(state.directionQuestions[0].question, 'What if I had only one day?');
  assert.equal(update(state, 'direction/select', { id: state.directions[0].id }).screen, 'chosen');
  state = update(state, 'direction/qa-apply', { id: 'qa-1', text: 'I now have only one day.' });
  assert.equal(state.inputs.at(-1).text, 'I now have only one day.');
  assert.equal(state.inputs.at(-1).type, 'direction-followup');
  assert.equal(state.directionQuestions[0].appliedInputId, state.inputs.at(-1).id);
  assert.equal(state.review.ready, false);
  assert.equal(state.directions.length, 0);
  assert.equal(state.directionHistory[0].directions.length, 2);
  assert.deepEqual(update(state, 'direction/qa-apply', { id: 'qa-1' }), state);
});

test('reused direction ids keep questions attached to their original generation', () => {
  let state = showDirections(project());
  const originalSetId = state.directionSetId;
  const directionId = state.directions[0].id;
  state = update(state, 'direction/qa', {
    directionSetId: originalSetId,
    directionId,
    question: 'Can I photograph outdoors?',
    answer: 'Check the weather and available time.',
  });
  state = showDirections(state);
  assert.notEqual(state.directionSetId, originalSetId);
  assert.equal(state.directionHistory[0].id, originalSetId);
  assert.equal(
    state.directionQuestions.filter(
      (item) => item.directionId === directionId && item.directionSetId === state.directionSetId,
    ).length,
    0,
  );
  state = update(state, 'direction/qa', {
    directionSetId: originalSetId,
    directionId,
    question: 'What equipment did that older idea need?',
    answer: 'It was based on your phone.',
  });
  assert.equal(state.directionQuestions.at(-1).directionSetId, originalSetId);
  assert.equal(
    state.directionQuestions.filter(
      (item) => item.directionId === directionId && item.directionSetId === originalSetId,
    ).length,
    2,
  );
});

test('correction excludes descendants and generated clues cannot launder excluded interpretations', () => {
  let state = update(project(), 'thought/add', { text: 'I like watching films.' });
  const sourceId = state.clues[0].id;
  state = applyTurn(
    state,
    response({
      clues: [
        {
          id: 'experienced-editor',
          title: 'Experienced editor',
          detail: 'Assumed editing experience.',
          sourceIds: [sourceId],
        },
        {
          id: 'advanced-tools',
          title: 'Advanced tools',
          detail: 'Assumed skill with tools.',
          sourceIds: ['experienced-editor'],
        },
      ],
    }),
    state.revision,
  );
  state = update(state, 'clue/correct', {
    id: 'experienced-editor',
    text: 'I cannot edit videos.',
  });
  assert.equal(state.clues.find((item) => item.id === 'advanced-tools').status, 'invalid');
  assert.throws(
    () =>
      validateResponse(
        state,
        response({
          clues: [
            {
              id: 'new-editor',
              title: 'Film editing',
              detail: 'Reused old assumption.',
              sourceIds: ['experienced-editor'],
            },
          ],
        }),
      ),
    /excluded clue experienced-editor/,
  );
  assert.throws(
    () =>
      validateResponse(
        state,
        response({
          clues: [
            {
              id: 'new-plan',
              title: 'A plan',
              detail: 'Uses a new interpretation.',
              sourceIds: ['new-editor'],
            },
            {
              id: 'new-editor',
              title: 'Film editing',
              detail: 'Reused old assumption.',
              sourceIds: ['advanced-tools'],
            },
          ],
        }),
      ),
    /excluded clue advanced-tools/,
  );
  state = update(state, 'clue/aside', { id: sourceId });
  assert.throws(
    () =>
      validateResponse(
        state,
        response({
          clues: [
            { id: 'aside-remix', title: 'Another film idea', detail: '', sourceIds: [sourceId] },
          ],
        }),
      ),
    /excluded clue/,
  );
});

test('undo restores a removed connection and its interpretations, and stops after new semantic input', () => {
  let state = project();
  for (const text of ['Morning light', 'A familiar cup'])
    state = update(state, 'thought/add', { text });
  const [a, b] = state.clues;
  state = update(state, 'clue/connect', { a: a.id, b: b.id });
  let link = structuredClone(state.links[0]);
  state = applyTurn(
    state,
    response({
      clues: [
        {
          id: 'combined',
          title: 'A cup of light',
          detail: 'A possible connection.',
          sourceIds: [a.id, b.id],
        },
      ],
    }),
    state.revision,
  );
  state = update(state, 'clue/connect', { a: a.id, b: b.id });
  link = structuredClone(state.links[0]);
  state = update(state, 'clue/focus', { id: 'combined' });
  const interpretation = structuredClone(state.clues.find((item) => item.id === 'combined'));
  state = update(state, 'clue/disconnect', { id: link.id });
  assert.equal(state.focusId, 'combined');
  state = update(state, 'tutorial/seen');
  state = update(state, 'clue/undo-disconnect', { id: link.id });
  assert.deepEqual(state.links[0], link);
  assert.deepEqual(
    state.clues.find((item) => item.id === 'combined'),
    interpretation,
  );
  assert.equal(state.focusId, 'combined');
  assert.equal(state.lastDisconnected, null);
  state = update(state, 'clue/disconnect', { id: link.id });
  state = update(state, 'draft/set', { field: 'answer', value: 'Try another angle.' });
  assert.throws(
    () => update(state, 'clue/undo-disconnect', { id: link.id }),
    /project has changed/,
  );
});

test('unconfirmed clarification drafts survive reload but stay out of model context', () => {
  let state = project([{ id: 'paper', text: 'Which paper?' }]);
  for (const status of ['unresolved', 'resolved', 'unresolved', 'dismissed']) {
    state = update(state, 'brief/uncertainty', {
      id: 'paper',
      status,
      resolution: 'Use blue stock.',
    });
    state = migrateProject(JSON.parse(JSON.stringify(state)));
    const context = buildContext(state);
    assert.equal(state.brief.uncertainties[0].resolution, 'Use blue stock.');
    assert.equal(context.brief.uncertainties[0].status, status);
    assert.equal(
      context.brief.uncertainties[0].resolution,
      status === 'resolved' ? 'Use blue stock.' : '',
    );
    assert.equal(JSON.stringify(context).includes('Use blue stock.'), status === 'resolved');
  }
});

test('revised clarifications keep historical wording but only send the current answer, including older saves', () => {
  let state = project([{ id: 'color', text: 'Which colors are allowed?' }]);
  for (const resolution of ['Monochrome only.', 'Color allowed.']) {
    state = update(state, 'brief/uncertainty', { id: 'color', status: 'resolved', resolution });
  }
  const historical = state.inputs.filter((item) => item.type === 'brief-clarification');
  assert.deepEqual(
    historical.map((item) => item.text),
    ['Monochrome only.', 'Color allowed.'],
  );
  const legacy = structuredClone(state);
  for (const item of legacy.inputs) delete item.uncertaintyId;
  for (const saved of [state, legacy]) {
    const context = buildContext(migrateProject(saved));
    assert.deepEqual(
      context.inputs.filter((item) => item.type === 'brief-clarification').map((item) => item.text),
      ['Color allowed.'],
    );
    assert.equal(JSON.stringify(context).includes('Monochrome only.'), false);
  }
});
