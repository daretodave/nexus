// Recover a Workflow run from its transcript folder (spec 40, "Recover"; A10).
//
// Claude Code writes a Workflow run under the Claude home (CLAUDE_CONFIG_DIR or ~/.claude) as:
//   projects/<slug>/<session>.jsonl                               the session that ran it (its first lines carry cwd)
//   projects/<slug>/<session>/subagents/workflows/<run>/          journal.jsonl, agent-<id>.jsonl, agent-<id>.meta.json
//   projects/<slug>/<session>/workflows/scripts/<name>-<run>.js   the script
//   projects/<slug>/<session>/workflows/<run>.json                the run record, once the run ended
// journal.jsonl holds one line per event: {type:'launched'}, {type:'started', key, agentId, label, phase},
// {type:'result', key, agentId, result} and {type:'failed', key, agentId}. A key started again after a failure is a
// retry. The run record adds the status (completed | killed), the phases, and per agent its times and error.
//
// Resume: the Workflow tool resumes a run with { scriptPath, resumeFromRunId } from the session that ran it, replaying
// every agent the journal holds a result for and running the rest. The GUI cannot call that tool, so a resume is a
// hosted session that resumes the run's own Claude Code session (SDK `resume`), in the folder it worked in, and is
// asked to make that call (resumePrompt). When it cannot host one (the session is still live, its folder is gone, the
// script is gone) the screen shows the command and the prompt to paste instead. A resume always restarts at the
// first agent that did not finish: the tool has no "from step N".
import fs from 'node:fs';
import path from 'node:path';
import { claudeSlug, STALE_MIN } from './sessions.mjs';

const RUN_ID = /^wf_[A-Za-z0-9_-]{1,64}$/;
const PEEK = 240;
const PRE = 4000;

/** The run folder a path names (the folder, its journal.jsonl, or its run record), checked to be under the Claude home. */
export function locateRun(given, home) {
  let p = String(given || '').trim().replace(/^file:\/\//, '');
  if (!p) return { error: 'name a workflow run folder' };
  p = path.resolve(p);
  if (path.basename(p) === 'journal.jsonl') p = path.dirname(p);
  const projects = path.resolve(home, 'projects');
  const inside = (x) => {
    const rel = path.relative(projects, x);
    return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
  };
  // <session>/workflows/<run>.json -> <session>/subagents/workflows/<run>
  if (/\.json$/.test(p) && path.basename(path.dirname(p)) === 'workflows' && RUN_ID.test(path.basename(p, '.json'))) {
    p = path.join(path.dirname(path.dirname(p)), 'subagents', 'workflows', path.basename(p, '.json'));
  }
  if (!inside(p)) return { error: `a workflow run folder lives under Claude Code's projects folder (${projects})` };
  const runId = path.basename(p);
  const sessionDir = path.dirname(path.dirname(path.dirname(p)));
  if (!RUN_ID.test(runId) || path.basename(path.dirname(p)) !== 'workflows' || path.basename(path.dirname(path.dirname(p))) !== 'subagents') {
    return { error: 'not a workflow run folder: it is <session>/subagents/workflows/wf_<id>' };
  }
  if (!fs.existsSync(path.join(p, 'journal.jsonl'))) return { error: 'no journal.jsonl in that folder' };
  return { runDir: p, runId, sessionDir, sessionId: path.basename(sessionDir), projectDir: path.dirname(sessionDir) };
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

const mtime = (file) => { try { return fs.statSync(file).mtimeMs; } catch { return 0; } };

/** The first `cwd` a transcript records (its head only: transcripts run to megabytes). */
function headCwd(file) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(256 * 1024);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    const m = /"cwd":("(?:[^"\\]|\\.)*")/.exec(buf.subarray(0, n).toString('utf8'));
    return m ? JSON.parse(m[1]) : '';
  } catch {
    return '';
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

/** The journal, folded into one entry per agent key in the order they first started. */
export function readJournal(file) {
  const by = new Map();
  let text = '';
  try { text = fs.readFileSync(file, 'utf8'); } catch { return []; }
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    if (!e || !e.key) continue;
    const a = by.get(e.key) || { key: e.key, agentId: '', label: '', phase: '', state: 'never', result: null, tries: 0 };
    if (e.agentId) a.agentId = e.agentId;
    if (e.type === 'started') { a.state = 'running'; a.tries += 1; a.label = e.label || a.label; a.phase = e.phase || a.phase; a.result = null; }
    else if (e.type === 'result') { a.state = 'done'; a.result = typeof e.result === 'string' ? e.result : JSON.stringify(e.result); }
    else if (e.type === 'failed') a.state = 'failed';
    by.set(e.key, a);
  }
  return [...by.values()].filter((a) => a.tries > 0 || a.state === 'failed');
}

