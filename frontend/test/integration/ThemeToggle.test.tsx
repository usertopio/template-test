// The theme switch fades between dark and light instead of jumping.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ThemeToggle from '../../src/components/ThemeToggle';

const root = document.documentElement;
const reducedMotion = (reduce: boolean) => vi.stubGlobal('matchMedia', (q: string) => ({ matches: reduce && q.includes('reduce') }));

beforeEach(() => {
  root.className = 'dark';
  reducedMotion(false);
});
afterEach(() => {
  delete (document as { startViewTransition?: unknown }).startViewTransition;
  vi.useRealTimers();
});

describe('ThemeToggle', () => {
  it('switches inside a view transition where the browser has them', async () => {
    const start = vi.fn((update: () => void) => update());
    Object.assign(document, { startViewTransition: start });
    render(<ThemeToggle />);
    await userEvent.click(screen.getByRole('button', { name: 'Switch to light mode' }));
    expect(start).toHaveBeenCalledOnce();
    expect(root).not.toHaveClass('dark');
    expect(screen.getByRole('button', { name: 'Switch to dark mode' })).toBeInTheDocument();
  });

  it('otherwise fades the colors for a moment', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<ThemeToggle />);
    await userEvent.click(screen.getByRole('button', { name: 'Switch to light mode' }));
    expect(root).toHaveClass('theme-changing');
    expect(root).not.toHaveClass('dark');
    vi.advanceTimersByTime(400);
    expect(root).not.toHaveClass('theme-changing');
  });

  it('switches at once when the system asks for reduced motion', async () => {
    reducedMotion(true);
    const start = vi.fn();
    Object.assign(document, { startViewTransition: start });
    render(<ThemeToggle />);
    await userEvent.click(screen.getByRole('button', { name: 'Switch to light mode' }));
    expect(start).not.toHaveBeenCalled();
    expect(root).not.toHaveClass('theme-changing');
    expect(root).not.toHaveClass('dark');
  });
});
