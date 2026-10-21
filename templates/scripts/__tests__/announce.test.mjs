// announce.mjs (the notice board): lines parse and number past every line ever posted, a drop never frees a number,
// a session sees a line once, an owner REBOOT line preempts, and `help` or an unknown flag posts nothing. node:test, no
// deps, no git (the CLI runs against a scratch folder in the temp dir).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { FILE, SEEN, author, drop, main, parse, post, reboot, unread } from '../announce.mjs';

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
