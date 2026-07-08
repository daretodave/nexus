# Customization: verify gate

> The verify gate is `pnpm verify` (or stack-equivalent). It
> runs **before every commit**. The composition varies per
> stack; the discipline doesn't.

---

## The contract

`pnpm verify` should be **what fails the same way locally that
it fails in CI**. If your CI runs ten checks and your verify
runs three, the loop will push commits that pass locally but
fail CI — exactly the silent regression class the methodology
exists to prevent.

Aim for verify ⊇ CI's required checks. Then CI either passes
or fails fast.

The canonical composition (`agents.md` rule 3) is `typecheck →
test:run → data:validate → build → e2e`, with two variance
rules: `data:validate` runs iff the project has a data layer —
drop the leg otherwise; `lint` is optional — wire it into
`verify` or leave it standalone, per stack. The examples below
apply both rules per stack's actual shape.

## Composition by stack

### Web (Next.js / SvelteKit / Astro / Remix)

```json
{
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test:run": "vitest run",
    "build": "next build",
    "e2e": "playwright test",
    "lint": "next lint",
    "verify": "pnpm typecheck && pnpm test:run && pnpm build && pnpm e2e"
  }
}
```

No data layer in this example, so `data:validate` is dropped
entirely (add it back if you're using GitHub-as-DB or
migrations). `lint` is defined but left out of `verify` —
standalone, run on save or pre-commit hook instead.

The hermetic e2e is the load-bearing piece. Playwright with
`webServer` config that boots `next start` on a separate port:

```ts
// playwright.config.ts
export default {
  webServer: {
    command: 'pnpm --filter @<PROJECT_PKG_PREFIX>/web start -p 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  // ...
}
```

This catches "tests pass but build is broken" — common in SSG /
SSR projects.

### API (Express / Fastify / Hono / Nest)

```json
{
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test:run": "vitest run",
    "test:integration": "vitest run --config vitest.integration.config.ts",
    "build": "tsc --build",
    "verify": "pnpm typecheck && pnpm test:run && pnpm build && pnpm test:integration"
  }
}
```

Replace e2e with **integration tests** that boot the API on a
separate port and exercise endpoints. Hermetic by design — no
external dependencies; mock or test-container DB.

### CLI

```json
{
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test:run": "vitest run",
    "build": "tsc --build",
    "test:cli": "node scripts/cli-smoke.mjs",
    "verify": "pnpm typecheck && pnpm test:run && pnpm build && pnpm test:cli"
  }
}
```

`test:cli` is your end-to-end equivalent: invoke the built CLI
with sample args, assert exit codes + output snapshot.

### Library (npm package, no app)

```json
{
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test:run": "vitest run",
    "build": "tsup",
    "test:exports": "node scripts/test-exports.mjs",
    "verify": "pnpm typecheck && pnpm test:run && pnpm build && pnpm test:exports"
  }
}
```

`test:exports` validates the package can be `require()`'d /
`import`-ed correctly from a clean node_modules — catches
"package.json `exports` is wrong."

### Python (Django / FastAPI / Flask)

```toml
# pyproject.toml or Makefile equivalent
[tool.poetry.scripts]
typecheck = "mypy ."
test_run = "pytest"
build = "python -m build"
e2e = "pytest tests/e2e"
```

Verify runs them in sequence (Makefile is cleaner for the chain
than poetry scripts):

```makefile
verify: typecheck test build e2e
typecheck:
	mypy .
test:
	pytest tests/unit
build:
	python -m build
e2e:
	pytest tests/e2e
```

### Go

```makefile
verify: vet test build smoke
vet:
	go vet ./...
test:
	go test -race ./...
build:
	go build ./...
smoke:
	./scripts/smoke.sh
```

### Rust

```makefile
verify: check clippy test build
check:
	cargo check --all-targets
clippy:
	cargo clippy -- -D warnings
test:
	cargo test
build:
	cargo build --release
```

---

## Hermetic — what makes it real

A verify gate is **hermetic** when:

1. **No external network calls.** Mock or fixture every API.
2. **No live database.** Use a test container, in-memory DB,
   or fixture file.
3. **Deterministic output.** No flake from clock-dependent or
   network-dependent assertions.
4. **Repeatable.** Running 10 times in a row produces the same
   pass/fail pattern.

Tests that aren't hermetic produce **flake**. Flake produces
**verify-gate ignore-fatigue**. Ignore-fatigue produces silent
regressions. Don't accept flake.

If a test is genuinely flaky and you can't fix it: skip it,
file an `[ ]` audit row to fix it, do not let it pollute
verify.

---

## What's NOT in the verify gate

- **Style / formatting (Prettier).** Run on save / pre-commit
  hook; not in verify. (Optional: include if your culture
  treats style as substance.)
- **Bundle size analysis.** Run quarterly or on major perf
  phases; too heavy for every tick.
- **Visual regression.** Different beast (Percy / Chromatic).
  Useful but slow; runs in `/iterate` audits, not verify.
- **Mutation testing.** Heavy; quarterly at most.
- **Integration with external services** (Stripe webhook
  replay, etc.). Mock these; if you need real: that's a
  staging environment problem, not verify.

---

## When verify is too slow

Target: full verify ≤ 5 minutes. Beyond that, the loop's tick
time grows and tickets-per-hour drops.

If verify is slow:

1. **Parallelize.** `pnpm` has `-r --parallel`. Vitest has
   built-in parallelism. Make + Makefile parallelism via `-j`.
2. **Drop e2e to a smoke subset for verify.** Full e2e runs
   nightly. Verify runs the 5–10 critical paths.
3. **Test-impact analysis.** Only run tests affected by the
   diff (Jest's `--findRelatedTests`, Vitest's
   `--changed`). Don't sacrifice the full e2e though — that's
   your safety net.
4. **Build cache.** Turborepo, Nx, or rust's incremental.
   Cache hits are seconds; cold builds are minutes.

If verify drops below 5 min via these moves: ship it. If you
have to compromise hermeticity to get there: don't. Fast +
flaky < slow + reliable for autonomous loops.

---

## Adding a check to verify

Whenever you find yourself fixing a class of bug that **could
have been caught at verify time but wasn't**: add the check.

Pattern:

1. Write a failing test or a static check that catches this
   class.
2. Add it to verify (the script, then composition).
3. Run verify locally — confirm it fails on the unfixed
   regression.
4. Fix the regression. Verify passes.
5. Commit the fix + the new check together.

Example: deploy gate kept failing on missing OG images. Add a
check to verify that scans every page route and confirms an
`opengraph-image.tsx` exists. Now the deploy gate stops being
the canary for that class.

The verify gate grows over the project's life. That's correct.
A six-month-old project's verify gate is bigger than a one-week
old's, and the loop is more reliable for it.
