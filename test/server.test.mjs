import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server.mjs';

async function withServer(run) {
  const server = createApp({ apiKey: '', model: 'gpt-6.1-sol' });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await run(base);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('serves the app and reports unconfigured live access honestly', () =>
  withServer(async (base) => {
    const page = await fetch(base);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Idea Studio/i);
    const status = await (await fetch(base + '/api/status')).json();
    assert.equal(status.ready, false);
    assert.equal(status.connectionVerified, false);
    assert.equal(status.provider, 'OpenAI');
    assert.equal(status.model, 'gpt-6.1-sol');
    assert.equal('apiKey' in status, false);
    assert.equal((await fetch(base + '/.env')).status, 404);
  }));

test('rejects malformed requests and cross-origin mutations before any AI call', () =>
  withServer(async (base) => {
    let result = await fetch(base + '/api/turn', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{bad',
    });
    assert.equal(result.status, 400);
    result = await fetch(base + '/api/turn', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://example.com' },
      body: JSON.stringify({ mode: 'preview' }),
    });
    assert.equal(result.status, 403);
    result = await fetch(base + '/api/turn', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mode: 'preview',
        action: 'directions',
        revision: 3,
        state: { revision: 2 },
      }),
    });
    assert.equal(result.status, 400);
  }));

test('live requests without a key return an actionable error instead of simulated AI', () =>
  withServer(async (base) => {
    const result = await fetch(base + '/api/brief', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'live', text: 'Create a still-image narrative.' }),
    });
    assert.equal(result.status, 503);
    const value = await result.json();
    assert.match(value.error, /key|configure|API|Claude/i);
    assert.equal(value.code, 'api_key_missing');
    assert.equal('requirements' in value, false);
  }));

test('localized brief failures retain stable codes through HTTP', () =>
  withServer(async (base) => {
    for (const [mode, status, code] of [
      ['live', 503, 'api_key_missing'],
      ['preview', 422, 'demo_only'],
    ]) {
      const result = await fetch(base + '/api/brief', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode,
          text: '一周内完成6—8张图片，提交PDF和150—200字说明。评分为35%、30%、20%、15%。',
          language: { code: 'zh-CN' },
        }),
      });
      assert.equal(result.status, status);
      const value = await result.json();
      assert.equal(value.code, code);
      assert.equal(typeof value.error, 'string');
      assert.match(value.error, /[\u4e00-\u9fff]/u);
      assert.equal('requirements' in value, false);
    }
  }));

test('upload limits and accepted formats agree with the interface', () =>
  withServer(async (base) => {
    const send = (file) =>
      fetch(base + '/api/brief', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'live', text: '', file }),
      });
    const tooLarge = await send({
      mediaType: 'image/png',
      base64: Buffer.alloc(8 * 1024 * 1024 + 1).toString('base64'),
    });
    assert.equal(tooLarge.status, 413);
    const unsupported = await send({ mediaType: 'image/webp', base64: 'dGVzdA==' });
    assert.equal(unsupported.status, 400);
    assert.equal((await fetch(base + '/i18n.mjs')).status, 200);
    assert.equal((await fetch(base + '/preview-locales.mjs')).status, 200);
  }));
