// scripts/plan/order.mjs: the plan in /next's pick order, simulated. What /plot shows before and after it slots a
// task, what `/next peek` reasons from, and the GUI's "next up" sort.
//
// /next picks the first listed chunk whose `needs` are all done, taking specs in this order: the **Asap** lane in
// order, then `priority N` rows (1 first), then the roadmap table's order. It skips the **Held** lane, `plan only`
// specs, a spec on another base, and every chunk someone else claims or holds. This script plays that forward: it
// picks, counts the pick as done, and picks again, so the list reads as the order the chunks get built in, with a
// running estimate from their sizes (S 1 h, M 2.5 h, L 5 h). What can't be reached (a need nothing will close, a held
// spec) is listed after, with why. A pending close counts as closed; reading the working tree, a pending file's
// `## Edit` or `## Add` of the roadmap or a spec counts as applied (the settled view, as plan-check reads it), so a plot's own rows
// and chunks show before they settle. Each chunk in `--json` carries the parsed line (plan-check's parseChunk), so its
// `secrets` (the names it needs, never values; [] when none) ride along for /next and the GUI.
//
// The secret gate: a chunk with a `secrets` field is the owner's alone, so a contributor checkout lists it apart as
// `owner only`. In the owner's, a chunk whose secret the vault lacks (no ring holds it and the environment doesn't set
// it: a cloud tick gets its secrets as env) parks as `needs secret <names>` (`needsSecret` in --json) until the owner
// sets it; `node scripts/secrets.mjs request <id>` files the ask. Names only: the vault is asked where a name is set,
// never what it is. `--no-vault` skips the vault check (the contributor rule stays).
//
//   node scripts/plan/order.mjs [--ref origin/main] [--mark 34.1,34.2] [--limit 12] [--no-vault] [--json]
//
// --mark flags chunks as "just plotted" (/plot's after picture; a pending `## Add`'s `07.?slug` reads as the number it
// settles as); --ref reads the plan at a ref instead of the files; --limit (a whole number from 1, 12 when left out)
// caps the next-up list the text view prints. Anything else after --limit (a word, 0, a negative, a fraction,
// nothing) prints usage and exits 64, never an empty list.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { SPEC_FILE, parseSpec } from '../plan-check.mjs';
import { pendingCloses } from './pending.mjs';
import { HOURS, planReader } from './progress.mjs';

const ID = /\b\d{2,}\.\w+\b/g;

