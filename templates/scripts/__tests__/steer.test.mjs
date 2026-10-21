// claude/hooks/steer.mjs (the steer hook): an owner line addressed to one session reaches that session at its next
// tool boundary (deny with the line as the reason), with its next prompt, after the running tool, or before it stops;
// never another session, never a subagent, never twice, never a line to every loop; inert under NEXUS_NO_STEER=1; and
// any error exits 0 with nothing said. node:test, no deps, no git (a `.git` folder made by hand stands in for a repo).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, it } from 'node:test';
import * as board from '../announce.mjs';
import { output, primaryRootOf, respond } from '../../claude/hooks/steer.mjs';

const HOOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../claude/hooks/steer.mjs');
const A = 'aaaa1111-0000-4000-8000-000000000001';
const B = 'bbbb2222-0000-4000-8000-000000000002';

let root;
const hook = (event, session, extra = {}, env = {}) => respond({ hook_event_name: event, session_id: session, cwd: root, ...extra }, { env, root, board });
const text = (out) => out?.hookSpecificOutput?.permissionDecisionReason ?? out?.hookSpecificOutput?.additionalContext ?? out?.reason ?? '';

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-steer-'));
  fs.mkdirSync(path.join(root, '.git'));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('the addressing', () => {
  it('interrupts only the addressed session, once, at its next tool call', () => {
    board.postTo(root, 'stop and re-read the spec', { to: A });
    board.postTo(root, 'sirius, keep going', { to: B });
    board.postTo(root, 'to every loop');
    const out = hook('PreToolUse', A, { tool_name: 'Bash' });
    assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
    assert.match(text(out), /stop and re-read the spec/);
    assert.doesNotMatch(text(out), /sirius|every loop|@aaaa/);
    assert.equal(hook('PreToolUse', A), null, 'handed over once');
    assert.equal(hook('PostToolUse', A), null);
    assert.match(text(hook('PostToolUse', B)), /sirius, keep going/);
    assert.equal(hook('UserPromptSubmit', 'cccc3333-unrelated'), null, 'a third session gets nothing');
  });

  it('answers to the star of the session\'s own held ledger, not an ended one', () => {
    fs.mkdirSync(path.join(root, '.nexus/sessions'), { recursive: true });
    fs.writeFileSync(path.join(root, '.nexus/sessions/a.json'), JSON.stringify({ id: A, star: 'vega', state: 'live' }));
    fs.writeFileSync(path.join(root, '.nexus/sessions/b.json'), JSON.stringify({ id: B, star: 'sirius', state: 'ended' }));
    board.postTo(root, 'for vega', { to: 'vega' });
    board.postTo(root, 'for sirius', { to: 'sirius' });
    assert.equal(hook('PreToolUse', B), null, 'an ended ledger\'s star is not B\'s any more');
    assert.match(text(hook('PreToolUse', A)), /for vega/);
  });

  it('never hands a line to a subagent, a session-authored line, or under NEXUS_NO_STEER=1', () => {
    board.postTo(root, 'for the lead', { to: A });
    fs.appendFileSync(path.join(root, board.FILE), `- **9** · 2026-10-21T10:00Z · session bbbb2222 · @${A} a session cannot steer\n`);
    assert.equal(hook('PreToolUse', A, { agent_id: 'sub-1' }), null);
    assert.equal(hook('PreToolUse', A, {}, { NEXUS_NO_STEER: '1' }), null);
    const out = hook('Stop', A, { stop_hook_active: false });
    assert.equal(out.decision, 'block');
    assert.match(out.reason, /for the lead/);
    assert.doesNotMatch(out.reason, /cannot steer/);
  });

  it('shares one hand-over with announce.mjs read: neither repeats the other', () => {
    board.postTo(root, 'first', { to: A });
    board.main(['read'], { env: { CLAUDE_CODE_SESSION_ID: A }, root, out: () => {}, err: () => {} });
    assert.equal(hook('UserPromptSubmit', A), null);
    board.postTo(root, 'second', { to: A });
    assert.match(text(hook('UserPromptSubmit', A)), /second/);
    const said = [];
    board.main(['read'], { env: { CLAUDE_CODE_SESSION_ID: A }, root, out: (s) => said.push(s), err: () => {} });
    assert.doesNotMatch(said.join('\n'), /second/);
  });

  it('says nothing without a board or a session id, and for events it does not serve', () => {
    assert.equal(hook('PreToolUse', A), null);
    board.postTo(root, 'x', { to: A });
    assert.equal(hook('PreToolUse', ''), null);
    assert.equal(hook('SessionStart', A), null);
    assert.equal(output('PostToolUse', []), null);
  });
});

describe('the process', () => {
  const spawn = (stdin, env = {}) => spawnSync(process.execPath, [HOOK], { input: stdin, cwd: root, encoding: 'utf8', env: { ...process.env, NEXUS_NO_STEER: '', ...env } });

  it('finds the primary checkout from a worktree without git', () => {
    const wt = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-steer-wt-'));
    try {
      const gitdir = path.join(root, '.git', 'worktrees', 'wt');
      fs.mkdirSync(gitdir, { recursive: true });
      fs.writeFileSync(path.join(gitdir, 'commondir'), '../..\n');
      fs.writeFileSync(path.join(wt, '.git'), `gitdir: ${gitdir}\n`);
      fs.mkdirSync(path.join(wt, 'deep', 'er'), { recursive: true });
      assert.equal(primaryRootOf(path.join(wt, 'deep', 'er')), root);
      assert.equal(primaryRootOf(root), root);
    } finally {
      fs.rmSync(wt, { recursive: true, force: true });
    }
  });

  it('exits 0 and says nothing on garbage, and on a broken board', () => {
    for (const input of ['', 'not json', '{"hook_event_name":"PreToolUse"}']) {
      const r = spawn(input);
      assert.equal(r.status, 0);
      assert.equal(r.stdout, '');
    }
    fs.mkdirSync(path.join(root, board.STEERED), { recursive: true });
    fs.writeFileSync(path.join(root, board.STEERED, 'aaaa1111-0000-4000-8000-000000000001'), 'a file where a folder goes');
    board.postTo(root, 'x', { to: A });
    const r = spawn(JSON.stringify({ hook_event_name: 'PreToolUse', session_id: A, cwd: root }));
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
  });

  it('prints the deny JSON for the addressed session, quickly, and nothing when switched off', () => {
    board.postTo(root, 'land nothing until I say', { to: A });
    const input = JSON.stringify({ hook_event_name: 'PreToolUse', session_id: A, cwd: root, tool_name: 'Bash' });
    assert.equal(spawn(input, { NEXUS_NO_STEER: '1' }).stdout, '');
    const t0 = Date.now();
    const r = spawn(input);
    const ms = Date.now() - t0;
    assert.equal(r.status, 0);
    const out = JSON.parse(r.stdout);
    assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
    assert.match(out.hookSpecificOutput.permissionDecisionReason, /land nothing until I say/);
    assert.ok(ms < 3000, `the hook took ${ms} ms`);
  });
});
