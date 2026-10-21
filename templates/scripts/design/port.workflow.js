export const meta = {
  name: 'design-port',
  description: 'Port a Claude Design handoff into the app: foundation, one agent per canvas page, integrate, one fidelity reviewer per theme, land with the skip list',
  whenToUse: 'The port chunk of a design handoff (skills/design/port.md): run from the chunk worktree with args {handoff, worktree, chunk}',
  phases: [
    { title: 'Survey', detail: 'the handoff manifest, canvas pages and port map: what to port' },
    { title: 'Foundation', detail: 'stylesheet verbatim, fonts bundled, one component per design class, a route per screen' },
    { title: 'Screens', detail: 'one agent per canvas page, in parallel' },
    { title: 'Integrate', detail: 'real data, shared wiring, the endpoints the server lacks' },
    { title: 'Fidelity', detail: 'one reviewer per theme: render the boards, screenshot the app, compare; then the fixes' },
    { title: 'Land', detail: 'the port map complete, the skip list in the handoff README, the check green, the close drafted' },
  ],
}

// scripts/design/port.workflow.js: the port recipe (playbooks/design-handoff.md Step 5) as a Workflow script.
//
// The lead of a port chunk runs it through the Workflow tool, never by hand:
//   Workflow({ scriptPath: 'scripts/design/port.workflow.js',
//              args: { handoff: 'design/handoff/2026-11-02', worktree: '<abs path>', chunk: '12.3',
//                      themes: ['night', 'dawn'], boards: ['Fleet', 'Inbox'] } })
// `handoff` (the folder ingest wrote), `worktree` (where every agent works) and `chunk` are required; `themes` defaults
// to night and dawn (one reviewer each); `boards` narrows a re-port to the new and changed boards; `app` overrides the
// port map's app folder. The agents edit the worktree and never commit: the lead gates, commits and closes with the
// returned skip list. Plain JS; the Workflow runtime supplies agent, parallel, phase, log and args.

const A = args || {}
const need = ['handoff', 'worktree', 'chunk'].filter((k) => !A[k])
if (need.length) throw new Error(`design-port: args needs ${need.join(', ')} (see skills/design/port.md)`)
const THEMES = Array.isArray(A.themes) && A.themes.length ? A.themes : ['night', 'dawn']
const ONLY = Array.isArray(A.boards) && A.boards.length ? A.boards : null

const WHERE = [
  `Work only in ${A.worktree}; paths below are relative to it. Never commit, push or switch branches: the lead does that.`,
  `The handoff ${A.handoff}/ is the source of truth for the UI and is never edited: a screen that differs from its board is a bug in the screen.`,
  'The boards are the design tool\'s documents (x-dc, helmet, {{holes}}, sc-for, sc-if, dc-import, support.js): translate them, never ship them.',
  'No emoji anywhere. Never ship board demo data: a value nobody saw draws blank or a dash.',
].join('\n')

const PAGES = {
  type: 'object',
  properties: {
    app: { type: 'string', description: 'the app folder, relative to the worktree' },
    stylesheet: { type: 'string', description: 'the handoff stylesheet file' },
    pages: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          boards: { type: 'array', items: { type: 'string' }, description: 'the boards on this page to port' },
        },
        required: ['name', 'boards'],
      },
    },
    decided: {
      type: 'array',
      description: 'boards not to port in this run, with why (a theme twin, a documentation board, already ported and unchanged)',
      items: { type: 'object', properties: { board: { type: 'string' }, reason: { type: 'string' } }, required: ['board', 'reason'] },
    },
  },
  required: ['app', 'pages', 'decided'],
}

const DONE = {
  type: 'object',
  properties: {
    ported: {
      type: 'array',
      items: { type: 'object', properties: { board: { type: 'string' }, files: { type: 'array', items: { type: 'string' } } }, required: ['board', 'files'] },
    },
    skipped: {
      type: 'array',
      items: { type: 'object', properties: { board: { type: 'string' }, reason: { type: 'string' } }, required: ['board', 'reason'] },
    },
    patterns: { type: 'array', items: { type: 'string' }, description: 'board patterns left out or drawn differently, each with its reason' },
    shared: { type: 'array', items: { type: 'string' }, description: 'changes a shared file needs (routes, app shell, data layer) for the integrator' },
    endpoints: { type: 'array', items: { type: 'string' }, description: 'data the server does not serve yet' },
  },
  required: ['ported', 'skipped', 'patterns'],
}

