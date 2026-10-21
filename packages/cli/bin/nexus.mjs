#!/usr/bin/env node
// npx @usenexus/cli [--repo <dir>] [--port <n>] [--no-open]
// npx @usenexus/cli run "<prompt>" [--cwd <dir>]   one turn headless, JSON out
//
// Starts the nexus GUI on 127.0.0.1 (random port, per-launch token) for
// the repo in the current directory and opens it in the browser. One
// server per repo: a second launch finds the first through
// .nexus/server.json and opens it instead (server/instance.mjs).
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { startServer } from '../server/server.mjs';
import { primaryRoot } from '../server/sessions.mjs';
import { findRunning, removeInstance, writeInstance } from '../server/instance.mjs';

const argv = process.argv.slice(2);

// `nexus run "<prompt>"`: one turn headless, JSON out (server/headless.mjs).
if (argv[0] === 'run') {
  const { runCli } = await import('../server/headless.mjs');
  const code = await runCli(argv.slice(1));
  await new Promise((r) => process.stdout.write('', r));
  process.exit(code);
}

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
  npx @usenexus/cli --port <n>      a fixed port (default: any free port)
                                    (a server already running for the repo is
                                    reused: its link opens instead)
  npx @usenexus/cli run "<prompt>"  one turn headless, JSON out (run --help)

  NEXUS_PROVIDER=cli                drive \`claude -p\` instead of the Agent SDK

  The kit: https://github.com/daretodave/nexus`);
  process.exit(0);
}

if (flag('--version') || flag('-v')) {
  const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  console.log(pkg.version);
  process.exit(0);
}

const repo = path.resolve(opt('--repo') || process.cwd());
const port = Number(opt('--port') || 0);

const root = await primaryRoot(repo);

// A server already running for this repo: open it rather than start a second.
const running = await findRunning(root);
if (running) {
  console.log(`
  nexus  ·  ${path.basename(root)}  (already running, pid ${running.rec.pid})

  ${running.url}

  This repo's server is up: this opens it. Stop it with Ctrl+C where it runs.
`);
  if (!flag('--no-open')) openBrowser(running.url);
  process.exit(0);
}

const app = await startServer({ repo, port });
const pkgVersion = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
await writeInstance(root, { pid: process.pid, port: app.port, token: app.token, url: app.url, repo, root, started: new Date().toISOString(), version: pkgVersion })
  .catch((e) => console.log(`  (could not write .nexus/server.json: ${e.message}; a second launch starts its own server)`));

console.log(`
  nexus  ·  ${path.basename(repo)}

  ${app.url}

  Local only (127.0.0.1). The link carries this launch's token; do not share it.
  Ctrl+C to stop.
`);

if (!flag('--no-open')) openBrowser(app.url);

let closing = false;
const shutdown = async () => {
  if (closing) process.exit(1);
  closing = true;
  console.log('\n  stopping...');
  removeInstance(root);
  await app.close().catch(() => {});
  process.exit(0);
};
process.on('exit', () => removeInstance(root));
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

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
