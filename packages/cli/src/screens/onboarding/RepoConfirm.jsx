// "This goes to GitHub": the confirm card in front of every outward step (creating the repo, pushing). Inline, in
// place of the step's buttons, so the person keeps the context. The command lines are the server's own plan for
// these exact fields (GET /api/repo/start's dry-run answer), so the card cannot drift from what runs.
import { Icon, TickLabel } from '../../ui/index.js';
import { SynRuns } from '../../ui/markdown.jsx';
import { tokenizeShell } from '../../ui/shell-syntax.js';
import { cmdOf } from './repoStart.js';

/**
 * @param {object} p
 * @param {'create'|'push'} p.kind          create: gh repo create, then the push; push: the push only
 * @param {string} p.owner
 * @param {string} p.name
 * @param {string} p.visibility            'private' | 'public'
 * @param {string} p.login                 the gh login (owner mode is offered ticked only for your own repo)
 * @param {{ remote: string[], push: string[] }} p.plan
 * @param {{ commits?: number, files?: number, branch?: string }} p.counts
 * @param {boolean} p.ownerMode            the tick
 * @param {(on: boolean) => void} p.onOwnerMode
 * @param {string|null} p.phase           null | 'creating' | 'pushing'
 * @param {boolean} p.created              the repo exists: the button pushes again, never creates again
 */
export default function RepoConfirm({ kind = 'create', owner, name, visibility = 'private', login, plan, counts = {}, ownerMode, onOwnerMode, phase, created, onCancel, onGo, children }) {
  const branch = counts.branch || 'main';
  const commits = counts.commits || 1;
  const lines = kind === 'create' && !created ? [plan?.remote, plan?.push] : [plan?.push];
  const mine = owner && login && owner.toLowerCase() === login.toLowerCase();
  const busy = !!phase;
  const go = phase === 'creating' ? `Creating ${owner}/${name}...` : phase === 'pushing' ? `Pushing ${branch}...` : created || kind === 'push' ? 'Push again' : 'Create and push';
  return (
    <div className="rs-confirm" role="group" aria-label="This goes to GitHub">
      <div className="rs-confirm-h"><Icon name="external" size={14} />This goes to GitHub</div>
      <p className="t-body-s c-2" style={{ margin: 0 }}>
        {kind === 'create' && !created
          ? <>This creates a <b>{visibility}</b> repo <b>{owner}/{name}</b> on GitHub as <b>{login}</b>, and pushes <b>{branch}</b> ({commits} commit{commits === 1 ? '' : 's'}{counts.files ? `, ${counts.files} files` : ''}) to it.</>
          : <>This pushes <b>{branch}</b> ({commits} commit{commits === 1 ? '' : 's'}) to <b>{owner}/{name}</b> on GitHub.</>}
      </p>
      <div className="rs-cmds">
        {lines.filter(Boolean).map((args, i) => (
          <div className="cmd-line" key={i}><span className="p">$</span><span><SynRuns tokens={tokenizeShell(cmdOf(args))} /></span></div>
        ))}
      </div>
      {kind === 'create' && !created && onOwnerMode ? (
        <div className="rs-owner">
          <TickLabel checked={!!ownerMode} onChange={onOwnerMode} disabled={busy}>Owner mode on: your commits and the cloud loop land straight on {branch}.</TickLabel>
          <span className="t-body-s c-3">{mine ? 'You own this repo; contributor mode would open pull requests to yourself.' : 'An org repo: tick it if you are the one who lands work here.'}</span>
        </div>
      ) : null}
      {children}
      <div className="rs-confirm-acts">
        <button className="btn btn-ghost btn-s" type="button" onClick={onCancel} disabled={busy}>Cancel</button>
        <button className="btn btn-primary btn-s" type="button" onClick={onGo} disabled={busy} aria-busy={busy || undefined}>{go}</button>
      </div>
    </div>
  );
}
