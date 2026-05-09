# Customization: hermetic e2e

> The e2e leg of the verify gate is the one that decides
> whether the autonomous loop is trustworthy. Get it right
> and you can `/loop /march` for hours unattended. Get it
> wrong and the loop will happily ship a green local build
> that 404s in production.

---

## Why hermetic e2e is load-bearing

Every other check in the verify gate (`typecheck`, `test:run`,
`build`) tells you the **code compiles, types line up, and unit
contracts hold**. None of them tell you the **product actually
works when assembled**.

That assembly bug class is the one autonomous loops are uniquely
prone to, because the agent ships in slices, and each slice can
look fine in isolation while breaking the whole. Examples the
loop has hit and would have hit again without a hermetic e2e:

- A new page that prerenders fine but its lens query returns
  `[]` in production because a data import never landed.
- A route that 404s under the production server's stricter
  trailing-slash rules but resolves fine in dev.
- A schema migration that types-checked and unit-tested but
  blew up at boot because an env var was renamed.
- A component that mounts cleanly in isolation but throws
  during SSR because it accesses `window` at module scope.
- An edge-rendered route that works locally on Node 22 but
  fails on the deploy provider's Node 20 runtime.

Unit tests will not catch any of these. The build alone will not
catch any of these. **You need to actually serve the production
artifact and walk the URLs.** That is what a hermetic e2e does.

The "hermetic" half is what makes it loop-safe:

- **No shared dev server.** The e2e leg builds and serves its
  own copy on its own port. A failing e2e is the e2e's fault,
  not "you forgot to restart `pnpm dev`".
- **No external network dependence.** Every dependency the
  product needs at boot is either bundled in, mocked at the
  edge, or spawned as part of e2e setup. A flaky upstream is
  not allowed to redden the gate.
- **Identical locally and in CI.** Same command, same ports,
  same env. If it passes locally and fails in CI, that is a
  bug in the gate definition, not "CI is weird".

When those three hold, a green e2e gate genuinely means *the
product works end-to-end*. That is the contract every shipping
skill (`/ship-a-phase`, `/iterate`, `/ship-data`) leans on
before pushing. Without it, the loop is firing blind.

---

## The two shapes hermetic e2e takes

The discipline is constant; the moving parts depend on what
your product is. Two patterns cover almost every project this
methodology has been applied to.

### Pattern A — static / SSG / SSR site

A web app that renders to HTML (and optionally runs a Node
runtime on top). No external state at boot beyond what's in the
repo. This is the simpler shape and the one most projects start
with.

The e2e leg:

1. Builds the production artifact (`next build`, `astro build`,
   `vite build`, `next-on-pages`, etc.) — no skips, no caching
   shortcuts in CI.
2. Boots a production server on a **dedicated private port**
   that is *not* your dev server's port. Standard convention:
   `4173` for the e2e server, leaving `3000` for `pnpm dev`.
3. Walks the canonical URL set and asserts each page rendered
   with the data it was supposed to fetch.

Playwright's `webServer` config does the boot for you:

```ts
// apps/e2e/playwright.config.ts
import { defineConfig } from '@playwright/test'
import { resolve } from 'node:path'

const PORT = Number(process.env.E2E_WEB_PORT ?? 4173)
const baseURL = `http://localhost:${PORT}`

const skipBuild = process.env.E2E_SKIP_BUILD === '1'
const previewCmd = `pnpm --filter @<PROJECT>/web preview --port ${PORT} --strictPort`
const buildAndPreviewCmd = `pnpm --filter @<PROJECT>/web build && ${previewCmd}`

