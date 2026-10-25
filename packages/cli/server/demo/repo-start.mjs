// The demo's folder-to-cloud-loop stage (spec 44 A1; the live side is server/repo-start.mjs and cloud-secret.mjs):
// one state machine held in memory for the `plain-folder` and `cloud-token` scenarios. Nothing is written, run or
// sent: a "git init" moves a word in memory, a posted token is checked with the same checkToken the live server uses
// and dropped at once. The machine lives outside the world, so --loop's restarts never undo a person's clicks; only
// POST /api/demo/restart resets it.
//
// The names are invented: the folder `lantern`, the person Ada Park (gh login ada-park), the org lantern-labs.
import { guideFor, manualFor, OWNER_RE, NAME_RE } from '../repo-start.mjs';
import { checkToken, SECRET_NAME } from '../../shared/oauth-token.mjs';
import { cronNext, describeCrons, scheduleRequest } from '../cloud.mjs';

const PERSON = { name: 'Ada Park', email: 'ada@example.com' };
const LOGIN = 'ada-park';
const ORG = 'lantern-labs';
const FOLDER = 'lantern';
const TAKEN = new Set(['ada-park/lantern-old', 'lantern-labs/lantern']);
const NIGHT = '30 1-6 * * *';

/** Where each scenario starts. */
const STARTS = {
  'plain-folder': { step: 'none', remote: null, workflow: false, secret: false },
  'cloud-token': { step: 'github', remote: { owner: LOGIN, name: FOLDER }, workflow: true, secret: false },
};

const sleep = (clock, ms) => (clock.kind === 'manual' ? Promise.resolve() : new Promise((r) => setTimeout(r, ms / (clock.speed || 1))));

