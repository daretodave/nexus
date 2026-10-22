// The cockpit's permission card reads like a tool row (spec 49, A11): the input's description is the title (else the
// tool), the argument is drawn as a tool row draws it (a Bash command highlighted, in full), and the input's JSON
// shows only behind a closed "Raw input".
import './jsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { toolTitle } from '../shared/tool-arg.mjs';
import { createSession } from '../server/session.mjs';

const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const LONG = `cd /z/nexus-wt/49-perm && grep -rn "cron" ${'scripts/plan/ '.repeat(12)}| head -40`;
const INPUT = { command: LONG, description: 'Find cron read/write callers' };

test('toolTitle: the input\'s description, else the tool', () => {
  assert.equal(toolTitle('Bash', INPUT), 'Find cron read/write callers');
  assert.equal(toolTitle('Bash', { command: 'ls' }), 'Bash');
  assert.equal(toolTitle('Edit', { file_path: 'a.js', description: '  ' }), 'Edit');
  assert.equal(toolTitle('Read', null), 'Read');
});

test('a permission\'s view carries the title and the full argument beside the JSON', async () => {
  let hooks = null;
  const fake = { kind: 'fake', send() {}, async interrupt() {}, async stop() {}, async fresh() {} };
  const s = await createSession({ id: 's1', cwd: os.tmpdir(), provider: (h) => { hooks = h; return fake; } });
  const pending = hooks.onPermission({ id: 'p1', agent: 'main', tool: 'Bash', input: INPUT });
  const view = s.permissions.get('p1').view;
  assert.equal(view.title, 'Find cron read/write callers');
  assert.equal(view.args, LONG, 'not cut at 120');
  assert.ok(LONG.length > 120);
  s.permissions.get('p1').resolve({ allow: false });
  await pending;
});

test('the card: description as title, the command highlighted and whole, raw JSON only in a closed disclosure', async () => {
  const { PermissionCard, permissionCard } = await import('../src/ui/permission-card.jsx');
  const req = { id: 'p1', tool: 'Bash', title: INPUT.description, args: LONG, summary: JSON.stringify(INPUT), reason: null, canAlways: true };
  const html = renderToStaticMarkup(createElement(PermissionCard, { req, who: 'main' }));
  assert.match(html, /<p class="tug-q"[^>]*><span class="md md-inline">Find cron read\/write callers<\/span><\/p>/);
  assert.match(html, /wants to use Bash/);
  assert.match(html, /<pre class="perm-arg"><span class="syn-cmd">cd<\/span>/, 'the command goes through the shell highlighter');
  assert.match(html, /<span class="syn-cmd">grep<\/span>/);
  assert.ok(html.replace(/<[^>]+>/g, '').includes('| head -40'), 'the whole command, no 120-char cut');
  // The JSON shows only inside a <details> with no open attribute.
  const outside = html.replace(/<details class="perm-raw">[\s\S]*?<\/details>/, '');
  assert.doesNotMatch(outside, /&quot;command&quot;|"command"/, 'no raw JSON outside the disclosure');
  assert.match(html, /<details class="perm-raw"><summary>Raw input<\/summary><pre>\{&quot;command&quot;/);
  assert.doesNotMatch(html, /<details[^>]* open/);
  assert.match(html, />Always allow</);

  // No title and no args from the server: the tool names it, the argument is read from the clipped JSON.
  const old = permissionCard({ tool: 'Bash', summary: JSON.stringify(INPUT).slice(0, 60) });
  assert.equal(old.title, 'Bash');
  assert.ok(old.args.startsWith('cd /z/nexus-wt/49-perm && grep'));
  const bare = renderToStaticMarkup(createElement(PermissionCard, { req: { tool: 'Edit', title: 'Edit', args: 'src/a.js', summary: '{"file_path":"src/a.js"}' }, who: 'main' }));
  assert.match(bare, /<p class="tug-q"[^>]*><span class="md md-inline">Edit<\/span><\/p>/);
  assert.match(bare, /perm-arg/);
});

test('the cockpit draws permissions with the card and its own stylesheet; nexus.css untouched', () => {
  const working = read('../src/screens/cockpit/Working.jsx');
  assert.match(working, /<PermissionCard req=\{req\} who=\{who\} onAnswer=\{answer\} \/>/);
  assert.match(working, /import '\.\.\/\.\.\/styles\/permission-card\.css'/);
  assert.doesNotMatch(working, /question=\{req\.reason \|\| req\.summary\}/);
  assert.equal(read('../src/styles/nexus.css'), read('../design/handoff/nexus.css'));
  assert.doesNotMatch(read('../src/styles/permission-card.css'), /#[0-9a-fA-F]{3,8}\b/, 'tokens only, both themes');
});
