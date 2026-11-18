import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../public/app.mjs', import.meta.url), 'utf8');
const references = source.slice(
  source.indexOf('function indexDirectionSources('),
  source.indexOf('function requirementReferences('),
);
const raw = source.slice(
  source.indexOf('function rawMarkup('),
  source.indexOf('function openDialog('),
);
const dialog = source.slice(
  source.indexOf('function openDialog('),
  source.indexOf('function questionDraftKey('),
);
test('saved dialog renders original source words for active, aside and corrected clues', () => {
  const state = {
    inputs: [{ id: 'i1', text: 'My sister gave me this mug.', type: 'answer' }],
    clues: ['active', 'aside', 'invalid'].map((status, i) => ({
      id: 'c' + i,
      title: 'Mug',
      detail: 'Comfort',
      origin: 'system',
      status,
      sourceIds: ['i1'],
    })),
    brief: { text: 'Six images', confirmed: true },
    draft: {},
    corrections: [],
    rejections: [],
    links: [],
  };
  const render = new Function(
    'state',
    `
 const withTranslatedView=fn=>fn();
 const ui={tourStep:null},document={activeElement:null},panel={open:false,showModal(){this.open=true},querySelector(){return null}},content={innerHTML:''};
 const $=s=>s==='#dialog'?panel:content,reqs=()=>[],esc=v=>String(v??''),t=v=>v,dialogHeading=v=>v,btn=()=>'',protectRaw=()=>{},localize=()=>{},lockBusyControls=()=>{},requestAnimationFrame=()=>{};
 ${references}\n${raw}\n${dialog}
 openDialog('saved'); return {html:content.innerHTML,open:panel.open};`,
  );
  const result = render(state);
  assert.equal(result.open, true);
  assert.equal((result.html.match(/My sister gave me this mug\./g) || []).length, 4);
  assert.match(result.html, /corrected interpretation/);
});
