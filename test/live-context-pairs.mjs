import { loadConfig } from '../server.mjs';
import { runTurn } from '../lib/provider.mjs';
import { createProject, update, prepareTurn } from '../public/state.mjs';
import { writeFile } from 'node:fs/promises';
const config = await loadConfig();
const results = [];
for (const language of ['en', 'zh-CN']) {
  const zh = language === 'zh-CN';
  const brief = zh
    ? '一周内用6—8张原创插画讲述一个短故事。提交PDF和简短创作说明。'
    : 'Create 6-8 original illustrations telling a short story. Due in one week. Submit a PDF and a short artist statement.';
  let base = update(createProject(), 'brief/text', { text: brief });
  base = update(base, 'brief/review', {
    summary: brief,
    requirements: [{ id: 'r', text: brief, quote: brief }],
    uncertainties: [],
  });
  base = update(base, 'brief/confirm');
  base = update(base, 'entry/select', { kind: 'none', idea: '' });
  const thoughts = zh
    ? ['我喜欢修理损坏的日常物品。', '我留意陌生人之间的小小善意。', '我会数字绘画，有一周时间。']
    : [
        'I enjoy repairing broken everyday objects.',
        'I notice small acts of kindness between strangers.',
        'I can draw digitally and have a week.',
      ];
  for (const text of thoughts) base = update(base, 'thought/add', { text });
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
        text: zh
          ? '我并不喜欢修理物品。我感兴趣的是人们为什么丢弃还能用的东西。'
          : 'I do not enjoy repairing objects. I am interested in why people throw usable things away.',
      }),
    ],
  ];
  const batch = await Promise.all(
    cases.map(async ([name, state]) => {
      const prepared = prepareTurn(state, 'explore');
      try {
        return {
          language,
          name,
          response: await runTurn(
            { mode: 'live', ...prepared.request, language: { code: language } },
            config,
          ),
        };
      } catch (e) {
        return { language, name, error: e.code || e.message };
      }
    }),
  );
  results.push(...batch);
  await writeFile(
    new URL('../.runtime/context-live-pairs.json', import.meta.url),
    JSON.stringify(results, null, 2),
  );
  for (const result of batch) console.log(JSON.stringify(result));
}
