// The demo scenarios (spec 44 A1): fixtures and a timed beat script each,
// for docs, screenshots, the README's recordings and UI tests. Every name
// here is invented: the project is "fieldday", a league and fixtures
// scheduler that does not exist; no real project is named.
//
//   fleet-to-tug    four star-named sessions breathing on the fleet; vega asks, everything hushes and the card
//                   pulls into the conversation; the owner answers; the stage wakes and the chunk lands on main
//   bug-to-archive  "the PDF export crashes on long seasons" shows a /bug chip; accepted, the chunk slots into
//                   the plan, is claimed, built, gated and closed
//   fall-and-resume deneb fell over mid-chunk; Resume on its tile picks it up and it finishes the chunk
//   heads-down      altair works a claimed list of three chunks, one after another
//   stack           Set up a stack in the Vault: Cloudflare, Supabase and Vercel, card by card, to a live domain
//
// The script format is server/demo/world.mjs's. Times are ms from the start (or from the gate that holds them).
// A scenario may carry a `shot` for the recorder (scripts/record.mjs): the screen it opens on (`fleet`, or a
// session's name; default the home session's cockpit) and the clicks a pointer makes there, each
// `{ at, click: <css selector>, text?, what }` (`at`: script ms; `text`: the element holds it). A click on the
// owner's turn takes it as the owner would; the gate's `auto` stays the fallback.
import { MAIN } from '../../shared/beats.mjs';

export const PROJECT = 'fieldday';
const OWNER = 'sam';
const H = 3600000;

// ---- shared fixtures ------------------------------------------------------------------

const commits = (list) => list.map(([sha, m, w]) => ({ sha, m, w }));

/** One session's tile, detail and channel history. */
function session(ctx, o) {
  const id = `demo-${o.name}`;
  const git = {
    branch: o.kind === 'terminal' ? `feat/${o.chunk.id}` : `nexus/${o.name}-1`,
    worktree: o.kind === 'terminal' ? '' : `../.nexus-wt/${o.name}-1`,
    up: o.up ?? 2, down: 0, behind: 0, dirty: o.dirty ?? 3, pr: null, noPr: true,
    claims: [o.chunk.id],
    commits: commits(o.commits || []),
  };
  const row = {
    claude: `c-${o.name}`, repo: PROJECT, mode: 'owner',
    state: o.state || 'live', phase: 'working',
    progress: o.progress, chunk: { id: o.chunk.id, title: o.chunk.title },
    orb: o.orb || 'thinking', agents: o.agents || [{ state: 'thinking' }],
    event: { at: ctx.ago(o.eventAgo ?? 0), text: o.event || '' },
    beat: ctx.ago(o.beatAgo ?? 0), parked: 0, git,
    linked: true, steer: o.kind === 'terminal' ? 'hook' : 'sdk', live: o.state !== 'fallen',
    hosted: o.kind !== 'terminal', pause: 'run', sources: o.kind === 'terminal' ? ['ledger', 'claude'] : ['server'],
    ...(o.row || {}),
  };
  const ledger = {
    claude: `c-${o.name}`, repo: PROJECT, mode: 'owner', phase: 'working', state: o.state === 'fallen' ? 'fallen' : 'live',
    startedAt: ctx.ago(o.startedAgo ?? 47), workedMs: (o.startedAgo ?? 47) * 60000, budget: { label: '3–4h', ms: 4 * H },
    chunk: { id: o.chunk.id, title: o.chunk.title, size: o.chunk.size || 'M', estimate: 40, startedAt: ctx.ago(o.chunkAgo ?? 18), ac: o.chunk.ac || { met: 2, total: 4 } },
    spec: o.spec || null,
    claims: { now: o.chunk.id, next: o.next || [], held: 1 + (o.next || []).length },
    closed: o.closed || [], landed: o.landed || [],
    lastShip: o.landed?.length ? { ...o.landed[o.landed.length - 1], where: 'main' } : null,
    context: { room: o.room ?? 62, strata: [18, 26, 56], compactsAt: 10 },
    parked: [], tugs: [], defaults: [], git,
    ...(o.ledger || {}),
  };
  return { id, name: o.name, kind: o.kind || 'local', row, ledger, beats: o.beats || [], transcript: o.transcript || [] };
}

