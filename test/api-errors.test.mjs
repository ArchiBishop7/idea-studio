import { productText } from '../public/product-i18n.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewBrief } from '../lib/provider.mjs';
import { LANGUAGES, setLocale, t, friendlyError } from '../public/i18n.mjs';
import { PREVIEW_LOCALES } from '../public/preview-locales.mjs';

const brief =
  '一周内完成6—8张原创静态图像，提交PDF和150—200字创作说明。评分为叙事35%、视觉30%、概念20%、完成度15%。';
const demo =
  'The sample preview works with the guided example assignment. Use the guided example or switch to live OpenAI for your own brief.';
const generic = 'Something went wrong. Your work is saved. Try again.';
function assertSetupMeaning(displayed, code) {
  assert.equal(displayed, productText(code, 2));
  assert.doesNotMatch(displayed, /OpenAI|\.env|API|server|服务器|伺服器/iu);
  assert.notEqual(displayed, t(generic));
}
async function failureFor(mode, code, config = {}) {
  try {
    await reviewBrief({ mode, text: brief, language: { code } }, config);
  } catch (error) {
    return error;
  }
  assert.fail('The brief must not succeed without a configured model or matching guided example.');
}

test('actual no-key and unsupported-preview errors remain actionable in all twelve languages', async () => {
  let calls = 0;
  try {
    for (const { code } of LANGUAGES) {
      setLocale(code);
      for (const [mode, errorCode] of [
        ['live', 'api_key_missing'],
        ['preview', 'demo_only'],
      ]) {
        const error = await failureFor(mode, code, {
          fetchImpl() {
            calls++;
            throw new Error('No model may be called.');
          },
        });
        assert.equal(error.code, errorCode);
        const displayed = friendlyError(error.message, error.code);
        if (mode === 'live') assertSetupMeaning(displayed, code);
        else
          assert.equal(
            displayed,
            PREVIEW_LOCALES[code].errors.demo,
            `${code}/${mode}: show the recovery action`,
          );
        assert.notEqual(displayed, t(generic), `${code}/${mode}: do not hide the known failure`);
        assert.equal(
          friendlyError(error.message),
          displayed,
          `${code}/${mode}: recognize old responses without a code`,
        );
        assert.equal(
          friendlyError(displayed),
          displayed,
          `${code}/${mode}: repeated rendering keeps the diagnosis`,
        );
      }
    }
    assert.equal(calls, 0);
  } finally {
    setLocale('en');
  }
});

test('known translated errors follow the selected language without changing unknown service text into output', async () => {
  try {
    for (const source of LANGUAGES) {
      const missing = await failureFor('live', source.code);
      setLocale(source.code);
      const displayed = friendlyError(missing.message, missing.code);
      for (const target of LANGUAGES) {
        setLocale(target.code);
        const translated = friendlyError(displayed);
        assertSetupMeaning(translated, target.code);
        assert.equal(
          friendlyError(missing.message),
          translated,
          'Old provider messages and previously rendered text resolve to the same diagnosis.',
        );
        if (target.code !== source.code)
          assert.notEqual(
            translated,
            displayed,
            'Switching language changes the message presentation.',
          );
      }
    }
    for (const { code } of LANGUAGES) {
      setLocale(code);
      for (const raw of [
        'upstream-secret-value-123',
        '服务器内部路径 D:/private/credentials',
        '<script>private()</script>',
      ]) {
        assert.equal(friendlyError(raw, 'unexpected_service_code'), t(generic));
      }
    }
  } finally {
    setLocale('en');
  }
});

test('real provider failures use stable codes for safe localized recovery messages', async () => {
  const secret = 'upstream-secret-value-123';
  const cases = [
    ['provider_auth', () => new Response(secret, { status: 401 })],
    ['provider_busy', () => new Response(secret, { status: 429 })],
    ['provider_unavailable', () => new Response(secret, { status: 500 })],
    [
      'provider_network',
      () => {
        throw new Error(secret);
      },
    ],
    [
      'provider_timeout',
      () => {
        throw Object.assign(new Error(secret), { name: 'AbortError' });
      },
    ],
    ['provider_invalid_json', () => new Response(secret, { status: 200 })],
  ];
  try {
    for (const { code } of LANGUAGES) {
      setLocale(code);
      for (const [errorCode, fetchImpl] of cases) {
        const error = await failureFor('live', code, { apiKey: 'test-key', fetchImpl });
        assert.equal(error.code, errorCode);
        const displayed = friendlyError(error.message, error.code);
        assert.equal(typeof displayed, 'string');
        assert.ok(displayed.trim());
        assert.notEqual(displayed, t(generic));
        assert.ok(!displayed.includes(secret));
        assert.equal(
          friendlyError(displayed),
          displayed,
          'Rendered errors survive another frontend localization pass.',
        );
        if (errorCode === 'provider_network')
          assert.equal(displayed, PREVIEW_LOCALES[code].errors.network);
        if (errorCode === 'provider_timeout')
          assert.equal(displayed, PREVIEW_LOCALES[code].errors.timeout);
        if (['provider_auth', 'provider_busy'].includes(errorCode))
          assert.notEqual(displayed, PREVIEW_LOCALES[code].errors.retry);
      }
    }
  } finally {
    setLocale('en');
  }
});
