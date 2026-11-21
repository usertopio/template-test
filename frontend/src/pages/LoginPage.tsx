import { useState, type FormEvent } from 'react';
import { useLogin } from '../api';
import Logo from '../components/Logo';
import ThemeToggle from '../components/ThemeToggle';

export default function LoginPage() {
  const login = useLogin();
  const [password, setPassword] = useState('');

  function submit(e: FormEvent) {
    e.preventDefault();
    login.mutate(password);
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="absolute top-[calc(0.5rem+env(safe-area-inset-top))] right-2">
        <ThemeToggle />
      </div>
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div>
          <h1 className="flex items-center gap-2.5 text-xl font-semibold">
            <Logo className="h-10 w-10" />
            Parzival Profile
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Enter the password to continue.</p>
        </div>
        <input
          type="password"
          autoFocus
          autoComplete="current-password"
          aria-label="Password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
        {login.error && <p className="text-sm text-red-600 dark:text-red-400">{login.error.message}</p>}
        <button
          type="submit"
          disabled={!password || login.isPending}
          className="w-full rounded-md bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {login.isPending ? 'Checking…' : 'Log in'}
        </button>
      </form>
    </div>
  );
}
