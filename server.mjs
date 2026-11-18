import http from 'node:http';
import { createHash } from 'node:crypto';
import { readFile, stat, mkdir, appendFile } from 'node:fs/promises';
import { resolve, dirname, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  reviewBrief,
  runTurn,
  answerQuestion,
  explainQuestion,
  translateGeneratedText,
} from './lib/provider.mjs';
import { validateResponse } from './public/state.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PUBLIC = resolve(ROOT, 'public');
const MAX_BODY = 22 * 1024 * 1024;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

export async function loadConfig() {
  let saved = {};
  try {
    const raw = await readFile(resolve(ROOT, '.env'), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
      if (match) saved[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return {
    apiKey: process.env.OPENAI_API_KEY || saved.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || saved.OPENAI_MODEL || 'gpt-6.1-sol',
    onUsage: recordUsage,
  };
}

async function recordUsage(usage) {
  const directory = resolve(ROOT, '.runtime');
  const count = (value) => (Number.isFinite(value) && value >= 0 ? value : 0);
  const entry = {
    timestamp: new Date().toISOString(),
    provider: 'OpenAI',
    model: String(usage.model || '').slice(0, 100),
    requestId: String(usage.requestId || '').slice(0, 100),
    status: String(usage.status || 'completed').slice(0, 40),
    inputTokens: count(usage.inputTokens),
    outputTokens: count(usage.outputTokens),
    cachedInputTokens: count(usage.cachedInputTokens),
    reasoningTokens: count(usage.reasoningTokens),
    durationMs: count(usage.durationMs),
  };
  if (process.env.VERCEL) {
    console.info('usage', JSON.stringify(entry));
    return;
  }
  await mkdir(directory, { recursive: true });
  await appendFile(resolve(directory, 'api-usage.jsonl'), JSON.stringify(entry) + '\n', 'utf8');
}

function json(res, status, data) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(data));
}

async function body(req) {
  if (!(req.headers['content-type'] || '').startsWith('application/json')) {
    const error = new Error('Send this request as JSON.');
    error.status = 415;
    throw error;
  }
  if (req.body !== undefined) return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) {
      const error = new Error(
        'This file is too large. Use a smaller file (under 3 MB) or paste the relevant requirements.',
      );
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    const error = new Error('The request could not be read. Your saved work is unchanged.');
    error.status = 400;
    throw error;
  }
}

function requireMode(data) {
  if (!['preview', 'live'].includes(data?.mode)) {
    const error = new Error('Choose preview or live mode.');
    error.status = 400;
    throw error;
  }
}

