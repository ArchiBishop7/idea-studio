import { createApp, loadConfig } from '../server.mjs';
const config = await loadConfig();
const app = createApp({ ...config, hosted: true });
const handle = app.listeners('request')[0];
// The published prototype is public. Provider credentials stay on the server;
// visitors do not need the owner's Vercel account or a shared HTTP password.
export default function handler(req, res) {
  return handle(req, res);
}