/** What an agent returned, as one line: its first line, or a structured result's shape. */
export function peekOf(result) {
  const text = String(result || '').trim();
  if (!text) return '';
  if (/^[{[]/.test(text)) {
    try {
      const v = JSON.parse(text);
      if (Array.isArray(v)) return `${v.length} items`;
      if (v && typeof v === 'object') {
        return Object.entries(v).slice(0, 4).map(([k, x]) => `${k}: ${Array.isArray(x) ? x.length : x && typeof x === 'object' ? '{…}' : String(x).slice(0, 40)}`).join(', ');
      }
    } catch { /* not JSON after all */ }
  }
  // Claude Code may open a result with a [harness: ...] note; the peek is what the agent said.
  const first = text.split(/\r?\n/).find((l) => l.trim() && !/^\[harness:/.test(l.trim())) || '';
  return first.length > PEEK ? `${first.slice(0, PEEK - 1)}…` : first;
}

const minutes = (ms) => (ms > 0 ? `${Math.max(1, Math.round(ms / 60000))}m` : '');

function phasesOf(record, scriptPath) {
  if (record && Array.isArray(record.phases)) return record.phases.map((p) => p && p.title).filter(Boolean);
  try {
    const src = fs.readFileSync(scriptPath, 'utf8');
    const m = /phases\s*:\s*\[([^\]]*)\]/.exec(src);
    return m ? [...m[1].matchAll(/title\s*:\s*['"`]([^'"`]+)['"`]/g)].map((x) => x[1]) : [];
  } catch {
    return [];
  }
}

function scriptOf(loc, record) {
  if (record && record.scriptPath && fs.existsSync(record.scriptPath)) return record.scriptPath;
  const dir = path.join(loc.sessionDir, 'workflows', 'scripts');
  try {
    const f = fs.readdirSync(dir).find((x) => x.endsWith(`-${loc.runId}.js`) || x === `${loc.runId}.js`);
    if (f) return path.join(dir, f);
  } catch { /* no scripts folder */ }
  return record && record.scriptPath ? record.scriptPath : '';
}

/** The prompt that asks a resumed session to resume the run with the Workflow tool. */
export function resumePrompt({ scriptPath, runId }) {
  return [
    `Resume the Workflow run ${runId}. Call the Workflow tool with`,
    JSON.stringify({ scriptPath, resumeFromRunId: runId }, null, 2),
    'Agents that finished replay from its journal; the rest run again. Do not start a new run, and do not change the script.',
  ].join('\n');
}

/** The terminal line that reopens the run's session, where the prompt is pasted. */
export function resumeCommand({ cwd, sessionId }) {
  return `cd "${String(cwd || '.').replace(/"/g, '')}" && claude --resume ${sessionId}`;
}

/**
 * Read one run folder.
 * @returns {{ run, agents, resume } | { error }}
 *   run: { runId, sessionId, title, summary, kind, state: 'running'|'done'|'fallen'|'killed', fell, started, scriptPath, dir, runId }
 *   agents: [{ k, name, role, state: 'done'|'failed'|'running'|'never', when, peek, pre, resume, why }]
 *   resume: { hostable, why, sessionId, cwd, scriptPath, runId, prompt, command }
 */
export function readRun(dir, { home, now = Date.now(), staleMin = STALE_MIN } = {}) {
  const loc = locateRun(dir, home);
  if (loc.error) return loc;
  const journal = path.join(loc.runDir, 'journal.jsonl');
  const record = readJson(path.join(loc.sessionDir, 'workflows', `${loc.runId}.json`));
  const scriptPath = scriptOf(loc, record);
  const progress = new Map((record && Array.isArray(record.workflowProgress) ? record.workflowProgress : [])
    .filter((p) => p && p.type === 'workflow_agent' && p.agentId).map((p) => [p.agentId, p]));
  const entries = readJournal(journal);
  const lastWrite = Math.max(mtime(journal), ...entries.map((a) => mtime(path.join(loc.runDir, `agent-${a.agentId}.jsonl`))));
  const ended = !!(record && record.status);
  const fresh = now - lastWrite < staleMin * 60000;
  const unfinished = entries.some((a) => a.state === 'running');
  let state;
  if (ended) state = record.status === 'completed' ? 'done' : String(record.status);
  else if (unfinished && fresh) state = 'running';
  else if (unfinished || entries.some((a) => a.state === 'failed')) state = 'fallen';
  else state = fresh ? 'running' : 'fallen';
  const gone = state !== 'running' && state !== 'done';

  const agents = entries.map((a) => {
    const p = progress.get(a.agentId) || {};
    let st = a.state;
    if (p.state === 'error') st = 'failed';
    if (st === 'running' && gone) st = 'failed';
    const file = path.join(loc.runDir, `agent-${a.agentId}.jsonl`);
    const at = Number(p.startedAt) || mtime(file);
    const result = a.result || '';
    const peek = st === 'done' ? peekOf(result) || 'returned nothing'
      : st === 'failed' ? (a.state === 'running' ? 'stopped before it returned' : 'failed') : 'working';
    let pre = '';
    if (st === 'failed' && p.error) pre = String(p.error).slice(0, PRE);
    else if (st === 'done') {
      const rest = result.trim();
      // The rest of what it said, after the peek line.
      if (rest && rest !== peek && !/^[{[]/.test(rest)) { const i = rest.indexOf(peek); pre = (i >= 0 ? rest.slice(i + peek.length) : rest).trim().slice(0, PRE); }
      else if (/^[{[]/.test(rest)) { try { pre = JSON.stringify(JSON.parse(rest), null, 2).slice(0, PRE); } catch { pre = rest.slice(0, PRE); } }
    }
    const dur = minutes(Number(p.durationMs) || 0);
    return { k: a.key, agentId: a.agentId, name: a.label || a.agentId, role: [a.phase, dur].filter(Boolean).join(' · '), state: st, when: at ? new Date(at).toISOString() : '', peek, pre, tries: a.tries };
  });

  // Phases the script declares that no agent reached.
  if (state !== 'done') {
    const seen = new Set(entries.map((a) => a.phase));
    for (const title of phasesOf(record, scriptPath)) {
      if (!seen.has(title)) agents.push({ k: `phase:${title}`, agentId: '', name: title.toLowerCase(), role: `${title} · never started`, state: 'never', when: '', peek: '', pre: '' });
    }
  }

  // The resume point: the first agent that did not finish (the tool replays the rest of the journal).
  const at = gone ? agents.findIndex((a) => a.state !== 'done') : -1;
  agents.forEach((a, i) => {
    a.resume = i === at;
    if (a.resume) a.why = '';
    else if (state === 'done') a.why = 'the run finished';
    else if (state === 'running') a.why = 'the run is still going';
    else if (a.state === 'done') a.why = 'kept: its result replays';
    else a.why = `starts after ${agents[at]?.name || 'the step before'}`;
    if (a.state === 'never' && !a.peek) a.peek = `Waits on ${agents[at]?.name || 'the run'}.`;
  });

  const transcript = path.join(loc.projectDir, `${loc.sessionId}.jsonl`);
  const cwd = headCwd(transcript) || headCwd(path.join(loc.runDir, `agent-${entries[0]?.agentId}.jsonl`));
  let why = '';
  if (!fs.existsSync(transcript)) why = 'the session that ran it is gone, so nothing can resume it';
  else if (!scriptPath || !fs.existsSync(scriptPath)) why = 'its script is gone';
  else if (!cwd || !fs.existsSync(cwd)) why = `the folder its session worked in (${cwd || 'unknown'}) no longer exists`;
  else if (now - mtime(transcript) < staleMin * 60000) why = 'its session is still live: paste the prompt there';
  const runRow = {
    runId: loc.runId,
    sessionId: loc.sessionId,
    dir: loc.runDir,
    title: (record && record.workflowName) || (scriptPath ? path.basename(scriptPath, '.js').replace(`-${loc.runId}`, '') : loc.runId),
    summary: (record && record.summary) || '',
    kind: 'workflow',
    state,
    started: record && record.startTime ? new Date(record.startTime).toISOString() : agents.find((a) => a.when)?.when || '',
    fell: gone ? { at: new Date(lastWrite || now).toISOString() } : null,
    scriptPath,
  };
  return {
    run: runRow,
    agents,
    resume: { hostable: !why, why, sessionId: loc.sessionId, cwd, scriptPath, runId: loc.runId, prompt: resumePrompt({ scriptPath, runId: loc.runId }), command: resumeCommand({ cwd, sessionId: loc.sessionId }) },
  };
}

/** This repo's Workflow runs (the repo and its worktrees), newest first: [{ dir, t, d, when, kind }]. */
export function recentRuns({ home, dirs, now = Date.now(), limit = 8, staleMin = STALE_MIN }) {
  const found = [];
  for (const d of dirs) {
    const project = path.join(home, 'projects', claudeSlug(d));
    let sessions = [];
    try { sessions = fs.readdirSync(project, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name); } catch { continue; }
    for (const s of sessions) {
      const wf = path.join(project, s, 'subagents', 'workflows');
      let runs = [];
      try { runs = fs.readdirSync(wf).filter((r) => RUN_ID.test(r)); } catch { continue; }
      for (const r of runs) {
        const t = mtime(path.join(wf, r, 'journal.jsonl'));
        if (t) found.push({ dir: path.join(wf, r), session: s, runId: r, at: t, project });
      }
    }
  }
  found.sort((a, b) => b.at - a.at);
  return found.slice(0, limit).map((f) => {
    const sdir = path.join(f.project, f.session);
    const record = readJson(path.join(sdir, 'workflows', `${f.runId}.json`));
    let name = record && record.workflowName;
    if (!name) {
      try { name = (fs.readdirSync(path.join(sdir, 'workflows', 'scripts')).find((x) => x.endsWith(`-${f.runId}.js`)) || '').replace(`-${f.runId}.js`, ''); } catch { /* none */ }
    }
    const entries = readJournal(path.join(f.dir, 'journal.jsonl'));
    const kind = record && record.status ? (record.status === 'completed' ? 'done' : 'fallen')
      : now - f.at < staleMin * 60000 ? 'running' : 'fallen';
    return { dir: f.dir, t: `${name || f.runId} · ${entries.length} agent${entries.length === 1 ? '' : 's'}`, d: `${f.session.slice(0, 8)} / ${f.runId}`, when: new Date(f.at).toISOString(), kind };
  });
}
