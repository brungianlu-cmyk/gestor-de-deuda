import { copyFileSync, cpSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const root = process.cwd();
const copy = (source, target) => {
  const destination = join(root, 'dist', target);
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(join(root, source), destination);
};

copy('src/parse-debt.mjs', 'parse-debt.mjs');
copy('node_modules/pdfjs-dist/build/pdf.min.mjs', 'vendor/pdfjs/pdf.min.mjs');
copy('node_modules/pdfjs-dist/build/pdf.worker.min.mjs', 'vendor/pdfjs/pdf.worker.min.mjs');
for (const directory of ['cmaps', 'standard_fonts', 'wasm']) {
  cpSync(join(root, 'node_modules', 'pdfjs-dist', directory), join(root, 'dist', 'vendor', 'pdfjs', directory), { recursive: true });
}
copy('node_modules/tesseract.js/dist/tesseract.min.js', 'vendor/tesseract/tesseract.min.js');
copy('node_modules/tesseract.js/dist/worker.min.js', 'vendor/tesseract/worker.min.js');
for (const variant of ['', '-simd', '-lstm', '-simd-lstm']) {
  copy(`node_modules/tesseract.js-core/tesseract-core${variant}.wasm.js`, `vendor/tesseract/core/tesseract-core${variant}.wasm.js`);
  copy(`node_modules/tesseract.js-core/tesseract-core${variant}.wasm`, `vendor/tesseract/core/tesseract-core${variant}.wasm`);
}
copy('node_modules/@tesseract.js-data/spa/4.0.0/spa.traineddata.gz', 'vendor/tesseract/lang/spa.traineddata.gz');
console.log('Local PDF and Spanish OCR assets ready.');
