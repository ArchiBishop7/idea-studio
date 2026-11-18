import test from 'node:test';
import assert from 'node:assert/strict';
import { translateGeneratedText } from '../lib/provider.mjs';
const fields = [{ key: '["directions",0,"title"]', text: 'What was there all along' }];
function config(translations) {
  return {
    apiKey: 'test-only',
    fetchImpl: async (_url, request) => {
      const body = JSON.parse(request.body);
      assert.match(body.instructions, /translation only/);
      assert.match(body.instructions, /Preserve meaning/);
      return new Response(
        JSON.stringify({
          status: 'completed',
          output: [
            {
              type: 'message',
              role: 'assistant',
              status: 'completed',
              content: [{ type: 'output_text', text: JSON.stringify({ translations }) }],
            },
          ],
        }),
        { status: 200 },
      );
    },
  };
}
test('translation returns keyed existing content', async () => {
  const translations = [{ key: fields[0].key, text: '一直都在的关怀' }];
  assert.deepEqual(
    await translateGeneratedText({ fields, language: { code: 'zh-CN' } }, config(translations)),
    { translations },
  );
});
test('translation refuses missing or substituted fields', async () => {
  for (const translations of [[], [{ key: 'unknown', text: '其他' }]])
    await assert.rejects(
      translateGeneratedText({ fields, language: { code: 'zh-CN' } }, config(translations)),
    );
});
