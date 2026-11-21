import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router';
import { SECTIONS } from '@profile/shared';
import { downloadExport, useHealth } from './api';
import SectionPage from './components/SectionPage';
import ThemeToggle from './components/ThemeToggle';
import AboutPage from './pages/AboutPage';
import PostsPage from './pages/PostsPage';

export default function App() {
  const health = useHealth();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const current = SECTIONS.find((s) => location.pathname === `/${s.key}`);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => setDrawerOpen(false), [location.pathname]);

  // Esc closes the drawer; lock page scroll behind it.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDrawerOpen(false);
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [drawerOpen]);

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-slate-200 bg-white/90 px-2 pt-[env(safe-area-inset-top)] backdrop-blur md:hidden dark:border-slate-800 dark:bg-slate-900/90">
        <button
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
          aria-expanded={drawerOpen}
          className="rounded-md p-2.5 text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <span className="flex-1 truncate py-3 font-semibold">{current?.label ?? 'Parzival Profile'}</span>
        <ThemeToggle />
      </header>

      {/* Mobile drawer */}
      <div className={`fixed inset-0 z-40 md:hidden ${drawerOpen ? '' : 'pointer-events-none'}`} inert={!drawerOpen}>
        <div
          onClick={() => setDrawerOpen(false)}
          className={`absolute inset-0 bg-slate-950/60 transition-opacity ${drawerOpen ? 'opacity-100' : 'opacity-0'}`}
        />
        <aside
          className={`absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] shadow-xl transition-transform dark:bg-slate-900 ${drawerOpen ? 'translate-x-0' : '-translate-x-full'}`}
        >
          <div className="flex items-center justify-between py-3 pl-5 pr-2">
            <span className="font-semibold">Parzival Profile</span>
            <button
              onClick={() => setDrawerOpen(false)}
              aria-label="Close menu"
              className="rounded-md p-2.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
          <SidebarContent />
        </aside>
      </div>

      {/* Desktop sidebar */}
      <aside className="hidden border-r border-slate-200 bg-white md:sticky md:top-0 md:flex md:h-dvh md:w-56 md:flex-col dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between py-3 pl-5 pr-3">
          <span className="font-semibold">Parzival Profile</span>
          <ThemeToggle />
        </div>
        <SidebarContent />
      </aside>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 pt-4 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:pt-6 md:px-8 md:pb-8">
        {health.error && (
          <div className="mb-6 rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 p-4 text-sm text-amber-900 dark:text-amber-200">
            <strong>Google Sheets not connected:</strong> {health.error.message}
            <div className="mt-1 text-xs">Check server/.env and that the sheet is shared with the service account (see README).</div>
          </div>
        )}
        <Routes>
          <Route path="/" element={<Navigate to="/about" replace />} />
          {SECTIONS.map((s) => {
            const Page = s.singleton ? AboutPage : s.key === 'posts' ? PostsPage : SectionPage;
            return <Route key={s.key} path={`/${s.key}`} element={<Page key={s.key} section={s} />} />;
          })}
          <Route path="*" element={<Navigate to="/about" replace />} />
        </Routes>
      </main>
    </div>
  );
}

/** Section links + export, shared by the desktop sidebar and the mobile drawer. */
function SidebarContent() {
  const [exportError, setExportError] = useState('');

  return (
    <>
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 pb-3">
        {SECTIONS.map((s) => (
          <NavLink
            key={s.key}
            to={`/${s.key}`}
            className={({ isActive }) =>
              `rounded-md px-3 py-2.5 text-base md:py-2 md:text-sm ${isActive ? 'bg-blue-50 dark:bg-blue-500/15 font-medium text-blue-700 dark:text-blue-400' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`
            }
          >
            {s.label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-slate-200 px-3 py-3 dark:border-slate-800">
        <button
          onClick={() => downloadExport().then(() => setExportError(''), (e: Error) => setExportError(e.message))}
          className="w-full rounded-md border border-slate-300 dark:border-slate-700 px-3 py-2.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 md:py-2"
        >
          Export JSON
        </button>
        {exportError && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{exportError}</p>}
      </div>
    </>
  );
}
