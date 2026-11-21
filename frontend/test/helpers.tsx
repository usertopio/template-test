import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { vi } from 'vitest';

/**
 * Stub fetch with canned JSON per GET path (e.g. '/api/sections/organizations') or per
 * "<METHOD> <path>" for other methods (e.g. 'POST /api/media'); records every request.
 */
export function mockApi(routes: Record<string, unknown>) {
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const key = method === 'GET' ? url : `${method} ${url}`;
    if (key in routes) return Response.json(routes[key]);
    return Response.json({ error: `No mock for ${method} ${url}` }, { status: 500 });
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

/** Render inside a fresh React Query client (no retries, so failures show up at once). */
export function renderWithQuery(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}