/** A stage mid-chunk: main, its sub-agents, the chunk claimed and building. */
function working(chunk, agents) {
  const out = [{ k: 'agent', p: 'start', id: MAIN, label: 'session' }, { k: 'chunk', p: 'claim', id: chunk }, { k: 'chunk', p: 'build', id: chunk }];
  for (const a of agents) {
    out.push({ k: 'agent', p: 'start', id: a.id, parent: a.parent || MAIN, label: a.label, ...(a.junction ? { junction: true } : {}) });
    if (a.tool) out.push({ k: 'agent', p: 'tool', id: a.id, tool: a.tool });
    if (a.done) out.push({ k: 'agent', p: 'end', id: a.id, ok: true });
  }
  out.push({ k: 'agent', p: 'tool', id: MAIN, tool: 'Read' });
  return out;
}

function fleet(ctx) {
  return [
    session(ctx, {
      name: 'vega', chunk: { id: '12.4', title: 'Season standings table' }, next: ['12.5'],
      progress: { done: 2, total: 4, pct: 50, label: '2 of 4 chunks' },
      spec: { line: 'Standings: every table a season needs', ref: 'plan/12-standings.md' },
      agents: [{ state: 'writing' }, { state: 'tool' }], event: 'editing src/standings/table.ts',
      closed: [{ id: '12.3', title: 'Points per match', at: ctx.ago(31) }],
      landed: [{ sha: '9c1e2b7', msg: 'feat: points per match', chunk: '12.3', at: ctx.ago(31) }],
      commits: [['3f0a9d2', 'feat: standings rows from results', '6m'], ['9c1e2b7', 'feat: points per match', '31m']],
      beats: working('12.4', [
        { id: 'a-vega-table', label: 'standings view', tool: 'Edit' },
        { id: 'a-vega-tests', label: 'tiebreak tests', tool: 'Bash' },
      ]),
      transcript: [
        { kind: 'text', id: 'v1:0', agent: MAIN, text: 'Claimed 12.4. The table reads results through the points rule from 12.3; splitting the view and its tests.' },
        { kind: 'tool', id: 't-v1', agent: MAIN, name: 'Read', summary: 'plan/12-standings.md' },
        { kind: 'tool-done', id: 't-v1', agent: MAIN, ms: 400, ok: true },
        { kind: 'tool', id: 't-v2', agent: MAIN, name: 'Agent', summary: 'standings view' },
        { kind: 'tool', id: 't-v3', agent: MAIN, name: 'Agent', summary: 'tiebreak tests' },
        { kind: 'tool', id: 't-v4', agent: 'a-vega-table', name: 'Edit', summary: 'src/standings/table.ts', diff: { add: 64, del: 9 } },
        { kind: 'tool-done', id: 't-v4', agent: 'a-vega-table', ms: 1800, ok: true },
      ],
    }),
    session(ctx, {
      name: 'sirius', chunk: { id: '9.2', title: 'Roster import from CSV' }, next: ['9.3'],
      progress: { done: 1, total: 3, pct: 33, label: '1 of 3 chunks' }, startedAgo: 32, chunkAgo: 11,
      agents: [{ state: 'tool' }], event: 'running the importer tests', up: 1, dirty: 2,
      commits: [['b71c4e0', 'feat: roster CSV columns', '14m']],
      beats: working('9.2', [{ id: 'a-sirius-parse', label: 'csv parser', tool: 'Bash' }]),
      transcript: [{ kind: 'text', id: 's1:0', agent: MAIN, text: 'Header row maps; now the rows with missing shirt numbers.' }],
    }),
    session(ctx, {
      name: 'deneb', chunk: { id: '14.1', title: 'Fixture clash detector' }, next: ['14.2'],
      progress: { done: 0, total: 2, pct: 0, label: '0 of 2 chunks' }, startedAgo: 21, chunkAgo: 21,
      agents: [{ state: 'tool', workflow: true }, { state: 'thinking' }, { state: 'tool' }], event: 'workflow: venue sweep', up: 0, dirty: 5,
      beats: working('14.1', [
        { id: 'w-deneb', label: 'venue sweep', junction: true },
        { id: 'a-deneb-1', parent: 'w-deneb', label: 'north venues', tool: 'Grep' },
        { id: 'a-deneb-2', parent: 'w-deneb', label: 'south venues', tool: 'Read' },
      ]),
      transcript: [{ kind: 'text', id: 'd1:0', agent: MAIN, text: 'Two venues share a pitch on alternate weekends; sweeping every venue for the same pattern.' }],
    }),
    session(ctx, {
      name: 'altair', kind: 'terminal', chunk: { id: '7.6', title: 'Referee availability' },
      progress: { done: 3, total: 5, pct: 60, label: '3 of 5 chunks' }, startedAgo: 95, chunkAgo: 9,
      agents: [{ state: 'thinking' }], event: 'in a terminal', beatAgo: 1, up: 4, dirty: 1,
      commits: [['e2d5a61', 'feat: referee rest days', '22m']],
      beats: working('7.6', []),
    }),
  ];
}

