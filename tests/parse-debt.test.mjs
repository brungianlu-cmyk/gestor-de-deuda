import assert from 'node:assert/strict';
import test from 'node:test';
import { buildResult, moneyToCents, pageTextFromItems } from '../src/parse-debt.mjs';

test('conserva códigos de posición especiales y corrige un total mediante los renglones', () => {
  const example = 'Partida N° 4132017-03. deuda en sede administrativa -periodos 06/2023, por un total de $100,00 ($80,00 privilegio general y especial y $20,00 quirografario)';
  const pages = [{ number: 1, text: 'Página: 1-1\nPARTIDA: 00004132215-01\n2025 - 090 6.206,16 30/04/2025 1.500,90 7.707,06\nTOTAL: 6.206,16 1.500,90 7.107,06' }];
  const result = buildResult(pages, example);
  assert.equal(result.count, 1);
  assert.match(result.text, /Partida N° 4132215-01/);
  assert.match(result.text, /periodos 090\/2025/);
  assert.match(result.text, /\$7\.707,06 \(\$6\.206,16/);
  assert.ok(result.warnings.length > 0);
});

test('adapta la misma estructura a un dominio', () => {
  const example = 'Dominio N° ABC123. deuda en sede administrativa -periodos 01/2025, por un total de $150,00 ($100,00 privilegio general y especial y $50,00 quirografario)';
  const pages = [{ number: 1, text: 'Página: 1-1\nDOMINIO: ABC124\n2025 - 009 100,00 01/10/2025 50,00 150,00\nTOTAL: 100,00 50,00 150,00' }];
  const result = buildResult(pages, example);
  assert.equal(result.count, 1);
  assert.match(result.text, /Dominio N° ABC124/);
  assert.match(result.text, /periodos 09\/2025/);
});

test('genera una lista numerada de dominios aun sin ejemplo escrito', () => {
  const pages = [
    { number: 1, text: 'Página: 1 2\nDOMINIO OCM515 -31\n2021 - 005 100,00 20/10/2021 50,00 150,00\nTOTAL: 100,00 50,00 150,00' },
    { number: 2, text: 'Página: 2 2\nDOMINIO OCM515 -31\nTexto legal de continuación' },
    { number: 3, text: 'Página: 1 1\nDOMINIO OCM516 -41\n2021 - 006 100,00 20/12/2021 50,00 150,00\nTOTAL: 100,00 50,00 150,00' },
  ];
  const result = buildResult(pages, '');
  assert.equal(result.count, 2);
  assert.match(result.text, /^1- DOMINIO OCM515: cuotas 5\/2021/);
  assert.match(result.text, /\n2- DOMINIO OCM516: cuotas 6\/2021/);
});

test('admite identificadores con etiquetas de varias palabras', () => {
  const example = 'Cuenta corriente N° 100-A. deuda en sede administrativa -periodos 01/2025, por un total de $150,00 ($100,00 privilegio general y especial y $50,00 quirografario)';
  const pages = [{ number: 1, text: 'CUENTA CORRIENTE: 101-B\n2025 - 001 100,00 01/02/2025 50,00 150,00\nTOTAL: 100,00 50,00 150,00' }];
  const result = buildResult(pages, example);
  assert.equal(result.count, 1);
  assert.match(result.text, /Cuenta corriente N° 101-B/);
});

test('nunca inventa un resumen cuando falta una plantilla reconocible', () => {
  const pages = [{ number: 1, text: 'Texto reconocido de una página escaneada.' }];
  const result = buildResult(pages, '');
  assert.equal(result.generated, false);
  assert.match(result.text, /Texto reconocido/);
});

test('interpreta separadores monetarios defectuosos de la capa de texto', () => {
  assert.equal(moneyToCents('1.004,183,98'), 100418398);
});

test('ordena los fragmentos de PDF por línea y columna', () => {
  const items = [
    { str: 'TOTAL:', transform: [1, 0, 0, 1, 10, 10] },
    { str: '150,00', transform: [1, 0, 0, 1, 100, 10] },
    { str: 'PARTIDA:', transform: [1, 0, 0, 1, 10, 30] },
  ];
  assert.equal(pageTextFromItems(items), 'PARTIDA:\nTOTAL: 150,00');
});
