import test from 'node:test';
import assert from 'node:assert/strict';
import { compactRequestContext } from '../lib/request-context.mjs';
test('request projection preserves constraints and removes repeated history snapshots without mutating archive', () => {
  const clue = {
    id: 'c1',
    title: 'Old interest',
    detail: 'Repeated snapshot '.repeat(100),
    sourceIds: ['i1'],
    status: 'invalid',
  };
  const context = {
    brief: { text: 'Original mandatory requirements' },
    inputs: [{ id: 'i1', text: 'Never use video' }],
    corrections: [{ text: 'Use original drawings only', previous: clue }],
    setAsideClues: [clue],
    invalidClues: [clue],
    activeClues: [],
    latestConnectionGroup: [],
    exploredCombinations: Array.from({ length: 10 }, (_, i) => ({
      id: String(i),
      round: i,
      clues: [clue],
      results: [clue],
      question: { text: 'Earlier question' },
      note: 'Earlier possibility',
    })),
  };
  const original = JSON.stringify(context);
  const result = compactRequestContext(context);
  for (const key of [
    'brief',
    'inputs',
    'setAsideClues',
    'invalidClues',
    'activeClues',
    'latestConnectionGroup',
  ])
    assert.deepEqual(result.currentState[key], context[key]);
  assert.deepEqual(result.correctionsFirst, context.corrections);
  assert.equal(result.currentState.corrections, undefined);
  assert.equal(result.currentState.exploredCombinations[0].historicalOnly, true);
  assert.deepEqual(result.currentState.exploredCombinations[0].clueIds, ['c1']);
  assert.equal(JSON.stringify(context), original);
  assert.ok(JSON.stringify(result).length < original.length / 2);
});
