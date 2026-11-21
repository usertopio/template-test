// Builds a zip off the main thread, so the page stays responsive while large files (videos) are packed.
import { zipSync } from 'fflate';

self.onmessage = async (e: MessageEvent<{ path: string; url: string }[]>) => {
  try {
    const contents: Record<string, [Uint8Array, { level: 0 }]> = {};
    // Images, PDFs and videos are already compressed: store them as they are.
    for (const f of e.data) contents[f.path] = [new Uint8Array(await (await fetch(f.url)).arrayBuffer()), { level: 0 }];
    const zip = zipSync(contents);
    (self as unknown as Worker).postMessage({ zip }, [zip.buffer]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ error: (err as Error).message });
  }
};