export function createApp(config = {}) {
  // Keep only the latest completed live turn for a lost-response retry.
  let lastCompletedTurn;
  return http.createServer(async (req, res) => {
    const controller = new AbortController();
    const abortRequest = () => controller.abort();
    const abortUnfinishedResponse = () => {
      if (!res.writableEnded) abortRequest();
    };
    req.once('aborted', abortRequest);
    res.once('close', abortUnfinishedResponse);
    const requestConfig = {
      ...config,
      signal: config.signal
        ? AbortSignal.any([config.signal, controller.signal])
        : controller.signal,
    };
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('referrer-policy', 'no-referrer');
    res.setHeader(
      'content-security-policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'",
    );
    try {
      const host = req.headers.host || '';
      if (!config.hosted && !/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host))
        return json(res, 403, { error: 'Open this prototype through localhost.' });
      if (
        req.method === 'POST' &&
        req.headers.origin &&
        req.headers.origin !== `${config.hosted ? 'https' : 'http'}://${host}`
      )
        return json(res, 403, { error: 'This request must come from the prototype itself.' });
      const url = new URL(req.url, `http://${host}`);
      if (req.method === 'GET' && url.pathname === '/api/status')
        return json(res, 200, {
          ready: Boolean(config.apiKey?.trim()),
          model: config.model || 'gpt-6.1-sol',
          provider: 'OpenAI',
          previewAvailable: true,
          connectionVerified: false,
        });
      if (req.method === 'POST' && url.pathname.startsWith('/api/')) {
        const data = await body(req);
        requireMode(data);
        if (url.pathname === '/api/translate')
          return json(res, 200, await translateGeneratedText(data, requestConfig));
        if (url.pathname === '/api/brief') {
          if (typeof data.text !== 'string' || data.text.length > 100000)
            return json(res, 400, { error: 'Paste an assignment brief under 100,000 characters.' });
          if (
            data.file &&
            (!['application/pdf', 'image/png', 'image/jpeg'].includes(data.file.mediaType) ||
              typeof data.file.base64 !== 'string' ||
              !/^[A-Za-z0-9+/=\r\n]+$/.test(data.file.base64))
          )
            return json(res, 400, { error: 'Use a PDF, PNG, or JPEG file.' });
          if (data.file && Buffer.from(data.file.base64, 'base64').length > 3 * 1024 * 1024)
            return json(res, 413, { error: 'Please use a file under 3 MB.' });
          return json(res, 200, await reviewBrief(data, requestConfig));
        }
        if (url.pathname === '/api/turn') {
          if (
            !['explore', 'directions'].includes(data.action) ||
            !data.state ||
            !Number.isInteger(data.revision) ||
            data.state.revision !== data.revision
          )
            return json(res, 400, {
              error: 'This exploration state is out of date. Your work is saved; try again.',
            });
          if (!data.state.brief?.confirmed)
            return json(res, 400, {
              error: 'Confirm the assignment requirements before exploring.',
            });
          if (JSON.stringify(data.state).length > 180000)
            return json(res, 413, {
              error:
                'This project has grown too large for this prototype. Export your work before starting a new project.',
            });
          const retryKey =
            data.mode === 'live'
              ? createHash('sha256').update(JSON.stringify(data)).digest('hex')
              : null;
          if (retryKey && lastCompletedTurn?.key === retryKey)
            return json(res, 200, lastCompletedTurn.result);
          const result = await runTurn(data, requestConfig);
          validateResponse(data.state, result, data.action);
          if (retryKey) lastCompletedTurn = { key: retryKey, result };
          return json(res, 200, result);
        }
        if (url.pathname === '/api/explain') {
          if (JSON.stringify(data).length > 60000)
            return json(res, 413, { error: 'This question is too long. Please shorten it.' });
          return json(res, 200, await explainQuestion(data, requestConfig));
        }
        if (url.pathname === '/api/ask') {
          if (
            !data.state ||
            typeof data.question !== 'string' ||
            !data.question.trim() ||
            data.question.length > 4000
          )
            return json(res, 400, {
              error: 'Write a question about a direction (up to 4,000 characters).',
            });
          if (!data.state.directions?.some((item) => item.id === data.directionId))
            return json(res, 400, { error: 'Choose an existing direction to ask about.' });
          return json(res, 200, await answerQuestion(data, requestConfig));
        }
        return json(res, 404, { error: 'This action is not available.' });
      }
      if (!['GET', 'HEAD'].includes(req.method))
        return json(res, 405, { error: 'Method not allowed.' });
      const path = resolve(
        PUBLIC,
        '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname),
      );
      if (!path.startsWith(PUBLIC + sep)) return json(res, 403, { error: 'File not available.' });
      const info = await stat(path).catch(() => null);
      if (!info?.isFile()) return json(res, 404, { error: 'File not found.' });
      res.writeHead(200, {
        'content-type': MIME[extname(path)] || 'application/octet-stream',
        'cache-control': 'no-cache',
      });
      res.end(req.method === 'HEAD' ? undefined : await readFile(path));
    } catch (error) {
      if (controller.signal.aborted || res.destroyed) return;
      if (res.headersSent) {
        res.end();
        return;
      }
      const status =
        Number.isInteger(error.status) && error.status >= 400 && error.status <= 599
          ? error.status
          : 422;
      const message = error.message || 'This step could not finish. Your work is still saved.';
      const code =
        typeof error.code === 'string' && /^[a-z][a-z0-9_]{0,63}$/.test(error.code)
          ? error.code
          : 'request_failed';
      json(res, status, {
        error: config.apiKey ? message.split(config.apiKey).join('[redacted]') : message,
        code,
      });
    } finally {
      req.removeListener('aborted', abortRequest);
      res.removeListener('close', abortUnfinishedResponse);
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const config = await loadConfig();
  const port = Number(process.env.PORT || 4317);
  const server = createApp(config);
  server.listen(port, '127.0.0.1', () =>
    console.log(
      `Idea Studio ready: http://127.0.0.1:${port}\nMode: ${config.apiKey ? 'OpenAI key configured; live testing still required' : 'Interactive preview; sample AI responses'}`,
    ),
  );
  server.on('error', (error) => {
    console.error(
      error.code === 'EADDRINUSE'
        ? `Port ${port} is already in use. Open the running prototype or choose a different PORT.`
        : error.message,
    );
    process.exitCode = 1;
  });
}
