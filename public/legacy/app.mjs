import * as pdfjs from './vendor/pdfjs/pdf.min.mjs';
import { buildResult, pageTextFromItems } from './parse-debt.mjs';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;

const $ = (id) => document.getElementById(id);
const fileInput = $('file');
const dropzone = $('dropzone');
const runButton = $('runBtn');
const exampleInput = $('example');

function placeholderHeight() {
  const measure = exampleInput.cloneNode();
  measure.removeAttribute('id');
  measure.setAttribute('aria-hidden', 'true');
  measure.tabIndex = -1;
  measure.value = exampleInput.placeholder;
  Object.assign(measure.style, {
    position: 'absolute',
    visibility: 'hidden',
    pointerEvents: 'none',
    width: `${exampleInput.getBoundingClientRect().width}px`,
    height: '0px',
    minHeight: '0px',
  });
  exampleInput.parentElement.appendChild(measure);
  const style = getComputedStyle(measure);
  const height = measure.scrollHeight + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
  measure.remove();
  return height;
}

function resizeExample() {
  const baseHeight = parseFloat(getComputedStyle(exampleInput).minHeight) || 75;
  exampleInput.style.height = `${baseHeight}px`;
  const contentHeight = exampleInput.value ? exampleInput.scrollHeight : placeholderHeight();
  exampleInput.style.height = `${Math.max(baseHeight, contentHeight)}px`;
}

exampleInput.addEventListener('input', resizeExample);
window.addEventListener('resize', resizeExample);
resizeExample();

let selectedFile = null;
let activeResult = null;
let cancelled = false;
let ocrWorker = null;
let aiController = null;

function showToast(message) {
  $('toast').textContent = message;
  $('toast').classList.add('show');
  setTimeout(() => $('toast').classList.remove('show'), 1700);
}

function chooseFile(file) {
  if (!file) return;
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    showToast('Adjuntá un archivo PDF');
    return;
  }
  selectedFile = file;
  $('uploadDefault').style.display = 'none';
  $('fileReady').style.display = 'flex';
  $('fileName').textContent = file.name;
  $('fileSize').textContent = `${(file.size / 1024 / 1024).toFixed(1)} MB · listo para procesar`;
  activeResult = null;
  $('output').style.display = 'none';
  $('empty').style.display = 'block';
}

fileInput.addEventListener('change', (event) => chooseFile(event.target.files[0]));
for (const name of ['dragenter', 'dragover']) dropzone.addEventListener(name, (event) => {
  event.preventDefault();
  dropzone.classList.add('drag');
});
for (const name of ['dragleave', 'drop']) dropzone.addEventListener(name, (event) => {
  event.preventDefault();
  dropzone.classList.remove('drag');
});
dropzone.addEventListener('drop', (event) => {
  const file = event.dataTransfer.files[0];
  if (file) chooseFile(file);
});

function progress(page, total, stage) {
  $('stage').textContent = `${stage} · página ${page} de ${total}`;
  $('progress').style.width = `${Math.max(3, Math.round(page / total * 100))}%`;
}

async function getOcrWorker() {
  if (ocrWorker) return ocrWorker;
  $('stage').textContent = 'Cargando OCR en español por primera vez…';
  if (!globalThis.Tesseract?.createWorker) throw new Error('No se pudo cargar el motor OCR local. Actualizá la página e intentá de nuevo.');
  const base = new URL('./vendor/tesseract/', import.meta.url);
  ocrWorker = await Tesseract.createWorker('spa', 1, {
    workerPath: new URL('worker.min.js', base).href,
    corePath: new URL('core/', base).href,
    langPath: new URL('lang', base).href,
    workerBlobURL: false,
    cacheMethod: 'write',
  });
  await ocrWorker.setParameters({
    tessedit_pageseg_mode: '3',
    preserve_interword_spaces: '1',
    user_defined_dpi: '250',
  });
  return ocrWorker;
}

