// Fonts, bundled offline (all OFL), at the weights the handoff loads:
// Fira Sans 300-700 + 400 italic (UI), Quicksand 300-700 (display),
// JetBrains Mono 400/500/700 (mono). Box-drawing, block, geometric and
// arrow glyphs are outside the @fontsource subsets; mono-symbols.css serves
// them from range cuts of the JetBrains Mono webfonts, so 120-column rows
// hold. The build keeps only the latin and latin-ext faces of each import,
// woff2 only (trimFontsource in vite.config.mjs).
import '@fontsource/fira-sans/300.css';
import '@fontsource/fira-sans/400.css';
import '@fontsource/fira-sans/400-italic.css';
import '@fontsource/fira-sans/500.css';
import '@fontsource/fira-sans/600.css';
import '@fontsource/fira-sans/700.css';
import '@fontsource/quicksand/300.css';
import '@fontsource/quicksand/400.css';
import '@fontsource/quicksand/500.css';
import '@fontsource/quicksand/600.css';
import '@fontsource/quicksand/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/700.css';
import './mono-symbols.css';
