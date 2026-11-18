import test from 'node:test';
import assert from 'node:assert/strict';
import { LANGUAGES } from '../public/i18n.mjs';
import { REFINEMENT_MESSAGES, rt } from '../public/refinement-i18n.mjs';

const placeholders = (value) =>
  [...value.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((match) => match[1]).sort();

test('all supported locales include every refinement message and preserve its placeholders', () => {
  assert.deepEqual(
    Object.keys(REFINEMENT_MESSAGES),
    LANGUAGES.map((language) => language.code),
  );
  const keys = Object.keys(REFINEMENT_MESSAGES.en).sort();
  assert.equal(keys.length, 45);
  for (const { code } of LANGUAGES) {
    const entries = REFINEMENT_MESSAGES[code];
    assert.deepEqual(Object.keys(entries).sort(), keys, code);
    for (const key of keys) {
      assert.equal(typeof entries[key], 'string', code + ': ' + key);
      assert.ok(entries[key].trim(), code + ': empty ' + key);
      assert.ok(!entries[key].includes('\uFFFD'), code + ': damaged ' + key);
      assert.deepEqual(
        placeholders(entries[key]),
        placeholders(REFINEMENT_MESSAGES.en[key]),
        code + ': ' + key,
      );
    }
  }
});

test('recovery, source, and history controls have real translations in every non-English locale', () => {
  const critical = [
    'disconnect',
    'connectionRemoved',
    'historyReview',
    'historyStale',
    'qaApply',
    'qaApplied',
    'uncertaintyResolve',
    'uncertaintyReopen',
    'studentSource',
    'documentSource',
    'requestCanceled',
    'reviewIssuesTitle',
    'reviewIssuesHelp',
    'reviewIssuesBrief',
  ];
  for (const { code } of LANGUAGES) {
    if (code === 'en') continue;
    for (const key of critical) assert.notEqual(rt(code, key), rt('en', key), code + ': ' + key);
  }
});

test('history dates and counts retain literal supplied text through one interpolation pass', () => {
  const date = '<原文> {number} & "2026-10-25"';
  for (const { code } of LANGUAGES) {
    assert.ok(rt(code, 'historyDate', { date }).includes(date), code);
    assert.ok(rt(code, 'historySet', { number: 0 }).includes('0'), code);
    assert.ok(rt(code, 'showMoreClues', { count: 17 }).includes('17'), code);
    assert.ok(
      rt(code, 'historyDate').includes('{date}'),
      code + ': missing values must stay visible',
    );
  }
});

test('unknown locale falls back to English and unknown key retains its text', () => {
  assert.equal(rt('xx-ZZ', 'disconnect'), 'Remove connection');
  assert.equal(rt(undefined, 'historySet', { number: 2 }), 'Set 2');
  assert.equal(
    rt('zh-CN', 'Student text: {text}', { text: 'My <idea> {date}' }),
    'Student text: My <idea> {date}',
  );
});
