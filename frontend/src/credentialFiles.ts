// A certificate file in all three formats (PNG, JPG and PDF), whichever one was uploaded: LinkedIn and job sites
// each ask for a different one. Each is made at the best quality it can have: the PNG and PDF lose nothing, and the
// JPG (a format that always loses a little) is at its highest quality.
import { fileType } from './api';

export const CREDENTIAL_FORMATS = ['image/png', 'image/jpeg', 'application/pdf'] as const;
const EXTENSIONS: Record<(typeof CREDENTIAL_FORMATS)[number], string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'application/pdf': 'pdf' };

// A PDF page is drawn this big on its longer side (A4 at 300 dpi), so the image stays sharp when printed.
const RENDER_SIDE = 3508;
// The PDF made from an image is A4-sized on its longer side, in points.
const PDF_SIDE = 842;

/**
 * `file` plus the other two formats, in the order PNG, JPG, PDF. A PDF's images show its first page. Anything else
 * (a type checkFile let through by mistake) comes back alone.
 */
export async function credentialFormats(file: File): Promise<File[]> {
  const type = fileType(file);
  if (!CREDENTIAL_FORMATS.some((t) => t === type)) return [file];
  const canvas = type === 'application/pdf' ? await renderFirstPage(file) : await drawImage(file);
  const base = file.name.replace(/\.[^.]+$/, '') || 'certificate';
  const named = (blob: Blob, format: (typeof CREDENTIAL_FORMATS)[number]) => new File([blob], `${base}.${EXTENSIONS[format]}`, { type: format });
  const made: Record<string, () => Promise<File>> = {
    'image/png': async () => named(await toBlob(canvas, 'image/png'), 'image/png'),
    'image/jpeg': async () => named(await toBlob(canvas, 'image/jpeg'), 'image/jpeg'),
    'application/pdf': async () => named(new Blob([await imageFilePdf(file, type, canvas)]), 'application/pdf'),
  };
  // The uploaded file itself is kept as it is, not redrawn.
  return Promise.all(CREDENTIAL_FORMATS.map((format) => (format === type ? file : made[format]())));
}

/**
 * The PDF of an uploaded image. A JPG goes in byte for byte (a PDF can hold one as it is), so it isn't compressed a
 * second time; a PNG, or a JPG a PDF can't hold as it is, goes in as its exact pixels.
 */
async function imageFilePdf(file: File, type: string, canvas: HTMLCanvasElement): Promise<Uint8Array<ArrayBuffer>> {
  if (type === 'image/jpeg') {
    const jpeg = new Uint8Array(await file.arrayBuffer());
    const info = jpegInfo(jpeg);
    // CMYK would need its colors worked out, and a turned photo would show unturned: those go in as pixels.
    if (info && !info.turned && (info.components === 1 || info.components === 3)) {
      return imagePdf({ data: jpeg, width: info.width, height: info.height, colorSpace: info.components === 1 ? 'DeviceGray' : 'DeviceRGB', filter: 'DCTDecode' });
    }
  }
  const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
  const rgb = new Uint8Array(canvas.width * canvas.height * 3);
  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
    rgb[j] = data[i];
    rgb[j + 1] = data[i + 1];
    rgb[j + 2] = data[i + 2];
  }
  return imagePdf({ data: await deflate(rgb), width: canvas.width, height: canvas.height, colorSpace: 'DeviceRGB', filter: 'FlateDecode' });
}

/** zlib-compressed, which is what a PDF's FlateDecode reads; it loses nothing. */
const deflate = async (bytes: Uint8Array<ArrayBuffer>) => new Uint8Array(await new Response(new Response(bytes).body!.pipeThrough(new CompressionStream('deflate'))).arrayBuffer());

/**
 * A JPEG's size and number of color components, from its frame header, and whether its Exif orientation turns or
 * flips it (the browser shows it turned, but a PDF would show the stored pixels as they are). Nothing if it can't be read.
 */
