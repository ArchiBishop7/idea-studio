import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createProject,
  update,
  applyTurn,
  buildContext,
  migrateProject,
  combinationKey,
} from '../public/state.mjs';
function fixture() {
  let s = createProject();
  for (const text of ['Repair', 'Kindness', 'Illustration']) s = update(s, 'thought/add', { text });
  return update(s, 'clue/connect', { a: s.clues[0].id, b: s.clues[1].id });
}
const response = {
  clues: [],
  issues: [],
  directions: [],
  ready: false,
  readinessReason: 'More exploration',
  question: { id: 'q', text: 'What interests you?', options: [] },
  memoryNote: '',
};
test('success archives snapshots and clears only current selection; explicit reuse is possible', () => {
  let s = fixture();
  const original = structuredClone(s);
  s = applyTurn(s, response, s.revision);
  assert.equal(s.links.length, 0);
  assert.equal(s.clues.length, 3);
  assert.equal(s.combinationHistory.length, 1);
  assert.equal(original.links.length, 1);
  assert.deepEqual(buildContext(s).connectionGroups, []);
  s = update(s, 'clue/reuse-combination', { id: s.combinationHistory[0].id });
  assert.equal(combinationKey(s.links.flatMap((l) => [l.a, l.b])), s.combinationHistory[0].key);
  assert.equal(buildContext(s).latestExplorationIntent.type, 'clue/reuse-combination');
});
test('invalid or stale responses leave pending combination intact', () => {
  const s = fixture();
  assert.throws(() => applyTurn(s, {}, s.revision));
  assert.throws(() => applyTurn(s, response, s.revision - 1));
  assert.equal(s.links.length, 1);
  assert.equal(s.combinationHistory.length, 0);
});
test('reported conflicts retain pending combination for correction', () => {
  const s = fixture();
  const next = applyTurn(
    s,
    { ...response, issues: [{ id: 'issue', message: 'Clarify', quote: '', requirementId: null }] },
    s.revision,
  );
  assert.equal(next.links.length, 1);
  assert.equal(next.combinationHistory.length, 0);
});
test('aside removes selection, exposes exclusion to model and restore does not reconnect', () => {
  let s = fixture();
  const id = s.clues[0].id;
  s = update(s, 'clue/aside', { id });
  let c = buildContext(s);
  assert.deepEqual(c.connectionGroups, []);
  assert.equal(c.latestExplorationIntent.type, 'clue/aside');
  assert.equal(c.excludedSourceContext[0].id, id);
  s = update(s, 'clue/restore', { id });
  assert.equal(s.links.length, 0);
});
test('legacy completed selection migrates once while unprocessed selection remains', () => {
  let s = fixture();
  delete s.combinationHistory;
  s.events.push({ id: 'old', type: 'turn/applied', revision: s.revision + 1, payload: {} });
  s.round = 3;
  let next = migrateProject(s);
  assert.equal(next.links.length, 0);
  assert.equal(next.combinationHistory.length, 1);
  assert.equal(migrateProject(next).combinationHistory.length, 1);
  s = fixture();
  delete s.combinationHistory;
  assert.equal(migrateProject(s).links.length, 1);
});
test('history cannot revive an aside clue', () => {
  let s = fixture();
  s = applyTurn(s, response, s.revision);
  s = update(s, 'clue/aside', { id: s.clues[0].id });
  assert.throws(
    () => update(s, 'clue/reuse-combination', { id: s.combinationHistory[0].id }),
    /unavailable/,
  );
});
