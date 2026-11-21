// Images embedded in Word, Excel and PDF exports: scaled down so a document of photos stays small.

export interface ExportImage {
  data: Uint8Array;
  type: 'png' | 'jpg';
  width: number;
  height: number;
}

/** Longest side, in pixels, of an embedded image (plenty for a page width). */
const MAX_SIDE = 1600;

/** Width and height from a PNG or JPEG's header, without decoding it. */
export function imageSize(data: Uint8Array): { width: number; height: number } | null {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  // PNG: the IHDR chunk follows the 8-byte signature.
  if (data.length >= 24 && data[0] === 0x89 && data[1] === 0x50) return { width: view.getUint32(16), height: view.getUint32(20) };
  // JPEG: walk the segments to the first SOFn (start of frame) marker.
  if (data[0] === 0xff && data[1] === 0xd8) {
    let i = 2;
    while (i + 9 < data.length) {
      if (data[i] !== 0xff) return null;
      const marker = data[i + 1];
      const length = view.getUint16(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { width: view.getUint16(i + 7), height: view.getUint16(i + 5) };
      i += 2 + length;
    }
  }
  return null;
}

/** Scale a large image down in the browser (a canvas); null where that isn't possible (tests, old browsers). */
async function downscale(blob: Blob, width: number, height: number, type: ExportImage['type']): Promise<ExportImage | null> {
  if (Math.max(width, height) <= MAX_SIDE || typeof createImageBitmap === 'undefined' || typeof OffscreenCanvas === 'undefined') return null;
  const scale = MAX_SIDE / Math.max(width, height);
  const size = { width: Math.round(width * scale), height: Math.round(height * scale) };
  const bitmap = await createImageBitmap(blob, { resizeWidth: size.width, resizeHeight: size.height, resizeQuality: 'high' });
  const canvas = new OffscreenCanvas(size.width, size.height);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
  bitmap.close();
  // Photos stay JPEG; PNGs (screenshots, transparency) stay PNG.
  const out = await canvas.convertToBlob({ type: type === 'png' ? 'image/png' : 'image/jpeg', quality: 0.85 });
  return { data: new Uint8Array(await out.arrayBuffer()), type, ...size };
}

/** A JPG or PNG ready to embed, from its (blob) URL; null if it can't be read. */
export async function loadImage(url: string, mimeType: string): Promise<ExportImage | null> {
  const blob = await (await fetch(url)).blob();
  const data = new Uint8Array(await blob.arrayBuffer());
  const type = mimeType === 'image/png' ? 'png' : 'jpg';
  const size = imageSize(data);
  if (!size) return null;
  return (await downscale(blob, size.width, size.height, type).catch(() => null)) ?? { data, type, ...size };
}

/** Fit an image in a box, keeping its shape. */
export function fit(image: { width: number; height: number }, maxWidth: number, maxHeight: number) {
  const scale = Math.min(1, maxWidth / image.width, maxHeight / image.height);
  return { width: Math.round(image.width * scale), height: Math.round(image.height * scale) };
}
