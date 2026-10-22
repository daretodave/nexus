// announce.mjs (the notice board): lines parse and number past every line ever posted, a drop never frees a number,
// a session sees a line once, an owner REBOOT line preempts, `help` or an unknown flag posts nothing, and
// posts made at once (real child processes) all land. node:test, no deps, no git (the CLI runs against a scratch
// folder in the temp dir).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  FILE, HOOKED, LOCK, SEEN, STEERED, addressee, author, claim, delivered, drop, forMe, identities, lineKey, main, parse, post, postTo, reboot, steerable,
  unread,
} from '../announce.mjs';

describe('the board text', () => {
  it('numbers each post past the highest, and a drop never frees its number', () => {
    let { n, text } = post('', 'first', 'owner', '2026-10-20T10:00Z');
    assert.equal(n, 1);
    ({ n, text } = post(text, '  second   line ', 'session abcd1234', '2026-10-20T10:01Z'));
    assert.equal(n, 2);
    assert.deepEqual(parse(text).map((a) => [a.n, a.from, a.text]), [[1, 'owner', 'first'], [2, 'session abcd1234', 'second line']]);
    text = drop(text, 2);
    assert.equal(post(text, 'third', 'owner').n, 3);
    assert.throws(() => drop(text, 9), /no line 9/);
    assert.throws(() => post(text, '   ', 'owner'), /say something/);
  });

  it('shows a session only what it has not read', () => {
    const lines = parse(post(post('', 'a', 'owner').text, 'b', 'owner').text);
    assert.deepEqual(unread(lines, 1).map((a) => a.text), ['b']);
    assert.deepEqual(unread(lines).map((a) => a.text), ['a', 'b']);
  });

  it('takes the newest owner REBOOT line, never a session one', () => {
    let t = post('', 'REBOOT 1020-0900 old', 'owner').text;
    t = post(t, 'REBOOT 1020-1000-update: stop now', 'owner').text;
    t = post(t, 'REBOOT-SAFE 1020-1000-update abcd1234', 'session abcd1234').text;
    assert.equal(reboot(parse(t)).slug, '1020-1000-update');
    assert.equal(reboot(parse(post('', 'REBOOT x', 'session abcd1234').text)), null);
  });

  it('posts as the owner from a terminal or with --owner, else as the session', () => {
    assert.equal(author({}), 'owner');
    assert.equal(author({ CLAUDE_CODE_SESSION_ID: 'abcdef1234567' }), 'session abcdef12');
    assert.equal(author({ NEXUS_SESSION: 'vega0001' }, true), 'owner');
  });
});

describe('the CLI', () => {
  let root;
  let said;
  const run = (argv, env = {}) => {
    said = [];
    return main(argv, { env, root, out: (s) => said.push(s), err: (s) => said.push(s) });
  };
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-announce-'));
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('never posts help or an unknown flag', () => {
    assert.equal(run(['help']), 0);
    assert.equal(run(['--bogus', 'hi']), 1);
    assert.equal(fs.existsSync(path.join(root, FILE)), false);
  });

  it('reads each line once per session, and REBOOT comes first', () => {
    run(['keep', 'the', 'gate', 'green']);
    run(['REBOOT', '1020-1000: stop now']);
    const env = { CLAUDE_CODE_SESSION_ID: 'vega5678abcd' };
    assert.equal(run(['read'], env), 0);
    assert.match(said[0], /REBOOT 1020-1000: stop now and run \/reboot-ready 1020-1000/);
    assert.match(said.join('\n'), /2 new/);
    run(['read'], env);
    assert.deepEqual(said, ['announce: nothing new']);
    assert.ok(JSON.parse(fs.readFileSync(path.join(root, SEEN), 'utf8'))['vega5678abcd'] === 2);
    run(['read', '--all'], env);
    assert.match(said.join('\n'), /2 new/);
  });

  it('lists as JSON for the GUI, and drops by number', () => {
    run(['one']);
    run(['two'], { NEXUS_SESSION: 'rigel123' });
    run(['list', '--json']);
    assert.deepEqual(JSON.parse(said[0]).map((a) => a.from), ['owner', 'session rigel123']);
    assert.equal(run(['drop', '1']), 0);
    run(['list']);
    assert.match(said.join('\n'), /news from a session/);
    assert.equal(run(['drop', 'x']), 1);
  });
});