function plan() {
  const c = (id, title, size, state = 'ready') => ({ id, title, size, state, closedOn: state === 'closed' ? '2026-10-20' : null, claim: null });
  const spec = (n, title, chunks) => ({ spec: n, title, file: `plan/${String(n).padStart(2, '0')}-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.md`, status: 'chunked', chunks });
  const specs = [
    spec('12', 'Standings', [c('12.1', 'Results feed', 'S', 'closed'), c('12.2', 'Match outcomes', 'S', 'closed'), c('12.3', 'Points per match', 'S', 'closed'), c('12.4', 'Season standings table', 'M', 'claimed'), c('12.5', 'Head-to-head tiebreaks', 'M')]),
    spec('9', 'Roster import', [c('9.1', 'Roster model', 'S', 'closed'), c('9.2', 'Roster import from CSV', 'M', 'claimed'), c('9.3', 'Duplicate player merge', 'S')]),
    spec('14', 'Fixture clashes', [c('14.1', 'Fixture clash detector', 'L', 'claimed'), c('14.2', 'Clash warnings in the editor', 'M'), c('14.3', 'Venue blackout dates', 'S')]),
    spec('15', 'Exports', [c('15.1', 'Season PDF export', 'M', 'closed'), c('15.2', 'Calendar feed (.ics)', 'M')]),
    spec('7', 'Referees', [c('7.4', 'Referee pool', 'S', 'closed'), c('7.5', 'Referee grades', 'S', 'closed'), c('7.6', 'Referee availability', 'M', 'claimed'), c('7.7', 'Assignment suggestions', 'M'), c('7.8', 'Referee travel limits', 'S')]),
  ];
  for (const s of specs) {
    const closed = s.chunks.filter((x) => x.state === 'closed').length;
    s.counts = { closed, open: s.chunks.length - closed, total: s.chunks.length };
    s.percent = Math.round((100 * closed) / s.chunks.length);
  }
  const claimed = [['12.4', 'vega'], ['9.2', 'sirius'], ['14.1', 'deneb'], ['7.6', 'altair']];
  for (const [id, who] of claimed) for (const s of specs) for (const x of s.chunks) if (x.id === id) x.claim = { who };
  return {
    order: {
      inFlight: claimed.map(([id, who]) => ({ id, spec: id.split('.')[0], who })),
      next: [
        { id: '12.5', spec: '12', lane: 'spec', size: 'M' }, { id: '9.3', spec: '9', lane: 'spec', size: 'S' },
        { id: '14.2', spec: '14', lane: 'spec', size: 'M' }, { id: '15.2', spec: '15', lane: 'spec', size: 'M' },
        { id: '7.7', spec: '7', lane: 'spec', size: 'M' }, { id: '14.3', spec: '14', lane: 'spec', size: 'S' }, { id: '7.8', spec: '7', lane: 'spec', size: 'S' },
      ],
      blocked: [], unchunked: [], mark: [],
    },
    progress: { specs },
  };
}