export default defineConfig({
  testDir: resolve(import.meta.dirname, 'src'),
  testMatch: /.*\.spec\.ts$/,
  timeout: 30_000,
  use: { baseURL, trace: 'retain-on-failure' },
  webServer: {
    command: skipBuild ? previewCmd : buildAndPreviewCmd,
    url: baseURL,
    // CI must always boot fresh; locally, attach if something is
    // already listening so the inner loop is fast.
    reuseExistingServer: !process.env.CI,
    timeout: skipBuild ? 30_000 : 600_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
```

Three details earn their keep here:

- **`--strictPort`** — fail loud if the port is occupied
  instead of silently picking another one. The squatter
  problem (a stale process serving 200s on the same port) is
  one of the worst e2e failure modes; refuse to coexist with it.
- **`E2E_SKIP_BUILD=1`** — the local fast path. Build once,
  iterate on specs without rebuilding the artifact. Never
  honored in CI.
- **`reuseExistingServer: !process.env.CI`** — locally, `pnpm
  preview` + `pnpm e2e` in two terminals = sub-second feedback.
  In CI, always boot fresh.

### Pattern B — service with stateful dependencies

A product whose runtime depends on a database, message bus,
worker process, or sibling service. The webServer trick is not
enough: you also need to bring up the stateful parts in
isolation, then tear them down cleanly.

The e2e leg becomes a small orchestrator:

1. Resolves a **port offset** that lifts the entire stack out
   of the dev range. Nothing in the e2e suite binds to a port
   that `pnpm dev` would.
2. Ensures isolated databases exist (`<project>_e2e`,
   `<project>_e2e_tenant`, etc.) — separate from any dev DB.
3. Runs migrations against the isolated DBs.
4. Spawns the service + workers + auxiliary mocks as detached
   children, all on offset ports.
5. Writes a **state file** (`.runtime/state.json`) so the test
   runner and the teardown step know what was spawned.
6. Polls a health endpoint and waits for readiness.
7. Runs the suite. Tears down (or keeps the stack alive if the
   developer brought it up themselves — see "ownership"
   below).

Playwright's `globalSetup` / `globalTeardown` is the right hook:

```ts
// apps/e2e/playwright.config.ts
import { defineConfig } from '@playwright/test'
import { resolve } from 'node:path'
import { loadEnv, urls } from './src/env.js'

const e2eEnv = loadEnv()
const e2eUrls = urls(e2eEnv)

export default defineConfig({
  testDir: resolve(import.meta.dirname, 'src/spec'),
  globalSetup: resolve(import.meta.dirname, 'src/spec/global-setup.ts'),
  globalTeardown: resolve(import.meta.dirname, 'src/spec/global-teardown.ts'),
  workers: process.env.CI ? 2 : 4,
  use: { baseURL: e2eUrls.service, trace: 'retain-on-failure' },
})
```

Three discipline points worth surfacing:

- **Port offset, not random ports.** A *deterministic* offset
  (e.g. `+10000`, so dev's `3001` becomes e2e's `13001`)
  beats randomness because the port set is reproducible across
  runs. You can `lsof -i :13001` to debug. Random ports are
  unreproducible and therefore undebuggable.
- **Database seed as a launched event, on alt ports.** When
  Postgres / Redis / whatever lives on `5432` for dev, the
  hermetic stack can either (a) connect to the same Postgres
  but spin up an *e2e-only database name*, or (b) launch its
  own Postgres on an alt port for full isolation. (a) is
  cheaper and works for most teams; (b) is what you reach for
  when the dev DB schema and the e2e schema diverge or when
  multiple suites run in parallel.
- **Stack ownership.** `globalSetup` should detect a
  pre-existing healthy stack (developer ran `stack:up` in
  another terminal) and *attach* to it instead of spawning a
  duplicate. The teardown step reads the same flag and *only
  tears down what it spawned*. The local inner loop benefits;
  CI always owns and tears down.

A minimal up-script worth lifting:

```ts
// apps/e2e/scripts/up.ts
import { spawn } from 'node:child_process'
import pg from 'pg'
import { loadEnv, ports, platformDbUrl } from '../src/env.js'
import { readState, writeState, isStackHealthy } from './state.js'

async function main() {
  const env = loadEnv()
  const p = ports(env)

  const existing = readState(env.runtimeDir)
  if (existing && (await isStackHealthy(existing.urls.service))) {
    console.log(`stack already up at ${existing.urls.service}`)
    return
  }

  // Refuse to coexist with a squatter. The class of bug where a
  // stale process serves 200s on our target port is the worst
  // possible e2e failure mode — a green run that proves nothing.
  for (const port of [p.service, p.worker, p.runnerGateway]) {
    if (await isPortInUse(env.host, port)) {
      throw new Error(
        `port ${port} is in use. Run \`pnpm stack:down --force\` ` +
          `or set E2E_PORT_OFFSET to pick a different range.`,
      )
    }
  }

  await ensureDatabase(env.basePgUrl, env.platformDb)
  await runMigrations(platformDbUrl(env))

  const child = spawn('pnpm', ['--filter', '@<PROJECT>/service', 'start'], {
    env: {
      ...process.env,
      PORT: String(p.service),
      DATABASE_URL: platformDbUrl(env),
    },
    detached: true,
    stdio: 'ignore',
  })
  child.unref()

  await waitForHealth(`http://${env.host}:${p.service}/health`)
  writeState(env.runtimeDir, { pid: child.pid, urls: { service: `http://${env.host}:${p.service}` } })
}
```

The matching env module makes the port offset honest:

```ts
// apps/e2e/src/env.ts
export interface E2eEnv {
  portOffset: number   // 10000 by default
  host: string         // 127.0.0.1
  basePgUrl: string
  platformDb: string   // <project>_e2e
  tenantDb: string     // <project>_e2e_tenant
  runtimeDir: string   // .runtime
}

export function ports(env: E2eEnv) {
  return {
    service:       3001 + env.portOffset,  // 13001
    worker:        3050 + env.portOffset,  // 13050
    runnerGateway: 3099 + env.portOffset,  // 13099
  }
}
```

If your product has chat-platform integrations, OAuth flows,
webhooks, or external APIs, those become **mock servers** the
stack also spawns on offset ports, so the hermetic boundary
stays intact. The mocks live in the e2e package; the service
configures itself to point at `http://127.0.0.1:13601` instead
of `https://api.real-vendor.com`.

---

## URL contract: the smoke walker pattern

Pattern A and Pattern B both benefit from a single discipline:
**every URL the product serves lives in one source-of-truth
file.** The e2e suite imports that file and walks every entry.
New page = new entry = automatically tested.

```ts
// apps/web/src/routes/canonical-urls.ts (or wherever your
// route definitions live)
export const URL_PATTERNS = [
  { kind: 'home',          path: () => '/' },
  { kind: 'article',       path: (slug: string) => `/articles/${slug}` },
  { kind: 'switch',        path: (slug: string) => `/switches/${slug}` },
  // ...
] as const

export async function listCanonicalUrls(): Promise<CanonicalUrl[]> {
  // expand parametric patterns by reading data/, the DB, etc.
}
```

```ts
// apps/e2e/src/fixtures/canonical-urls.ts — re-export, so
// tests have a stable import path independent of the web
// package's internal structure.
export { URL_PATTERNS, listCanonicalUrls } from '../../../web/src/routes/canonical-urls.js'
```

```ts
// apps/e2e/src/smoke.spec.ts
import { test, expect } from '@playwright/test'
import { listCanonicalUrls } from './fixtures/canonical-urls.js'

const urls = await listCanonicalUrls()
for (const url of urls) {
  test(`${url.kind}: ${url.path}`, async ({ page }) => {
    const res = await page.goto(url.path)
    expect(res?.status(), `${url.path} returned ${res?.status()}`).toBeLessThan(400)
    // optional: assert the page rendered the data it was supposed to
  })
}
```

For data-driven products, pair canonical-urls with a
**page-reads** map: per page kind, declare the queries that page
will issue, and the smoke asserts each query returned data.
That catches the "page renders, but it's empty because the data
wasn't imported" bug — the most common silent regression in
content sites.

```ts
// apps/e2e/src/fixtures/page-reads.ts
export const PAGE_READS = new Map<EntityKind, PageReadSpec[]>([
  ['home',    [{ label: 'articles.count', run: (_, c) => c.count('articles') }]],
  ['article', [{ label: 'article.bySlug', run: (url, c) => c.query('articles', { where: { slug: url.slug }, limit: 1 }) }]],
  ['switch',  [{ label: 'switch.bySlug', run: (url, c) => c.query('switches', { where: { slug: url.slug }, limit: 1 }) }]],
])
```

The contract is mechanical: when the loop ships a new page kind,
it adds a `URL_PATTERNS` entry **and** a `PAGE_READS` entry. The
smoke walker picks both up automatically. Forgetting to wire one
of them surfaces as a hard-failed e2e — exactly the signal the
gate exists to produce.

---

## Sampling parametric routes

One trap: a product with thousands of parametric URLs (one per
record) cannot afford to walk all of them on every commit.

The fix is built into the canonical-urls loader: a `sample`
parameter that returns *all static URLs + N parametric URLs per
kind*. Default to a small sample (3–5) for the loop's verify
gate. CI can run a `SMOKE_SAMPLE=full` job nightly that walks
every URL.

```ts
const urls = await listCanonicalUrls({
  sample: process.env.SMOKE_SAMPLE === 'full' ? undefined : 3,
})
```

A loop that walks 3 of each kind catches structural regressions
within 30 seconds. The full nightly walk catches the data-shape
regressions that only show up on specific records.

---

## Wiring into the verify gate

Once the e2e harness exists, expose it as `pnpm e2e` and chain
it into `verify`:

```json
{
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test:run": "vitest run",
    "build": "pnpm --filter @<PROJECT>/web build",
    "e2e": "pnpm --filter @<PROJECT>/e2e test",
    "verify": "pnpm typecheck && pnpm test:run && pnpm build && pnpm e2e"
  }
}
```

A failing e2e is a hard block on commit. Never `--no-verify`. If
the e2e is flaky, the e2e is a bug — fix the source of flake.
The most common sources, ranked by frequency:

1. **Race conditions in setup.** Health check polls the wrong
   path, or returns 200 before the service is actually ready.
   Fix: poll the path that depends on every subsystem you care
   about, not `/`.
2. **Port collisions with stale processes.** A previous run
   crashed without tearing down. Fix: refuse to start if the
   port is in use; surface a clear "run `stack:down --force`"
   message.
3. **Build artifacts cached across runs.** Old `dist/` served,
   new code expected. Fix: in CI, never honor `E2E_SKIP_BUILD`.
4. **External calls leaking through.** A test hits the real
   vendor by accident. Fix: every external base URL flows
   through env, defaults to the mock, and the test asserts the
   mock received the call.
5. **Time-of-day flakes.** The suite passes at 9am and fails at
   midnight UTC because a date crosses a boundary. Fix: freeze
   time at suite boot; never use `new Date()` in test
   assertions.

---

## Common pitfalls (and what they look like)

- **The dev server is the e2e server.** You'll know because
  e2e fails when you forget to start `pnpm dev`. Fix: dedicated
  port + Playwright `webServer` boot.
- **`localhost` vs `127.0.0.1` mismatch.** The webServer probe
  hits `127.0.0.1`, the runner hits `localhost`, IPv6 resolves
  one but not the other. Fix: pick one host string and use it
  everywhere (`localhost` is forgiving; `127.0.0.1` is exact).
- **Nondeterministic data.** A query orders by `createdAt
  DESC`, the seed inserts records in the same instant, the
  ordering flips between runs. Fix: order by a stable secondary
  key (id, slug).
- **Tests that pass empty.** A "click and assert text" test
  silently passes when the page never renders the element it's
  asserting on, because Playwright's auto-wait masks the empty
  case. Fix: `await expect(page.getByRole('main')).toBeVisible()`
  before any assertions, so an empty page fails fast.
- **CI passes, deploy fails.** The deploy provider's Node
  version, build env, or runtime differs from CI. Fix: pin the
  same Node version locally, in CI, and at the deploy provider;
  never rely on "latest".

---

## What "good" looks like

You know the e2e leg is doing its job when:

- A new phase that breaks any URL fails verify before the
  commit lands. The agent never pushes broken code.
- Local runs with `E2E_SKIP_BUILD=1` complete in under 30
  seconds. The inner loop is fast enough that you actually use
  it.
- A CI failure points unambiguously at the broken page or the
  broken read. No "rerun the job and see if it's still red".
- The e2e suite has caught at least one regression in the wild
  that no other check would have caught. (If it never fires,
  it's either over-mocked or under-asserting — audit it.)

This is the gate that makes `/loop /march` safe. Get it right
once and you stop thinking about it; the loop pushes against it
forever after, and the loop never lies to you.
