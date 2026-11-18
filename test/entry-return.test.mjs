import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createProject,
  update,
  migrateProject,
  buildContext,
  prepareTurn,
} from '../public/state.mjs';
const make = () => {
  let s = update(createProject(), 'brief/text', { text: 'Write an essay.' });
  s = update(s, 'brief/review', {
    summary: 'Essay',
    requirements: [{ id: 'r1', text: 'Write an essay.', quote: 'Write an essay.' }],
  });
  s = update(s, 'brief/confirm');
  s = update(s, 'entry/select', { kind: 'none', idea: '' });
  s.question = { id: 'q1', text: 'What caught your attention?', options: [] };
  s.round = 1;
  s = update(s, 'draft/set', { field: 'answer', value: 'An unfinished answer' });
  return s;
};
test('return and cancel preserve the entire exploration and keep edits out of AI context', () => {
  const original = make();
  let s = update(original, 'entry/return');
  s = update(s, 'entry/draft', { kind: 'rough', idea: 'A draft idea' });
  assert.equal(s.start.kind, 'none');
  assert.equal(buildContext(s).start.kind, 'none');
  assert.equal(migrateProject(s).entryEdit.draft.idea, 'A draft idea');
  s = update(s, 'entry/resume');
  assert.deepEqual(s, original);
});
test('unchanged confirmation is navigation only', () => {
  const original = make();
  const s = update(update(original, 'entry/return'), 'entry/select', { kind: 'none', idea: '' });
  assert.deepEqual(s, original);
});
test('confirming a new idea preserves the brief and pending answer and submits both', () => {
  const original = make();
  let s = update(original, 'entry/return');
  s = update(s, 'entry/draft', { kind: 'rough', idea: 'Small daily rituals' });
  s = update(s, 'entry/select', { kind: 'rough', idea: s.entryEdit.draft.idea });
  assert.equal(s.screen, 'explore');
  assert.equal(s.brief.confirmed, true);
  assert.deepEqual(s.draft, original.draft);
  assert.ok(s.revision > original.revision);
  assert.equal(s.review.ready, false);
  assert.equal(buildContext(s).start.idea, 'Small daily rituals');
  const prepared = prepareTurn(s);
  assert.ok(prepared.state.inputs.some((x) => x.text === 'An unfinished answer'));
  assert.ok(prepared.state.inputs.some((x) => x.text === 'Small daily rituals'));
});
test('replacing a starting idea retires its interpretations but retains history and independent clues', () => {
  let s = update(make(), 'entry/select', { kind: 'rough', idea: 'Old idea' });
  const old = s.inputs.find((x) => x.type === 'starting-idea');
  s.clues.push({
    id: 'derived',
    origin: 'ai',
    status: 'active',
    title: 'Old inference',
    detail: '',
    sourceIds: [old.id],
  });
  s = update(s, 'thought/add', { text: 'An independent observation' });
  s = update(update(s, 'entry/return'), 'entry/select', { kind: 'rough', idea: 'New idea' });
  assert.ok(s.inputs.some((x) => x.id === old.id));
  assert.ok(!buildContext(s).inputs.some((x) => x.id === old.id));
  assert.equal(s.clues.find((x) => x.id === 'derived').status, 'invalid');
  assert.ok(s.clues.some((x) => x.title === 'An independent observation' && x.status === 'active'));
  s = update(update(s, 'entry/return'), 'entry/select', { kind: 'none', idea: '' });
  assert.ok(!buildContext(s).inputs.some((x) => x.type === 'starting-idea'));
});

test('changing to a blank start frees the board for a new combination, including after restoring an old project', () => {
  let state = update(make(), 'entry/return');
  state = update(state, 'entry/select', { kind: 'rough', idea: 'Old theme' });
  state = update(state, 'thought/add', { text: 'Keep this independent clue' });
  state = update(state, 'clue/connect', { a: state.clues.at(-2).id, b: state.clues.at(-1).id });
  const oldLinks = state.links;
  state = update(update(state, 'entry/return'), 'entry/select', { kind: 'none', idea: '' });
  assert.deepEqual(state.links, []);
  state = migrateProject({ ...state, links: oldLinks });
  assert.deepEqual(state.links, []);
  state = update(state, 'thought/add', { text: 'New theme' });
  state = update(state, 'clue/connect', { a: state.clues.at(-2).id, b: state.clues.at(-1).id });
  assert.equal(buildContext(state).links.length, 1);
});

test('confirming a blank start discards the unused rough draft even when the caller omits idea', () => {
  let state = createProject();
  state.brief.confirmed = true;
  state = update(state, 'entry/draft', { kind: 'rough', idea: 'Unused topic' });
  state = update(state, 'entry/draft', { kind: 'none' });
  state = update(migrateProject(JSON.parse(JSON.stringify(state))), 'entry/select', {
    kind: 'none',
  });
  const context = buildContext(state);
  assert.deepEqual(context.start, { kind: 'none', idea: '' });
  assert.equal(context.activeClues.length, 0);
  assert.equal(
    context.inputs.some((input) => input.type === 'starting-idea'),
    false,
  );
  assert.throws(() => update(state, 'entry/select', { kind: 'rough', idea: '  ' }), /rough idea/);
});