function claims(ctx) {
  return [['12.4', 'vega', 18], ['9.2', 'sirius', 11], ['14.1', 'deneb', 21], ['7.6', 'altair', 9]].map(([id, star, min]) => ({
    id, who: OWNER, host: 'demo', at: ctx.ago(min), session: `demo-${star}`, star, pr: null, held: false, state: 'live', mine: true,
  }));
}

function base(ctx, patch = (s) => s) {
  return {
    repo: { name: PROJECT, branch: 'main', lastCommit: '9c1e2b7 feat: points per match', owner: OWNER },
    owner: true,
    sessions: fleet(ctx).map(patch),
    plan: plan(),
    claims: claims(ctx),
    durable: [],
  };
}

// ---- script helpers --------------------------------------------------------------------

/** Several actions at one time, on one session: `at(1200, 'vega', { beat }, { tx })`. */
const at = (ms, s, ...actions) => actions.map((a) => ({ at: ms, session: s, ...a }));
const beat = (b) => ({ beat: b });
const tx = (t) => ({ tx: t });
const tool = (id, agent, name, summary, extra = {}) => tx({ kind: 'tool', id, agent, name, summary, ...extra });
const done = (id, agent, ms) => tx({ kind: 'tool-done', id, agent, ms, ok: true });

/** The fleet breathing: tools ticking over on every session, so every orb moves. */
function breathing(until) {
  const ticks = [
    ['sirius', 'a-sirius-parse', 'Bash'], ['deneb', 'a-deneb-1', 'Grep'], ['vega', 'a-vega-tests', 'Bash'],
    ['deneb', 'a-deneb-2', 'Read'], ['sirius', MAIN, 'Edit'], ['vega', 'a-vega-table', 'Edit'], ['altair', MAIN, 'Read'],
  ];
  const out = [];
  for (let t = 400, i = 0; t < until; t += 450, i += 1) {
    const [s, id, name] = ticks[i % ticks.length];
    out.push(...at(t, s, beat({ k: 'agent', p: 'tool', id, tool: name })));
  }
  return out;
}

// ---- the scenarios -----------------------------------------------------------------------

const STANDINGS_Q = 'Ties on points: break them by goal difference or by head-to-head first?';

export const fleetToTug = {
  name: 'fleet-to-tug',
  title: 'Fleet to tug',
  summary: 'Four sessions breathing on the fleet; vega asks, the stage hushes and the card pulls in; the owner answers; vega wakes and the chunk lands on main.',
  home: 'vega',
  shot: {
    start: 'fleet',
    moves: [
      { at: 1100, click: 'a.tile-name', text: 'vega', what: "vega's tile" },
      { at: 4100, click: 'button.tug-opt', text: 'Goal difference', what: 'the recommended answer' },
    ],
  },
  fixtures: (ctx) => base(ctx),
  script: [
    ...breathing(2400),
    ...at(1800, 'vega', tx({ kind: 'text', id: 'v2:0', agent: MAIN, text: 'The table renders. One call the spec leaves open before it can sort.' })),
    ...at(2400, 'vega', { row: { event: { text: 'asking you' } } }, beat({ k: 'agent', p: 'wait', id: 'a-vega-table' })),
    {
      at: 2500, session: 'vega',
      gate: {
        ask: {
          id: 'ask-vega-standings', agent: 'a-vega-table', deadline: 6 * 60000,
          questions: [{
            question: STANDINGS_Q, header: 'Standings tiebreak', multiSelect: false,
            options: [
              { label: 'Goal difference (recommended)', description: 'How most leagues publish a table; head-to-head is 12.5 on its own.' },
              { label: 'Head-to-head', description: 'Pulls 12.5 into this chunk.' },
            ],
          }],
        },
        auto: 2000,
        answers: { [STANDINGS_Q]: 'Goal difference' },
        then: [
          ...at(200, 'vega', { row: { event: { text: 'sorting by goal difference' } } }, beat({ k: 'agent', p: 'tool', id: 'a-vega-table', tool: 'Edit' })),
          ...at(300, 'vega', tx({ kind: 'text', id: 'v3:0', agent: MAIN, text: 'Goal difference it is. Finishing the sort and its tests.' })),
          ...at(500, 'vega', tool('t-v5', 'a-vega-table', 'Edit', 'src/standings/sort.ts', { diff: { add: 38, del: 4 } })),
          ...at(1000, 'vega', done('t-v5', 'a-vega-table', 500), beat({ k: 'agent', p: 'end', id: 'a-vega-table', ok: true })),
          ...at(1200, 'vega', beat({ k: 'agent', p: 'end', id: 'a-vega-tests', ok: true }), beat({ k: 'agent', p: 'tool', id: MAIN, tool: 'Bash' }), beat({ k: 'chunk', p: 'gate', id: '12.4' }), tool('t-v6', MAIN, 'Bash', 'node scripts/verify.mjs')),
          ...at(1900, 'vega',
            done('t-v6', MAIN, 700), beat({ k: 'chunk', p: 'archive', id: '12.4' }),
            { land: { sha: '4be81d0', msg: 'feat: season standings table', chunk: '12.4' } },
            { chunk: { id: '12.4', state: 'closed' } },
            { release: '12.4' },
            { row: { progress: { done: 3, total: 4, pct: 75, label: '3 of 4 chunks' }, event: { text: '12.4 landed on main' } } },
            { ledger: { closed: [{ id: '12.3', title: 'Points per match' }, { id: '12.4', title: 'Season standings table' }], chunk: null, claims: { now: null, next: ['12.5'], held: 1 } } },
            tx({ kind: 'text', id: 'v4:0', agent: MAIN, text: '12.4 is on main. Taking 12.5 next.' })),
          ...at(2500, 'vega', { claim: { id: '12.5' } }, beat({ k: 'chunk', p: 'claim', id: '12.5' }),
            { row: { chunk: { id: '12.5', title: 'Head-to-head tiebreaks' }, event: { text: 'claimed 12.5' } } },
            { ledger: { chunk: { id: '12.5', title: 'Head-to-head tiebreaks', size: 'M', ac: { met: 0, total: 3 } }, claims: { now: '12.5', next: [], held: 1 } } }),
        ],
      },
    },
  ],
};

