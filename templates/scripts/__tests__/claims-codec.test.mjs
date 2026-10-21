// claims-codec.mjs: the rules every claimant obeys, as pure functions on a map (no git). A table of cases (free,
// mine, someone's live, stale, PR'd, privileged, a spec against its chunks, a held claim, a package) gives each
// verdict; claims.test.mjs checks claims.mjs reaches the same verdicts over git. node:test, no deps.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as codec from '../claims-codec.mjs';

const NOW = Date.parse('2026-10-11T12:00:00Z');
const at = (h) => new Date(NOW - h * 3600_000).toISOString();
const dev = (who, host = `${who}-pc`, session = `${who}-s1`) => ({ owner: false, who, ip: '10.0.0.2', host, session });
const loop = { owner: true, who: codec.PRIVILEGED, ip: '10.0.0.1', host: 'owner-pc', session: 'loop-a' };
const loopB = { ...loop, session: 'loop-b' };
const entry = (me, h, extra = {}) => codec.format({ ...me, at: at(h), ...extra });

/** [name, seed map, claimant, ids, force, expected per-id { ok, why } (why matched as a prefix)]. */
const CASES = [
  ['free', {}, dev('alex'), ['44.4'], false, [{ ok: true, why: 'free' }]],
  ['mine', { '44.4': entry(dev('alex'), 1) }, dev('alex'), ['44.4'], false, [{ ok: true, why: 'yours' }]],
  ["someone's live", { '44.4': entry(dev('sam'), 1) }, dev('alex'), ['44.4'], false, [{ ok: false, why: 'held by sam' }]],
  ['stale', { '44.4': entry(dev('sam'), 30) }, dev('alex'), ['44.4'], false, [{ ok: true, why: 'reclaimed' }]],
  ["PR'd, never stale", { '44.4': entry(dev('sam'), 300, { pr: 4 }) }, dev('alex'), ['44.4'], false, [{ ok: false, why: 'held by sam' }]],
  ['privileged, stale, to a contributor', { '44.4': entry(loop, 30) }, dev('alex'), ['44.4'], false, [{ ok: false, why: 'held by the owner' }]],
  ['privileged, stale, to another owner session', { '44.4': entry(loop, 30) }, loopB, ['44.4'], false, [{ ok: true, why: 'reclaimed' }]],
  ['privileged, live, to another owner session', { '44.4': entry(loop, 1) }, loopB, ['44.4'], false, [{ ok: false, why: `held by ${codec.PRIVILEGED}` }]],
  ['privileged, live, forced by the owner', { '44.4': entry(loop, 1) }, loopB, ['44.4'], true, [{ ok: true, why: 'taken over' }]],
  ['a contributor never forces', { '44.4': entry(dev('sam'), 1) }, dev('alex'), ['44.4'], true, [{ ok: false, why: 'held by sam' }]],
  ['a spec against its live chunk', { '44.3': entry(dev('sam'), 1) }, dev('alex'), ['44'], false, [{ ok: false, why: '44.3 is held by sam' }]],
  ['a chunk against its live spec', { '44': entry(dev('sam'), 1) }, dev('alex'), ['44.4'], false, [{ ok: false, why: '44 is held by sam' }]],
  ['a chunk beside a stale spec', { '44': entry(dev('sam'), 30) }, dev('alex'), ['44.4'], false, [{ ok: true, why: 'free' }]],
  ['held, long past 24 h, never stale', { '44.4': entry(dev('sam'), 900, { held: 'sam-gh' }) }, dev('alex'), ['44.4'], false, [{ ok: false, why: 'held for sam (@sam-gh)' }]],
  ['held, its person by login', { '44.4': entry(dev('sam'), 900, { held: 'sam-gh' }) }, { ...dev('sammy'), login: 'Sam-GH' }, ['44.4'], false, [{ ok: true, why: 'yours' }]],
  ['a group, all or nothing', { '44.5': entry(dev('sam'), 1) }, loop, ['44.4', '44.5'], false, [{ ok: true, why: 'free' }, { ok: false, why: 'held by sam' }]],
];

function expectVerdicts(results, want) {
  assert.equal(results.length, want.length);
  results.forEach((r, i) => {
    assert.equal(r.ok, want[i].ok, r.why);
    assert.ok(r.why.startsWith(want[i].why), `${r.why} starts with ${want[i].why}`);
  });
}

