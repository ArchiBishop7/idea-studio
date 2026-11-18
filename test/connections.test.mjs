import test from 'node:test';
import assert from 'node:assert/strict';
import { connectionGroups } from '../public/connections.mjs';
const clues = ['a', 'b', 'c', 'd'].map((id) => ({ id, status: 'active' }));
const links = [
  { id: 'ab', a: 'a', b: 'b' },
  { id: 'bc', a: 'b', b: 'c' },
  { id: 'cd', a: 'c', b: 'd' },
];
test('a chain of four clues is one group without inventing pairwise links', () => {
  const groups = connectionGroups(clues, links);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].clueIds, ['a', 'b', 'c', 'd']);
  assert.equal(groups[0].connectionIds.length, 3);
});
test('disconnecting the middle splits the group into two', () => {
  assert.deepEqual(
    connectionGroups(clues, [links[0], links[2]]).map((g) => g.clueIds),
    [
      ['a', 'b'],
      ['c', 'd'],
    ],
  );
});
test('set-aside clues do not participate in active groups', () => {
  assert.deepEqual(
    connectionGroups(
      clues.map((c) => (c.id === 'b' ? { ...c, status: 'aside' } : c)),
      links,
    ).map((g) => g.clueIds),
    [['c', 'd']],
  );
});

import { createProject, update } from '../public/state.mjs';
function groupedProject() {
  const s = createProject();
  s.clues = clues.map((c) => ({ ...c, title: c.id, origin: 'student', detail: c.id }));
  s.links = structuredClone(links);
  return s;
}
test('removing a member preserves only existing remaining connections', () => {
  const s = update(groupedProject(), 'clue/leave-group', { id: 'b' });
  assert.deepEqual(new Set(connectionGroups(s.clues, s.links)[0].clueIds), new Set(['c', 'd']));
  assert.ok(!s.links.some((l) => l.a === 'b' || l.b === 'b'));
  assert.equal(s.clues.length, 4);
});
test('dissolving a group keeps its cards', () => {
  const s = update(groupedProject(), 'clue/dissolve-group', { id: 'a' });
  assert.equal(s.links.length, 0);
  assert.equal(s.clues.filter((c) => c.status === 'active').length, 4);
});

test('previously hidden connection-derived cards recover without restoring removed lines', () => {
  const s = groupedProject();
  s.links = [];
  s.clues.push({
    id: 'old-ai',
    title: 'Saved idea',
    detail: 'Keep me',
    origin: 'ai',
    status: 'invalid',
    invalidReason: 'connection-removed',
    sourceIds: ['a'],
  });
  const next = update(s, 'tutorial/seen');
  assert.equal(next.clues.find((c) => c.id === 'old-ai').status, 'active');
  assert.equal(next.links.length, 0);
});

test('one round blocks a second independent pair but permits adding a clue', () => {
  let s = groupedProject();
  s.links = [links[0]];
  assert.throws(() => update(s, 'clue/connect', { a: 'c', b: 'd' }), /current combination/);
  const next = update(s, 'clue/connect', { a: 'b', b: 'c' });
  assert.equal(next.links.length, 2);
  assert.equal(next.clues.length, 4);
});
test('reset combination keeps all clues and permits a new pair', () => {
  let s = groupedProject();
  const original = structuredClone(s.clues);
  s = update(s, 'clue/reset-round');
  assert.deepEqual(s.clues, original);
  assert.equal(s.links.length, 0);
  s = update(s, 'clue/connect', { a: 'c', b: 'd' });
  assert.equal(s.links.length, 1);
  assert.deepEqual([s.links[0].a, s.links[0].b], ['c', 'd']);
});
