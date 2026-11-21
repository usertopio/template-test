import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyText } from '../../src/clipboard';

afterEach(() => vi.unstubAllGlobals());

describe('copyText', () => {
  it('uses the Clipboard API on https and localhost', async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    vi.stubGlobal('isSecureContext', true);
    await copyText('hello');
    expect(writeText).toHaveBeenCalledWith('hello');
  });

  it('falls back to a hidden text box over plain http', async () => {
    vi.stubGlobal('isSecureContext', false);
    let selected = '';
    document.execCommand = vi.fn(() => {
      selected = (document.activeElement as HTMLTextAreaElement | null)?.value ?? document.querySelector('textarea')?.value ?? '';
      return true;
    });
    await copyText('over http');
    expect(selected).toBe('over http');
    expect(document.querySelector('textarea')).toBeNull(); // cleaned up
    (document.execCommand as ReturnType<typeof vi.fn>).mockReturnValue(false);
    await expect(copyText('x')).rejects.toThrow('Copying is blocked');
  });
});