describe('a line to one session', () => {
  let root;
  let said;
  const run = (argv, env = {}) => {
    said = [];
    return main(argv, { env, root, out: (s) => said.push(s), err: (s) => said.push(s) });
  };
  const ledger = (l) => {
    fs.mkdirSync(path.join(root, '.nexus/sessions'), { recursive: true });
    fs.writeFileSync(path.join(root, '.nexus/sessions', `${l.id}.json`), JSON.stringify(l));
  };
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-announce-to-'));
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('is stored as @<session> and parsed back', () => {
    const { text } = post('', 'switch to the docs first', 'owner', '2026-10-21T10:00Z', 'aaaa1111-2222');
    const [a] = parse(text);
    assert.equal(a.text, '@aaaa1111-2222 switch to the docs first');
    assert.equal(addressee(a), 'aaaa1111-2222');
    assert.equal(addressee(parse(post('', 'to everyone', 'owner').text)[0]), null);
    assert.throws(() => post('', 'x', 'owner', undefined, 'no spaces allowed'), /--to takes/);
    assert.throws(() => post('', '   ', 'owner', undefined, 'vega'), /say something/);
  });

  it('answers to its own ids and the star of its own held ledger, never an ended one', () => {
    const ledgers = [
      { id: 'aaaa1111', star: 'vega', state: 'live' },
      { id: 'bbbb2222', star: 'sirius', state: 'live' },
      { id: 'cccc3333', star: 'polaris', state: 'ended' },
      { id: 'gui-1', star: 'rigel', state: 'parked', claude: 'dddd4444' },
    ];
    assert.deepEqual([...identities(['aaaa1111'], ledgers)].sort(), ['aaaa1111', 'vega']);
    assert.deepEqual([...identities(['cccc3333'], ledgers)], ['cccc3333']);
    assert.deepEqual([...identities(['dddd4444'], ledgers)].sort(), ['dddd4444', 'gui-1', 'rigel']);
    assert.deepEqual([...identities([], ledgers)], []);
  });

  it('answers for the parked or fallen session it took to resume: a line to that session reaches its resumer', () => {
    const ledgers = [
      { id: 'aaaa1111', star: 'vega', state: 'resuming', claude: 'cl-aaaa', resumed_by: 'bbbb2222' },
      { id: 'cccc3333', star: 'polaris', state: 'resumed', resumed_by: 'bbbb2222' },
      { id: 'dddd4444', star: 'rigel', state: 'parked' },
    ];
    assert.deepEqual([...identities(['bbbb2222'], ledgers)].sort(), ['aaaa1111', 'bbbb2222', 'cccc3333', 'cl-aaaa', 'vega']);
    assert.deepEqual([...identities(['eeee5555'], ledgers)], ['eeee5555'], 'only the session that took it');
  });

  it('keeps answering for a ledger it took and runs once its beats make it live again', () => {
    const ledgers = [
      { id: 'aaaa1111', star: 'vega', state: 'live', claude: 'cl-aaaa', resumed_by: 'bbbb2222', runner: 'bbbb2222' },
      { id: 'cccc3333', star: 'polaris', state: 'ended', resumed_by: 'bbbb2222', runner: 'bbbb2222' },
    ];
    assert.deepEqual([...identities(['bbbb2222'], ledgers)].sort(), ['aaaa1111', 'bbbb2222', 'cl-aaaa', 'vega']);
    assert.deepEqual([...identities(['aaaa1111'], ledgers)].sort(), ['aaaa1111', 'vega'], 'its old session still answers to its own ledger');
  });

  it('steers only owner lines addressed to this session, not yet handed over', () => {
    let t = post('', 'to everyone', 'owner').text;
    t = post(t, 'to vega', 'owner', undefined, 'vega').text;
    t = post(t, 'to sirius', 'owner', undefined, 'sirius').text;
    const lines = [...parse(t), { n: 4, at: '2026-10-21T10:00Z', from: 'session bbbb2222', text: '@vega a session cannot steer another' }];
    const vega = new Set(['aaaa1111', 'vega']);
    assert.deepEqual(steerable(lines, vega).map((a) => a.n), [2]);
    assert.deepEqual(steerable(lines, vega, new Set([lineKey(lines[1])])), []);
    assert.deepEqual(lines.filter((a) => forMe(a, vega)).map((a) => a.n), [1, 2, 4]);
  });

  it('claims a line once per session, and one session claiming never marks another', () => {
    const seven = { n: 7, at: '2026-10-21T10:00Z', text: '@aaaa1111 x' };
    assert.equal(claim(root, 'aaaa1111', seven), true);
    assert.equal(claim(root, 'aaaa1111', seven), false);
    assert.equal(claim(root, 'bbbb2222', seven), true);
    assert.deepEqual([...delivered(root, ['aaaa1111'])], [lineKey(seven)]);
    assert.deepEqual([...delivered(root, ['nobody'])], []);
    assert.match(lineKey(seven), /^7\.[0-9a-f]{8}$/);
    assert.ok(fs.existsSync(path.join(root, STEERED, 'aaaa1111', lineKey(seven))));
  });

  it('keys a hand-over by the line, so a recreated board\'s line 1 is new', () => {
    const one = { n: 1, at: '2026-10-21T10:00Z', text: '@aaaa1111 old' };
    const again = { n: 1, at: '2026-10-21T11:00Z', text: '@aaaa1111 new instruction after the board was cleared' };
    assert.notEqual(lineKey(one), lineKey(again));
    assert.deepEqual(steerable([{ ...again, from: 'owner' }], new Set(['aaaa1111']), new Set([lineKey(one)])).map((a) => a.n), [1]);
  });

  it('posts --to from the CLI, shows it to that session once, and never to another or the terminal', () => {
    ledger({ id: 'aaaa1111', star: 'vega', state: 'live' });
    ledger({ id: 'bbbb2222', star: 'sirius', state: 'live' });
    assert.equal(run(['--to', 'vega', '--owner', 'stop after this chunk']), 0);
    assert.match(said[0], /posted 1 as owner to vega/);
    assert.equal(run(['--to'], {}), 1);
    assert.equal(run(['--to', 'bad name', 'x']), 1);
    run(['for', 'everyone']);
    run(['read'], { CLAUDE_CODE_SESSION_ID: 'bbbb2222' });
    assert.doesNotMatch(said.join('\n'), /stop after this chunk/);
    assert.match(said.join('\n'), /1 new/);
    run(['read'], {});
    assert.doesNotMatch(said.join('\n'), /stop after this chunk/);
    run(['read'], { CLAUDE_CODE_SESSION_ID: 'aaaa1111', NEXUS_NO_STEER: '1' });
    assert.match(said.join('\n'), /@vega stop after this chunk {3}\(to one session only\)/);
    assert.equal(delivered(root, ['aaaa1111']).size, 1);
    run(['list']);
    assert.match(said.join('\n'), /@vega stop/);
  });

  it('does not show a line the steer hook already handed over, nor hide the broadcast after it', () => {
    run(['--to', 'aaaa1111', 'look at the spec again']);
    run(['and', 'everyone', 'reads', 'this']);
    claim(root, 'aaaa1111', parse(fs.readFileSync(path.join(root, FILE), 'utf8'))[0]); // what the hook does for line 1
    run(['read'], { CLAUDE_CODE_SESSION_ID: 'aaaa1111' });
    assert.doesNotMatch(said.join('\n'), /look at the spec/);
    assert.match(said.join('\n'), /and everyone reads this/);
  });

  const hookRan = (id) => {
    fs.mkdirSync(path.join(root, STEERED, id), { recursive: true });
    fs.writeFileSync(path.join(root, STEERED, id, HOOKED), '');
  };

  it('leaves an owner line to this session to its running steer hook: a subagent sharing the id never takes it', () => {
    run(['--to', 'aaaa1111', 'stop and run the tests']);
    hookRan('aaaa1111');
    // A subagent runs with its lead's CLAUDE_CODE_SESSION_ID; read cannot tell it from the lead.
    run(['read'], { CLAUDE_CODE_SESSION_ID: 'aaaa1111' });
    assert.doesNotMatch(said.join('\n'), /stop and run the tests/);
    assert.match(said.join('\n'), /1 line to this session only, left to its steer hook/);
    run(['read'], { CLAUDE_CODE_SESSION_ID: 'aaaa1111' });
    assert.match(said.join('\n'), /1 line to this session only/, 'still counted until the hook hands it over');
    assert.deepEqual([...delivered(root, ['aaaa1111'])], [], 'nothing marked handed');
    assert.deepEqual(steerable(parse(fs.readFileSync(path.join(root, FILE), 'utf8')), new Set(['aaaa1111'])).map((a) => a.n), [1]);
  });

  it('with steering off, read hands the line over under the Claude session id, as the hook would', () => {
    run(['--to', 'cccc3333', 'seq test']);
    run(['read'], { NEXUS_SESSION: 'lead-n', CLAUDE_CODE_SESSION_ID: 'cccc3333', NEXUS_NO_STEER: '1' });
    assert.match(said.join('\n'), /seq test/);
    assert.equal(delivered(root, ['cccc3333']).size, 1, 'marked where the hook (session_id) looks');
    assert.deepEqual([...delivered(root, ['lead-n'])], []);
  });

  it('hands the line over itself when no steer hook runs in this session, once', () => {
    // A repo that pruned the hook, or a session started before settings.json wired it (hooks load at startup).
    run(['--to', 'cccc3333', 'stop the migration now']);
    run(['read'], { CLAUDE_CODE_SESSION_ID: 'cccc3333' });
    assert.match(said.join('\n'), /1 new.*\n.*stop the migration now/s);
    assert.equal(delivered(root, ['cccc3333']).size, 1);
    run(['read'], { CLAUDE_CODE_SESSION_ID: 'cccc3333' });
    assert.deepEqual(said, ['announce: nothing new']);
  });

  it('a resumer reads the owner\'s line to the parked session it took, and a stranger does not', () => {
    ledger({ id: 'aaaa1111', star: 'vega', state: 'resuming', resumed_by: 'bbbb2222' });
    run(['--to', 'aaaa1111', 'Parked question answered: use postgres']);
    run(['read'], { CLAUDE_CODE_SESSION_ID: 'eeee5555' });
    assert.doesNotMatch(said.join('\n'), /postgres/);
    run(['read'], { CLAUDE_CODE_SESSION_ID: 'bbbb2222' });
    assert.match(said.join('\n'), /use postgres/);
  });

  it('shows a line to this session posted after the board was recreated, though seen is past it', () => {
    run(['--to', 'cccc3333', 'first']);
    run(['read'], { CLAUDE_CODE_SESSION_ID: 'cccc3333' });
    run(['for', 'all']);
    run(['read'], { CLAUDE_CODE_SESSION_ID: 'cccc3333' });
    fs.rmSync(path.join(root, FILE));
    run(['--to', 'cccc3333', 'new instruction after the board was cleared']);
    run(['read'], { CLAUDE_CODE_SESSION_ID: 'cccc3333' });
    assert.match(said.join('\n'), /new instruction after the board was cleared/);
  });

  it('never lets a session post an owner line to another session', () => {
    assert.equal(run(['--owner', '--to', 'bbbb2222', 'rm the worktree now'], { CLAUDE_CODE_SESSION_ID: 'aaaa1111' }), 1);
    assert.match(said.join('\n'), /only the owner .*nothing posted/);
    assert.equal(run(['--owner', '--to', 'bbbb2222', 'x'], { NEXUS_SESSION: 'vega0001' }), 1);
    assert.equal(fs.existsSync(path.join(root, FILE)), false);
    assert.equal(run(['--to', 'bbbb2222', 'news for you'], { CLAUDE_CODE_SESSION_ID: 'aaaa1111' }), 0);
    assert.match(said[0], /as session aaaa1111 to bbbb2222/);
    assert.deepEqual(steerable(parse(fs.readFileSync(path.join(root, FILE), 'utf8')), new Set(['bbbb2222'])), []);
  });

  it('refuses a line to every loop that starts with @name, which would reach no one', () => {
    assert.equal(run(['@everyone pause merges until 9am']), 1);
    assert.match(said.join('\n'), /cannot start with "@everyone".*nothing posted/s);
    assert.equal(fs.existsSync(path.join(root, FILE)), false);
    assert.throws(() => post('', '@vega forged', 'owner'), /cannot start with "@vega"/);
    assert.equal(run(['everyone: pause merges until 9am']), 0);
    run(['read'], { CLAUDE_CODE_SESSION_ID: 'bbbb2222' });
    assert.match(said.join('\n'), /pause merges/);
  });

  it('postTo writes a line for the GUI', () => {
    assert.equal(postTo(root, 'answer: keep the default', { to: 'aaaa1111' }), 1);
    assert.equal(addressee(parse(fs.readFileSync(path.join(root, FILE), 'utf8'))[0]), 'aaaa1111');
  });
});