/** The stage for scenario `name`, or null when it has none. */
export function createRepoStage(name, { clock }) {
  const init = STARTS[name];
  if (!init) return null;
  let st;
  let runs;
  let failPush = false;
  const reset = () => {
    st = { ...init, remote: init.remote ? { ...init.remote } : null, head: init.step === 'github' ? '9d4c1e0' : null, gitignore: null };
    runs = [];
    failPush = false;
  };
  reset();

  const place = () => ({ none: 'none', local0: 'local', local: 'local', unpushed: 'unpushed', github: 'github' }[st.step]);
  const isGit = () => st.step !== 'none';
  const web = () => (st.remote ? `https://github.com/${st.remote.owner}/${st.remote.name}` : null);
  const slug = () => (st.remote ? `${st.remote.owner}/${st.remote.name}` : null);

  /** GET /api/repo/start, in the live server's shape. */
  function start(q = {}) {
    const owner = q.owner && OWNER_RE.test(q.owner) ? q.owner : (st.remote?.owner || LOGIN);
    const nm = q.name && NAME_RE.test(q.name) ? q.name : (st.remote?.name || FOLDER);
    const vis = q.visibility === 'public' ? 'public' : 'private';
    const next = { none: 'init', local0: 'commit', local: 'remote', unpushed: 'push', github: 'done' }[st.step];
    const ctx = { platform: 'linux', folder: `/demo/${FOLDER}`, slug: FOLDER, owner, name: nm, ghName: PERSON.name, branch: 'main', visibility: vis };
    const commits = st.head ? 1 : 0;
    const out = {
      place: place(),
      next,
      platform: 'linux',
      folder: { path: `/demo/${FOLDER}`, name: FOLDER, slug: FOLDER },
      git: { installed: true, version: '2.43.0', user: PERSON, from: 'global' },
      gh: { installed: true, signedIn: true, login: LOGIN, name: PERSON.name, id: 4815162, orgs: [ORG], scopes: ['gist', 'read:org', 'repo', 'workflow'], protocol: 'https' },
      repo: isGit() ? { branch: 'main', commits, head: st.head, remote: st.remote ? { host: 'github.com', owner: st.remote.owner, name: st.remote.name, web: web() } : null, pushed: st.step === 'github' ? true : st.remote ? false : null } : { branch: null, commits: 0, head: null, remote: null, pushed: null },
      gitignore: { exists: isGit(), missing: isGit() ? [] : ['.env', '.env.*', '!.env.example', '.nexus/', '.owner'] },
      plan: {
        init: ['git', 'init', '-b', 'main'],
        remote: ['gh', 'repo', 'create', `${owner}/${nm}`, `--${vis}`, '--source', '.', '--remote', 'origin'],
        push: ['git', 'push', '-u', 'origin', 'main'],
      },
      guide: {},
      manual: manualFor(ctx),
    };
    if (st.step === 'none') out.preview = { files: 37, capped: false, ignoredTop: [], flagged: [], large: [] };
    if (st.step === 'local0') out.preview = { files: 37, capped: false, ignoredTop: ['node_modules/', '.env', '.nexus/'], flagged: [{ path: 'config/secrets.json', why: 'named for secrets' }], large: [] };
    if (q.owner && q.name) {
      out.nameFree = !TAKEN.has(`${owner}/${nm}`);
      if (!out.nameFree) out.guide.exists = guideFor('exists', ctx);
    }
    return out;
  }

  const answer = (status, body) => ({ ...body, status });

  async function write(step, b) {
    await sleep(clock, 700 + Math.round(Math.random() * 700));
    switch (step) {
      case 'init':
        if (st.step !== 'none') return answer(200, { already: true, branch: 'main', start: start() });
        st.step = 'local0';
        return answer(200, { ok: true, branch: 'main', gitignore: { wrote: true, lines: 9 }, start: start() });
      case 'identity':
        return answer(200, { already: true, identity: { ...PERSON, scope: 'global' }, start: start() });
      case 'commit': {
        if (st.step === 'none') return answer(409, { error: 'This folder is not a repo at this root yet: start the repo first.' });
        if (st.head) return answer(200, { already: true, head: st.head, start: start() });
        const flagged = ['config/secrets.json'];
        const leave = Array.isArray(b.leaveOut) ? b.leaveOut : flagged;
        if (leave.some((x) => !flagged.includes(x))) return answer(400, { error: 'leaveOut takes only the files nexus flagged.' });
        st.head = 'a1b2c3d';
        st.step = 'local';
        return answer(200, { ok: true, head: st.head, files: leave.length ? 36 : 37, leftOut: leave, start: start() });
      }
      case 'remote': {
        if (!st.head) return answer(409, { error: 'Make the first commit before putting it on GitHub.' });
        if (st.remote) return answer(200, { already: true, web: web(), start: start() });
        if (![LOGIN, ORG].includes(b.owner) || !NAME_RE.test(String(b.name || ''))) return answer(400, { error: 'owner, name and visibility (private or public) are needed, in GitHub\'s own characters.' });
        if (TAKEN.has(`${b.owner}/${b.name}`)) return answer(409, { error: `github.com/${b.owner}/${b.name} already exists.`, exists: true, why: 'exists', guide: guideFor('exists', { owner: b.owner, name: b.name }) });
        st.remote = { owner: b.owner, name: b.name };
        st.step = 'unpushed';
        return answer(200, { ok: true, web: web(), remote: `${web()}.git`, start: start() });
      }
      case 'push':
        if (!st.remote) return answer(409, { error: 'There is no origin to push to yet.' });
        if (st.step === 'github') return answer(200, { already: true, web: web(), start: start() });
        if (failPush) {
          failPush = false;
          return answer(409, { error: 'GitHub did not take the push: git has no GitHub sign-in on this machine.', why: 'push-auth', guide: guideFor('push-auth', {}), start: start() });
        }
        st.step = 'github';
        return answer(200, { ok: true, web: web(), branch: 'main', start: start() });
      default:
        return null;
    }
  }

  function schedule() {
    if (!st.workflow) return null;
    const crons = [NIGHT];
    const human = describeCrons(crons);
    const next = cronNext(NIGHT, new Date(clock.now()));
    return { path: '.github/workflows/march.yml', ref: 'origin/main', crons, cron: NIGHT, human, raw: false, label: human[0].toUpperCase() + human.slice(1), next: next ? next.toISOString() : null };
  }

  /** GET /api/actions in the live shape: a plain folder says so; a GitHub repo lists the loop and the secret. */
  function actions() {
    if (st.step !== 'github') return { gh: true, place: place(), note: st.step === 'none' ? 'This folder is not a git repo yet, so it has no GitHub repo for the cloud loop. Put it on GitHub first (Cloud setup, step 0).' : 'This repo is not on GitHub yet: it has no origin. Put it on GitHub first (Cloud setup, step 0).', steps: [], workflows: [], schedule: null };
    return {
      gh: true,
      place: 'github',
      web: web(),
      slug: slug(),
      viewer: 'ADMIN',
      steps: [
        { id: 'secret', label: `${SECRET_NAME} repo secret`, ok: st.secret, detail: st.secret ? `secrets: ${SECRET_NAME}` : 'no repo secrets', fix: 'Run `claude setup-token` on this machine, then paste the token in Cloud setup\'s sign-in step.' },
        { id: 'control', label: 'You can pause and run the loop', ok: true, optional: true, detail: 'your role: admin', fix: null },
        { id: 'permissions', label: 'Workflow token has what the loop needs', ok: true, detail: 'march.yml declares its own permissions per job; repo default: read (least privilege)', fix: null },
        { id: 'rulesets', label: 'Rulesets on main and claims', ok: false, optional: true, detail: 'none', fix: 'Optional in owner mode. In PR mode, protect main so only pull requests land.' },
      ],
      workflows: st.workflow ? [{ id: 1, name: 'march', path: '.github/workflows/march.yml', enabled: true, state: 'active' }] : [],
      schedule: schedule(),
    };
  }

  /** A fake run: queued, then running, then green, over about 6 s of wall time from its start. */
  function runRows() {
    const now = clock.now();
    return runs.map((r) => {
      const age = now - r.t0;
      const status = age < 1500 ? 'queued' : age < 6000 ? 'in_progress' : 'completed';
      return {
        databaseId: r.id, number: r.id, displayTitle: 'nexus loop: one pass', workflowName: 'march', event: 'workflow_dispatch',
        status, conclusion: status === 'completed' ? 'success' : null,
        createdAt: new Date(r.t0).toISOString(), updatedAt: new Date(Math.min(now, r.t0 + 6000)).toISOString(), url: '', stalled: false,
      };
    }).reverse();
  }

  /** -> { status, ...answer } for a route this stage serves, or null. */
  async function handle(method, pathname, url, readBody) {
    const route = `${method} ${pathname}`;
    if (route === 'GET /api/repo/start') {
      if (url.searchParams.get('fail') === 'push') failPush = true;
      return answer(200, start(Object.fromEntries(url.searchParams)));
    }
    const m = /^POST \/api\/repo\/(init|identity|commit|remote|push)$/.exec(route);
    if (m) {
      const b = await readBody();
      if (b.confirm !== true) return answer(400, { error: 'confirm: true is required' });
      return write(m[1], b);
    }
    switch (route) {
      case 'GET /api/actions': return answer(200, actions());
      case 'GET /api/runs': return answer(200, st.step === 'github' ? { ok: true, runs: runRows() } : { ok: false, runs: [], place: place(), note: actions().note });
      case 'POST /api/cloud/secret': {
        const b = await readBody();
        if (st.step !== 'github') return answer(409, { error: 'This folder is not on GitHub yet: put it there first (Cloud setup, step 0).', place: place() });
        const tok = checkToken(b.value, { force: b.force === true });
        // The value is dropped here: only whether it passed is kept.
        b.value = null;
        if (!tok.ok) return answer(tok.status, { error: tok.error, ...(tok.warn ? { warn: tok.warn } : {}) });
        await sleep(clock, 900);
        st.secret = true;
        return answer(200, { ok: true, name: SECRET_NAME, repo: slug(), verified: true, updatedAt: new Date(clock.now()).toISOString() });
      }
      case 'POST /api/cloud/workflow': {
        await readBody();
        if (st.step !== 'github') return answer(409, { error: 'This folder is not on GitHub yet: put it there first (Cloud setup, step 0).', place: place() });
        await sleep(clock, 1200);
        const was = st.workflow;
        st.workflow = true;
        return answer(200, { path: '.github/workflows/march.yml', sha: '3f1c2ab', written: !was, branch: 'main' });
      }
      case 'POST /api/cloud/schedule': {
        const b = await readBody();
        if (st.step !== 'github') return answer(409, { error: 'This folder is not on GitHub yet.', place: place() });
        await sleep(clock, 1200);
        // The live checks (cloud.mjs scheduleRequest): a preset's cron is its own, and it sets NEXUS_CADENCE.
        const q = scheduleRequest(b);
        if (q.error) return answer(400, { error: q.error });
        st.workflow = true;
        const cron = q.cron;
        return answer(200, { cron, next: cron ? cronNext(cron, new Date(clock.now()))?.toISOString() ?? null : null, path: '.github/workflows/march.yml', written: true, sha: '7e2d9a4', ...(q.cadence ? { cadence: { name: q.cadence, variable: 'set' } } : {}) });
      }
      case 'POST /api/cloud/run': {
        await readBody();
        if (!st.workflow) return answer(409, { error: 'no loop workflow in this repo' });
        runs.push({ id: 100 + runs.length + 1, t0: clock.now() });
        return answer(200, { ok: true, id: '1', out: '' });
      }
      case 'POST /api/actions/workflow': await readBody(); return answer(200, { ok: true, out: '' });
      default: return null;
    }
  }

  return {
    handle,
    reset,
    /** What GET /api/state and /api/preflight say about the folder. */
    info: () => ({ isGit: isGit(), place: place(), branch: isGit() ? 'main' : null, remote: st.remote ? `${web()}.git` : null, lastCommit: st.head ? `${st.head} first commit` : null }),
  };
}