const BUG = 'the PDF export crashes on long seasons';

export const bugToArchive = {
  name: 'bug-to-archive',
  title: 'Bug to archive',
  summary: 'A bug typed in the composer shows a /bug chip; accepted, its chunk slots into the plan, is claimed, built, gated and closed.',
  home: 'vega',
  shot: {
    start: 'vega',
    moves: [
      { at: 400, type: 'textarea[aria-label="Message the session"]', keys: BUG, ms: 1200, what: 'the composer' },
      // Plain text goes as typed (A17): the /bug route is the suggestion chip, taken with a click.
      { at: 2000, click: 'button.route-suggest-send', what: 'the /bug chip' },
    ],
  },
  fixtures: (ctx) => base(ctx),
  script: [
    ...breathing(1200),
    {
      at: 600, session: 'vega',
      gate: {
        send: `/bug ${BUG} -- plan it and do it`,
        auto: 2400,
        then: [
          ...at(300, 'vega', tx({ kind: 'text', id: 'b1:0', agent: MAIN, text: 'Reproduced: a season past 38 fixtures overflows the PDF page table. Plotting it as 15.3, then doing it.' }), tool('t-b1', MAIN, 'Skill', '/plot asap 15.3 PDF export: long seasons overflow the page table')),
          ...at(700, 'vega', done('t-b1', MAIN, 400), { chunk: { id: '15.3', title: 'PDF export: long seasons overflow the page table', size: 'S', plotted: true, lane: 'asap' } }),
          ...at(1300, 'vega', { claim: { id: '15.3' } }, beat({ k: 'chunk', p: 'claim', id: '15.3' }), { row: { chunk: { id: '15.3', title: 'PDF export: long seasons' }, event: { text: 'claimed 15.3' } } }),
          ...at(1700, 'vega', beat({ k: 'agent', p: 'start', id: 'a-pdf', parent: MAIN, label: 'pdf pagination fix' }), beat({ k: 'chunk', p: 'build', id: '15.3' }), tool('t-b2', MAIN, 'Agent', 'pdf pagination fix')),
          ...at(2300, 'vega', beat({ k: 'agent', p: 'tool', id: 'a-pdf', tool: 'Edit' }), tool('t-b3', 'a-pdf', 'Edit', 'src/export/pdf-table.ts', { diff: { add: 27, del: 11 } })),
          ...at(3000, 'vega', done('t-b3', 'a-pdf', 700), beat({ k: 'agent', p: 'end', id: 'a-pdf', ok: true }), beat({ k: 'agent', p: 'tool', id: MAIN, tool: 'Bash' }), beat({ k: 'chunk', p: 'gate', id: '15.3' }), tool('t-b4', MAIN, 'Bash', 'node scripts/verify.mjs')),
          ...at(3700, 'vega', done('t-b4', MAIN, 700), beat({ k: 'chunk', p: 'archive', id: '15.3' }),
            { land: { sha: 'c0de5a1', msg: 'fix: long seasons paginate the PDF table', chunk: '15.3' } },
            { chunk: { id: '15.3', state: 'closed' } }, { release: '15.3' },
            { row: { chunk: { id: '12.4', title: 'Season standings table' }, event: { text: '15.3 landed on main' } } },
            tx({ kind: 'text', id: 'b2:0', agent: MAIN, text: '15.3 is closed and on main. Back to 12.4.' })),
        ],
      },
    },
  ],
};

