import { Suspense, lazy, useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router';
import { Settings } from 'lucide-react';
import { SECTIONS, type SectionDef } from '@profile/shared';
import { ApiError, downloadExport, setToken, useAuthStatus, useEntries, useHealth, useToken } from './api';
import LanguageToggle from './components/LanguageSwitch';
import Logo from './components/Logo';
import ProfileExport from './components/ProfileExport';
import SectionPage, { EntryTotal } from './components/SectionPage';
import ThemeToggle from './components/ThemeToggle';
import { ToolsSlots } from './components/ToolsPanel';
import { useSettings } from './settings';
// Pages other than the generic list load on demand, keeping the first download small.
const AboutPage = lazy(() => import('./pages/AboutPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const PostsPage = lazy(() => import('./pages/PostsPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));

const pageFallback = <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>;

export default function App() {
  const health = useHealth();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Where pages put their tools: elements, held in state so pages re-render once they're there.
  const [panelSlot, setPanelSlot] = useState<HTMLElement | null>(null);
  const [topBarSlot, setTopBarSlot] = useState<HTMLElement | null>(null);
  const current = SECTIONS.find((s) => location.pathname === `/${s.key}`);
  const startPage = `/${useSettings().startPage}`;

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

  const authStatus = useAuthStatus();
  const token = useToken();
  if (authStatus.isPending) {
    return <p className="flex min-h-dvh items-center justify-center px-4 text-center text-sm text-slate-500 dark:text-slate-400">Connecting to the server…</p>;
  }
  if (authStatus.data?.required && !token) {
    return (
      <Suspense fallback={pageFallback}>
        <LoginPage />
      </Suspense>
    );
  }

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
        <Logo />
        <span className="flex min-w-0 flex-1 items-center gap-2 py-3 font-semibold">
          <span className="truncate">{current?.label ?? (location.pathname === '/settings' ? 'Settings' : 'Parzival Profile')}</span>
          {current && !current.singleton && <TopBarTotal section={current} />}
        </span>
        {/* A list page's tools button goes here (see ToolsSlots). */}
        <div ref={setTopBarSlot} className="contents" />
        <LanguageToggle />
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
            <span className="flex items-center gap-2 font-semibold">
              <Logo />
              Parzival Profile
            </span>
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
          <span className="flex items-center gap-2 font-semibold">
            <Logo />
            Parzival Profile
          </span>
          <ThemeToggle />
        </div>
        <div className="px-5 pb-3">
          <LanguageToggle />
        </div>
        <SidebarContent />
      </aside>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 pt-4 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:pt-6 md:px-8 md:pb-8">
        {health.error && (
          <div className="mb-6 rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 p-4 text-sm text-amber-900 dark:text-amber-200">
            {health.error instanceof ApiError && health.error.status === 0 ? (
              health.error.message
            ) : (
              <>
                <strong>Google Sheets not connected:</strong> {health.error.message}
                <div className="mt-1 text-xs">Check the server's environment variables and that the sheet is shared with the service account (see README).</div>
              </>
            )}
          </div>
        )}
        <Suspense fallback={pageFallback}>
          <ToolsSlots value={{ panel: panelSlot, topBar: topBarSlot }}>
            <Routes>
              <Route path="/" element={<Navigate to={startPage} replace />} />
              {SECTIONS.map((s) => {
                const Page = s.singleton ? AboutPage : s.key === 'posts' ? PostsPage : SectionPage;
                return <Route key={s.key} path={`/${s.key}`} element={<Page key={s.key} section={s} />} />;
              })}
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to={startPage} replace />} />
            </Routes>
          </ToolsSlots>
        </Suspense>
      </main>
      {/* A list page's tools panel: a column on the right on wide screens (see ToolsPanel). */}
      <div ref={setPanelSlot} className="contents" />
    </div>
  );
}

/** The open list page's total, in the phone's top bar (the page's own heading is hidden there). */
function TopBarTotal({ section }: { section: SectionDef }) {
  // The same query as the page's, so nothing extra is fetched.
  const { data } = useEntries(section.key);
  return data ? <EntryTotal count={data.length} /> : null;
}

/** Section links + export, shared by the desktop sidebar and the mobile drawer. */
function SidebarContent() {
  const [exportError, setExportError] = useState('');
  const token = useToken();

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
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `mb-2 flex items-center gap-2 rounded-md px-3 py-2.5 text-sm md:py-2 ${isActive ? 'bg-blue-50 font-medium text-blue-700 dark:bg-blue-500/15 dark:text-blue-400' : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`
          }
        >
          <Settings size={16} aria-hidden />
          Settings
        </NavLink>
        <ProfileExport />
        <button
          onClick={() => downloadExport().then(() => setExportError(''), (e: Error) => setExportError(e.message))}
          className="w-full rounded-md border border-slate-300 dark:border-slate-700 px-3 py-2.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 md:py-2"
        >
          Export JSON
        </button>
        {exportError && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{exportError}</p>}
        {token && (
          <button
            onClick={() => setToken('')}
            className="mt-2 w-full rounded-md px-3 py-2.5 text-sm text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 md:py-2"
          >
            Log out
          </button>
        )}
      </div>
    </>
  );
}
