import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createProject, update, prepareTurn, applyTurn } from '../public/state.mjs';
import { LANGUAGES } from '../public/i18n.mjs';
import { FIRST_TURN_MESSAGES, firstTurnText } from '../public/first-turn-i18n.mjs';

const source = await readFile(new URL('../public/app.mjs', import.meta.url), 'utf8');
const between = (start, end) => source.slice(source.indexOf(start), source.indexOf(end));
const locking = between('function lockBusyControls(', 'function render(');
const turning = between('async function turn(', 'async function demo()');
const question = between('function questionMarkup(', 'function clueTitle(');
const requesting = between('async function api(', 'async function reviewBrief()');

function project() {
  let state = update(createProject(), 'brief/text', {
    text: 'Give a five-minute oral presentation.',
  });
  state = update(state, 'brief/review', {
    summary: 'Give an oral presentation.',
    requirements: [
      {
        id: 'r1',
        category: 'requirements',
        label: 'Presentation length',
        text: 'Speak for five minutes.',
        quote: 'Give a five-minute oral presentation.',
        sourceType: 'document',
      },
    ],
  });
  state = update(state, 'brief/confirm');
  state = update(state, 'entry/select', { kind: 'none' });
  state.tutorialSeen = true;
  return state;
}
const response = {
  question: { id: 'q1', text: 'Which everyday experience would you like to share?', options: [] },
  clues: [],
  ready: false,
  readinessReason: 'Begin with an experience.',
  issues: [],
  directions: [],
  memoryNote: 'internal-only',
};

// Execute the actual app functions, including the busy-control loop. No browser or API is contacted.
const createHarness = new Function(
  'initialState',
  'respond',
  'options',
  'prepareTurn',
  'applyTurn',
  'firstTurnText',
  `
  const navigator = options.navigator || {};
  let state=structuredClone(initialState),apiCalls=0,renderCalls=0;
  const ui={busy:false,mode:'live',notice:'',error:false};
  const controls=[{tagName:'BUTTON',disabled:false,dataset:{action:'continue'}},{tagName:'INPUT',disabled:false,dataset:{}},{tagName:'BUTTON',disabled:false,dataset:{action:'cancel-request'}},{tagName:'BUTTON',disabled:true,dataset:{action:'directions'}}];
  const card={draggable:true};
  const $=selector=>selector==='#dialog'?{open:false}:controls[0];
  const $$=selector=>selector==='[data-busy-disabled]'?controls.filter(el=>'busyDisabled' in el.dataset):selector==='[draggable]'?[card]:selector.includes('#main button')?controls:[];
  const tr=key=>key,getLocale=()=>options.locale||'en';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const arrow='↗',btn=(action,text,extra='',classes='')=>'<button data-action="'+action+'" '+extra+'>'+text+'</button>';
  function save(){}
  function notice(message){ui.notice=message;}
  function startTour(){}
  ${locking}
  ${question}
  function render(){renderCalls++;lockBusyControls();if(options.failFirstRender&&renderCalls===1)throw new Error('Simulated render failure');}
  async function api(){apiCalls++;return respond();}
  ${turning}
  return {ui,controls,card,turn,questionMarkup,lockBusyControls,get state(){return state},get apiCalls(){return apiCalls}};
`,
);
const harness = (respond = () => structuredClone(response), options = {}) =>
  createHarness(project(), respond, options, prepareTurn, applyTurn, firstTurnText);

test('busy locking iterates every control, preserves cancellation, and restores only controls it disabled', () => {
  const h = harness();
  h.ui.busy = true;
  assert.doesNotThrow(() => h.lockBusyControls());
  assert.equal(h.controls[0].disabled, true);
  assert.equal(h.controls[1].disabled, true);
  assert.equal(h.controls[2].disabled, false);
  assert.equal(h.controls[3].disabled, true);
  assert.equal(h.card.draggable, false);
  h.ui.busy = false;
  h.lockBusyControls();
  assert.equal(h.controls[0].disabled, false);
  assert.equal(h.controls[1].disabled, false);
  assert.equal(h.controls[3].disabled, true, 'Readiness restrictions must remain disabled.');
});

test('the first question starts once, explains the active wait, then restores controls with the first question', async () => {
  let complete;
  const deferred = new Promise((resolve) => (complete = resolve));
  const h = harness(() => deferred, { locale: 'zh-CN' }),
    original = structuredClone(h.state.brief);
  const pending = h.turn();
  assert.equal(h.apiCalls, 1);
  assert.equal(h.ui.busy, true);
  assert.equal(h.ui.busyText, firstTurnText('zh-CN', 'preparing'));
  const html = h.questionMarkup();
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /正在准备第一个问题…/);
  assert.match(html, /data-action="continue" disabled/);
  assert.doesNotMatch(html, /Find my first question|finding the next question/);
  await h.turn();
  assert.equal(h.apiCalls, 1, 'A repeat click must not start another request.');
  complete(structuredClone(response));
  await pending;
  assert.equal(h.ui.busy, false);
  assert.equal(h.ui.error, false);
  assert.equal(h.state.question.text, response.question.text);
  assert.equal(h.ui.notice, firstTurnText('zh-CN', 'ready'));
  assert.equal(h.controls[0].disabled, false);
  assert.deepEqual(h.state.brief, original);
});