export const fallAndResume = {
  name: 'fall-and-resume',
  title: 'Fall and resume',
  summary: 'deneb fell over mid-chunk; Resume on its tile picks the ledger up and the chunk finishes.',
  home: 'deneb',
  fixtures: (ctx) => base(ctx, (s) => (s.name !== 'deneb' ? s : {
    ...s,
    row: { ...s.row, state: 'fallen', live: false, orb: 'failed', agents: [], beat: ctx.ago(9), fell: { tool: 'Bash', chunk: '14.1', at: ctx.ago(9) }, event: { at: ctx.ago(9), text: 'fell over: the session ended mid-chunk' } },
    ledger: { ...s.ledger, state: 'fallen' },
    beats: [], transcript: [],
  })),
  script: [
    ...breathing(1000),
    {
      at: 800, session: 'deneb',
      gate: {
        resume: true,
        auto: 1600,
        then: [
          ...at(0, 'deneb', { row: { state: 'resuming', resume: { by: 'deneb', chunk: '14.1', text: 'resuming 14.1 from its ledger' }, event: { text: 'resuming as deneb' } } }),
          ...at(1200, 'deneb', { row: { state: 'live', live: true, orb: 'thinking', fell: null, resume: null, event: { text: 'picked up 14.1' } } }, { ledger: { state: 'live' } },
            beat({ k: 'agent', p: 'start', id: MAIN, label: 'session' }), beat({ k: 'chunk', p: 'claim', id: '14.1' }),
            tx({ kind: 'text', id: 'r1:0', agent: MAIN, text: 'Resumed from the ledger: 14.1, the venue sweep had two of four venues done.' })),
          ...at(1800, 'deneb', beat({ k: 'agent', p: 'start', id: 'a-deneb-3', parent: MAIN, label: 'remaining venues' }), beat({ k: 'chunk', p: 'build', id: '14.1' })),
          ...at(2600, 'deneb', beat({ k: 'agent', p: 'tool', id: 'a-deneb-3', tool: 'Grep' })),
          ...at(3400, 'deneb', beat({ k: 'agent', p: 'end', id: 'a-deneb-3', ok: true }), beat({ k: 'chunk', p: 'gate', id: '14.1' })),
          ...at(4200, 'deneb', beat({ k: 'chunk', p: 'archive', id: '14.1' }), { land: { sha: '5a7e9f3', msg: 'feat: fixture clash detector', chunk: '14.1' } },
            { chunk: { id: '14.1', state: 'closed' } }, { release: '14.1' },
            { row: { progress: { done: 1, total: 2, pct: 50, label: '1 of 2 chunks' }, event: { text: '14.1 landed on main' } } }),
        ],
      },
    },
  ],
};

