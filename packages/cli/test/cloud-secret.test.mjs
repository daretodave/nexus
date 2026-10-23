// The cloud loop's sign-in (server/cloud-secret.mjs, shared/oauth-token.mjs): the token goes to gh on stdin only,
// comes back in no answer, and is checked after with gh secret list. gh is a recording fake; git is a fake place.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoopSecret, secretArgs } from '../server/cloud-secret.mjs';
import { checkToken, scrub } from '../shared/oauth-token.mjs';

// Built at runtime, so no secret scanner reads the source as a key.
const TOKEN = ['sk', 'ant', 'oat01', 'Q'.repeat(30)].join('-') + '_test-only';
const NOW = Date.parse('2026-10-23T12:00:00Z');

/** git as a fake: a repo whose origin is `origin` (null: none; 'none': not a repo). */
const fakeGit = (origin = 'https://github.com/o/r.git', top = '/x/repo') => async (cwd, args) => {
  if (args[0] === 'rev-parse') return origin === 'none' ? { ok: false, out: '', err: 'fatal: not a git repository' } : { ok: true, out: top };
  if (args[0] === 'remote') return origin && origin !== 'none' ? { ok: true, out: origin } : { ok: false, out: '', err: 'no origin' };
  return { ok: false, out: '', err: '' };
};

function fakeGh({ set = 'ok', list = 'ok', updatedAt = new Date(NOW - 10000).toISOString(), slow = 0 } = {}) {
  const calls = [];
  const run = async (cmd, args, opts = {}) => {
    calls.push({ args, input: opts.input });
    const a = args.join(' ');
    if (a === 'auth status') return { ok: true, code: 0, stdout: 'Logged in to github.com', stderr: '' };
    if (args[0] === 'secret' && args[1] === 'set') {
      if (slow) await new Promise((r) => setTimeout(r, slow));
      return set === 'ok' ? { ok: true, code: 0, stdout: '', stderr: '' } : { ok: false, code: 1, stdout: '', stderr: `HTTP 403: refused ${opts.input}` };
    }
    if (args[0] === 'secret' && args[1] === 'list') {
      return list === 'ok' ? { ok: true, code: 0, stdout: JSON.stringify([{ name: 'CLAUDE_CODE_OAUTH_TOKEN', updatedAt }]), stderr: '' } : { ok: false, code: 1, stdout: '', stderr: 'HTTP 403: Must have admin rights' };
    }
    return { ok: false, code: 1, stdout: '', stderr: `unexpected ${a}` };
  };
  return { run, calls };
}

const mk = (gh, git = fakeGit()) => createLoopSecret({ repo: '/x/repo', run: gh.run, git, now: () => NOW });

test('exact args; the value only on stdin; verified from the list', async () => {
  const gh = fakeGh();
  const r = await mk(gh).set({ value: `  ${TOKEN}  ` });
  assert.equal(r.status, 200);
  assert.equal(r.verified, true);
  assert.equal(r.repo, 'o/r');
  const call = gh.calls.find((c) => c.args[1] === 'set');
  assert.deepEqual(call.args, ['secret', 'set', 'CLAUDE_CODE_OAUTH_TOKEN', '--app', 'actions', '--repo', 'o/r']);
  assert.deepEqual(secretArgs('o/r'), call.args);
  assert.equal(call.input, TOKEN, 'trimmed, on stdin');
  for (const c of gh.calls) assert.ok(!c.args.some((x) => x.includes(TOKEN)), 'never in argv');
  assert.ok(!JSON.stringify(r).includes(TOKEN));
  assert.deepEqual(gh.calls.find((c) => c.args[1] === 'list').args, ['secret', 'list', '--app', 'actions', '--repo', 'o/r', '--json', 'name,updatedAt']);
});

test('gh echoing the value comes back scrubbed; no answer ever carries it', async () => {
  const r = await mk(fakeGh({ set: 'fail' })).set({ value: TOKEN });
  assert.equal(r.status, 502);
  assert.ok(!JSON.stringify(r).includes(TOKEN));
  assert.match(r.error, /\[token\]/);
  assert.equal(scrub(`a ${TOKEN} b`, TOKEN), 'a [token] b');
});

test('bad values: multi-line, empty, too short or too long are 400; no prefix is 422 until force', async () => {
  for (const v of ['', 'short', `${TOKEN}\nmore`, 'x'.repeat(5000)]) {
    const gh = fakeGh();
    const r = await mk(gh).set({ value: v });
    assert.equal(r.status, 400, JSON.stringify(v.slice(0, 20)));
    assert.ok(!gh.calls.some((c) => c.args[1] === 'set'));
  }
  const odd = 'abcdefghijklmnopqrstuvwxyz0123';
  const gh = fakeGh();
  const w = await mk(gh).set({ value: odd });
  assert.equal(w.status, 422);
  assert.equal(w.warn, 'prefix');
  const f = await mk(gh).set({ value: odd, force: true });
  assert.equal(f.status, 200);
  assert.equal(checkToken(TOKEN).ok, true);
});

test('verify: null with a note when listing needs admin; false when GitHub does not list it fresh', async () => {
  const a = await mk(fakeGh({ list: 'fail' })).set({ value: TOKEN });
  assert.equal(a.status, 200);
  assert.equal(a.verified, null);
  assert.match(a.note, /needs admin/);
  const b = await mk(fakeGh({ updatedAt: '2025-01-01T00:00:00Z' })).set({ value: TOKEN });
  assert.equal(b.verified, false);
});

test('not on GitHub is 409 with the place, and gh is never asked', async () => {
  for (const [origin, place] of [['none', 'none'], [null, 'local'], ['git@gitlab.com:x/y.git', 'other']]) {
    const gh = fakeGh();
    const r = await mk(gh, fakeGit(origin)).set({ value: TOKEN });
    assert.equal(r.status, 409);
    assert.equal(r.place, place);
    assert.equal(gh.calls.length, 0);
  }
});

test('a second call while the first runs is 409', async () => {
  const s = mk(fakeGh({ slow: 150 }));
  const [a, b] = await Promise.all([s.set({ value: TOKEN }), s.set({ value: TOKEN })]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
});
