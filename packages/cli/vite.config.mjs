import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// nexus.css stays verbatim from the Claude Design handoff. Two of its element
// resets (.nx button/input/textarea/select { font: inherit; color: inherit }
// and .nx :focus-visible { outline }) carry more specificity than the
// single-class component rules after them, so a <button class="btn
// btn-primary"> lost its ink and weight, a .pause-btn, .switcher, .tug-opt
// or .tool-btn its type size, and the composer's textarea drew a focus box
// inside the composer's own focus glow. The handoff already patches the <a>
// cases by hand (.nx a.btn, .nx a.btn-primary, .nx a.btn-ghost). Here the
// two resets are wrapped in :where() at build time, so every component rule
// wins as written. Logged as a skipped pattern in design/handoff/README.md.
export const CASCADE_REPAIRS = [
  ['.nx button, .nx input, .nx textarea, .nx select {', ':where(.nx) :where(button, input, textarea, select) {'],
  ['.nx :focus-visible {', ':where(.nx) :focus-visible {'],
];

export function repairCascade(css) {
  let out = css;
  for (const [from, to] of CASCADE_REPAIRS) {
    if (!out.includes(from)) throw new Error(`nexus.css no longer has "${from}": revisit the cascade repair in vite.config.mjs`);
    out = out.replace(from, to);
  }
  return out;
}

const cascadeRepair = {
  name: 'nexus-css-cascade-repair',
  enforce: 'pre',
  transform(code, id) {
    if (!/[\/]styles[\/]nexus\.css(\?|$)/.test(id)) return null;
    return { code: repairCascade(code), map: null };
  },
};

// The UI is prebuilt into dist/ and shipped in the package; the server
// serves it as static files. No runtime bundler, no CDN.
export default defineConfig({
  root: 'src',
  // Absolute asset paths, so reloading a deep link (/s/vega, /onboarding/detect)
  // still finds /assets/*; the server answers every extensionless path with index.html.
  base: '/',
  plugins: [cascadeRepair, react()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    sourcemap: false,
    // Never inline fonts as data: URIs: the page's CSP (server.mjs) allows
    // fonts from 'self' only, so an inlined subset (JetBrains Mono's small
    // cyrillic-ext and vietnamese files) was refused and its glyphs fell back.
    assetsInlineLimit: (file) => (/\.(woff2?|ttf|otf)$/.test(file) ? false : undefined),
  },
});