test('an initial render failure clears busy and leaves the first-question retry available without making an API call', async () => {
  const h = harness(undefined, { failFirstRender: true });
  await assert.doesNotReject(h.turn());
  assert.equal(h.ui.busy, false);
  assert.equal(h.ui.error, true);
  assert.equal(h.apiCalls, 0);
  assert.equal(h.controls[0].disabled, false);
  assert.match(h.questionMarkup(), /Find my first question/);
  await h.turn();
  assert.equal(h.apiCalls, 1);
  assert.equal(h.ui.busy, false);
  assert.equal(h.ui.error, false);
});

test('first-turn errors and cancellation preserve the brief and restore the retry controls', async () => {
  for (const canceled of [false, true]) {
    const error = Object.assign(new Error(canceled ? 'Canceled' : 'The request took too long.'), {
      canceled,
    });
    const h = harness(() => Promise.reject(error)),
      original = structuredClone(h.state.brief);
    await h.turn();
    assert.equal(h.ui.busy, false);
    assert.equal(h.ui.error, !canceled);
    assert.equal(h.state.question, null);
    assert.equal(h.controls[0].disabled, false);
    assert.deepEqual(h.state.brief, original);
    assert.match(h.questionMarkup(), /Find my first question/);
  }
});

test('the real first-turn request times out within the bounded review budget and clears its request handle; user cancellation remains distinct', async () => {
  for (const canceled of [false, true]) {
    const ui = {};
    let timer,
      delay,
      cleared = false;
    const fetch = (_path, { signal }) =>
      new Promise((_resolve, reject) =>
        signal.addEventListener('abort', () => reject(new DOMException('Stopped', 'AbortError')), {
          once: true,
        }),
      );
    const make = new Function(
      'ui',
      'fetch',
      'setTimeout',
      'clearTimeout',
      'getLanguage',
      'friendlyError',
      'tr',
      `${requesting}; return api;`,
    );
    const api = make(
      ui,
      fetch,
      (fn, ms) => {
        timer = fn;
        delay = ms;
        return 17;
      },
      (id) => {
        assert.equal(id, 17);
        cleared = true;
      },
      () => ({ code: 'en' }),
      (message) => message,
      (key) => key,
    );
    const pending = api('/api/turn', { action: 'explore' });
    assert.equal(delay, 150000);
    assert.ok(ui.request);
    if (canceled) {
      ui.request.canceled = true;
      ui.request.controller.abort();
    } else timer();
    await assert.rejects(
      pending,
      (error) =>
        error.canceled === canceled &&
        (canceled ? error.message === 'requestCanceled' : /took too long/.test(error.message)),
    );
    assert.equal(ui.request, null);
    assert.equal(cleared, true);
  }
});

test('first-question waiting and success messages are complete in all twelve languages', async () => {
  assert.deepEqual(
    Object.keys(FIRST_TURN_MESSAGES).sort(),
    LANGUAGES.map((language) => language.code).sort(),
  );
  for (const { code } of LANGUAGES) {
    assert.deepEqual(Object.keys(FIRST_TURN_MESSAGES[code]).sort(), [
      'copy',
      'otherTab',
      'preparing',
      'ready',
    ]);
    for (const key of ['copy', 'otherTab', 'preparing', 'ready']) {
      assert.ok(firstTurnText(code, key));
      if (code !== 'en') assert.notEqual(firstTurnText(code, key), firstTurnText('en', key));
    }
    const h = harness(undefined, { locale: code });
    await h.turn();
    assert.equal(h.ui.notice, firstTurnText(code, 'ready'));
    assert.equal(h.ui.noticeRaw, true);
  }
});

test('a turn already running in another tab leaves the current answer available without a second request', async () => {
  const navigator = {
    locks: {
      request: async (name, options, callback) => {
        assert.equal(options.ifAvailable, true);
        return callback(null);
      },
    },
  };
  const h = harness(undefined, { navigator, locale: 'zh-CN' });
  const before = structuredClone(h.state);
  await h.turn();
  assert.equal(h.apiCalls, 0);
  assert.deepEqual(h.state, before);
  assert.equal(h.ui.notice, firstTurnText('zh-CN', 'otherTab'));
});
