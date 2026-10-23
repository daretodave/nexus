// "Give the loop its sign-in": the cloud loop needs the CLAUDE_CODE_OAUTH_TOKEN repo secret. A mini terminal shows
// what `claude setup-token` prints (TokenTerm.jsx), then three honest places to put the token:
//   Paste it here   nexus hands it to `gh secret set` on stdin and keeps nothing (POST /api/cloud/secret)
//   In your terminal  the value never touches nexus: `gh secret set ... --repo O/N` and paste at its prompt
//   On GitHub       the repo's Actions secrets page
// Used by Cloud setup's step 2 and the Cloud loop screen's Sign-in card.
import { useEffect, useRef, useState } from 'react';
import { Icon, MaskField } from '../../ui/index.js';
import { useCopy, CopyFace } from './frame.jsx';
import { setLoopSecret } from './calls.js';
import TokenTerm, { StillTerm } from './TokenTerm.jsx';
import { SECRET_NAME } from '../../../shared/oauth-token.mjs';
import '../../styles/mini-term.css';

/** Who may paste: on GitHub, gh signed in, and admin on the repo (or a role gh could not read: gh decides). */
export function canPaste({ place, gh, viewer }) {
  if (place && place !== 'github') return false;
  if (gh === false) return false;
  return viewer == null || String(viewer).toUpperCase() === 'ADMIN';
}

/** The GitHub page where a new repo secret is added. */
export const secretsPage = (slug) => (slug ? `https://github.com/${slug}/settings/secrets/actions/new` : null);

const WHERE = {
  paste: { label: 'Paste it here', sub: 'nexus hands it to gh and keeps nothing' },
  terminal: { label: 'In your terminal', sub: 'the token never touches nexus' },
  github: { label: 'On GitHub', sub: 'the repo\'s secrets page' },
};

/**
 * @param {object} p
 * @param {string} [p.slug]          owner/name of the repo
 * @param {string} [p.place]
 * @param {boolean} [p.gh]           gh signed in
 * @param {string|null} [p.viewer]   the person's role on the repo (ADMIN, WRITE, ...), null when unread
 * @param {boolean} [p.open]         the terminal starts open
 * @param {() => void} [p.onSaved]   after a save GitHub took (the step reloads /api/actions)
 * @param {() => void} [p.onCheck]   Check again
 * @param {boolean} [p.reduced]      force the still terminal (tests)
 */
