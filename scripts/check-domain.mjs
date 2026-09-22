import fs from 'node:fs';
import { dirname } from 'node:path';
import { buildResult } from '../src/parse-debt.mjs';

const source = process.argv[2];
if (!source) throw new Error('Uso: node scripts/check-domain.mjs resultado-ocr.txt');
const raw = fs.readFileSync(source, 'utf8');
const pages = raw.split(/--- Página (\d+) ---\r?\n/).slice(1);
const parsed = [];
for (let index = 0; index < pages.length; index += 2) parsed.push({ number: Number(pages[index]), text: pages[index + 1].trim() });
const example = '1- DOMINIO OCM515: cuotas 5 a 6/2021, 1 a 6/2022, 1 a 6/2023, 1 a 6/2024, por la suma total de $275.627,25 ($145.462,52 en concepto de capital y $130.164,73 por intereses)';
for (const selected of [example, '']) {
  const result = buildResult(parsed, selected);
  if (selected && process.argv[3]) {
    fs.mkdirSync(dirname(process.argv[3]), { recursive: true });
    fs.writeFileSync(process.argv[3], `${result.text}\n`, 'utf8');
  }
  console.log(JSON.stringify({
    pages: parsed.length,
    withExample: Boolean(selected),
    detected: result.detected,
    generated: result.count,
    first: result.text.split('\n').filter(Boolean).slice(0, 4),
    warnings: result.warnings.slice(0, 8),
  }, null, 2));
}
