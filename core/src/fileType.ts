import type { MediaMimeType } from '@profile/shared';

const SIGNATURES: [MediaMimeType, number[]][] = [
  ['image/jpeg', [0xff, 0xd8, 0xff]],
  ['image/png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  ['application/pdf', [0x25, 0x50, 0x44, 0x46, 0x2d]], // "%PDF-"
  ['video/webm', [0x1a, 0x45, 0xdf, 0xa3]], // EBML (WebM/Matroska)
];

const ascii = (data: Uint8Array, from: number, to: number) => String.fromCharCode(...data.subarray(from, to));

/**
 * Plain text: valid UTF-8 (a BOM allowed) with no control characters but tab, line breaks and form feed. Binary
 * files have those (or invalid UTF-8) within their first bytes, so they aren't taken for text. Checked by hand:
 * core has no TextDecoder (see core/tsconfig.json).
 */
function isText(data: Uint8Array): boolean {
  if (!data.length) return false;
  let i = data[0] === 0xef && data[1] === 0xbb && data[2] === 0xbf ? 3 : 0;
  while (i < data.length) {
    const b = data[i];
    if (b < 0x80) {
      if ((b < 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0c && b !== 0x0d) || b === 0x7f) return false;
      i++;
      continue;
    }
    // A lead byte, then that many continuation bytes (0x80–0xBF).
    const more = b >= 0xc2 && b <= 0xdf ? 1 : b >= 0xe0 && b <= 0xef ? 2 : b >= 0xf0 && b <= 0xf4 ? 3 : 0;
    if (!more || i + more >= data.length) return false;
    for (let k = 1; k <= more; k++) if ((data[i + k] & 0xc0) !== 0x80) return false;
    i += more + 1;
  }
  return true;
}

/** The file's real type from its first bytes (the name and the browser's claimed type can lie). */
export function detectMediaType(data: Uint8Array): MediaMimeType | undefined {
  const match = SIGNATURES.find(([, sig]) => sig.every((byte, i) => data[i] === byte))?.[0];
  if (match) return match;
  // MP4 and QuickTime: a box of type "ftyp" at offset 4, then the brand ("qt  " for .mov).
  if (data.length >= 12 && ascii(data, 4, 8) === 'ftyp') return ascii(data, 8, 12) === 'qt  ' ? 'video/quicktime' : 'video/mp4';
  if (isText(data)) return 'text/plain';
  return undefined;
}