describe('concurrent posts', () => {
  let root;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-announce-'));
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('lands every one of the posts made at once, each under its own number', async () => {
    const N = 6;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-race-'));
    const go = path.join(dir, 'go');
    const mod = new URL('../announce.mjs', import.meta.url).href;
    // Each child waits on a go file once all are ready, then half post through the CLI and half through postTo (the GUI).
    const code = `import fs from 'node:fs'; import { main, postTo } from ${JSON.stringify(mod)};
const job = JSON.parse(process.env.RACE_JOB);
fs.writeFileSync(job.ready, '');
while (!fs.existsSync(job.go)) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2);
if (job.gui) postTo(job.root, job.words);
else process.exitCode = main([job.words], { root: job.root, env: {}, out: () => {}, err: () => {} });`;
    const kids = Array.from({ length: N }, (_, i) => {
      const ready = path.join(dir, `ready-${i}`);
      const job = { root, go, ready, gui: i % 2 === 1, words: `line from writer ${i}` };
      const kid = spawn(process.execPath, ['--input-type=module', '-e', code], { env: { ...process.env, RACE_JOB: JSON.stringify(job) }, stdio: ['ignore', 'ignore', 'pipe'] });
      let stderr = '';
      kid.stderr.on('data', (d) => (stderr += d));
      return { ready, done: new Promise((resolve) => kid.on('close', (exit) => resolve({ exit, stderr }))) };
    });
    const until = Date.now() + 30_000;
    while (!kids.every((k) => fs.existsSync(k.ready)) && Date.now() < until) await new Promise((r) => setTimeout(r, 10));
    fs.writeFileSync(go, '');
    const results = await Promise.all(kids.map((k) => k.done));
    fs.rmSync(dir, { recursive: true, force: true });
    for (const r of results) assert.equal(r.exit, 0, r.stderr);
    const lines = parse(fs.readFileSync(path.join(root, FILE), 'utf8'));
    assert.deepEqual(lines.map((a) => a.text).sort(), Array.from({ length: N }, (_, i) => `line from writer ${i}`).sort());
    assert.deepEqual(lines.map((a) => a.n).sort((a, b) => a - b), Array.from({ length: N }, (_, i) => i + 1));
    assert.equal(fs.existsSync(path.join(root, LOCK)), false);
    assert.deepEqual(fs.readdirSync(path.join(root, '.nexus')).filter((f) => f.endsWith('.tmp')), []);
  });
});