describe('the claims codec', () => {
  for (const [name, seed, me, ids, force, want] of CASES) {
    it(`${name}: decides as the table says`, () => {
      const out = codec.claimInto({ ...seed }, ids, me, NOW, { force });
      expectVerdicts(out.results, want);
      assert.equal(out.ok, want.every((w) => w.ok));
      if (!out.ok) assert.equal(out.next, null);
      else {
        for (const id of ids) {
          const c = codec.parse(out.next.map[id]);
          assert.deepEqual([c.who, c.host, c.session, c.at], [me.who, me.host, me.session, new Date(NOW).toISOString()]);
        }
        for (const [k, v] of Object.entries(seed)) if (!ids.includes(k)) assert.equal(out.next.map[k], v);
      }
    });
  }

  it('round-trips a claim and keeps a pipe out of a field; omits b:main', () => {
    const c = { who: 'a|b', ip: '10.0.0.2', host: 'pc', at: at(1), session: 's1', pr: 7, held: 'x', base: 'main' };
    const v = codec.format(c);
    assert.equal(v, `a/b|10.0.0.2|pc|${at(1)}|s:s1|pr:7|held:x`);
    assert.deepEqual(codec.parse(v), { ...c, who: 'a/b', base: '' });
  });

  it('is live for 24 h, then stale; a PR or a hold never goes stale', () => {
    assert.equal(codec.state(codec.parse(entry(dev('a'), 23)), NOW), 'live');
    assert.equal(codec.state(codec.parse(entry(dev('a'), 25)), NOW), 'stale');
    assert.equal(codec.state(codec.parse(entry(dev('a'), 900, { pr: 3 })), NOW), 'pr');
    assert.equal(codec.state(codec.parse(entry(dev('a'), 900, { held: 'a' })), NOW), 'held');
  });

  it('keeps a PR, a hold and a base through a claim of your own, and writes a base when asked', () => {
    const seed = { '44.4': entry(dev('alex'), 2, { pr: 9, base: 'next/44' }) };
    const out = codec.claimInto(seed, ['44.4'], dev('alex'), NOW);
    const c = codec.parse(out.next.map['44.4']);
    assert.deepEqual([c.pr, c.base], [9, 'next/44']);
    assert.equal(codec.parse(codec.claimInto({}, ['44.4'], dev('alex'), NOW, { base: 'x' }).next.map['44.4']).base, 'x');
  });

  it("names a bad id and a contributor's group; the owner claims a group; a contributor claims a package", () => {
    assert.equal(codec.idsProblem(['44.4'], dev('alex')), null);
    assert.match(codec.idsProblem(['44.4', '44.5'], dev('alex')), /one chunk at a time/);
    assert.equal(codec.idsProblem(['44.4', '44.5'], dev('alex'), { pkg: true }), null);
    assert.equal(codec.idsProblem(['44.4', '44.5'], loop), null);
    assert.match(codec.idsProblem(['nope'], loop), /"nope" is not a chunk id/);
    assert.match(codec.idsProblem([], loop), /no chunk/);
    assert.match(codec.idsProblem(['44.4', '44.4'], loop), /named twice/);
    assert.equal(codec.idsProblem(['104.2'], loop), null);
  });

  it("renews and releases only this session's claims unless the owner forces", () => {
    const seed = { '44.4': entry(loop, 5), '44.5': entry(loopB, 5), '44.6': entry(dev('sam'), 5) };
    const r = codec.renewIn({ ...seed }, [], loop, NOW);
    assert.deepEqual(r.done, ['44.4']);
    assert.equal(codec.parse(r.next.map['44.4']).at, new Date(NOW).toISOString());
    assert.equal(r.next.map['44.5'], seed['44.5']);
    assert.equal(codec.renewIn({ ...seed }, ['44.6'], loop, NOW).next, null);
    const rel = codec.releaseFrom({ ...seed }, ['44.4', '44.5', '44.9'], loop);
    assert.deepEqual([rel.gone, rel.kept], [['44.4'], ['44.5']]);
    assert.deepEqual(codec.releaseFrom({ ...seed }, ['44.5', '44.6'], loop, { force: true }).gone, ['44.5', '44.6']);
    assert.deepEqual(codec.releaseFrom({ ...seed }, ['44.4'], dev('sam'), { force: true }).kept, ['44.4']);
  });

  it('serializes sorted by chunk, and never reads an unreadable file as empty', () => {
    const text = codec.serialize({ '44.10': 'b', '06': 'c', '44.4': 'a' });
    assert.equal(text, '{\n  "06": "c",\n  "44.4": "a",\n  "44.10": "b"\n}\n');
    assert.deepEqual(codec.readMap(text), { '06': 'c', '44.4': 'a', '44.10': 'b' });
    assert.throws(() => codec.readMap('{ nope'), /can't be read/);
    assert.throws(() => codec.readMap('[]'), /not a map/);
    assert.throws(() => codec.readMap('null'), /not a map/);
  });

  it('tells a lost race from protected claims from any other refusal', () => {
    assert.equal(codec.pushRefusal(' ! [rejected]        abc -> claims (fetch first)'), 'race');
    assert.equal(codec.pushRefusal(' ! [rejected]        abc -> claims (non-fast-forward)'), 'race');
    assert.equal(
      codec.pushRefusal('remote: error: GH013: Repository rule violations found for refs/heads/claims.\nremote: - Cannot update this protected ref.\n ! [remote rejected] abc -> claims (push declined due to repository rule violations)'),
      'protected',
    );
    assert.equal(codec.pushRefusal('remote: error: GH006: Protected branch update failed for refs/heads/claims.'), 'protected');
    assert.equal(codec.pushRefusal(' ! [remote rejected] abc -> claims (pre-receive hook declined)'), 'other');
    assert.equal(codec.pushRefusal('fatal: Authentication failed'), 'other');
  });
});