/** The README's lanes: the chunk ids (and spec numbers) under its **Asap** and **Held** headings, in order. */
export function lanes(readme) {
  const out = { asap: [], held: [] };
  let lane = null;
  for (const line of readme.split(/\r?\n/)) {
    if (/^\*\*Asap\b/.test(line)) lane = 'asap';
    else if (/^\*\*Held\b/.test(line)) lane = 'held';
    else if (/^(##|\*\*)/.test(line)) lane = null;
    else if (lane && /^\s*- /.test(line) && !/\(none/.test(line)) {
      const ids = line.match(ID) ?? [];
      // A line naming no chunk names a spec (`- 9 (waits on the owner, 2026-10-20)`): its number, as files spell it.
      const specs = ids.length ? [] : (line.match(/\b\d+\b/g) ?? []).slice(0, 1).map((n) => n.padStart(2, '0'));
      out[lane].push(...ids, ...specs);
    }
  }
  return out;
}

/** The roadmap table's rows: { num, file, priority, planOnly, base }, in table order. The number is the linked
 * file's (`01-bootstrap.md`), since the # column may spell it `1`. */
export function rows(readme) {
  const out = [];
  for (const line of readme.split(/\r?\n/)) {
    const m = /^\|\s*\d+\s*\|.*?\]\(((\d{2,})-[^)]+\.md)\)/.exec(line);
    if (!m) continue;
    // The status column (# | Initiative | Spec | Status | Progress) carries the markers, never the initiative's words.
    const status = line.split('|')[4] ?? '';
    const pr = /\bpriority (\d+)\b/i.exec(status);
    const base = /\bbase ([\w./-]+)/.exec(status);
    out.push({ num: m[2], file: m[1], priority: pr ? Number(pr[1]) : null, planOnly: /\bplan only\b/i.test(status), base: base ? base[1] : null });
  }
  return out;
}

/**
 * The simulated pick order. `specs` are parseSpec results; `closed` the ids a pending close already closes; `claims`
 * maps an id to { who, mine } for live claims. Returns { inFlight, next, blocked }: `next` in build order with a
 * running estimate in hours, `blocked` with why. `secrets` is the secret gate, { contributor, missing(names) -> the
 * names not set } (null: no gate).
 */
export function simulate({ readme, specs, closed = new Set(), claims = {}, base = null, secrets = null }) {
  const { asap, held } = lanes(readme);
  const table = rows(readme);
  const bySpec = new Map(specs.map((s) => [s.num, s]));
  const listed = new Map();
  for (const s of specs) for (const c of s.chunks) if (!closed.has(c.id)) listed.set(c.id, { ...c, spec: s.num });
  const done = (id) => !listed.has(id);
  const heldSpec = (num) => held.includes(num);
  const order = [...table].sort((a, b) => (a.priority ?? Infinity) - (b.priority ?? Infinity));
  const skipSpec = new Map();
  for (const r of table) {
    if (heldSpec(r.num)) skipSpec.set(r.num, 'held');
    else if (r.planOnly) skipSpec.set(r.num, 'plan only');
    else if ((r.base ?? null) !== base) skipSpec.set(r.num, `base ${r.base ?? 'main'}`);
  }
  const inFlight = [];
  const blocked = [];
  const pool = [];
  for (const c of listed.values()) {
    const claim = claims[c.id] ?? claims[c.spec];
    if (claim && !claim.mine) inFlight.push({ ...c, who: claim.who });
    else if (held.includes(c.id)) blocked.push({ ...c, why: 'held' });
    else if (skipSpec.has(c.spec)) blocked.push({ ...c, why: skipSpec.get(c.spec) });
    else if (secrets && c.secrets?.length && secrets.contributor) blocked.push({ ...c, why: `owner only (secrets ${c.secrets.join(', ')})` });
    else {
      const lacking = secrets?.missing && c.secrets?.length ? secrets.missing(c.secrets) : [];
      if (lacking.length) blocked.push({ ...c, why: `needs secret ${lacking.join(', ')}`, needsSecret: lacking });
      else pool.push(c);
    }
  }
  const taken = new Set(inFlight.map((c) => c.id));
  const ready = (c) => (c.needs ?? []).every((n) => done(n) || taken.has(n));
  const next = [];
  let hours = 0;
  const left = new Set(pool.map((c) => c.id));
  const take = (c, lane) => {
    left.delete(c.id);
    taken.add(c.id);
    hours += HOURS[c.size] ?? 0;
    // The listed copy carries the spec number; a chunk found through its spec is the bare parsed one.
    next.push({ ...(listed.get(c.id) ?? c), lane, eta: hours });
  };
  for (;;) {
    let pick = null;
    for (const id of asap) {
      // A lane entry is a chunk id, or a spec number standing for that spec's first ready chunk.
      const c = listed.has(id) ? listed.get(id) : bySpec.get(id)?.chunks.find((x) => left.has(x.id) && ready(x));
      if (c && left.has(c.id) && ready(c)) {
        pick = [c, 'asap'];
        break;
      }
    }
    for (const r of pick ? [] : order) {
      const s = bySpec.get(r.num);
      const c = s?.chunks.find((x) => left.has(x.id) && ready(x));
      if (c) {
        pick = [c, r.priority ? `priority ${r.priority}` : 'table'];
        break;
      }
    }
    if (!pick) break;
    take(...pick);
  }
  for (const id of left) {
    const c = listed.get(id);
    const missing = (c.needs ?? []).filter((n) => !done(n) && !taken.has(n));
    blocked.push({ ...c, why: missing.length ? `needs ${missing.join(', ')}` : 'not in the roadmap table' });
  }
  const unchunked = order.filter((r) => bySpec.get(r.num)?.unchunked && !skipSpec.has(r.num)).map((r) => r.num);
  return { inFlight, next, blocked, unchunked };
}

export const USAGE = 'usage: node scripts/plan/order.mjs [--ref origin/main] [--mark 34.1,34.2] [--limit 12] [--no-vault] [--json]';

/** The vault's answer as missing(names): the names no ring holds and the environment doesn't set. Names only. */
export function secretsMissing(vault, env = process.env) {
  return (names) => {
    const set = new Set(vault.status(names).filter((r) => r.rings.length).map((r) => r.name));
    return names.filter((n) => !set.has(n) && !env[n]);
  };
}

/** The secret gate for a checkout: its mode from owner.mjs, the vault from secrets-vault.mjs. A repo without
 * owner.mjs gets no gate (null); without the vault (or with --no-vault), only the contributor rule. */
export async function secretGate(cwd, { vault = true, env = process.env } = {}) {
  let owner;
  try {
    owner = await import(new URL('../owner.mjs', import.meta.url).href);
  } catch {
    return null;
  }
  if (!owner.isOwner(cwd, env)) return { contributor: true, missing: null };
  const file = new URL('../secrets-vault.mjs', import.meta.url);
  if (!vault || !fs.existsSync(file)) return { contributor: false, missing: null };
  const { openVault } = await import(file.href);
  const root = owner.primaryRoot(cwd);
  return { contributor: false, missing: secretsMissing(openVault({ root, settings: owner.localSettings(root) }), env) };
}

/** `--limit`'s value as a whole number from 1 (12 when the flag is absent), or null when it is anything else. */
export function parseLimit(value) {
  if (value === undefined) return 12;
  return typeof value === 'string' && /^\d+$/.test(value) && Number(value) >= 1 ? Number(value) : null;
}

const pad = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s.padEnd(n, ' '));

