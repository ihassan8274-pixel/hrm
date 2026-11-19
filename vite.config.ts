import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
    build: {
      // Split the heavy, rarely-changing libraries out of the app chunk so a
      // code change in a screen does not invalidate 1MB+ of vendor code in
      // every user's browser cache.
      //
      // jsPDF/html2canvas are deliberately NOT listed here. Naming them in
      // manualChunks made Rollup hoist Vite's dynamic-import preload helper
      // (__vitePreload) into that same chunk, so every React.lazy() call ended
      // up statically importing it — dragging the whole 594KB PDF bundle into
      // the initial page load. Left to Rollup, they stay behind the lazy
      // boundary in PdfExportModal and only load when a PDF is exported.
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom', 'react-dom/client'],
            charts: ['recharts'],
            animation: ['framer-motion', 'motion'],
            qrcode: ['qrcode'],
          },
        },
      },
      // Screens are code-split via React.lazy in App.tsx, so the largest
      // remaining chunk is vendor code. This ceiling only guards against a
      // regression that silently re-inlines every screen again.
      chunkSizeWarningLimit: 700,
    },
  };
});
