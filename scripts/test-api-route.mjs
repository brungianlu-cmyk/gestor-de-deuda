const baseUrl = process.env.TEST_BASE_URL || 'http://127.0.0.1:4173';
const pdf = new TextEncoder().encode('%PDF-1.4\n% Prueba ficticia de la ruta API\n%%EOF');
const upload = await fetch(new URL('/api/history', baseUrl), {
  method: 'POST',
  headers: { 'Content-Type': 'application/pdf', 'X-File-Name': 'prueba-api.pdf' },
  body: pdf,
});
const created = await upload.json();
if (!upload.ok || !created.id) throw new Error(created.error || 'No se pudo crear el registro de prueba.');

const response = await fetch(new URL('/api/generate', baseUrl), {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    runId: created.id,
    callIndex: 1,
    mode: 'records',
    example: '1- DOMINIO AAA111: cuotas 1/2025, por la suma total de $150,00 ($100,00 en concepto de capital y $50,00 por intereses)',
    extraInstructions: 'Conservá las particularidades de cada caso indicadas en el documento.',
    records: [{
      ordinal: 1,
      id: 'BBB222',
      label: 'DOMINIO',
      periods: '2/2025',
      total: '150,00',
      principal: '100,00',
      interest: '50,00',
      text: '1- DOMINIO BBB222: cuotas 2/2025, por la suma total de $150,00 ($100,00 en concepto de capital y $50,00 por intereses)',
      sourceExcerpt: 'DOMINIO BBB222. Cuotas 2/2025. Total $150,00.',
    }],
  }),
});
const body = await response.json();
await fetch(new URL(`/api/history/${created.id}`, baseUrl), {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(response.ok
    ? { status: 'completed', resultText: body.items?.map((item) => item.text).join('\n') || 'Sin resultado', caseCount: body.items?.length || 0, aiUsed: true }
    : { status: 'failed', error: body.error || 'La prueba de IA falló.' }),
});
console.log(JSON.stringify({ status: response.status, corrected: body.corrected || 0,
  items: body.items || null, error: body.error || null, code: body.code || null }));
if (!response.ok || !Array.isArray(body.items) || body.items.length !== 1) process.exitCode = 1;