const REVIEW = {
  type: 'object',
  properties: {
    theme: { type: 'string' },
    boards: {
      type: 'array',
      items: {
        type: 'object',
        properties: { board: { type: 'string' }, percent: { type: 'number' }, findings: { type: 'array', items: { type: 'string' } } },
        required: ['board', 'findings'],
      },
    },
  },
  required: ['theme', 'boards'],
}

const FIXED = {
  type: 'object',
  properties: {
    fixed: { type: 'array', items: { type: 'string' } },
    departures: { type: 'array', items: { type: 'string' }, description: 'where the app draws what the handoff means rather than its render, and why' },
    left: { type: 'array', items: { type: 'string' }, description: 'findings left, each with its reason' },
  },
  required: ['fixed', 'departures', 'left'],
}

const LANDED = {
  type: 'object',
  properties: {
    check: { type: 'string', description: 'the port map check output' },
    counts: { type: 'object', properties: { ported: { type: 'number' }, skipped: { type: 'number' }, pending: { type: 'number' } } },
    skipList: { type: 'array', items: { type: 'string' } },
    close: { type: 'string', description: 'the close text for the chunk, the skip list in it' },
  },
  required: ['check', 'skipList', 'close'],
}

phase('Survey')
const survey = await agent([
  WHERE,
  '',
  `Read ${A.handoff}/manifest.json, its canvas.json and its port.json (the port map: each board a file in the app, { "skip": reason } or { "pending": chunk }).`,
  ONLY ? `This is a re-port of these boards only: ${ONLY.join(', ')}.` : `Port every board still pending in port.json (chunk ${A.chunk}).`,
  A.app ? `The app folder is ${A.app}.` : 'The app folder is port.json\'s "app".',
  'Group the boards to port by canvas page. Leave out, under decided, a board that only re-imports another in a theme (a *Light twin: the theme tokens draw it), a documentation board (colour, type, space, motion, token sheets), and a board already ported that this run does not touch.',
  'Return the app folder, the stylesheet file, the pages with their boards to port, and the decided boards with their reasons. Read only; change nothing.',
].join('\n'), { label: 'survey', phase: 'Survey', schema: PAGES })

if (!survey) throw new Error('design-port: the survey returned nothing; rerun with resumeFromRunId')
const pages = survey.pages.filter((p) => p.boards && p.boards.length)
log(`${pages.length} pages to port, ${pages.reduce((n, p) => n + p.boards.length, 0)} boards; ${survey.decided.length} decided up front`)

phase('Foundation')
const foundation = await agent([
  WHERE,
  '',
  `The app is ${survey.app}. Lay the foundation every screen agent builds on:`,
  `1. Copy ${A.handoff}/${survey.stylesheet || '<the stylesheet>'} into the app verbatim. A delivered bug is repaired at build time, never in the file; log each repair as a departure.`,
  '2. Bundle the fonts offline (the boards\' font links never ship).',
  '3. One component per design class the boards use, in the app\'s UI folder; reuse what exists.',
  `4. Every screen the pages below draw gets a route and a stub file, so the screen agents touch only their own files: ${pages.map((p) => `${p.name} (${p.boards.join(', ')})`).join('; ')}.`,
  'Run the app\'s own tests and build. Return the components, routes and stub files made, one line each.',
].join('\n'), { label: 'foundation', phase: 'Foundation' })

phase('Screens')
const screens = (await parallel(pages.map((p) => () => agent([
  WHERE,
  '',
  `You port the canvas page "${p.name}": boards ${p.boards.join(', ')}. The foundation is laid:`,
  String(foundation || '(no foundation summary)'),
  '',
  `Build each board in its stub, from the foundation's components and ${survey.stylesheet || 'the stylesheet'}'s classes, adopting every pattern unless it is clearly superfluous.`,
  'Edit only your page\'s screen files. A change a shared file needs (routes, the app shell, the data layer) goes back under shared, for the integrator.',
  'Real data only: data the server does not serve yet shows the design\'s empty state or a dim dash, listed under endpoints.',
  'Return each board ported with its files (relative to the app folder), each board skipped with its reason, and every pattern left out or drawn differently with its reason.',
].join('\n'), { label: `page ${p.name}`, phase: 'Screens', schema: DONE })))).filter(Boolean)

