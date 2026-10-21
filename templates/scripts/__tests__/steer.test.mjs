// claude/hooks/steer.mjs (the steer hook): an owner line addressed to one session reaches that session at its next
// tool boundary (deny with the line as the reason) or with its next prompt; never another session, never a subagent, never twice, never a line to every loop; inert under NEXUS_NO_STEER=1; and
// any error exits 0 with nothing said. node:test, no deps, no git (a `.git` folder made by hand stands in for a repo).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, it } from 'node:test';
import * as board from '../announce.mjs';
import { keyOf, mayBeDue, namesOf, output, primaryRootOf, respond, scan } from '../../claude/hooks/steer.mjs';

const HOOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../claude/hooks/steer.mjs');
const A = 'aaaa1111-0000-4000-8000-000000000001';
const B = 'bbbb2222-0000-4000-8000-000000000002';
const C = 'cccc3333-0000-4000-8000-000000000003';

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
    assert.equal(hook('UserPromptSubmit', A), null);
    assert.match(text(hook('UserPromptSubmit', B)), /sirius, keep going/);
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
    const out = hook('UserPromptSubmit', A);
    assert.equal(out.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
    assert.match(text(out), /for the lead/);
    assert.doesNotMatch(text(out), /cannot steer/);
  });

  it('a subagent running announce.mjs read under the lead\'s id leaves the line to the lead', () => {
    scan(root, [A]); // the lead's hook has run in this session (its first tool call)
    board.postTo(root, 'stop and run the tests', { to: A });
    const said = [];
    board.main(['read'], { env: { CLAUDE_CODE_SESSION_ID: A }, root, out: (s) => said.push(s), err: () => {} });
    assert.doesNotMatch(said.join('\n'), /stop and run the tests/);
    assert.match(text(hook('PreToolUse', A)), /stop and run the tests/, 'the lead still gets it');
  });

  it('shares one hand-over with announce.mjs read when steering is off for the read: neither repeats the other', () => {
    const read = (env) => {
      const said = [];
      board.main(['read'], { env, root, out: (s) => said.push(s), err: () => {} });
      return said.join('\n');
    };
    board.postTo(root, 'first', { to: A });
    assert.match(read({ CLAUDE_CODE_SESSION_ID: A, NEXUS_SESSION: 'lead-n', NEXUS_NO_STEER: '1' }), /first/);
    assert.equal(hook('UserPromptSubmit', A), null, 'the hook, without NEXUS_SESSION, sees it handed');
    assert.equal(hook('UserPromptSubmit', A, {}, { NEXUS_SESSION: 'lead-n' }), null);
    board.postTo(root, 'second', { to: A });
    assert.match(text(hook('UserPromptSubmit', A)), /second/);
    assert.doesNotMatch(read({ CLAUDE_CODE_SESSION_ID: A, NEXUS_NO_STEER: '1' }), /second/);
  });

  it('hands an answer to a parked session to the session that took its ledger, and to no stranger', () => {
    fs.mkdirSync(path.join(root, '.nexus/sessions'), { recursive: true });
    const vega = { id: A, star: 'vega', state: 'parked', train: 't1', parked: [] };
    fs.writeFileSync(path.join(root, '.nexus/sessions', `${A}.json`), JSON.stringify(vega));
    board.postTo(root, 'Parked question answered: "Use sqlite?". Change to: no, postgres.', { to: A });
    assert.equal(hook('PreToolUse', B), null, 'not before B takes the ledger');
    fs.writeFileSync(path.join(root, '.nexus/sessions', `${A}.json`), JSON.stringify({ ...vega, state: 'resuming', resumed_by: B }));
    assert.equal(hook('PreToolUse', C), null, 'a stranger never');
    assert.match(text(hook('PreToolUse', B)), /Change to: no, postgres/);
    assert.equal(hook('PreToolUse', B), null, 'once');
  });

  it('hands over a line posted after the board was recreated, though its number was handed before', () => {
    board.postTo(root, 'old instruction', { to: C });
    assert.match(text(hook('PreToolUse', C)), /old instruction/);
    fs.rmSync(path.join(root, board.FILE));
    board.postTo(root, 'new instruction after the board was cleared', { to: C });
    assert.match(text(hook('PreToolUse', C)), /new instruction after the board was cleared/);
  });

  it('says nothing without a board or a session id, and for events it does not serve', () => {
    assert.equal(hook('PreToolUse', A), null);
    board.postTo(root, 'x', { to: A });
    assert.equal(hook('PreToolUse', ''), null);
    assert.equal(hook('SessionStart', A), null);
    assert.equal(hook('PostToolUse', A), null, 'not served: PreToolUse is the interrupt');
    assert.equal(hook('Stop', A), null, 'not served');
    assert.equal(output('UserPromptSubmit', []), null);
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

  it('runs from the settings.json command in a subfolder: the path is the project dir, not the cwd', (t) => {
    if (spawnSync('bash', ['-c', 'exit 0']).status !== 0) return t.skip('no bash to run a hook command line');
    const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
    fs.mkdirSync(path.join(root, '.claude', 'hooks'), { recursive: true });
    fs.copyFileSync(HOOK, path.join(root, '.claude', 'hooks', 'steer.mjs'));
    fs.mkdirSync(path.join(root, 'scripts'));
    for (const f of ['announce.mjs', 'ledger.mjs', 'owner.mjs']) fs.copyFileSync(path.join(repo, 'scripts', f), path.join(root, 'scripts', f));
    const sub = path.join(root, 'packages', 'deep');
    fs.mkdirSync(sub, { recursive: true });
    board.postTo(root, 'from a subfolder too', { to: A });
    const settings = [path.join(repo, 'claude', 'settings.json'), path.join(repo, '..', '.claude', 'settings.json')].filter((f) => fs.existsSync(f));
    for (const file of settings) {
      const hooks = JSON.parse(fs.readFileSync(file, 'utf8')).hooks;
      const commands = Object.values(hooks).flat().flatMap((g) => g.hooks).map((h) => h.command).filter((c) => /steer\.mjs/.test(c));
      assert.equal(commands.length, 2, `${file}: steer on two events`);
      for (const command of new Set(commands)) {
        fs.rmSync(path.join(root, board.STEERED), { recursive: true, force: true });
        const input = JSON.stringify({ hook_event_name: 'PreToolUse', session_id: A, cwd: sub, tool_name: 'Bash' });
        const r = spawnSync('bash', ['-c', command], { input, cwd: sub, encoding: 'utf8', env: { ...process.env, NEXUS_NO_STEER: '', CLAUDE_PROJECT_DIR: root } });
        assert.equal(r.status, 0, `${file}: ${command} from a subfolder: ${r.stderr}`);
        assert.match(r.stdout, /from a subfolder too/, `${file}: ${command}`);
      }
    }
  });

  it('decides there is nothing due without loading the board', () => {
    const a = new Set([A]);
    const t = board.postTo(root, 'to every loop') && fs.readFileSync(path.join(root, board.FILE), 'utf8');
    assert.equal(mayBeDue(t, new Set(), a), false, 'a line to every loop is read\'s');
    board.postTo(root, 'for a', { to: A });
    const t2 = fs.readFileSync(path.join(root, board.FILE), 'utf8');
    const two = board.parse(t2)[1];
    assert.equal(mayBeDue(t2, new Set(), a), true);
    assert.equal(mayBeDue(t2, new Set([board.lineKey(two)]), a), false, 'already handed here');
    assert.equal(mayBeDue(`${t2}- **3** · 2026-10-21T10:00Z · session bbbb2222 · @${A} news\n`, new Set([board.lineKey(two)]), a), false, 'a session\'s line never steers');
    assert.equal(mayBeDue(t2, new Set(), new Set([B])), false, 'a line to another session is not due here');
    assert.equal(mayBeDue(t2.replace(/\n/g, '\r\n'), new Set([board.lineKey(two)]), a), false, 'CRLF reads the same');
  });

  it('keys and names the way the board does, without loading it', () => {
    for (const l of [{ n: 1, at: '2026-10-21T10:00Z', text: `@${A} x` }, { n: 42, at: 'z', text: '@vega é ünïcode · dots' }]) {
      assert.equal(keyOf(l.n, l.at, l.text), board.lineKey(l));
    }
    const ledgers = [
      { id: A, star: 'vega', state: 'live' },
      { id: 'nexus-1', star: 'rigel', state: 'parked', claude: B },
      { id: 'old', star: 'sirius', state: 'ended' },
      { id: 'p1', star: 'deneb', state: 'resuming', claude: 'cl-p1', resumed_by: C },
      { id: 'p2', star: 'altair', state: 'resumed', resumed_by: C },
      null,
    ];
    for (const ids of [[A], [B], [C], ['old'], [], [A, 'nexus-1']]) {
      assert.deepEqual([...namesOf(ids, ledgers)].sort(), [...board.identities(ids, ledgers)].sort(), ids.join());
    }
  });

  it('marks that it runs in this session, so read leaves the line to it, and finds the lines handed under any name', () => {
    fs.mkdirSync(path.join(root, '.nexus/sessions'), { recursive: true });
    fs.writeFileSync(path.join(root, '.nexus/sessions/a.json'), JSON.stringify({ id: A, star: 'vega', state: 'resuming', resumed_by: B }));
    board.postTo(root, 'for vega', { to: A });
    board.claim(root, A, board.parse(fs.readFileSync(path.join(root, board.FILE), 'utf8'))[0]);
    const { names, handed } = scan(root, [B]);
    assert.ok(names.has(A) && names.has('vega'));
    assert.equal(handed.size, 1, 'handed to A before it parked: not again to its resumer');
    assert.equal(board.hooked(root, [B]), true);
    assert.equal(board.hooked(root, [C]), false);
  });

  it('finds the board through CLAUDE_PROJECT_DIR while the session works outside the repo', () => {
    const away = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-steer-away-'));
    try {
      board.postTo(root, 'stop now', { to: C });
      const input = JSON.stringify({ hook_event_name: 'PreToolUse', session_id: C, cwd: away });
      const r = spawnSync(process.execPath, [HOOK], { input, cwd: away, encoding: 'utf8', env: { ...process.env, NEXUS_NO_STEER: '', CLAUDE_PROJECT_DIR: root } });
      assert.equal(r.status, 0);
      assert.match(r.stdout, /stop now/);
    } finally {
      fs.rmSync(away, { recursive: true, force: true });
    }
  });

  it('a resumer\'s hook process takes the line to the session whose ledger it took', () => {
    fs.mkdirSync(path.join(root, '.nexus/sessions'), { recursive: true });
    fs.writeFileSync(path.join(root, '.nexus/sessions/a.json'), JSON.stringify({ id: A, star: 'vega', state: 'resuming', resumed_by: B }));
    board.postTo(root, 'answered: use postgres', { to: A });
    const r = spawn(JSON.stringify({ hook_event_name: 'UserPromptSubmit', session_id: B, cwd: root }), { CLAUDE_PROJECT_DIR: root });
    assert.match(r.stdout, /use postgres/);
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