async function recognizePage(page, pageNumber, total) {
  const viewportAtOne = page.getViewport({ scale: 1 });
  const targetScale = navigator.deviceMemory && navigator.deviceMemory <= 4 ? 3.2 : 4.2;
  const scale = Math.min(targetScale, 5000 / Math.max(viewportAtOne.width, viewportAtOne.height));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Este navegador no permite preparar la página para OCR.');
  try {
    progress(pageNumber, total, 'Aplicando OCR local');
    await page.render({ canvasContext: context, canvas, viewport }).promise;
    const worker = await getOcrWorker();
    const response = await worker.recognize(canvas);
    return { text: response.data.text?.trim() || '', confidence: response.data.confidence || 0 };
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

function shouldUseOcr(text) {
  return text.trim().length < 90 || (text.match(/\p{L}/gu) || []).length < 35;
}

async function extractPdf(file) {
  const data = new Uint8Array(await file.arrayBuffer());
  const task = pdfjs.getDocument({
    data,
    cMapUrl: new URL('./vendor/pdfjs/cmaps/', import.meta.url).href,
    standardFontDataUrl: new URL('./vendor/pdfjs/standard_fonts/', import.meta.url).href,
    wasmUrl: new URL('./vendor/pdfjs/wasm/', import.meta.url).href,
  });
  const pdf = await task.promise;
  const pages = [];
  const warnings = [];
  let recognized = 0;
  let direct = 0;
  try {
    for (let number = 1; number <= pdf.numPages; number++) {
      if (cancelled) throw new Error('Procesamiento cancelado.');
      progress(number, pdf.numPages, 'Leyendo el PDF');
      const page = await pdf.getPage(number);
      let text = '';
      let method = 'text';
      try {
        const content = await page.getTextContent();
        text = pageTextFromItems(content.items);
        if (shouldUseOcr(text)) {
          const ocr = await recognizePage(page, number, pdf.numPages);
          if (ocr.text) {
            text = ocr.text;
            method = 'ocr';
            recognized++;
            if (ocr.confidence < 60) warnings.push(`Página ${number}: OCR de baja confianza (${Math.round(ocr.confidence)}%).`);
          } else warnings.push(`Página ${number}: no se reconoció texto.`);
        } else direct++;
        pages.push({ number, text, method });
      } finally {
        page.cleanup();
      }
      if (number % 3 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
    }
    return { pages, warnings, recognized, direct };
  } finally {
    await pdf.destroy();
  }
}

async function callAI(payload) {
  aiController = new AbortController();
  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: aiController.signal,
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'La IA no respondió.');
    return body;
  } finally {
    aiController = null;
  }
}

async function enhanceWithAI(result, pages) {
  if (!result.usedExample) return result;
  const numbered = /^\s*\d+\s*[-.)]/.test(result.usedExample);
  if (result.items.length) {
    const output = [];
    let corrected = 0;
    for (let offset = 0; offset < result.items.length; offset += 8) {
      if (cancelled) throw new Error('Procesamiento cancelado.');
      $('stage').textContent = `GPT‑6 Luna · casos ${offset + 1} a ${Math.min(offset + 8, result.items.length)} de ${result.items.length}`;
      $('progress').style.width = `${Math.round((offset / result.items.length) * 100)}%`;
      const records = result.items.slice(offset, offset + 8).map((item, index) => ({ ...item, ordinal: offset + index + 1 }));
      const response = await callAI({ mode: 'records', example: result.usedExample, records });
      output.push(...response.items.map((item) => item.text));
      corrected += response.corrected || 0;
    }
    if (output.length !== result.items.length) throw new Error('La IA omitió casos.');
    result.text = output.join(numbered ? '\n' : '\n\n');
    result.aiUsed = true;
    result.aiCorrected = corrected;
    if (corrected) result.warnings.push(`${corrected} líneas de IA no pasaron la verificación de importes y se reemplazaron por el texto local.`);
    return result;
  }
  const found = new Map();
  const chunks = [];
  for (let index = 0; index < pages.length; index += 3) chunks.push(pages.slice(index, index + 3).map(({ number, text }) => ({ number, text: text.slice(0, 25000) })));
  for (let index = 0; index < chunks.length; index++) {
    if (cancelled) throw new Error('Procesamiento cancelado.');
    $('stage').textContent = `GPT‑6 Luna · bloque ${index + 1} de ${chunks.length}`;
    $('progress').style.width = `${Math.round((index / chunks.length) * 100)}%`;
    const response = await callAI({ mode: 'pages', example: result.usedExample, pages: chunks[index] });
    for (const item of response.items) if (!found.has(item.id)) found.set(item.id, item.text);
  }
  if (!found.size) throw new Error('La IA no identificó casos completos en este documento.');
  const lines = [...found.values()].map((text, index) => numbered
    ? `${index + 1}- ${text.replace(/^\s*\d+\s*[-.)]\s*/, '')}` : text);
  result.text = lines.join(numbered ? '\n' : '\n\n');
  result.count = lines.length;
  result.generated = true;
  result.label = 'IA';
  result.aiUsed = true;
  result.warnings.push('La IA extrajo casos de un formato no reconocido localmente. Comprobá los importes con el PDF.');
  return result;
}