/** The ASCII picture: in flight, then next (numbered, with the running estimate), then blocked. */
export function render({ inFlight, next, blocked, unchunked = [] }, { mark = new Set(), limit = 12 } = {}) {
  const out = [];
  const tag = (c) => (mark.has(c.id) ? '  <-- just plotted' : '');
  if (inFlight.length) {
    out.push('in flight');
    for (const c of inFlight) out.push(`      ${pad(c.id, 7)} ${pad(c.title, 44)} ${c.size}  ${c.who}${tag(c)}`);
  }
  out.push(next.length ? 'next up (as /next would pick)' : 'next up: nothing ready');
  next.slice(0, limit).forEach((c, i) => {
    const eta = c.eta < 1 ? '<1 h' : `~${Math.round(c.eta * 2) / 2} h`;
    out.push(`  ${String(i + 1).padStart(3)}  ${pad(c.id, 7)} ${pad(c.title, 44)} ${c.size}  ${pad(c.lane, 10)} ${eta}${tag(c)}`);
  });
  if (next.length > limit) {
    const marked = next.slice(limit).filter((c) => mark.has(c.id));
    out.push(`       … ${next.length - limit} more${marked.length ? ` (${marked.map((c) => `${c.id} at ${next.indexOf(c) + 1}`).join(', ')}: just plotted)` : ''}`);
  }
  if (unchunked.length) out.push(`  specs to chunk first (the first /next that picks one chunks it): ${unchunked.join(', ')}`);
  if (blocked.length) {
    out.push('not reachable now');
    for (const c of blocked) out.push(`      ${pad(c.id, 7)} ${pad(c.title, 44)} ${c.size}  ${c.why}${tag(c)}`);
  }
  return out.join('\n');
}

/** Read the plan (working tree through the settled view, or a ref) and simulate it. */
export async function load(cwd, ref, { vault = true } = {}) {
  const reader = planReader(cwd, ref);
  let read = (n) => reader.read(n);
  let numbers = new Map();
  if (!ref) {
    const { settledView } = await import('./settled.mjs');
    const view = settledView(cwd);
    read = (n) => view.read(`plan/${n}`) ?? '';
    numbers = view.numbers;
  }
  const readme = read('README.md');
  const specs = reader
    .names()
    .filter((n) => SPEC_FILE.test(n))
    .map((n) => parseSpec(n, read(n)));
  const closed = pendingCloses(reader.pending());
  let claims = {};
  try {
    const mod = await import(new URL('../claims.mjs', import.meta.url).href);
    const { map } = mod.fetchClaims(cwd);
    const session = mod.sessionId();
    const now = Date.now();
    for (const [id, v] of Object.entries(map)) {
      const c = mod.parse(v);
      if (mod.state(c, now) !== 'stale') claims[id] = { who: `${c.who}${c.session ? ` s:${c.session}` : ''}`, mine: c.session === session };
    }
  } catch {
    // no claims module, no network or no claims branch: nothing is in flight
  }
  const secrets = specs.some((s) => s.chunks.some((c) => c.secrets?.length)) ? await secretGate(cwd, { vault }) : null;
  return { readme, specs, closed, claims, secrets, numbers };
}

async function main(argv) {
  const val = (flag) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const ref = val('--ref');
  const marked = (val('--mark') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const limit = parseLimit(argv.includes('--limit') ? (val('--limit') ?? null) : undefined);
  if (limit === null) {
    console.error(USAGE);
    return 64;
  }
  const cwd = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  const plan = await load(path.resolve(cwd), ref, { vault: !argv.includes('--no-vault') });
  // A placeholder a pending `## Add` gives (`07.?strip`) marks the chunk it settles as.
  const mark = new Set(marked.map((id) => plan.numbers?.get(id) ?? id));
  const sim = simulate(plan);
  if (argv.includes('--json')) console.log(JSON.stringify({ ...sim, mark: [...mark] }, null, 2));
  else console.log(render(sim, { mark, limit }));
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(
    (code) => (process.exitCode = code),
    (e) => {
      console.error(e instanceof Error ? e.message : String(e));
      process.exitCode = 1;
    },
  );
}
