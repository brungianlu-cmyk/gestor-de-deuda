const MONEY = /\b\d[\d.,]*,\d{2}\b/g;

export function moneyToCents(value) {
  const parts = String(value).split(',');
  const decimals = parts.pop();
  const integer = parts.join('').replace(/\D/g, '');
  return Number(integer) * 100 + Number(decimals);
}

export function formatMoney(cents) {
  return new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export function pageTextFromItems(items) {
  const rows = [];
  for (const item of items) {
    const value = item.str?.trim();
    if (!value) continue;
    const x = item.transform?.[4] ?? 0;
    const y = item.transform?.[5] ?? 0;
    let row = rows.find((entry) => Math.abs(entry.y - y) < 2.5);
    if (!row) {
      row = { y, items: [] };
      rows.push(row);
    }
    row.items.push({ x, value });
  }
  return rows.sort((a, b) => b.y - a.y)
    .map((row) => row.items.sort((a, b) => a.x - b.x).map((part) => part.value).join(' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean).join('\n');
}

function identifierFromExample(example) {
  const heading = example.split(/[:.]/)[0];
  const match = heading.match(/^\s*(?:\d+\s*[-.)]\s*)?([\p{L}][\p{L}\s]*?)\s+(?:N\s*[°ºo]?\s*)?([A-Z0-9][A-Z0-9/-]*)\s*$/iu);
  if (!match) return null;
  return { label: match[1].trim(), value: match[2] };
}

function cleanIdentifier(value) {
  return value.replace(/[.;:,]+$/, '').replace(/^0+(?=\d)/, '');
}

function parsePositions(text) {
  const positions = [];
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*(20\d{2})\s*[-–]\s*(\d{1,3})\b(.*)$/);
    if (!match) continue;
    const month = Number(match[2]);
    if (month < 1 || month > 999) continue;
    positions.push({ year: Number(match[1]), month, code: match[2] });
    const amounts = [...match[3].matchAll(MONEY)].map((entry) => moneyToCents(entry[0]));
    if (amounts.length >= 3) rows.push({ principal: amounts[0], interest: amounts[1], total: amounts[2] });
  }
  return { positions, rows };
}

function summarizePositions(positions, padMonths = true) {
  const years = new Map();
  for (const { year, month } of positions) {
    if (!years.has(year)) years.set(year, new Set());
    years.get(year).add(month);
  }
  return [...years].sort(([a], [b]) => a - b).map(([year, months]) => {
    const sorted = [...months].sort((a, b) => a - b);
    const runs = [];
    let start = sorted[0];
    let end = sorted[0];
    for (const month of sorted.slice(1)) {
      if (month <= 12 && end <= 12 && month === end + 1) end = month;
      else { runs.push([start, end]); start = end = month; }
    }
    runs.push([start, end]);
    const display = (value) => value > 12 ? String(value).padStart(3, '0') : padMonths ? String(value).padStart(2, '0') : String(value);
    const segments = runs.map(([first, last]) => first === last
      ? display(first)
      : `${display(first)} a ${display(last)}`);
    return `${segments.join(' y ')}/${year}`;
  }).join(', ');
}

function parseTotals(text) {
  for (const line of text.split(/\r?\n/)) {
    if (!/^\s*TOTAL\s*:/i.test(line)) continue;
    const amounts = [...line.matchAll(MONEY)].map((entry) => moneyToCents(entry[0]));
    if (amounts.length >= 3) return { principal: amounts[0], interest: amounts[1], total: amounts[2] };
    if (amounts.length === 1) return { total: amounts[0] };
  }
  return null;
}

function reconcileTotals(record) {
  const printed = record.totals || {};
  const completeRows = record.rows.length > 0 && record.rows.length === record.positions.length;
  const rowTotals = completeRows ? {
    principal: record.rows.reduce((sum, row) => sum + row.principal, 0),
    interest: record.rows.reduce((sum, row) => sum + row.interest, 0),
    total: record.rows.reduce((sum, row) => sum + row.total, 0),
  } : {};
  const values = {
    principal: [printed.principal, rowTotals.principal].filter(Number.isFinite),
    interest: [printed.interest, rowTotals.interest].filter(Number.isFinite),
    total: [printed.total, rowTotals.total].filter(Number.isFinite),
  };
  if (!values.total.length) return null;
  const candidates = new Map();
  for (const principal of values.principal) for (const interest of values.interest) candidates.set(`${principal}:${interest}`, { principal, interest, total: principal + interest });
  for (const total of values.total) {
    for (const interest of values.interest) candidates.set(`${total - interest}:${interest}`, { principal: total - interest, interest, total });
    for (const principal of values.principal) candidates.set(`${principal}:${total - principal}`, { principal, interest: total - principal, total });
  }
  const scored = [...candidates.values()].filter((item) => item.principal >= 0 && item.interest >= 0)
    .map((item) => ({
      ...item,
      score: ['principal', 'interest', 'total'].reduce((score, key) => score
        + (printed[key] === item[key] ? 2 : 0)
        + (rowTotals[key] === item[key] ? 2 : 0), 0),
    })).sort((a, b) => b.score - a.score);
  if (!scored.length || scored[0].score < 6 || (scored[1] && scored[0].score === scored[1].score)) return null;
  return scored[0];
}