function showResult(extraction, result, aiError = null) {
  activeResult = result;
  activeResult.warnings.unshift(...extraction.warnings);
  $('loading').style.display = 'none';
  $('output').style.display = 'block';
  $('resultText').textContent = activeResult.text;
  $('count').textContent = String(activeResult.count);
  $('kind').textContent = activeResult.generated ? activeResult.label : 'Texto extraído';
  $('ocrCount').textContent = `${extraction.direct} páginas con texto · ${extraction.recognized} con OCR`;
  $('ocrCount').style.display = 'inline-block';
  $('aiStatus').textContent = activeResult.aiUsed ? 'GPT‑6 Luna aplicado' : aiError ? 'IA no disponible' : 'Procesamiento local';
  $('aiStatus').style.display = 'inline-block';
  const notice = $('notice');
  const messages = [];
  if (aiError) messages.push(`La IA no completó el proceso: ${aiError}. Se muestra el resultado local.`);
  if (!result.usedExample && !activeResult.generated) messages.push('Se extrajo el texto. Escribí un ejemplo para intentar redactar los casos con su estructura.');
  else if (!activeResult.generated) messages.push('No se identificó una estructura verificable. Se muestra el texto extraído para que puedas revisarlo.');
  else if (activeResult.count < activeResult.detected) messages.push(`Se redactaron ${activeResult.count} de ${activeResult.detected} casos detectados. Descargá el texto extraído para revisar los restantes.`);
  if (activeResult.warnings.length) {
    messages.push(`${activeResult.warnings.length} observaciones para revisar antes de usar el texto.`);
    messages.push(...activeResult.warnings.slice(0, 4));
  }
  notice.textContent = messages.join('\n');
  notice.style.display = messages.length ? 'block' : 'none';
  $('rawBtn').hidden = false;
}

async function stopProcessing() {
  cancelled = true;
  aiController?.abort();
  if (ocrWorker) {
    await ocrWorker.terminate();
    ocrWorker = null;
  }
}

runButton.addEventListener('click', async () => {
  if (runButton.dataset.running === 'true') {
    await stopProcessing();
    return;
  }
  if (!selectedFile) return showToast('Primero adjuntá un PDF');
  cancelled = false;
  activeResult = null;
  runButton.dataset.running = 'true';
  runButton.innerHTML = '<span>Cancelar</span><i class="ph ph-x"></i>';
  $('empty').style.display = 'none';
  $('output').style.display = 'none';
  $('loading').style.display = 'block';
  $('progress').style.width = '3%';
  $('stage').textContent = 'Abriendo el PDF…';
  try {
    const extraction = await extractPdf(selectedFile);
    if (cancelled) throw new Error('Procesamiento cancelado.');
    $('stage').textContent = 'Validando importes y redactando…';
    const result = buildResult(extraction.pages, $('example').value.trim());
    let aiError = null;
    if (result.usedExample) {
      try { await enhanceWithAI(result, extraction.pages); }
      catch (error) {
        if (cancelled) throw error;
        aiError = error instanceof Error ? error.message : 'Error desconocido';
      }
    }
    if (cancelled) throw new Error('Procesamiento cancelado.');
    showResult(extraction, result, aiError);
  } catch (error) {
    $('loading').style.display = 'none';
    $('empty').style.display = 'block';
    $('empty').querySelector('strong').textContent = error.message || 'No se pudo procesar el documento.';
    $('empty').querySelector('p').textContent = cancelled ? 'Podés iniciar el procesamiento cuando quieras.' : 'Revisá que el archivo sea un PDF válido e intentá de nuevo.';
  } finally {
    if (ocrWorker) {
      await ocrWorker.terminate();
      ocrWorker = null;
    }
    runButton.dataset.running = 'false';
    runButton.innerHTML = '<span>Generar texto</span><i class="ph ph-arrow-right"></i>';
  }
});

$('copyBtn').addEventListener('click', async () => {
  if (!activeResult) return showToast('Todavía no hay resultado');
  await navigator.clipboard.writeText(activeResult.text);
  showToast('Texto copiado');
});

function downloadText(text, name) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast('Descarga iniciada');
}

$('downloadBtn').addEventListener('click', () => {
  if (!activeResult) return showToast('Todavía no hay resultado');
  downloadText(activeResult.text, 'deuda-estructurada.txt');
});

$('rawBtn').addEventListener('click', () => {
  if (!activeResult) return;
  downloadText(activeResult.rawText, 'texto-extraido-ocr.txt');
});
