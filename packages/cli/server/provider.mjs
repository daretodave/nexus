// The provider seam: the only module that starts a GUI Claude Code session
// (headless.mjs starts the one-turn `nexus run` session, reusing this queue).
//
// Primary: @anthropic-ai/claude-agent-sdk query() on the person's own
// Claude Code login (no API key). Fallback: `claude -p` speaking
// stream-json on stdin/stdout. Both deliver the same message shapes to
// `onMessage`, so everything downstream (transcript, beats) is shared.
//
// Session options (SDK):
//   cwd: repo                    the adopter repo is the working directory
//   settingSources: ['project']  load the repo's commands, skills and hooks
//   includePartialMessages       stream text as it is written
//   canUseTool                   AskUserQuestion -> GUI buttons -> answers;
//                                other tools -> approve / deny in the GUI
//   permissionMode               the checkout's pref (Settings, "Permissions
//                                for new sessions"), read when a conversation
//                                starts and kept while it runs or resumes;
//                                bypassPermissions alone also sets the SDK's
//                                allowDangerouslySkipPermissions opt-in
// Subagent traffic (parent_tool_use_id) is kept: it is what the stage draws.
// Stop: interrupt() first so the turn's result still arrives, close() after
// a 1500 ms grace.

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

export const STOP_GRACE_MS = 1500;
export const BYPASS = 'bypassPermissions';
export const PERMISSION_MODES = ['default', 'acceptEdits', 'auto', 'plan', BYPASS];

/** A known permission mode, else 'default' (Ask). */
export function permissionModeOf(mode) {
  return PERMISSION_MODES.includes(mode) ? mode : 'default';
}

/** The SDK query options for a mode: bypass needs the SDK's explicit opt-in, and only bypass gets it. */
export function modeOptions(mode) {
  const m = permissionModeOf(mode);
  return m === BYPASS ? { permissionMode: m, allowDangerouslySkipPermissions: true } : { permissionMode: m };
}

/** The `claude -p` arguments for a mode: the CLI's own opt-in rides along with bypass only. */
export function modeArgs(mode) {
  const m = permissionModeOf(mode);
  return m === BYPASS ? ['--permission-mode', m, '--allow-dangerously-skip-permissions'] : ['--permission-mode', m];
}

/** An async iterable fed by push(); the session's streaming input. */
export function inputQueue() {
  const items = [];
  let wake = null;
  let done = false;
  return {
    push(v) { items.push(v); if (wake) { wake(); wake = null; } },
    end() { done = true; if (wake) { wake(); wake = null; } },
    async *[Symbol.asyncIterator]() {
      for (;;) {
        if (items.length) { yield items.shift(); continue; }
        if (done) return;
        await new Promise((r) => { wake = r; });
      }
    },
  };
}

/**
 * An SDKUserMessage. `content` is the prompt string, or an array of Messages content blocks (an image a person sent
 * beside their text, spec 51: shared/attachments.mjs messageContent). Both providers write the same shape: the SDK
 * to its streaming input, the `claude -p` fallback as a stream-json line, which takes image blocks too.
 */
export function userMessage(content) {
  return { type: 'user', message: { role: 'user', content }, parent_tool_use_id: null, session_id: '' };
}

async function loadSdk() {
  if (process.env.NEXUS_PROVIDER === 'cli') return null;
  try {
    return await import('@anthropic-ai/claude-agent-sdk');
  } catch {
    return null;
  }
}

/**
 * @param {object} o
 * @param {string} o.repo
 * @param {(msg: object) => void} o.onMessage
 * @param {(ask: {id, agent, questions}) => Promise<Record<string,string>>} o.onAsk
 * @param {(req: {id, agent, tool, input, suggestions}) => Promise<{allow: boolean, always?: boolean}>} o.onPermission
 * @param {(s: object) => void} o.onStatus
 * @param {() => string} [o.permissionMode]
 * @param {() => object} [o.env]   extra environment (NEXUS_SESSION, NEXUS_GH_LOGIN), read when a session starts
 * @param {string} [o.resume]      a Claude Code session id the first turn resumes (Recover: a Workflow run's own)
 */
export async function createProvider(o) {
  const sdk = await loadSdk();
  return sdk ? sdkProvider(sdk, o) : cliProvider(o);
}