function headsDownChunk(start, id, title, sha, n) {
  return [
    ...at(start, 'altair', { claim: { id } }, beat({ k: 'chunk', p: 'claim', id }), { row: { chunk: { id, title }, event: { text: `claimed ${id}` } } },
      { ledger: { chunk: { id, title, size: 'S', ac: { met: 0, total: 3 } } } }, tx({ kind: 'text', id: `h${id}:0`, agent: MAIN, text: `${id}: ${title}.` })),
    ...at(start + 500, 'altair', beat({ k: 'agent', p: 'start', id: `a-${id}`, parent: MAIN, label: title.toLowerCase() }), beat({ k: 'chunk', p: 'build', id })),
    ...at(start + 1000, 'altair', beat({ k: 'agent', p: 'tool', id: `a-${id}`, tool: 'Edit' })),
    ...at(start + 1500, 'altair', beat({ k: 'agent', p: 'end', id: `a-${id}`, ok: true }), beat({ k: 'chunk', p: 'gate', id })),
    ...at(start + 2000, 'altair', beat({ k: 'chunk', p: 'archive', id }), { land: { sha, msg: `feat: ${title.toLowerCase()}`, chunk: id } },
      { chunk: { id, state: 'closed' } }, { release: id },
      { row: { progress: { done: n, total: 3, pct: Math.round((100 * n) / 3), label: `${n} of 3 chunks` } } }),
  ];
}

export const headsDown = {
  name: 'heads-down',
  title: 'Heads-down',
  summary: 'altair, heads down, works a claimed list of three chunks one after another.',
  home: 'altair',
  fixtures: (ctx) => {
    const fx = base(ctx, (s) => (s.name !== 'altair' ? s : {
      ...s, kind: 'local',
      row: { ...s.row, chunk: { id: '7.6', title: 'Referee availability' }, progress: { done: 0, total: 3, pct: 0, label: '0 of 3 chunks' }, steer: 'sdk', hosted: true, sources: ['server'], git: { ...s.row.git, branch: 'nexus/altair-1', worktree: '../.nexus-wt/altair-1' } },
      ledger: { ...s.ledger, loop: 'heads-down', claimed: ['7.6', '7.7', '7.8'], done: [], claims: { now: '7.6', next: ['7.7', '7.8'], held: 3 } },
      beats: [{ k: 'agent', p: 'start', id: MAIN, label: 'session' }],
      transcript: [{ kind: 'text', id: 'h0:0', agent: MAIN, text: 'Heads down on 7.6, 7.7 and 7.8. Defaults assumed; questions park for the end.' }],
    }));
    return fx;
  },
  script: [
    ...headsDownChunk(500, '7.6', 'Referee availability', 'a17c3e2', 1),
    ...headsDownChunk(3000, '7.7', 'Assignment suggestions', 'b28d4f3', 2),
    ...headsDownChunk(5500, '7.8', 'Referee travel limits', 'c39e5a4', 3),
    ...at(7600, 'altair', tx({ kind: 'text', id: 'h9:0', agent: MAIN, text: 'All three closed and on main. Nothing parked.' }), beat({ k: 'agent', p: 'end', id: MAIN, ok: true }), { row: { event: { text: 'heads-down list done' } } }),
  ],
};

