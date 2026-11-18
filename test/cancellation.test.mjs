import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { EventEmitter } from 'node:events';
import { createApp } from '../server.mjs';
import { reviewBrief, runTurn } from '../lib/provider.mjs';
import { createProject, update, prepareTurn, applyTurn, DEMO_BRIEF } from '../public/state.mjs';

const envelope = (result) =>
  new Response(
    JSON.stringify({
      status: 'completed',
      model: 'gpt-6.1-sol',
      usage: { input_tokens: 10, output_tokens: 20 },
      output: [
        {
          type: 'message',
          role: 'assistant',
          status: 'completed',
          content: [{ type: 'output_text', text: JSON.stringify(result) }],
        },
      ],
    }),
    { status: 200 },
  );
const extracted = {
  summary: 'Six original images.',
  requirements: [
    {
      id: 'r1',
      text: 'Make six images.',
      quote: 'Make six images.',
      category: 'requirements',
      label: 'Image count',
    },
  ],
  uncertainties: [],
};
const accepted = {
  accepted: true,
  repairDirectionIds: [],
  needsStudentInput: false,
  issues: [],
  question: null,
};
const rejected = {
  accepted: false,
  repairDirectionIds: [],
  needsStudentInput: false,
  issues: [
    { id: 'fix', message: 'Revise an unsupported assumption.', requirementId: null, quote: '' },
  ],
  question: null,
};
const canceled = (error) => error.code === 'request_canceled' && error.status === 499;

async function directionFixture() {
  let state = update(createProject(), 'brief/text', { text: DEMO_BRIEF });
  state = update(state, 'brief/review', await reviewBrief({ mode: 'preview', text: DEMO_BRIEF }));
  state = update(update(state, 'brief/confirm'), 'entry/select', { kind: 'none' });
  for (const value of [
    'A cup moving around my desk.',
    'Changes in light interest me.',
    'I have one week and a phone.',
  ]) {
    const prepared = prepareTurn(update(state, 'draft/set', { field: 'answer', value }));
    state = applyTurn(
      prepared.state,
      await runTurn({ mode: 'preview', ...prepared.request }),
      prepared.request.revision,
    );
  }
  const prepared = prepareTurn(state, 'directions');
  const candidate = await runTurn({ mode: 'preview', ...prepared.request });
  return {
    prepared,
    candidate,
    shown: applyTurn(prepared.state, candidate, prepared.request.revision, 'directions'),
  };
}

test('an already canceled request makes no model call', async () => {
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  await assert.rejects(
    reviewBrief(
      { mode: 'live', text: 'Make six images.' },
      {
        apiKey: 'test-placeholder',
        signal: controller.signal,
        fetchImpl: async () => {
          calls += 1;
          return envelope(extracted);
        },
      },
    ),
    canceled,
  );
  assert.equal(calls, 0);
});

test('canceling an active model request propagates its signal and is not reported as a timeout', async () => {
  const controller = new AbortController();
  let passedSignal;
  const pending = reviewBrief(
    { mode: 'live', text: 'Make six images.' },
    {
      apiKey: 'test-placeholder',
      signal: controller.signal,
      fetchImpl: async (_url, { signal }) => {
        passedSignal = signal;
        return new Promise((_resolve, reject) =>
          signal.addEventListener(
            'abort',
            () => reject(new DOMException('Stopped', 'AbortError')),
            { once: true },
          ),
        );
      },
    },
  );
  controller.abort();
  await assert.rejects(pending, canceled);
  assert.equal(passedSignal.aborted, true);
});

test('a late response after cancellation cannot trigger semantic review', async () => {
  const { prepared, candidate } = await directionFixture();
  const controller = new AbortController();
  let calls = 0;
  await assert.rejects(
    runTurn(
      { mode: 'live', ...prepared.request },
      {
        apiKey: 'test-placeholder',
        signal: controller.signal,
        fetchImpl: async () => {
          calls += 1;
          controller.abort();
          return envelope(candidate);
        },
      },
    ),
    canceled,
  );
  assert.equal(calls, 1);
});

test('cancellation after each completed pass prevents later review or repair calls', async () => {
  const { prepared, candidate } = await directionFixture();
  for (const cancelAfter of [1, 2, 3, 4]) {
    const controller = new AbortController();
    const responses = [
      candidate,
      { ...rejected, repairDirectionIds: [candidate.directions[0].id] },
      { directions: [{ ...candidate.directions[0], title: 'Repaired option' }] },
      accepted,
    ];
    let calls = 0;
    await assert.rejects(
      runTurn(
        { mode: 'live', ...prepared.request },
        {
          apiKey: 'test-placeholder',
          signal: controller.signal,
          fetchImpl: async () => envelope(responses[calls++]),
          onUsage: () => {
            if (calls === cancelAfter) controller.abort();
          },
        },
      ),
      canceled,
    );
    assert.equal(calls, cancelAfter, `No call after canceled pass ${cancelAfter}`);
  }
});

// Exercise the real HTTP request handler without sockets or network access.
function invoke(app, path, data) {
  const req = Readable.from([Buffer.from(JSON.stringify(data))]);
  Object.assign(req, {
    headers: { host: '127.0.0.1:4317', 'content-type': 'application/json' },
    method: 'POST',
    url: path,
  });
  const res = new EventEmitter();
  Object.assign(res, {
    writableEnded: false,
    ended: 0,
    setHeader() {},
    writeHead() {},
    end() {
      this.writableEnded = true;
      this.ended += 1;
      this.emit('close');
    },
  });
  const finished = app.listeners('request')[0](req, res);
  return { req, res, finished };
}

test('all live HTTP endpoints cancel the upstream request when the browser disconnects', async () => {
  const { prepared, shown } = await directionFixture();
  const cases = [
    ['/api/brief', { mode: 'live', text: 'Make six images.' }],
    ['/api/turn', { mode: 'live', ...prepared.request }],
    [
      '/api/ask',
      {
        mode: 'live',
        state: shown,
        directionId: shown.directions[0].id,
        question: 'What is the main tradeoff?',
      },
    ],
  ];
  for (const [path, data] of cases) {
    let signal, started;
    const begun = new Promise((resolve) => {
      started = resolve;
    });
    let calls = 0;
    const app = createApp({
      apiKey: 'test-placeholder',
      fetchImpl: async (_url, options) => {
        calls += 1;
        signal = options.signal;
        started();
        return new Promise((_resolve, reject) =>
          signal.addEventListener(
            'abort',
            () => reject(new DOMException('Stopped', 'AbortError')),
            { once: true },
          ),
        );
      },
    });
    const request = invoke(app, path, data);
    await begun;
    request.res.destroyed = true;
    request.res.emit('close');
    await request.finished;
    assert.equal(signal.aborted, true, path);
    assert.equal(calls, 1, path);
    assert.equal(request.res.ended, 0, 'Do not send an error to a disconnected browser');
    assert.equal(request.res.listenerCount('close'), 0, 'Remove disconnect listeners');
    assert.equal(request.req.listenerCount('aborted'), 0, 'Remove request listeners');
  }
});

test('normal HTTP completion does not mark a successful model request canceled', async () => {
  let signal;
  const app = createApp({
    apiKey: 'test-placeholder',
    fetchImpl: async (_url, options) => {
      signal = options.signal;
      return envelope(extracted);
    },
  });
  const request = invoke(app, '/api/brief', { mode: 'live', text: 'Make six images.' });
  await request.finished;
  assert.equal(request.res.ended, 1);
  assert.equal(signal.aborted, false);
});
