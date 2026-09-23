import fs from 'node:fs';
import { join } from 'node:path';

const content = fs.readFileSync(join(process.cwd(), '.env.local'), 'utf8');
const line = content.split(/\r?\n/).find((item) => /^\s*OPENAI_API_KEY\s*=/.test(item));
const key = line?.split('=').slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
if (!key) throw new Error('Falta OPENAI_API_KEY.');
const response = await fetch('https://api.openai.com/v1/responses', {
  method: 'POST',
  headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'gpt-6-luna',
    instructions: 'Devolvé una línea por identificador. Conservá números exactamente.',
    input: JSON.stringify({ example: '1- DOMINIO AAA111: cuotas 1/2025, por la suma total de $150,00 ($100,00 en concepto de capital y $50,00 por intereses)', records: [{ id: 'BBB222', periods: '2/2025', total: '150,00', principal: '100,00', interest: '50,00' }] }),
    text: { format: { type: 'json_schema', name: 'debt_lines', strict: true, schema: { type: 'object', additionalProperties: false, properties: { items: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { id: { type: 'string' }, text: { type: 'string' } }, required: ['id', 'text'] } } }, required: ['items'] } } },
  }),
  signal: AbortSignal.timeout(30000),
});
const body = await response.json();
console.log(JSON.stringify({
  status: response.status,
  model: body.model || null,
  output: body.output?.flatMap((item) => item.content || []).map((item) => item.text || '').join('').slice(0, 400) || null,
  errorCode: body.error?.code || null,
}));
