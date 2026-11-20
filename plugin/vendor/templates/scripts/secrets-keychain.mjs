// scripts/secrets-keychain.mjs: the OS keychain as an opt-in vault, through the OS's own command line, so the
// scripts stay dependency-free.
//
//   macOS     security (the login keychain: find-generic-password; a write goes through `security -i` on stdin)
//   Windows   Windows PowerShell 5.1 and the Credential Locker (Windows.Security.Credentials.PasswordVault)
//   Linux     secret-tool (libsecret: GNOME Keyring, KWallet's Secret Service)
//
// A value travels only on stdin and stdout, never as an argument: argv shows up in process lists and audit logs.
// Errors name the command and its exit code, never what it printed. Each item is filed under a service (default
// `nexus/<repo>`) and the secret's name. `run` is the seam tests stub: they never touch a real keychain.
// The vault on top: scripts/secrets-vault.mjs; the how and why: nexus/customization/secrets.md.
import { spawnSync } from 'node:child_process';

const NAME = /^[A-Z][A-Z0-9_]*$/;
/** A keychain service: no spaces or quotes, so it is safe inside a command or a script. */
export const SERVICE = /^[A-Za-z0-9._:/@-]+$/;

/** The real runner: (cmd, args, input) -> { status, stdout }. Throws when the command isn't installed. */
export function spawnRunner(cmd, args, input = '') {
  const r = spawnSync(cmd, args, { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  if (r.error) throw new Error(r.error.code === 'ENOENT' ? `keychain: ${cmd} is not installed` : `keychain: ${cmd} did not run`);
  return { status: r.status, stdout: r.stdout ?? '' };
}

const PS = ['-NoProfile', '-NonInteractive', '-Command'];
const PS_VAULT = [
  "$ErrorActionPreference='Stop'",
  '[void][Windows.Security.Credentials.PasswordVault,Windows.Security.Credentials,ContentType=WindowsRuntime]',
  '$v=New-Object Windows.Security.Credentials.PasswordVault',
].join('\n');
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const unb64 = (s) => Buffer.from(s.trim(), 'base64').toString('utf8');
const quoteMac = (s) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

function check(name) {
  if (!NAME.test(name)) throw new Error(`keychain: ${name} is not an env-var name`);
}

/** The keychain for this platform: { get(name) -> value | null, set(name, value), has(names) -> Set, remove(name) }. */
export function keychain({ platform = process.platform, run = spawnRunner, service } = {}) {
  if (!SERVICE.test(service ?? '')) throw new Error('keychain: the service is letters, digits and . _ : / @ - only');
  const fail = (cmd, r) => { throw new Error(`keychain: ${cmd} exited ${r.status}`); };
  if (platform === 'darwin') {
    return {
      get(name) {
        check(name);
        const r = run('security', ['find-generic-password', '-s', service, '-a', name, '-w']);
        return r.status === 0 ? r.stdout.replace(/\r?\n$/, '') : null;
      },
      set(name, value) {
        check(name);
        // `security -i` reads its commands from stdin, so the value never reaches argv.
        const r = run('security', ['-i'], `add-generic-password -U -s ${service} -a ${name} -w ${quoteMac(value)}\n`);
        if (r.status !== 0) fail('security', r);
      },
      has(names) {
        names.forEach(check);
        return new Set(names.filter((n) => run('security', ['find-generic-password', '-s', service, '-a', n]).status === 0));
      },
      remove(name) {
        check(name);
        // 44: no such item, which is what a remove wants.
        const r = run('security', ['delete-generic-password', '-s', service, '-a', name]);
        if (r.status !== 0 && r.status !== 44) fail('security', r);
      },
    };
  }
  if (platform === 'linux') {
    return {
      get(name) {
        check(name);
        const r = run('secret-tool', ['lookup', 'service', service, 'account', name]);
        return r.status === 0 ? r.stdout.replace(/\r?\n$/, '') : null;
      },
      set(name, value) {
        check(name);
        const r = run('secret-tool', ['store', `--label=${service} ${name}`, 'service', service, 'account', name], value);
        if (r.status !== 0) fail('secret-tool', r);
      },
      has(names) {
        names.forEach(check);
        return new Set(names.filter((n) => run('secret-tool', ['lookup', 'service', service, 'account', n]).status === 0));
      },
      remove(name) {
        check(name);
        const r = run('secret-tool', ['clear', 'service', service, 'account', name]);
        if (r.status !== 0) fail('secret-tool', r);
      },
    };
  }
  if (platform === 'win32') {
    // The value crosses as base64 both ways, so no console code page mangles it.
    const ps = (script, input) => run('powershell.exe', [...PS, `${PS_VAULT}\n${script}`], input);
    return {
      get(name) {
        check(name);
        const r = ps(`try { $c=$v.Retrieve('${service}','${name}') } catch { exit 3 }\n$c.RetrievePassword()\n[Console]::Out.Write([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($c.Password)))`);
        return r.status === 0 ? unb64(r.stdout) : null;
      },
      set(name, value) {
        check(name);
        const r = ps(`$p=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String([Console]::In.ReadToEnd().Trim()))\n$v.Add((New-Object Windows.Security.Credentials.PasswordCredential('${service}','${name}',$p)))`, b64(value));
        if (r.status !== 0) fail('powershell.exe', r);
      },
      has(names) {
        names.forEach(check);
        if (!names.length) return new Set();
        const list = names.map((n) => `'${n}'`).join(',');
        const r = ps(`foreach ($n in @(${list})) { try { [void]$v.Retrieve('${service}',$n); [Console]::Out.WriteLine($n) } catch {} }\nexit 0`);
        if (r.status !== 0) fail('powershell.exe', r);
        return new Set(r.stdout.split(/\r?\n/).filter((n) => names.includes(n)));
      },
      remove(name) {
        check(name);
        const r = ps(`try { $c=$v.Retrieve('${service}','${name}') } catch { exit 0 }\n$v.Remove($c)`);
        if (r.status !== 0) fail('powershell.exe', r);
      },
    };
  }
  throw new Error(`keychain: no keychain on ${platform} (use the .env vault)`);
}
