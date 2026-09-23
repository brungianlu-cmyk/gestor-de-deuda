import fs from 'node:fs';
import { buildResult } from '../src/parse-debt.mjs';

const raw = fs.readFileSync(process.argv[2], 'utf8');
const parts = raw.split(/--- Página (\d+) ---\r?\n/).slice(1);
const pages = [];
for (let index = 0; index < parts.length; index += 2) pages.push({ number: Number(parts[index]), text: parts[index + 1].trim() });
const result = buildResult(pages, '');
const records = result.items.slice(0, 4).map((item, index) => ({ ...item, ordinal: index + 1 }));
const response = await fetch('http://localhost:4181/api/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ mode: 'records', example: result.usedExample, records }),
});
const body = await response.json();
console.log(JSON.stringify({ status: response.status, model: body.model || null, returned: body.items?.length || 0, corrected: body.corrected || 0, error: body.error || null }));
