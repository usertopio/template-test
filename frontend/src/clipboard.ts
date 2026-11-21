/**
 * Copy text. Uses the Clipboard API, which browsers only offer on https and localhost; opened over
 * plain http (e.g. from a phone on the same Wi-Fi), falls back to selecting a hidden text box.
 */
export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
  const box = document.createElement('textarea');
  box.value = text;
  box.setAttribute('readonly', '');
  box.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
  document.body.appendChild(box);
  box.select();
  const ok = document.execCommand('copy');
  box.remove();
  if (!ok) throw new Error('Copying is blocked in this browser');
}
