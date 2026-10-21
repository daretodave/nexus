#!/usr/bin/env node
// npx @usenexus/cli [--repo <dir>] [--port <n>] [--no-open]
// npx @usenexus/cli run "<prompt>" [--cwd <dir>]   one turn headless, JSON out
//
// Starts the nexus GUI on 127.0.0.1 (random port, per-launch token) for
// the repo in the current directory and opens it in the browser.
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { startServer } from '../server/server.mjs';

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

const app = await startServer({ repo, port });

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
  await app.close().catch(() => {});
  process.exit(0);
};
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