// The stack hand-off: one quiet session while the owner walks Set up a stack in the Vault. The demo stack
// (server/demo/stack.mjs) answers the cards; the clicks below are the recorder's. The Supabase values are typed one
// by one (a recorder has no clipboard, so paste-many is shown in the UI tests instead). Demo-safe values:
//   cfut_demo0000000000000000000000, https://abcdefghijklmnopqrst.supabase.co, sb_publishable_demo0000000000,
//   sb_secret_demo000000000000000, vcp_demo00000000000000000000, and the pooler URL in server/demo/stack.mjs.
const sbVal = (key) => `[id="stk-supabase-${key}"]`;
export const stackHandoff = {
  name: 'stack',
  title: 'Stack hand-off',
  summary: 'Set up a stack in the Vault: Cloudflare, Supabase and Vercel, card by card, from tokens to a live domain.',
  home: 'vega',
  long: true,
  shot: {
    screen: '/vault?panel=stack',
    moves: [
      { at: 1500, click: 'button.stk-preset', text: 'Supabase + Vercel + Cloudflare', what: 'the trinity preset' },
      { at: 3000, type: 'input[aria-label="Your domain"]', keys: 'fieldday.dev', ms: 900, enter: true, what: 'the domain' },
      { at: 6000, type: '[id="stk-cloudflare-apiToken"] input', keys: 'cfut_demo0000000000000000000000', ms: 1200, what: 'the Cloudflare token' },
      { at: 7800, click: '[id="stk-cloudflare-apiToken"] button.btn-primary', text: 'Save', what: 'Save the token' },
      { at: 9000, click: '[id="stk-cloudflare"] .stk-check button', text: 'Check it', what: 'Check it (pending, nameservers shown)' },
      { at: 14500, type: `${sbVal('url')} input`, keys: 'https://abcdefghijklmnopqrst.supabase.co', ms: 1200, enter: true, what: 'the project URL' },
      { at: 17000, type: `${sbVal('publishable')} input`, keys: 'sb_publishable_demo0000000000', ms: 1000, enter: true, what: 'the publishable key' },
      { at: 19500, type: `${sbVal('secret')} input`, keys: 'sb_secret_demo000000000000000', ms: 1000, enter: true, what: 'the secret key' },
      { at: 22000, type: `${sbVal('dbUrl')} input`, keys: 'postgresql://postgres.abcdefghijklmnopqrst:demo-pw@aws-0-eu-west-2.pooler.supabase.com:6543/postgres', ms: 1600, enter: true, what: 'the database URL' },
      { at: 27500, type: '[id="stk-vercel-token"] input', keys: 'vcp_demo00000000000000000000', ms: 1000, enter: true, what: 'the Vercel token' },
      { at: 30000, click: '[id="stk-vercel"] .stk-check button', text: 'Check it', what: 'Check it' },
      { at: 32500, click: 'button.stk-proj', text: 'fieldday-web', what: 'pick fieldday-web' },
      { at: 35500, click: '.stk-next button', text: 'Send to Vercel', what: 'Send to Vercel' },
      { at: 38000, click: '[id="stk-act-vercel.env"] button.btn-primary', text: 'Send to Vercel', what: 'confirm' },
      { at: 41000, click: '.stk-next button', text: 'Add the domain', what: 'Add the domain' },
      { at: 43500, click: '[id="stk-act-vercel.domain"] button.btn-primary', text: 'Add the domain', what: 'confirm' },
      { at: 52000, click: '[id="stk-cloudflare"] .stk-check button', text: 'Check it', what: 'the zone turns active' },
      { at: 55000, click: '.stk-next button', text: 'Write the records', what: 'Write the records' },
      { at: 57500, click: '[id="stk-act-cloudflare.dns"] button.btn-primary', text: 'Write 2 records', what: 'confirm' },
      { at: 63000, click: '[id="stk-supabase-sb.auth"] .check', what: 'tick the Site URL step' },
      { at: 78000, click: '.stk-next button', text: 'Check again', what: 'Live: Vercel sees the records' },
    ],
  },
  fixtures: (ctx) => {
    const fx = base(ctx, (s) => ({
      ...s,
      row: { ...s.row, orb: 'thinking', agents: [], turn: 'idle', event: { at: ctx.ago(2), text: 'waiting for you' } },
      beats: [{ k: 'agent', p: 'start', id: MAIN, label: 'session' }],
      transcript: [{ kind: 'text', id: 'st0:0', agent: MAIN, text: 'Waiting while you set up the stack in the Vault. Agents only see the names.' }],
    }));
    return { ...fx, sessions: fx.sessions.filter((x) => x.name === 'vega') };
  },
  script: [
    ...at(400, 'vega', { row: { event: { text: 'waiting for you' } } }),
    ...at(90000, 'vega', tx({ kind: 'text', id: 'st1:0', agent: MAIN, text: 'The stack is set: names in the vault, values where the app reads them.' })),
  ],
};

export const SCENARIOS = Object.freeze({
  [fleetToTug.name]: fleetToTug,
  [bugToArchive.name]: bugToArchive,
  [fallAndResume.name]: fallAndResume,
  [headsDown.name]: headsDown,
  [stackHandoff.name]: stackHandoff,
});

export const scenarioNames = () => Object.keys(SCENARIOS);