phase('Integrate')
const integrated = await agent([
  WHERE,
  '',
  `Integrate the port in ${survey.app}. The screen agents report:`,
  JSON.stringify(screens.map((s) => ({ shared: s.shared || [], endpoints: s.endpoints || [] }))),
  'Apply every shared change, wire each screen to the app\'s real data, and list the endpoints the server lacks in one place in the app.',
  'Run the app\'s tests and build until green. Return what you changed and the endpoints list.',
].join('\n'), { label: 'integrate', phase: 'Integrate' })

phase('Fidelity')
const reviews = (await parallel(THEMES.map((theme) => () => agent([
  WHERE,
  '',
  `You review the ${theme} theme. Change no file in this step.`,
  `1. node scripts/design/render.mjs ${A.handoff} --theme ${theme} --out <a scratch folder>${ONLY ? ` --board ${ONLY.join(',')}` : ''}`,
  '2. Screenshot each ported screen at its board\'s size in this theme, on fixtures standing in for missing data (never live data).',
  '3. node scripts/design/compare.mjs <board.png> <app.png> --out <scratch>/<Board>.diff.png, then compare where the red gathers element by element: text, type, spacing, colour, contrast.',
  'Frozen demo states, demo data and timers differ on purpose (skills/design/render.md). Return each board\'s percent and its findings, each naming the element and the file to fix.',
].join('\n'), { label: `review ${theme}`, phase: 'Fidelity', schema: REVIEW })))).filter(Boolean)

const findings = reviews.flatMap((r) => r.boards.filter((b) => b.findings.length).map((b) => ({ theme: r.theme, board: b.board, findings: b.findings })))
log(`${findings.length} boards with findings across ${reviews.length} themes`)
const fixes = findings.length
  ? await agent([
    WHERE,
    '',
    'Fix these fidelity findings in the app, then rerun compare.mjs on each board to confirm:',
    JSON.stringify(findings),
    'A finding that is the handoff\'s own bug: draw what the handoff means, and log it as a departure. A finding left: say why.',
    'Run the app\'s tests and build until green.',
  ].join('\n'), { label: 'fidelity fixes', phase: 'Fidelity', schema: FIXED })
  : { fixed: [], departures: [], left: [] }

phase('Land')
const landed = await agent([
  WHERE,
  '',
  `Land the port of ${A.handoff} for chunk ${A.chunk}:`,
  `1. ${A.handoff}/port.json: every board ported maps to its files (relative to the app folder), every board left out is { "skip": "<reason>" }, and a board for a later chunk stays { "pending": "<chunk>" }. Port results:`,
  JSON.stringify({ decided: survey.decided, screens: screens.map((s) => ({ ported: s.ported, skipped: s.skipped })) }),
  `2. node scripts/design/port-map.mjs check ${A.handoff} passes.`,
  `3. ${A.handoff}/README.md "Patterns not adopted": every pattern left out or drawn differently, with its reason, grouped by kind (documentation boards, frozen demo states, demo data, the design tool's delivery, boards the tokens produce, data not served yet, slips not copied, departures).`,
  'The patterns, departures and findings left:',
  JSON.stringify({ patterns: screens.flatMap((s) => s.patterns), departures: fixes ? fixes.departures : [], left: fixes ? fixes.left : [] }),
  `4. Draft the close for chunk ${A.chunk}: what was ported, the integration notes, the fidelity passes (${THEMES.join(', ')}), and the skip list.`,
  'Return the check output, the counts, the skip list and the close.',
].join('\n'), { label: 'land', phase: 'Land', schema: LANDED })

return {
  chunk: A.chunk,
  handoff: A.handoff,
  pages: pages.map((p) => p.name),
  themes: THEMES,
  integrated,
  fixed: fixes ? fixes.fixed : [],
  departures: fixes ? fixes.departures : [],
  check: landed ? landed.check : null,
  counts: landed ? landed.counts : null,
  skipList: landed ? landed.skipList : [],
  close: landed ? landed.close : null,
}