export default function TokenGuide({ slug, place, gh, viewer = null, open: startOpen = false, onSaved, onCheck, reduced }) {
  const allowed = canPaste({ place, gh, viewer });
  const [show, setShow] = useState(startOpen);
  // It opens by itself the first time the step becomes the current one (the data arrives after the first render).
  const opened = useRef(startOpen);
  useEffect(() => { if (startOpen && !opened.current) { opened.current = true; setShow(true); } }, [startOpen]);
  const [where, setWhere] = useState(allowed ? 'paste' : 'terminal');
  const [paste, setPaste] = useState('');
  const [peek, setPeek] = useState(false);
  const [state, setState] = useState(null); // null | 'saving' | { ok, verified, updatedAt, note } | { warn } | { error }
  const [copied, copy] = useCopy();
  const repo = slug || 'this repo';
  const ghCmd = `gh secret set ${SECRET_NAME}${slug ? ` --repo ${slug}` : ''}`;
  const page = secretsPage(slug);

  const save = async (force = false) => {
    const value = paste;
    setState('saving');
    let keepIt = false;
    try {
      const r = await setLoopSecret(value, force);
      setState({ ok: true, verified: r.verified, updatedAt: r.updatedAt, note: r.note });
      onSaved?.(r);
    } catch (e) {
      // Only the prefix question keeps the paste, so Save anyway has it; every other answer empties the field.
      keepIt = e.data?.warn === 'prefix';
      setState(keepIt ? { warn: 'prefix', error: e.message } : { error: e.message });
    } finally {
      if (!keepIt) setPaste(''); // clearPaste: the field empties
    }
  };
  const again = () => { setPaste(''); setState(null); };

  return (
    <div className="tg">
      <p className="t-body-s c-2" style={{ margin: 0 }}>
        Each run signs in to Claude with a long-lived token from your subscription. Mint it once on this machine with <code>claude setup-token</code>, then put it in the repo&apos;s secrets. It is the loop&apos;s sign-in, not a project secret, so it never goes in the vault.
      </p>
      <div className="rs-acts">
        <button className="btn btn-s" type="button" aria-expanded={show} onClick={() => setShow(!show)}><Icon name="terminal" size={14} />{show ? 'Hide' : 'Show me how'}</button>
      </div>
      {show ? <TokenTerm reduced={reduced} /> : null}

      <div className="tg-where">
        <span className="t-caps c-2">Where it goes</span>
        <div className="sched" role="radiogroup" aria-label="Where the token goes">
          {Object.entries(WHERE).map(([k, w]) => [
            <input key={`i-${k}`} type="radio" name="tg-where" id={`tg-${k}`} checked={where === k} onChange={() => setWhere(k)} />,
            <label key={`l-${k}`} htmlFor={`tg-${k}`}><b>{w.label}</b><span>{w.sub}</span></label>,
          ])}
        </div>
      </div>

      {where === 'paste' ? (
        <div className="tg-panel">
          {!allowed ? (
            <div className="t-body-s c-2">
              {place && place !== 'github' ? <>Put the folder on GitHub first; then the token has a repo to go to.</>
                : gh === false ? <>gh is not signed in, so nexus cannot hand it over. Use your terminal or GitHub.</>
                  : <>Setting a repo secret needs admin on {repo}. Ask an admin, or send them to: {page ? <a href={page} target="_blank" rel="noreferrer">{page.replace(/^https:\/\//, '')}</a> : 'the repo\'s secrets page'}</>}
            </div>
          ) : state?.ok ? (
            <div className="tg-done" role="status">
              <Icon name="check" size={14} />
              <span className="t-body-s">
                {state.verified === true ? <><b>Set.</b> GitHub lists {SECRET_NAME} on {repo}, updated just now.</>
                  : state.verified === false ? <><b>gh says it is set.</b> GitHub does not list it yet; Check again in a moment.</>
                    : <><b>gh says it is set.</b> {state.note || 'Listing secrets needs admin, so nexus could not double-check; the first run will tell.'}</>}
              </span>
              <button className="btn btn-ghost btn-s" type="button" onClick={() => setState(null)}>Paste a new one</button>
            </div>
          ) : (
            <>
              <span className="t-body-s c-2">Paste the whole token</span>
              <MaskField value={paste} onChange={setPaste} show={peek} onToggle={() => setPeek(!peek)} label="Paste the whole token" placeholder="sk-ant-oat01-..." onEnter={() => paste && state !== 'saving' && save()} />
              {state?.warn === 'prefix' ? (
                <div className="rs-err" role="alert">
                  <span className="t-body-s">{state.error}</span>
                  <div className="rs-acts">
                    <button className="btn btn-s" type="button" onClick={() => save(true)}><Icon name="key" size={14} />Save anyway</button>
                    <button className="btn btn-s btn-ghost" type="button" onClick={again}>Paste again</button>
                  </div>
                </div>
              ) : state?.error ? <div className="rs-err" role="alert"><span className="t-body-s">{state.error}</span></div> : null}
              <div className="rs-acts">
                {state?.warn === 'prefix' ? null : (
                  <button className="btn btn-s btn-primary" type="button" disabled={!paste || state === 'saving'} aria-busy={state === 'saving' || undefined} onClick={() => save()}>
                    <Icon name="key" size={14} />{state === 'saving' ? 'Saving...' : `Save to ${repo}`}
                  </button>
                )}
              </div>
              <span className="t-body-s c-3">nexus hands it straight to <code>gh secret set</code> and keeps nothing: not on disk, not in a log, not in this page after you save.</span>
            </>
          )}
        </div>
      ) : null}

      {where === 'terminal' ? (
        <div className="tg-panel">
          <StillTerm lines={[`$ ${ghCmd}`, '? Paste your secret: ********************************', `✓ Set Actions secret ${SECRET_NAME} for ${repo}`]} />
          <div className="rs-acts">
            <button className="btn btn-s" type="button" onClick={() => copy('gh', ghCmd)}><CopyFace copied={copied === 'gh'} icon="terminal" doneColor={false}>Copy the command</CopyFace></button>
            {onCheck ? <button className="btn btn-s btn-ghost" type="button" onClick={onCheck}><Icon name="refresh" size={14} />Check again</button> : null}
          </div>
          <span className="t-body-s c-3">Paste the token at the prompt and press Enter. Then Check again.</span>
        </div>
      ) : null}

      {where === 'github' ? (
        <div className="tg-panel">
          <span className="t-body-s c-2">Open the repo&apos;s Actions secrets, choose <b>New repository secret</b>, name it <code>{SECRET_NAME}</code> and paste the token.</span>
          <div className="rs-acts">
            {page ? <a className="btn btn-s" href={page} target="_blank" rel="noreferrer">Open GitHub secrets<Icon name="external" size={14} /></a> : null}
            <button className="btn btn-s" type="button" onClick={() => copy('name', SECRET_NAME)}><CopyFace copied={copied === 'name'} doneColor={false}>Copy the name</CopyFace></button>
            {onCheck ? <button className="btn btn-s btn-ghost" type="button" onClick={onCheck}><Icon name="refresh" size={14} />Check again</button> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
