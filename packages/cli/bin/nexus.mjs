#!/usr/bin/env node
// npx @usenexus/cli [--repo <dir>] [--port <n>] [--no-open]
// npx @usenexus/cli run "<prompt>" [--cwd <dir>]   one turn headless, JSON out
// npx @usenexus/cli upgrade [--repo <dir>] [--json]   a v1 repo to v2, dry run (server/upgrade.mjs)
// npx @usenexus/cli --demo <scenario> [--speed <n>] [--loop]   fixtures and a beat script, no repo
//
// Starts the nexus GUI on 127.0.0.1 (random port, per-launch token) for
// the repo in the current directory and opens it in the browser. One
// server per repo: a second launch finds the first through
// .nexus/server.json and opens it instead (server/instance.mjs).
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import net from 'node:net';
import http from 'node:http';
import { startServer } from '../server/server.mjs';
import { primaryRoot } from '../server/sessions.mjs';
import { claimLock, findRunning, pidAlive, readLast, removeInstance, writeInstance, writeLast } from '../server/instance.mjs';

const argv = process.argv.slice(2);

// `nexus run "<prompt>"`: one turn headless, JSON out (server/headless.mjs).
if (argv[0] === 'run') {
  const { runCli } = await import('../server/headless.mjs');
  const code = await runCli(argv.slice(1));
  await new Promise((r) => process.stdout.write('', r));
  process.exit(code);
}

// `nexus upgrade`: a v1 repo to v2, dry run first, from a fresh fetch of origin (server/upgrade.mjs).
if (argv[0] === 'upgrade') {
  const { runUpgrade } = await import('../server/upgrade.mjs');
  const code = await runUpgrade(argv.slice(1));
  await new Promise((r) => process.stdout.write('', r));
  process.exit(code);
}

// Ctrl+C, a kill, and the terminal closing (SIGHUP: on Windows a closed console window gives about 10 s; SIGBREAK is
// Ctrl+Break there) all stop the same way: every session parked first, then the rest.
const SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP', ...(process.platform === 'win32' ? ['SIGBREAK'] : [])];

const flag = (name) => argv.includes(name);
const opt = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};

if (flag('--help') || flag('-h')) {
  console.log(`nexus: a GUI for Claude Code that runs the nexus loop on your repo.

  npx @usenexus/cli                 open the GUI for the repo in this folder
  npx @usenexus/cli --repo <dir>    ...for another folder
  npx @usenexus/cli --no-open       print the URL instead of opening a browser
  npx @usenexus/cli --port <n>      a fixed port (default: the last launch's,
                                    else any free port)
                                    (a server already running for the repo is
                                    reused: its link opens instead)
  npx @usenexus/cli --replace       stop this repo's running server the safe
                                    way (every session parked), then start:
                                    how a newer version takes over
  npx @usenexus/cli run "<prompt>"  one turn headless, JSON out (run --help)
  npx @usenexus/cli upgrade         a nexus v1 repo to v2: a dry run from a
                                    fresh fetch of origin (upgrade --help)
  npx @usenexus/cli --demo <name>   a scripted demo: fixtures and a timed beat
                                    script, no repo, no Claude, no network, no
                                    writes (--demo list names them; --speed <n>
                                    runs the script n times faster; --loop
                                    starts it over when it ends)

  NEXUS_PROVIDER=cli                drive \`claude -p\` instead of the Agent SDK

  The kit: https://github.com/daretodave/nexus`);
  process.exit(0);
}

if (flag('--version') || flag('-v')) {
  const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  console.log(pkg.version);
  process.exit(0);
}

// `nexus --demo <scenario>`: the real UI over fixtures and a timed beat script (server/demo.mjs). No repo is read,
// no .nexus/server.json is written, nothing reaches out.
if (flag('--demo')) {
  await demo();
  // The demo server keeps the process alive; Ctrl+C stops it.
} else {
  await serve();
}

async function demo() {
  const { startDemo, scenarioNames } = await import('../server/demo.mjs');
  const { SCENARIOS } = await import('../server/demo/scenarios.mjs');
  const name = opt('--demo');
  if (!name || name.startsWith('-') || name === 'list') {
    const rows = scenarioNames().map((n) => `  ${n.padEnd(17)}${SCENARIOS[n].summary}`).join('\n');
    console.log(`  npx @usenexus/cli --demo <scenario> [--speed <n>] [--loop] [--no-open]\n\n${rows}\n`);
    process.exit(name === 'list' ? 0 : 2);
  }
  let d;
  try {
    d = await startDemo({ scenario: name, port: Number(opt('--port') || 0), speed: Number(opt('--speed') || 1), loop: flag('--loop') });
  } catch (e) {
    console.error(`  ${e.message}`);
    process.exit(2);
  }
  console.log(`
  nexus demo  ·  ${d.scenario.title}  (a ${(d.world.duration / 1000).toFixed(1)} s script${flag('--loop') ? ', looping' : ''})

  ${d.url}

  Fixtures only: no repo, no Claude session, no network, nothing written.
  Ctrl+C to stop.
`);
  if (!flag('--no-open')) openBrowser(d.url);
  let stopping = false;
  const stop = async () => { if (stopping) process.exit(1); stopping = true; await d.close().catch(() => {}); process.exit(0); };
  for (const sig of SIGNALS) process.on(sig, stop);
}

/** Is this port free on 127.0.0.1? */
function portFree(port) {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(false));
    s.listen(port, '127.0.0.1', () => s.close(() => resolve(true)));
  });
}

