import { useState } from 'react';
import { flushSync } from 'react-dom';

type Theme = 'dark' | 'light';

/** How long the fallback color fade lasts; matches .theme-changing in index.css. */
const FADE_MS = 350;

/**
 * Toggles the `dark` class on <html>; the initial class is set in index.html (dark by default).
 * The switch cross-fades (a view transition, or a color fade where those aren't supported), unless the
 * system asks for reduced motion.
 */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() =>
    document.documentElement.classList.contains('dark') ? 'dark' : 'light',
  );

  function apply(next: Theme) {
    document.documentElement.classList.toggle('dark', next === 'dark');
    // Mobile browser toolbar color
    document.querySelector<HTMLMetaElement>('meta[name=theme-color]')?.setAttribute('content', next === 'dark' ? '#0f172a' : '#ffffff');
    try {
      localStorage.setItem('theme', next);
    } catch {
      // storage unavailable (private mode); the choice just won't persist
    }
    // Synchronously, so the icon is already swapped in the view transition's "after" picture.
    flushSync(() => setTheme(next));
  }

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    const root = document.documentElement;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return apply(next);
    if (document.startViewTransition) return void document.startViewTransition(() => apply(next));
    root.classList.add('theme-changing');
    apply(next);
    setTimeout(() => root.classList.remove('theme-changing'), FADE_MS);
  }

  const label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
  return (
    <button
      onClick={toggle}
      title={label}
      aria-label={label}
      className="rounded-md p-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
    >
      {theme === 'dark' ? (
        // sun
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        // moon
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      )}
    </button>
  );
}
