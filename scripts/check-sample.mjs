import fs from 'node:fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { buildResult, extractRecords, formatMoney, pageTextFromItems } from '../src/parse-debt.mjs';

const pdfPath = process.argv[2];
const examplePath = process.argv[3];
if (!pdfPath || !examplePath) throw new Error('Uso: node scripts/check-sample.mjs documento.pdf ejemplo.txt');

const data = new Uint8Array(fs.readFileSync(pdfPath));
const pdf = await pdfjs.getDocument({ data, disableFontFace: true }).promise;
const pages = [];
for (let number = 1; number <= pdf.numPages; number++) {
  const page = await pdf.getPage(number);
  pages.push({ number, text: pageTextFromItems((await page.getTextContent()).items) });
  page.cleanup();
}
const example = fs.readFileSync(examplePath, 'utf8').split('\n')[0].trim();
const result = buildResult(pages, example);
const expectedLines = fs.readFileSync(examplePath, 'utf8').split('\n').map((line) => line.trim()).filter(Boolean);
const expectedById = new Map(expectedLines.map((line) => [line.match(/N°\s*([^\s.]+)/)?.[1], line]));
const producedLines = result.text.split('\n\n');
const exactMatches = producedLines.filter((line) => expectedById.get(line.match(/N°\s*([^\s.]+)/)?.[1]) === line);
const missingIds = producedLines.filter((line) => !expectedById.has(line.match(/N°\s*([^\s.]+)/)?.[1]));
console.log(JSON.stringify({
  pages: pdf.numPages,
  detected: result.detected,
  generated: result.count,
  exactMatches: exactMatches.length,
  missingIds: missingIds.map((line) => line.match(/N°\s*([^\s.]+)/)?.[1]),
  firstParagraph: result.text.split('\n\n')[0],
  warnings: result.warnings.slice(0, 10),
  warningCounts: Object.entries(extractRecords(pages, example).records.reduce((counts, r) => {
    for (const warning of r.warnings) counts[warning] = (counts[warning] || 0) + 1;
    return counts;
  }, {})).sort((a, b) => b[1] - a[1]).slice(0, 8),
  diagnostics: extractRecords(pages, example).records.slice(0, 20).map((r) => ({
    id: r.id,
    pages: r.pages,
    rows: r.rows.length,
    rowPrincipal: formatMoney(r.rows.reduce((sum, row) => sum + row.principal, 0)),
    rowInterest: formatMoney(r.rows.reduce((sum, row) => sum + row.interest, 0)),
    rowTotal: formatMoney(r.rows.reduce((sum, row) => sum + row.total, 0)),
    totals: r.totals && Object.fromEntries(Object.entries(r.totals).map(([key, cents]) => [key, formatMoney(cents)])),
    warnings: r.warnings,
  })),
}, null, 2));
