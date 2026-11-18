import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import handler from '../api/index.mjs';

test('public hosting serves visitors without credentials and keeps private files inaccessible', async () => {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const page = await fetch(base);
    assert.equal(page.status, 200);
    assert.equal(page.headers.get('www-authenticate'), null);
    assert.match(await page.text(), /Idea Studio/);
    const status = await fetch(`${base}/api/status`);
    assert.equal(status.status, 200);
    assert.equal((await status.json()).provider, 'OpenAI');
    for (const path of ['/.env', '/server.mjs', '/api/index.mjs']) {
      assert.equal((await fetch(base + path)).status, 404);
    }
    const crossOrigin = await fetch(`${base}/api/brief`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://other.example' },
      body: JSON.stringify({ mode: 'preview', text: 'test' }),
    });
    assert.equal(crossOrigin.status, 403);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
