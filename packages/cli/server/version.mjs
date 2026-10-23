// This package's version, read once: the ledgers a server writes, GET /api/hello and /api/server, and the launch's
// "this repo's nexus runs an older version" line all name it.
import fs from 'node:fs';

let v = '0.0.0';
try { v = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version || v; } catch { /* a bare checkout */ }

export const VERSION = v;
