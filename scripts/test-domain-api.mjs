import fs from 'node:fs';
import path from 'node:path';
import { buildResult } from '../src/parse-debt.mjs';

if (!process.argv[2] || !process.argv[3]) throw new Error('Uso: node scripts/test-domain-api.mjs texto-extraido.txt documento-original.pdf');
const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:4181';
const raw = fs.readFileSync(process.argv[2], 'utf8');
const parts = raw.split(/--- Página (\d+) ---\r?\n/).slice(1);
const pages = [];
for (let index = 0; index < parts.length; index += 2) pages.push({ number: Number(parts[index]), text: parts[index + 1].trim() });
const result = buildResult(pages, '');
const pageText = new Map(pages.map((page) => [page.number, page.text]));
const records = result.items.slice(0, 4).map((item, index) => ({ ...item, ordinal: index + 1,
  sourceExcerpt: item.pages.map((number) => pageText.get(number) || '').join('\n').slice(0, 6000) }));
const upload = await fetch(new URL('/api/history', baseUrl), {
  method: 'POST',
  headers: { 'Content-Type': 'application/pdf', 'X-File-Name': encodeURIComponent(path.basename(process.argv[3])) },
  body: fs.readFileSync(process.argv[3]),
});
const created = await upload.json();
if (!upload.ok || !created.id) throw new Error(created.error || 'No se pudo archivar el PDF de prueba.');
const response = await fetch(new URL('/api/generate', baseUrl), {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ runId: created.id, callIndex: 1, mode: 'records', example: result.usedExample, extraInstructions: '', records }),
});
const body = await response.json();
await fetch(new URL(`/api/history/${created.id}`, baseUrl), {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(response.ok
    ? { status: 'completed', resultText: body.items?.map((item) => item.text).join('\n') || 'Sin resultado', caseCount: body.items?.length || 0, aiUsed: true }
    : { status: 'failed', error: body.error || 'La prueba de IA falló.' }),
});
console.log(JSON.stringify({ status: response.status, returned: body.items?.length || 0, corrected: body.corrected || 0, error: body.error || null }));