export function jpegInfo(bytes: Uint8Array): { width: number; height: number; components: number; turned: boolean } | undefined {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return undefined;
  let turned = false;
  for (let at = 2; at + 4 <= bytes.length; ) {
    if (bytes[at] !== 0xff) return undefined;
    const marker = bytes[at + 1];
    if (marker === 0xff) {
      at++; // fill byte
      continue;
    }
    const length = (bytes[at + 2] << 8) | bytes[at + 3];
    // A frame header (SOF0–SOF15; C4, C8 and CC are other markers in that range).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: (bytes[at + 5] << 8) | bytes[at + 6], width: (bytes[at + 7] << 8) | bytes[at + 8], components: bytes[at + 9], turned };
    }
    if (marker === 0xda) return undefined; // the image data starts with no frame header before it
    if (marker === 0xe1) turned ||= exifTurns(bytes.subarray(at + 4, at + 2 + length));
    at += 2 + length;
  }
  return undefined;
}

/** An Exif block's orientation (tag 0x0112 in its first directory) is anything other than "as stored" (1). */
function exifTurns(app1: Uint8Array): boolean {
  if (String.fromCharCode(...app1.subarray(0, 6)) !== 'Exif\0\0') return false;
  const tiff = app1.subarray(6);
  const little = tiff[0] === 0x49; // "II": Intel byte order
  const u16 = (i: number) => (little ? tiff[i] | (tiff[i + 1] << 8) : (tiff[i] << 8) | tiff[i + 1]);
  const ifd = little ? u16(4) | (u16(6) << 16) : (u16(4) << 16) | u16(6);
  for (let k = 0, count = u16(ifd); k < count; k++) {
    const entry = ifd + 2 + k * 12;
    if (entry + 10 > tiff.length) return false;
    if (u16(entry) === 0x0112) return u16(entry + 8) > 1;
  }
  return false;
}

async function drawImage(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file);
  const canvas = whiteCanvas(bitmap.width, bitmap.height);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas;
}

async function renderFirstPage(file: File): Promise<HTMLCanvasElement> {
  // Loaded only here: pdf.js and its worker are large, and only a certificate PDF needs them.
  const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  try {
    const pdf = await task.promise;
    const page = await pdf.getPage(1);
    const unscaled = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: RENDER_SIDE / Math.max(unscaled.width, unscaled.height) });
    const canvas = whiteCanvas(Math.round(viewport.width), Math.round(viewport.height));
    await page.render({ canvas, viewport }).promise;
    return canvas;
  } finally {
    await task.destroy();
  }
}

/** White underneath: a transparent PNG would otherwise turn black as a JPG. */
function whiteCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  return canvas;
}

// Quality 1: the browser's default (0.92) visibly softens a certificate's fine print. PNG ignores it.
const toBlob = (canvas: HTMLCanvasElement, type: string) =>
  new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error(`Couldn't make the ${EXTENSIONS[type as keyof typeof EXTENSIONS].toUpperCase()} file`))), type, 1));

/** An image as a PDF holds it: JPEG bytes as they are (DCTDecode), or zlib-compressed pixels (FlateDecode). */
export interface PdfImage {
  data: Uint8Array;
  width: number;
  height: number;
  colorSpace: 'DeviceRGB' | 'DeviceGray';
  filter: 'DCTDecode' | 'FlateDecode';
}

/**
 * A one-page PDF showing an image, filling the page. Written by hand rather than with pdfmake: the image goes in
 * as it is, so this is a few lines and loads nothing.
 */
export function imagePdf({ data, width, height, colorSpace, filter }: PdfImage): Uint8Array<ArrayBuffer> {
  const scale = PDF_SIDE / Math.max(width, height);
  const [w, h] = [width * scale, height * scale].map((n) => Number(n.toFixed(2)));
  const draw = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`;
  const objects: (string | [string, Uint8Array, string])[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
    [`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /${colorSpace} /BitsPerComponent 8 /Filter /${filter} /Length ${data.length} >>\nstream\n`, data, '\nendstream'],
    `<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`,
  ];
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  let length = 0;
  const add = (part: string | Uint8Array) => {
    const bytes = typeof part === 'string' ? encoder.encode(part) : part;
    parts.push(bytes);
    length += bytes.length;
  };
  add('%PDF-1.4\n');
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(length);
    add(`${i + 1} 0 obj\n`);
    for (const part of typeof body === 'string' ? [body] : body) add(part);
    add('\nendobj\n');
  });
  const xref = length;
  add(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`);
  add(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(length);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
