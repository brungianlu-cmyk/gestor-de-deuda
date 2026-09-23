const response = await fetch('http://localhost:4181/api/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    mode: 'records',
    example: '1- DOMINIO AAA111: cuotas 1/2025, por la suma total de $150,00 ($100,00 en concepto de capital y $50,00 por intereses)',
    records: [{
      ordinal: 1,
      id: 'BBB222',
      label: 'DOMINIO',
      periods: '2/2025',
      total: '150,00',
      principal: '100,00',
      interest: '50,00',
      text: '1- DOMINIO BBB222: cuotas 2/2025, por la suma total de $150,00 ($100,00 en concepto de capital y $50,00 por intereses)',
    }],
  }),
});
const body = await response.json();
console.log(JSON.stringify({ status: response.status, model: body.model || null, corrected: body.corrected || 0, items: body.items || null, error: body.error || null }));
