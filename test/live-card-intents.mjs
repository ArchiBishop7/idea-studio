import { loadConfig, createApp } from '../server.mjs';
import { createProject, update, prepareTurn, buildContext } from '../public/state.mjs';
import { writeFile } from 'node:fs/promises';
const server = createApp(await loadConfig());
await new Promise((r) => server.listen(0, '127.0.0.1', r));
let base = createProject();
const brief =
  'Create 6-8 original illustrations telling a short story. Due in one week. Submit a PDF and a short artist statement.';
base = update(base, 'brief/text', { text: brief });
base = update(base, 'brief/review', {
  summary: brief,
  requirements: [{ id: 'r', text: brief, quote: brief }],
  uncertainties: [],
});
base = update(base, 'brief/confirm');
base = update(base, 'entry/select', { kind: 'none', idea: '' });
for (const text of [
  'I enjoy repairing broken everyday objects.',
  'I notice small acts of kindness between strangers.',
  'I can draw digitally and have a week.',
])
  base = update(base, 'thought/add', { text });
const [a, b] = base.clues;
const combined = update(base, 'clue/connect', { a: a.id, b: b.id });
const cases = [
  ['baseline', base],
  ['combined', combined],
  ['aside', update(combined, 'clue/aside', { id: a.id })],
  [
    'corrected',
    update(combined, 'clue/correct', {
      id: a.id,
      text: 'I do not enjoy repairing objects. I am interested in why people throw usable things away.',
    }),
  ],
];
try {
  const results = await Promise.all(
    cases.map(async ([name, s]) => {
      const p = prepareTurn(s, 'explore');
      try {
        const r = await fetch(`http://127.0.0.1:${server.address().port}/api/turn`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ mode: 'live', ...p.request, language: { code: 'en' } }),
        });
        const body = await r.json();
        return { name, status: r.status, context: buildContext(p.state), response: body };
      } catch (e) {
        return { name, error: e.message };
      }
    }),
  );
  await writeFile(
    new URL('../.runtime/card-intent-results.json', import.meta.url),
    JSON.stringify(results, null, 2),
  );
  for (const r of results)
    console.log(
      JSON.stringify({ name: r.name, status: r.status, response: r.response, error: r.error }),
    );
} finally {
  server.close();
}
