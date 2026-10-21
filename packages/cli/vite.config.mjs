import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The UI is prebuilt into dist/ and shipped in the package; the server
// serves it as static files. No runtime bundler, no CDN.
export default defineConfig({
  root: 'src',
  // Absolute asset paths, so reloading a deep link (/s/vega, /onboarding/detect)
  // still finds /assets/*; the server answers every extensionless path with index.html.
  base: '/',
  plugins: [react()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    sourcemap: false,
  },
});
