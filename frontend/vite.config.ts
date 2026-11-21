import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // The React Compiler memoizes components and values automatically (no hand-written useMemo/useCallback).
  plugins: [react({ babel: { plugins: ['babel-plugin-react-compiler'] } }), tailwindcss()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3001' },
  },
});
