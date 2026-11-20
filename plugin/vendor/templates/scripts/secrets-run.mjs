// scripts/secrets-run.mjs: `secrets run`: a command run with the declared secrets in its environment. The model
// writes the command; this supplies the values, which go from the vault into the child's environment and nowhere
// else: never argv, never a terminal. The child gets this process's environment plus the declared names it asked for,
// nothing more from the vault (an undeclared name in .env stays out), and its stdout and stderr pass through with
// every value it was given replaced by `[secret NAME]`, so a command that prints one doesn't put it in a transcript.
// The command line: `node scripts/secrets.mjs run [--only A,B] -- <cmd...>`; the how: nexus/customization/secrets.md.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { maskText, scannable } from './secrets-scan.mjs';

/** A stream filter that masks every value, including one split across writes: the longest tail that could start a
 * value is held back until the next write (or the end) decides it. */
export function masker(values, write) {
  const list = scannable(values);
  const decoder = new StringDecoder('utf8');
  let pending = '';
  const emit = (final) => {
    const text = maskText(pending, values);
    let hold = 0;
    if (!final) {
      for (const [, v] of list) {
        for (let k = Math.min(v.length - 1, text.length); k > hold; k--) if (text.endsWith(v.slice(0, k))) { hold = k; break; }
      }
    }
    pending = text.slice(text.length - hold);
    const out = text.slice(0, text.length - hold);
    if (out) write(out);
  };
  return {
    write(chunk) { pending += typeof chunk === 'string' ? chunk : decoder.write(chunk); emit(false); },
    end() { pending += decoder.end(); emit(true); },
  };
}

// Windows: an .exe runs directly; anything else (npm.cmd, a .bat) needs the shell, its arguments quoted for it.
function onPath(cmd, env) {
  const exts = (env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean);
  const dirs = /[\\/]/.test(cmd) ? [''] : (env.PATH || env.Path || '').split(';').filter(Boolean);
  const names = path.extname(cmd) ? [cmd] : exts.map((e) => cmd + e.toLowerCase());
  for (const d of dirs) for (const n of names) { const p = d ? path.join(d, n) : n; try { if (fs.statSync(p).isFile()) return p; } catch { /* next */ } }
  return null;
}

const winQuote = (a) => (/^[\w\-.\/\\:=@,+]+$/.test(a) ? a : `"${a.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1')}"`);

function spawnCommand(cmd, args, opts, platform = process.platform) {
  if (platform !== 'win32') return spawn(cmd, args, opts);
  const found = onPath(cmd, opts.env);
  if (found && /\.(exe|com)$/i.test(found)) return spawn(found, args, opts);
  return spawn([cmd, ...args].map(winQuote).join(' '), { ...opts, shell: true });
}

/**
 * Run a command with `values` (a Map name -> value) added to its environment. Resolves the child's exit code (127
 * when it can't start). `out` and `err` take the child's masked output.
 */
export function runWithSecrets(command, values, { env = process.env, out = (s) => process.stdout.write(s), err = (s) => process.stderr.write(s), cwd = process.cwd() } = {}) {
  const [cmd, ...args] = command;
  const childEnv = { ...env, ...Object.fromEntries(values) };
  const mask = scannable(values).length > 0;
  return new Promise((resolve) => {
    let child;
    try {
      child = spawnCommand(cmd, args, { cwd, env: childEnv, stdio: ['inherit', mask ? 'pipe' : 'inherit', mask ? 'pipe' : 'inherit'], windowsHide: true });
    } catch (e) {
      err(`secrets run: ${cmd} could not start (${e.code || e.message})\n`);
      resolve(127);
      return;
    }
    const streams = [];
    if (mask) {
      for (const [stream, write] of [[child.stdout, out], [child.stderr, err]]) {
        const m = masker(values, write);
        streams.push(new Promise((done) => { stream.on('data', (c) => m.write(c)); stream.on('end', () => { m.end(); done(); }); }));
      }
    }
    child.on('error', (e) => { err(`secrets run: ${cmd} could not start (${e.code || e.message})\n`); resolve(127); });
    child.on('close', async (code, signal) => { await Promise.all(streams); resolve(code ?? (signal ? 1 : 0)); });
  });
}