export function extractRecords(pages, example) {
  const variable = identifierFromExample(example);
  if (!variable) return { records: [], warning: 'No pude identificar la variable del texto de ejemplo.' };
  const records = [];
  const labelPattern = variable.label.split(/\s+/).join('\\s+');
  const header = new RegExp(`^\\s*${labelPattern}\\s*:?\\s+([^\\s:]+)`, 'im');
  for (const page of pages) {
    const match = page.text.match(header);
    if (!match) continue;
    const id = cleanIdentifier(match[1]);
    const marker = page.text.match(/^\s*P[áa]gina\s*:\s*(\d+)\s*(?:[-–]|de|\s)\s*(\d+)/im);
    const previous = records.at(-1);
    const continuation = previous && marker && Number(marker[1]) > 1
      && previous.lastMarker === Number(marker[1]) - 1
      && previous.pages.at(-1) === page.number - 1;
    let record;
    if (continuation) {
      record = previous;
      if (record.id !== id) {
        const expectedLength = originalIdentifierLength(example);
        const chosen = [record.id, id].find((value) => value.length === expectedLength) || id;
        record.warnings.push(`El identificador difiere entre páginas; se usó ${chosen}.`);
        record.id = chosen;
      }
    } else if (previous?.id === id && !marker) {
      record = previous;
    } else {
      record = { label: variable.label, id, pages: [], positions: [], rows: [], totals: null, warnings: [], lastMarker: 0 };
      records.push(record);
    }
    record.pages.push(page.number);
    record.lastMarker = marker ? Number(marker[1]) : record.lastMarker + 1;
    const parsed = parsePositions(page.text);
    record.positions.push(...parsed.positions);
    record.rows.push(...parsed.rows);
    const totals = parseTotals(page.text);
    if (totals) record.totals = totals;
  }
  for (const record of records) {
    const periodExample = example.match(/(?:periodos?|cuotas)\s+(.+?)(?=,?\s+por\s+(?:la\s+suma\s+total|un\s+total)\b)/i)?.[1] || '';
    const padMonths = /(?:^|[\s,])0[1-9](?=\s+a|\/)/.test(periodExample);
    record.periods = summarizePositions(record.positions, padMonths);
    const chosen = reconcileTotals(record);
    if (!chosen) {
      record.warnings.push('Falta un total verificable.');
      continue;
    }
    for (const key of ['principal', 'interest', 'total']) {
      if (record.totals?.[key] !== undefined && record.totals[key] !== chosen[key]) {
        record.warnings.push(`El ${key === 'principal' ? 'capital' : key === 'interest' ? 'interés' : 'total'} extraído difiere; se validó ${formatMoney(chosen[key])} con los otros importes.`);
      }
    }
    record.totals = chosen;
    if (!record.periods) record.warnings.push('No se reconocieron los períodos.');
  }
  return { records, warning: null };
}

function originalIdentifierLength(example) {
  return identifierFromExample(example)?.value.length || 0;
}

function renderFromExample(example, record, ordinal) {
  const original = identifierFromExample(example);
  const totals = record.totals;
  if (!original || !record.periods || !totals || totals.principal === undefined || totals.interest === undefined || totals.total === undefined) return null;
  const periodPattern = /((?:periodos?|cuotas)\s+)(.+?)(?=,?\s+por\s+(?:la\s+suma\s+total|un\s+total)\b)/i;
  if (!periodPattern.test(example)) return null;
  if ([...example.matchAll(/\$\s*\d[\d.,]*,\d{2}/g)].length !== 3) return null;
  let rendered = example.replace(original.value, record.id).replace(/^\s*\d+\s*([-.)])\s*/, `${ordinal}${example.match(/^\s*\d+\s*([-.)])/)?.[1] || '-'} `);
  rendered = rendered.replace(periodPattern, (_match, lead) => `${lead}${record.periods}`);
  const amounts = [totals.total, totals.principal, totals.interest];
  let index = 0;
  rendered = rendered.replace(/\$\s*\d[\d.,]*,\d{2}/g, () => `$${formatMoney(amounts[index++])}`);
  return index === 3 ? rendered.trim() : null;
}

export function buildResult(pages, example) {
  const selectedExample = example.trim() || defaultExampleForPages(pages);
  const { records, warning } = extractRecords(pages, selectedExample);
  const warnings = warning ? [warning] : [];
  const paragraphs = [];
  for (const record of records) {
    const text = renderFromExample(selectedExample, record, paragraphs.length + 1);
    if (text) paragraphs.push(text);
    else warnings.push(`${record.label} ${record.id}: no se pudo generar un resumen confiable.`);
    for (const item of record.warnings) warnings.push(`${record.label} ${record.id}: ${item}`);
  }
  const rawText = pages.map(({ number, text }) => `--- Página ${number} ---\n${text}`).join('\n\n');
  return {
    text: paragraphs.length ? paragraphs.join(/^\s*\d+\s*[-.)]/.test(selectedExample) ? '\n' : '\n\n') : rawText,
    rawText,
    generated: paragraphs.length > 0,
    count: paragraphs.length,
    detected: records.length,
    label: records[0]?.label || identifierFromExample(selectedExample)?.label || 'Variable',
    warnings,
  };
}

function defaultExampleForPages(pages) {
  const content = pages.find((page) => page.text.trim())?.text || '';
  if (/^\s*DOMINIO\s*:?\s*[A-Z0-9]/im.test(content)) {
    return '1- DOMINIO OCM000: cuotas 1/2021, por la suma total de $0,00 ($0,00 en concepto de capital y $0,00 por intereses)';
  }
  if (/^\s*PARTIDA\s*:?\s*\d/im.test(content)) {
    return 'Partida N° 4132017-03. deuda en sede administrativa -periodos 01/2025, por un total de $0,00 ($0,00 privilegio general y especial y $0,00 quirografario)';
  }
  return '';
}
