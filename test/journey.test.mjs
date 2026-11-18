import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server.mjs';
import { createProject, update, prepareTurn, applyTurn, DEMO_BRIEF } from '../public/state.mjs';

test('preview goes through the actual HTTP routes from brief to chosen direction', async (t) => {
  const server = createApp({ apiKey: '', model: 'gpt-6.1-sol' });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function post(path, payload) {
    const r = await fetch(base + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: base },
      body: JSON.stringify({ mode: 'preview', ...payload }),
    });
    const body = await r.json();
    assert.equal(r.status, 200, body.error || JSON.stringify(body));
    return body;
  }
  let state = update(createProject(), 'brief/text', { text: DEMO_BRIEF });
  const brief = await post('/api/brief', { text: DEMO_BRIEF });
  state = update(state, 'brief/review', brief);
  state = update(state, 'brief/confirm');
  state = update(state, 'entry/select', { kind: 'none', idea: '' });
  async function turn(action = 'explore') {
    const prepared = prepareTurn(state, action);
    state = prepared.state;
    const response = await post('/api/turn', prepared.request);
    state = applyTurn(state, response, prepared.request.revision, action);
    return response;
  }
  await turn();
  assert.ok(state.question?.text, 'first question appears');
  for (const answer of [
    'I keep noticing how my desk changes during the day.',
    'I like ordinary objects with personal meaning.',
    'I can take photographs with my phone and have one week.',
  ]) {
    state = update(state, 'draft/set', { field: 'answer', value: answer });
    await turn();
  }
  assert.equal(state.review.ready, true, 'guided example reaches readiness');
  state = update(state, 'draft/set', {
    field: 'thought',
    value: 'I want the visual story to feel calm and personal.',
  });
  await turn('directions');
  assert.equal(state.screen, 'directions');
  assert.ok(state.directions.length >= 2);
  assert.ok(
    state.inputs.some((x) => x.text.includes('calm and personal')),
    'latest unprocessed draft enters results request',
  );
  const answer = await post('/api/ask', {
    state,
    directionId: state.directions[0].id,
    question: 'Why does this fit the assignment?',
  });
  assert.ok(answer.answer?.length > 0);
  state = update(state, 'directions/reject', { reason: '' });
  await turn();
  await turn('directions');
  assert.equal(state.screen, 'directions');
  state = update(state, 'direction/select', { id: state.directions[0].id });
  assert.equal(state.screen, 'chosen');
});
