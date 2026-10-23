// The frameworks a stack card knows (design section 5.1): which dependency marks each, the prefix its browser code
// reads public env under, and the file it loads env from. Order matters: the first hit wins (a Next app also depends
// on react, a SvelteKit app also on vite).
import { PUBLIC_NAME, publicSafe } from './shapes.mjs';

export const FRAMEWORKS = [
  { id: 'next', label: 'Next.js', deps: ['next'], prefix: 'NEXT_PUBLIC_', file: '.env.local', also: ['.env'], port: 3000 },
  { id: 'nuxt', label: 'Nuxt', deps: ['nuxt'], prefix: 'NUXT_PUBLIC_', file: '.env', also: [], port: 3000 },
  { id: 'sveltekit', label: 'SvelteKit', deps: ['@sveltejs/kit'], prefix: 'PUBLIC_', file: '.env', also: ['.env.local'], port: 5173 },
  { id: 'astro', label: 'Astro', deps: ['astro'], prefix: 'PUBLIC_', file: '.env', also: ['.env.local'], port: 4321 },
  { id: 'remix', label: 'Remix', deps: ['@remix-run/dev', '@react-router/dev'], prefix: '', file: '.env', also: [], port: 5173 },
  { id: 'expo', label: 'Expo', deps: ['expo'], prefix: 'EXPO_PUBLIC_', file: '.env', also: [], port: 8081 },
  { id: 'gatsby', label: 'Gatsby', deps: ['gatsby'], prefix: 'GATSBY_', file: '.env.development', also: [], port: 8000 },
  { id: 'cra', label: 'Create React App', deps: ['react-scripts'], prefix: 'REACT_APP_', file: '.env.local', also: [], port: 3000 },
  { id: 'vite', label: 'Vite', deps: ['vite'], prefix: 'VITE_', file: '.env.local', also: ['.env'], port: 5173 },
  { id: 'node', label: 'Node', deps: [], prefix: '', file: '.env', also: [], port: 3000 },
];

/** The framework by id (unknown ids read as Next.js, the default for a fresh folder). */
export function frameworkById(id) {
  return FRAMEWORKS.find((f) => f.id === id) || FRAMEWORKS[0];
}

/** The framework a package.json's dependencies name: the first hit in table order, else 'node'. */
export function detectFramework(pkg) {
  const deps = { ...(pkg && typeof pkg === 'object' ? pkg.dependencies : null), ...(pkg && typeof pkg === 'object' ? pkg.devDependencies : null) };
  const hit = FRAMEWORKS.find((f) => f.deps.some((d) => Object.prototype.hasOwnProperty.call(deps, d)));
  return hit ? hit.id : 'node';
}

/**
 * The env names one recipe value becomes in a framework: its public base under the framework's prefix (when it has
 * one), then its server name. A secret never gets a public name; a value whose public and server names come out the
 * same (a framework with no public prefix) is written once.
 */
export function envNamesFor(value, framework) {
  const fw = typeof framework === 'string' ? frameworkById(framework) : framework || FRAMEWORKS[0];
  const out = [];
  const env = value && value.env ? value.env : {};
  if (env.public && !value.secret) out.push(`${fw.prefix}${env.public}`);
  if (env.server) out.push(env.server);
  return [...new Set(out)].filter((n) => publicSafe(n, !!value.secret));
}

/** Whether a name ships to the browser (a public prefix). */
export const isPublicName = (name) => PUBLIC_NAME.test(String(name));
