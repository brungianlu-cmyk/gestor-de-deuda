import fs from 'node:fs';
import { join } from 'node:path';

const content = fs.readFileSync(join(process.cwd(), '.env.local'), 'utf8');
const line = content.split(/\r?\n/).find((item) => /^\s*OPENAI_API_KEY\s*=/.test(item));
const key = line?.split('=').slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
if (!key) throw new Error('OPENAI_API_KEY no está configurada.');

const model = process.argv[2] || 'gpt-6-luna';
const response = await fetch(`https://api.openai.com/v1/models/${encodeURIComponent(model)}`, {
  headers: { Authorization: `Bearer ${key}` },
  signal: AbortSignal.timeout(15000),
});
const body = await response.json().catch(() => ({}));
console.log(JSON.stringify({ status: response.status, model: body.id || model, errorCode: body.error?.code || null }));
