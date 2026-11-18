import { loadConfig } from '../server.mjs';
import { runTurn } from '../lib/provider.mjs';
import { createProject, update, prepareTurn } from '../public/state.mjs';
import { writeFile } from 'node:fs/promises';
const config = await loadConfig();
const cases = [
  {
    name: 'visual-repeated-uncertainty',
    brief: '用6—8张原创静态图像讲述故事。可摄影、插画或拼贴。提交PDF及150—200字说明。一周完成。',
    history: [
      ['这周用什么方法做图？', '自己画图'],
      ['哪种物品变化想画？', '还不确定'],
      ['画面复杂度？', '画人物与环境'],
    ],
    thoughts: ['自己画图', '人物与周围环境'],
    connect: true,
  },
  {
    name: 'history-no-idea',
    brief:
      'Write a 1200-word history essay comparing two primary sources about an event before 1900. Choose the event yourself. Due in two weeks.',
    history: [
      ['Which event?', 'Not sure'],
      ['Which period?', 'None fit'],
    ],
  },
  {
    name: 'biology-rough-idea',
    brief:
      'Create a five-minute biology presentation explaining one everyday biological phenomenon to non-specialists. Use at least two credible sources. Due next week.',
    idea: 'I wonder why indoor plants grow toward windows.',
    history: [['What interests you about plants?', 'How they respond to their surroundings']],
  },
];
const results = await Promise.all(
  cases.map(async (c) => {
    let s = update(createProject(), 'brief/text', { text: c.brief });
    s = update(s, 'brief/review', {
      summary: c.brief,
      requirements: [{ id: 'r1', text: c.brief, quote: c.brief }],
      uncertainties: [],
    });
    s = update(s, 'brief/confirm');
    s = update(s, 'entry/select', { kind: c.idea ? 'rough' : 'none', idea: c.idea || '' });
    for (const [questionText, text] of c.history)
      s.inputs.push({ id: 'test-' + s.inputs.length, type: 'answer', questionText, text });
    s.round = c.history.length;
    for (const text of c.thoughts || []) s = update(s, 'thought/add', { text });
    if (c.connect) s = update(s, 'clue/connect', { a: s.clues[0].id, b: s.clues[1].id });
    const p = prepareTurn(s, 'explore');
    const started = Date.now();
    try {
      const result = await runTurn(
        {
          mode: 'live',
          ...p.request,
          language: { code: c.name.startsWith('visual') ? 'zh-CN' : 'en' },
        },
        config,
      );
      return {
        name: c.name,
        seconds: (Date.now() - started) / 1000,
        question: result.question,
        clues: result.clues,
      };
    } catch (e) {
      return { name: c.name, error: e.code || e.message };
    }
  }),
);
await writeFile(
  new URL('../.runtime/question-quality-results.json', import.meta.url),
  JSON.stringify(results, null, 2),
);
console.log(JSON.stringify(results, null, 2));