export function sdkProvider(sdk, { repo, onMessage, onAsk, onPermission, onStatus, permissionMode = () => 'default', env = () => ({}), resume: seed = null }) {
  let session = null;
  let lastSessionId = seed;
  // The mode this conversation started in: a resume keeps it, a new conversation reads the pref again.
  let mode = null;

  const canUseTool = async (toolName, input, opts) => {
    const id = opts.toolUseID || randomUUID();
    const agent = opts.agentID || 'main';
    if (toolName === 'AskUserQuestion') {
      const answers = await onAsk({ id, agent, questions: input.questions || [], signal: opts.signal });
      if (!answers) return { behavior: 'deny', message: 'The person dismissed the question. Take your recommended option and keep going.' };
      return { behavior: 'allow', updatedInput: { ...input, answers } };
    }
    const d = await onPermission({ id, agent, tool: toolName, input, suggestions: opts.suggestions, reason: opts.decisionReason, signal: opts.signal });
    if (d && d.allow) return { behavior: 'allow', updatedInput: input, ...(d.always && opts.suggestions ? { updatedPermissions: opts.suggestions } : {}) };
    return { behavior: 'deny', message: 'The person denied this tool call from the nexus GUI.' };
  };

  function start(resume) {
    if (!resume || !mode) mode = permissionModeOf(permissionMode());
    const queue = inputQueue();
    const q = sdk.query({
      prompt: queue,
      options: {
        cwd: repo,
        settingSources: ['project'],
        includePartialMessages: true,
        ...modeOptions(mode),
        canUseTool,
        ...(resume ? { resume } : {}),
        env: { ...process.env, ...env(), CLAUDE_AGENT_SDK_CLIENT_APP: 'nexus-cli' },
      },
    });
    const s = { q, queue, seen: 0, ended: false, sent: [] };
    (async () => {
      try {
        for await (const msg of q) {
          s.seen += 1;
          if (msg.session_id) lastSessionId = msg.session_id;
          onMessage(msg);
        }
      } catch (e) {
        if (resume && s.seen === 0) {
          // The stored session is gone: start fresh rather than fail the send.
          lastSessionId = null;
          if (session === s) {
            session = start(null);
            for (const t of s.sent) { session.sent.push(t); session.queue.push(userMessage(t)); }
          }
          onStatus({ state: 'running', note: 'previous session could not resume; started fresh' });
          return;
        }
        onMessage({ type: 'result', is_error: true, subtype: 'error', result: String(e && e.message ? e.message : e) });
      } finally {
        s.ended = true;
        if (session === s) { session = null; onStatus({ state: 'idle' }); }
      }
    })();
    return s;
  }

  return {
    kind: 'sdk',
    send(content) {
      if (!session) session = start(lastSessionId);
      session.sent.push(content);
      session.queue.push(userMessage(content));
      onStatus({ state: 'running', provider: 'sdk' });
    },
    async interrupt() {
      if (session) await session.q.interrupt().catch(() => {});
    },
    async stop() {
      const s = session;
      if (!s) return;
      await s.q.interrupt().catch(() => {});
      await new Promise((r) => setTimeout(r, STOP_GRACE_MS));
      s.queue.end();
      try { s.q.close(); } catch {}
      if (session === s) session = null;
      onStatus({ state: 'idle' });
    },
    fresh() {
      lastSessionId = null;
      mode = null;
      return this.stop();
    },
    get active() { return !!session; },
    /** The mode the current conversation started in (null before its first turn). */
    get mode() { return mode; },
  };
}

/**
 * Fallback: `claude -p --input-format stream-json --output-format stream-json`.
 * No canUseTool here: tools outside the repo's allowlist are denied by the
 * CLI, and AskUserQuestion cannot be answered live (questions belong in the
 * oversight queue anyway).
 */
function cliProvider({ repo, onMessage, onStatus, permissionMode = () => 'default', env = () => ({}), resume: seed = null }) {
  let child = null;
  let lastSessionId = seed;
  let mode = null;

  function start() {
    if (!lastSessionId || !mode) mode = permissionModeOf(permissionMode());
    const args = ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', ...modeArgs(mode)];
    if (lastSessionId) args.push('--resume', lastSessionId);
    const c = process.platform === 'win32'
      ? spawn(['claude', ...args].join(' '), { cwd: repo, shell: true, windowsHide: true, env: { ...process.env, ...env() } })
      : spawn('claude', args, { cwd: repo, windowsHide: true, env: { ...process.env, ...env() } });
    let buf = '';
    c.stdout.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.session_id) lastSessionId = msg.session_id;
          onMessage(msg);
        } catch { /* a non-JSON line from the CLI; ignore */ }
      }
    });
    c.on('error', (e) => onMessage({ type: 'result', is_error: true, subtype: 'error', result: e.code === 'ENOENT' ? 'claude is not installed or not on PATH.' : String(e.message) }));
    c.on('close', () => { if (child === c) child = null; onStatus({ state: 'idle' }); });
    return c;
  }

  return {
    kind: 'cli',
    send(text) {
      if (!child) child = start();
      child.stdin.write(`${JSON.stringify(userMessage(text))}\n`);
      onStatus({ state: 'running', provider: 'cli' });
    },
    async interrupt() {
      if (child) child.kill('SIGINT');
    },
    async stop() {
      const c = child;
      if (!c) return;
      c.kill('SIGINT');
      await new Promise((r) => setTimeout(r, STOP_GRACE_MS));
      if (!c.killed || c.exitCode === null) c.kill();
      try { c.stdin.end(); } catch {}
      if (child === c) child = null;
    },
    fresh() {
      lastSessionId = null;
      return this.stop();
    },
    get active() { return !!child; },
  };
}
