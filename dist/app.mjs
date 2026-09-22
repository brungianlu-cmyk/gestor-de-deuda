import * as pdfjs from './vendor/pdfjs/pdf.min.mjs';
import { buildResult, pageTextFromItems } from './parse-debt.mjs';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;

const $ = (id) => document.getElementById(id);
const fileInput = $('file');
const dropzone = $('dropzone');
const runButton = $('runBtn');
let selectedFile = null;
let activeResult = null;
let cancelled = false;
let ocrWorker = null;

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

function showResult(extraction, example) {
  activeResult = buildResult(extraction.pages, example);
  activeResult.warnings.unshift(...extraction.warnings);
  $('loading').style.display = 'none';
  $('output').style.display = 'block';
  $('resultText').textContent = activeResult.text;
  $('count').textContent = String(activeResult.count);
  $('kind').textContent = activeResult.generated ? activeResult.label : 'Texto extraído';
  $('ocrCount').textContent = `${extraction.direct} páginas con texto · ${extraction.recognized} con OCR`;
  $('ocrCount').style.display = 'inline-block';
  const notice = $('notice');
  const messages = [];
  if (!example.trim()) messages.push('Se extrajo el texto. Escribí un ejemplo para intentar redactar los casos con su estructura.');
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
    showResult(extraction, $('example').value.trim());
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
