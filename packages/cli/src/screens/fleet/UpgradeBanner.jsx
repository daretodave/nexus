// The Upgrade banner (spec 58, A9): on the repo view of a nexus v1 repo (or one part way to v2), "This repo is on
// nexus v1" and an Upgrade button that runs `nexus upgrade`'s dry run on the server (POST /api/upgrade/dry: a fresh
// fetch of origin in a scratch worktree, nothing written) and shows its report here. On a v2 repo whose lock is
// behind the CLI's kit (A12) the same banner reads "nexus <version> is out" with a Sync button: the same command,
// which on v2 is the sync, and its report. Words: fleet/upgrade.js.
// It wears the GUI's colour and motion: an aurora edge that sweeps while the dry run works, a lit star, and a few
// drifting motes behind the words (none when Settings > Appearance turns effects off or the system asks for less
// motion; the CSS kill-switch stops the rest).
import { useEffect, useState } from 'react';
import { Icon, cx } from '../../ui/index.js';
import { server } from '../../data/index.js';
import { fxActive, useFxLevel, useReducedMotion } from '../../fx/pref.js';
import { bannerFor, ranAgo, reportView } from './upgrade.js';
import '../../styles/upgrade-banner.css';

const MOTES = [[8, 30, 0], [19, 72, 1.4], [33, 18, 2.6], [47, 64, 0.8], [61, 36, 3.2], [74, 78, 1.9], [86, 24, 2.2], [93, 58, 0.4]];

/** The drifting motes behind the banner's words: decoration only, CSS-drawn, a handful. */
export function UpgradeMotes() {
  return (
    <span className="upg-sky" aria-hidden="true">
      {MOTES.map(([x, y, d], i) => <i key={i} style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${d}s, ${d / 2}s` }} />)}
    </span>
  );
}

/** The dry run's report as the banner shows it: a headline, chips, the warnings, the first dispatch and the full text. */
export function UpgradeReport({ last, now = Date.now() }) {
  const v = reportView(last);
  if (!v) return null;
  return (
    <div className={cx('upg-report', `is-${v.tone}`)} role="region" aria-label="Upgrade dry run report">
      <div className="upg-head">
        <span className="upg-headline">{v.headline}</span>
        {last.at ? <span className="upg-age">{ranAgo(last.at, now)}</span> : null}
      </div>
      {v.chips.length ? (
        <div className="upg-chips">
          {v.chips.map((c) => <span key={c.k} className={cx('upg-chip', c.tone && `is-${c.tone}`)}><span className="k">{c.k}</span><b>{c.v}</b></span>)}
        </div>
      ) : null}
      {v.dispatch ? (
        <div className="upg-line"><span className="k">first dispatch</span><span className={cx('v', v.dispatch.bad && 'is-bad')}>{v.dispatch.text}{v.dispatch.also ? <><br />{v.dispatch.also}</> : null}</span></div>
      ) : null}
      {v.loop ? (
        <div className="upg-line"><span className="k">loop mode</span><span className="v">{v.loop.text}{v.loop.command ? <><br /><code>{v.loop.command}</code></> : null}</span></div>
      ) : null}
      {v.warnings.length ? (
        <ul className="upg-warn" aria-label="Warnings">
          {v.warnings.map((w, i) => <li key={i}>{w}</li>)}
        </ul>
      ) : null}
      {v.worktree ? <div className="upg-line"><span className="k">worktree kept</span><code className="v">{v.worktree}</code></div> : null}
      {v.text ? (
        <details className="upg-full" open={v.tone !== 'ok' && v.tone !== 'v2'}>
          <summary>The full report, as <code>npx @usenexus/cli upgrade</code> prints it</summary>
          <pre className="upg-term">{v.text}</pre>
        </details>
      ) : null}
    </div>
  );
}

export default function UpgradeBanner({ info }) {
  const b = bannerFor(info);
  const [level] = useFxLevel();
  const reduced = useReducedMotion();
  const [last, setLast] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const shape = b?.shape;

  const run = () => {
    setRunning(true);
    setError('');
    server.upgradeDry()
      .then((r) => setLast(r))
      .catch((e) => setError(e.status === 404 ? 'This nexus does not run the upgrade dry run yet. Run npx @usenexus/cli upgrade in a terminal.' : e.message))
      .finally(() => setRunning(false));
  };

  // A dry run already in flight (another tab asked) or finished earlier: pick it up rather than start over.
  useEffect(() => {
    if (!shape) return undefined;
    let live = true;
    server.upgrade().then((s) => {
      if (!live) return;
      if (s?.last) setLast(s.last);
      if (s?.running) run();
    }).catch(() => {});
    return () => { live = false; };
  }, [shape]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!b) return null;
  return (
    <section className={cx('upg', `is-${b.shape}`, running && 'is-running')} aria-label={b.action === 'Sync' ? 'Sync' : 'Upgrade'} aria-busy={running || undefined}>
      {fxActive(level, reduced) ? <UpgradeMotes /> : null}
      <div className="upg-bar">
        <span className="cstar is-lit upg-star" aria-hidden="true" />
        <div className="upg-words">
          <div className="upg-title">{b.title}</div>
          <div className="upg-sub">{b.sub}</div>
        </div>
        <button className="btn btn-s btn-primary upg-go" type="button" onClick={run} disabled={running}>
          <Icon name="arrowUp" size={14} />{running ? 'Dry run…' : last ? 'Run again' : b.action}
        </button>
      </div>
      {running ? <div className="upg-progress" role="status">{b.progress}</div> : null}
      {error ? <div className="upg-error" role="alert">{error}</div> : null}
      {!running ? <UpgradeReport last={last} /> : null}
    </section>
  );
}