/** Can this server version be stopped from here (POST /api/shutdown came after 0.5.1)? */
function canReplace(version) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(version || ''));
  if (!m) return false;
  const [a, b, c] = m.slice(1).map(Number);
  return a > 0 || b > 5 || (b === 5 && c >= 2);
}

/**
 * Ask a running server to stop the safe way (POST /api/shutdown with its token), then wait for its pid to go.
 * -> 'stopped', 'timeout', or 'old' (it has no /api/shutdown: an older version, stopped where it runs).
 */
async function replaceRunning(rec) {
  const status = await new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port: rec.port, method: 'POST', path: '/api/shutdown', agent: false, headers: { host: `127.0.0.1:${rec.port}`, origin: `http://127.0.0.1:${rec.port}`, 'x-nexus-token': rec.token, 'content-type': 'application/json' } }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    req.on('error', () => resolve(0));
    req.setTimeout(5000, () => { req.destroy(); resolve(0); });
    req.end('{}');
  });
  if (status === 404 && pidAlive(rec.pid)) return 'old';
  const end = Date.now() + 30000;
  while (pidAlive(rec.pid) && Date.now() < end) await new Promise((r) => setTimeout(r, 200));
  return pidAlive(rec.pid) ? 'timeout' : 'stopped';
}

async function serve() {
const repo = path.resolve(opt('--repo') || process.cwd());
const port = Number(opt('--port') || 0);

const root = await primaryRoot(repo);
const pkgVersion = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

// One launch starts a server at a time: a second launch at the same moment waits for the first's server and opens it.
let lock = claimLock(root);
if (!lock.ok) {
  const end = Date.now() + 5000;
  let up = null;
  while (!up && Date.now() < end) { await new Promise((r) => setTimeout(r, 250)); up = await findRunning(root, { connect: 1000, answer: 3000 }); }
  if (up) {
    console.log(`\n  nexus  ·  ${path.basename(root)}  (started a moment ago, pid ${up.rec.pid})\n\n  ${up.url}\n`);
    if (!flag('--no-open')) openBrowser(up.url);
    process.exit(0);
  }
  lock = claimLock(root);
  if (!lock.ok) lock = { ok: true, release: () => {} }; // the other launch never came up: go on
}

// A server already running for this repo: open it rather than start a second. One on another version says so: an
// upgrade is a stop and a launch (or --replace, which parks every session and takes over).
const running = await findRunning(root);
if (running) {
  const theirs = running.rec.version || 'an older version';
  if (flag('--replace')) {
    console.log(`\n  nexus  ·  stopping this repo's nexus ${theirs} (pid ${running.rec.pid}) the safe way: every session is parked...`);
    const how = await replaceRunning(running.rec);
    if (how !== 'stopped') {
      console.log(how === 'old'
        ? `  nexus ${theirs} cannot be stopped from here. Stop it with Ctrl+C where it runs (or close that terminal),\n  then launch again. Its sessions are kept and pick up where they left off.\n`
        : `  It did not stop within 30 s. Stop it with Ctrl+C where it runs, then launch again.\n`);
      lock.release();
      process.exit(1);
    }
  } else {
    const skew = running.rec.version !== pkgVersion
      ? `\n  This repo's nexus runs ${theirs}; you launched ${pkgVersion}. Stop it (Ctrl+C where it runs), then launch again\n  to upgrade${canReplace(running.rec.version) ? ', or launch with --replace' : ''}. Its sessions are kept and pick up where they left off.\n`
      : '\n  This repo\'s server is up: this opens it. Stop it with Ctrl+C where it runs.\n';
    console.log(`
  nexus  ·  ${path.basename(root)}  (already running, pid ${running.rec.pid})

  ${running.url}
${skew}`);
    if (!flag('--no-open')) openBrowser(running.url);
    lock.release();
    process.exit(0);
  }
}

// The last launch's port, when it is free: a tab left open from before reconnects on the same address.
let usePort = port;
if (!opt('--port')) {
  const last = readLast(root);
  if (last && await portFree(last.port)) usePort = last.port;
}
const app = await startServer({ repo, port: usePort, onShutdown: () => shutdown('replace'), log: (line) => console.log(`  ${line}`) });
await writeInstance(root, { pid: process.pid, port: app.port, token: app.token, url: app.url, repo, root, started: new Date().toISOString(), version: pkgVersion })
  .catch((e) => console.log(`  (could not write .nexus/server.json: ${e.message}; a second launch starts its own server)`));
await writeLast(root, { port: app.port, version: pkgVersion }).catch(() => null);
lock.release();

console.log(`
  nexus  ·  ${path.basename(repo)}

  ${app.url}

  Local only (127.0.0.1). The link carries this launch's token; do not share it.
  Ctrl+C to stop.
`);

if (!flag('--no-open')) openBrowser(app.url);

let closing = false;
async function shutdown(why = 'stop') {
  if (closing) process.exit(1);
  closing = true;
  // Parked first and synchronously (inside close, before anything async), then server.json goes, then the rest.
  const done = app.close({ why });
  removeInstance(root);
  console.log(`\n  stopping... every session is parked and picks up where it left off next launch.`);
  await done.catch(() => {});
  process.exit(0);
}
process.on('exit', () => removeInstance(root));
for (const sig of SIGNALS) process.on(sig, () => shutdown(sig === 'SIGHUP' ? 'signal' : 'stop'));
}

function openBrowser(url) {
  const [cmd, args] = process.platform === 'win32'
    ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
    : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  try {
    const c = spawn(cmd, args, { stdio: 'ignore', detached: true, windowsHide: true });
    c.on('error', () => console.log('  (could not open a browser; open the link above)'));
    c.unref();
  } catch {
    console.log('  (could not open a browser; open the link above)');
  }
}
