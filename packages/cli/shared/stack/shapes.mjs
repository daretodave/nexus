// The shape of each value a stack card asks for (stack hand-off, design section 3). A shape is checked locally, before
// anything is saved or sent: it says what the value should look like, never what it is. `checkShape(id, value)`
// returns { ok, kind: 'ok' | 'legacy' | 'warn' | 'bad', note?, why? } and never echoes the value or any part of it.
//
// Shared by the server (save refuses a bad shape, check makes no request for one) and the client (the paste field's
// one-line hint), so both say the same thing.

/**
 * A copy of server/secrets.mjs's PUBLIC_NAME: a name with one of these prefixes ships to the browser. A test asserts
 * the two stay identical.
 */
export const PUBLIC_NAME = /^(?:NEXT_PUBLIC_|PUBLIC_|VITE_|REACT_APP_|EXPO_PUBLIC_|NUXT_PUBLIC_|GATSBY_)/;

/** False when a secret would get a public name: a secret never ships to the browser. */
export function publicSafe(name, secret) {
  return !(secret && PUBLIC_NAME.test(String(name)));
}

import { MORE_SHAPES } from './shapes-more.mjs';

const JWT = /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/;

/**
 * Each shape: { re, hint, legacy?: { re, note }, warn?: [{ re, note }], tip?: [{ re, note }], reject?: [{ re, why }],
 * other?: { re, note }, compact?: 'json' }. `hint` is the plain line the field shows when the value does not match; a `warn` passes with
 * its note; a `tip` is a quiet note on a value that is fine; `other` is a value outside `re` that still passes.
 */
export const SHAPES = {
  hostname: {
    re: /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/,
    hint: 'A bare domain, like example.com.',
    reject: [{ re: /^www\./, why: 'Use the bare domain; we add www for you.' }],
  },
  cloudflareToken: {
    re: /^cf(ut|at)_[A-Za-z0-9_-]{20,}$/,
    hint: 'Cloudflare tokens start cfut_ or cfat_, or are 40 letters and digits.',
    legacy: { re: /^[A-Za-z0-9_-]{40}$/, note: 'An older token format; it still works.' },
  },
  hex32: {
    re: /^[a-f0-9]{32}$/,
    hint: 'A 32-character id of digits and the letters a to f.',
  },
  supabaseUrl: {
    re: /^https:\/\/[a-z0-9]{20}\.supabase\.co\/?$/,
    hint: 'The project URL looks like https://<ref>.supabase.co.',
    other: { re: /^https:\/\/[a-z0-9.-]+\.[a-z]{2,}\/?$/, note: 'A custom domain works, but Check it only knows supabase.co URLs.' },
  },
  supabaseRef: {
    re: /^[a-z0-9]{20}$/,
    hint: 'A project ref is 20 lower-case letters and digits.',
  },
  supabasePublishable: {
    re: /^sb_publishable_[A-Za-z0-9_-]{10,}$/,
    hint: 'The publishable key starts sb_publishable_.',
    legacy: { re: JWT, note: 'This is a legacy anon key. It works until the end of 2026; the new sb_publishable_ key is better.' },
    reject: [{ re: /^sb_secret_/, why: 'That is the secret key. It goes in the field below, never in a public name.' }],
  },
  supabaseSecret: {
    re: /^sb_secret_[A-Za-z0-9_-]{10,}$/,
    hint: 'The secret key starts sb_secret_.',
    legacy: { re: JWT, note: 'This is a legacy service_role key. It works until the end of 2026; the new sb_secret_ key is better.' },
    reject: [{ re: /^sb_publishable_/, why: 'That is the publishable key. It goes in the field above.' }],
  },
  postgresUrl: {
    re: /^postgres(ql)?:\/\/[^:\s]+:[^@\s]+@[^:/\s]+:(5432|6543)\/[A-Za-z0-9_]+(\?\S*)?$/,
    hint: 'A connection string like postgresql://user:password@host:6543/postgres.',
    reject: [{ re: /\[YOUR-PASSWORD\]/, why: 'Put your database password in place of [YOUR-PASSWORD].' }],
    warn: [
      { re: /@db\.[a-z0-9]{20}\.supabase\.co:5432/, note: 'Direct connections are IPv6 only and do not suit Vercel. Use the transaction pooler (6543).' },
      { re: /^postgres(ql)?:\/\/[^:\s]+:[^@\s]*[#?][^@\s]*@/, note: 'The password has a # or ? in it. Percent-encode it (%23, %3F) or the URL breaks.' },
    ],
    tip: [{ re: /:6543\//, note: 'Transaction pooler: right for Vercel. For Prisma add ?pgbouncer=true.' }],
  },
  supabasePat: {
    re: /^sbp_[A-Za-z0-9_]{20,}$/,
    hint: 'A Supabase access token starts sbp_.',
  },
  vercelToken: {
    re: /^vc[pikar]_[A-Za-z0-9]{16,}$/,
    hint: 'A Vercel token starts vcp_, or is an older 24-character one.',
    legacy: { re: /^[A-Za-z0-9]{24}$/, note: 'An older token format; it still works.' },
  },
  vercelTeam: {
    re: /^team_[A-Za-z0-9]{8,40}$/,
    hint: 'A team id starts team_.',
    legacy: { re: /^[A-Za-z0-9]{16,40}$/, note: 'A personal account id.' },
  },
  vercelProject: {
    re: /^prj_[A-Za-z0-9]{8,48}$/,
    hint: 'A project id starts prj_.',
  },
  ...MORE_SHAPES,
};

/** The value as it is checked and saved: trimmed; a hostname also loses a scheme and a trailing slash, lower-cased. */
export function normalize(id, value) {
  let v = typeof value === 'string' ? value.trim() : '';
  if (id === 'hostname') v = v.replace(/^https?:\/\//i, '').replace(/\/+$/, '').toLowerCase();
  // A JSON key file (a service account's) is stored as one line: parsed and written back with no spaces, so the
  // escaped \n inside its private key stays escaped and nothing spans lines. A paste that is not JSON is left as is.
  if (SHAPES[id]?.compact === 'json' && v) { try { v = JSON.stringify(JSON.parse(v)); } catch { /* the shape's own hint says what is wrong */ } }
  return v;
}

/** Check a value against a shape. Never returns the value or a piece of it. */
export function checkShape(id, value) {
  const s = SHAPES[id];
  if (!s) return { ok: false, kind: 'bad', why: 'nexus does not know this value\'s shape.' };
  if (typeof value !== 'string' || !value.trim()) return { ok: false, kind: 'bad', why: s.hint };
  // A compact shape (a JSON key) folds to one line first; every other value must already be one.
  const v = normalize(id, value);
  if (/[\r\n\0]/.test(s.compact ? v : value.trim())) return { ok: false, kind: 'bad', why: s.compact ? s.hint : 'A value goes on one line.' };
  for (const r of s.reject || []) if (r.re.test(v)) return { ok: false, kind: 'bad', why: r.why };
  if (s.re.test(v)) {
    for (const w of s.warn || []) if (w.re.test(v)) return { ok: true, kind: 'warn', note: w.note };
    const tip = (s.tip || []).find((w) => w.re.test(v));
    return tip ? { ok: true, kind: 'ok', note: tip.note } : { ok: true, kind: 'ok' };
  }
  if (s.legacy && s.legacy.re.test(v)) return { ok: true, kind: 'legacy', note: s.legacy.note };
  if (s.other && s.other.re.test(v)) return { ok: true, kind: 'warn', note: s.other.note };
  return { ok: false, kind: 'bad', why: s.hint };
}
