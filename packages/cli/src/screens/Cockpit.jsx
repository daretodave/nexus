// The cockpit (Cockpit, CockpitStart, CockpitReview, CockpitPackage,
// CockpitOwner, Cockpit1024 boards, night and dawn): one session, split in
// two. Left: the phase's page (questions at the start, the conversation
// while working, the parked questions at the end, the package) over the
// dock. Right: the agent stage. The phase track across the top links to
// each phase's page (?phase=), the session's own phase when none is named.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AppFrame, Empty, Err, Panes, Phases, ToastHost, localRunMode, prefsFromRunMode, saveRunMode, sessClass, useShell } from '../ui/index.js';
import { api, server, useCloudLoop, useEvents, useLocalSettings, useReloadOn, chunkStagesOf, useResource, useSessions } from '../data/index.js';
import { PATHS, rememberSession } from '../routes.js';
import CockpitTop from './cockpit/CockpitTop.jsx';
import Dock from './cockpit/Dock.jsx';
import { promptFor, routeFor, routeShowing, suggestFor } from './cockpit/compose.js';
import PackageView from './cockpit/PackageView.jsx';
import QuestionsEnd from './cockpit/QuestionsEnd.jsx';
import QuestionsStart from './cockpit/QuestionsStart.jsx';
import StageView from './cockpit/StageView.jsx';
import Working from './cockpit/Working.jsx';
import { questionMarks, tugFils, tugMarks } from './cockpit/tugs.js';
import { formWords } from '../../shared/forming.mjs';
import { withFiles } from '../../shared/attachments.mjs';
import { wireOf } from '../ui/attachments.js';
import {
  PHASES, basinItems, clock, ctxLayers, identity, isOwner, liveChunks, liveStage, packageStage, phaseTrack, rememberIdentity, reviewStage, sessionPhase,
  startStage,
} from './cockpit/model.js';

const ARRIVING_MS = 60000;

/** A clock that ticks once a minute, for elapsed times and "2m ago". */
function useNow(every = 30000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), every); return () => clearInterval(t); }, [every]);
  return now;
}

/** Toasts, one at a time, gone after six seconds. */
function useToasts() {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((t) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((cur) => [...cur, { ...t, id, onDismiss: () => setToasts((c) => c.filter((x) => x.id !== id)) }]);
    setTimeout(() => setToasts((c) => c.filter((x) => x.id !== id)), 6000);
  }, []);
  return [toasts, push];
}

export default function Cockpit() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const shell = useShell();
  const now = useNow();
  const [toasts, toast] = useToasts();
  useEffect(() => { rememberSession(id); }, [id]);

  const live = useEvents(id);
  const ledgerPath = `/api/sessions/${encodeURIComponent(id)}`;
  const ledgerRes = useResource(ledgerPath, { poll: 4000 });
  // A chunk claimed, gated or archived on the live channel refreshes the ledger now (the river, the strip),
  // not at the next poll.
  useReloadOn(chunkStagesOf(live), ledgerRes);
  const sessionsRes = useSessions();
  const cloudRes = useCloudLoop();
  const modelsRes = useResource('/api/models');
  const localRes = useLocalSettings();
  const ledger = ledgerRes.status === 'ready' ? ledgerRes.data : null;
  const sessions = sessionsRes.status === 'ready' && Array.isArray(sessionsRes.data) ? sessionsRes.data : null;
  const info = shell.app?.data?.info || {};
  const prefs = shell.app?.data?.prefs || {};

  // A session is listed under its ledger id; a cockpit opened by its Claude Code id finds it too.
  const listed = sessions?.find((s) => s.id === id || s.claude === id);
  // Its star and branch survive a read that has none (spec 47 A10): idle, it never falls back to the raw id.
  const known = useRef(null);
  known.current = rememberIdentity(known.current, id, ledger || listed);
  const session = identity(id, known.current);
  const terminal = (ledger || listed)?.kind === 'terminal';
  const owner = isOwner(ledger || listed, shell.owner);
  const phase = sessionPhase(ledger || listed, owner);
  const asked = params.get('phase');
  const view = PHASES.includes(asked) ? asked : phase;
  const hrefFor = (p) => (p === phase ? PATHS.cockpit(id) : `${PATHS.cockpit(id)}?phase=${p}`);
  const go = (p) => nav(hrefFor(p));

  // ---- server actions -----------------------------------------------------------
  const [busy, setBusy] = useState(false);
  const act = async (path, body, what) => {
    setBusy(true);
    try {
      const r = await api(path, body ?? {});
      // An answer to a session that is not running waits for whoever resumes it: say so, never "sent".
      if (r?.waits && r.note) toast({ kind: 'info', title: 'Queued', body: r.note });
      ledgerRes.reload();
      return true;
    } catch (e) {
      toast(e.status === 404
        ? { kind: 'error', title: `${what} is not wired up yet`, body: 'This server does not take that action yet. Nothing changed.' }
        : { kind: 'error', title: `${what} did not go through`, body: e.message });
      return false;
    } finally { setBusy(false); }
  };
  const base = `/api/sessions/${encodeURIComponent(id)}`;

  // ---- composer -------------------------------------------------------------------
  const [draft, setDraft] = useState('');
  const [override, setOverride] = useState(null);
  const [plotMode, setPlotMode] = useState('plan');
  const [pinMode, setPinMode] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const paused = ledger?.state === 'paused';
  // The worktree still forming behind an open cockpit (spec 47 A4): the live channel's word first, the detail's after.
  const form = live.status?.form || ledger?.form || null;
  const formingNow = !!form && form.state !== 'ready';
  const tick = useNow(formingNow ? 1000 : 60000);
  const formSay = formWords(form, tick);
  const [retrying, setRetrying] = useState(false);
  const retryForm = async () => { setRetrying(true); await act(`${base}/retry`, {}, 'Retry'); setRetrying(false); };
  // `route` is armed by the person (the chip's menu); `suggested` is the classifier's guess, sent only if accepted.
  const route = routeFor(draft, override);
  const suggested = suggestFor(draft, override, dismissed);
  const cmode = formingNow ? 'forming' : paused ? 'paused' : pinMode ? 'pin' : 'normal';
  // opts.line: one exact line from the transcript (a /plot card's action), sent as its own text; the draft, its
  // route chip, plot mode and pin mode are the composer's and stay as they are. opts.as: the suggestion accepted.
  // Plain text never picks up a route here: only an armed route or an accepted suggestion adds one.
  // files: the composer's ready attachments (spec 51): images go to a session this server runs as images, text
  // files as text. A pinned note and a terminal session take text only, and say so rather than drop an image.
  const send = async (text, files, opts = {}) => {
    const line = !!opts.line;
    const att = line ? [] : files || [];
    const images = att.filter((f) => f.kind === 'image');
    const texts = att.filter((f) => f.kind !== 'image');
    const pinning = (pinMode && !line) || (!line && route === 'pin' && !opts.as);
    if (images.length && (pinning || terminal)) {
      toast({ kind: 'error', title: 'Not sent', body: pinning ? 'A pinned note is text only. Remove the image, or send it as a message.' : `${session.name} runs in a terminal: a line reaches it as text only. Remove the image, or send it from a session this GUI runs.` });
      return false;
    }
    try {
      if (pinMode && !line) {
        await api('/api/pin', { session: id, text });
        setPinMode(false);
      } else {
        const rt = line ? null : route;
        if (rt === 'pin' && !opts.as) { await api('/api/pin', { session: id, text }); } else {
          const prompt = promptFor(text, { route: rt, as: line ? null : opts.as, plotMode, flags: { ...prefs, ...prefsFromRunMode(runMode) } });
          if (terminal) {
            // A terminal session: sending from its own cockpit aims at it, so link it and steer it. The line reaches
            // its next tool call (the steer hook), and only this session.
            if (!listed?.linked) await api(`${base}/link`, { on: true });
            const sent = await api(`${base}/steer`, { text: withFiles(prompt, texts) });
            toast(sent?.waits
              ? { kind: 'info', title: `Queued for ${session.name}`, body: sent.note || 'It is not running: the line waits.' }
              : { kind: 'info', title: `Sent to ${session.name}`, body: 'It reads it at its next tool call, or with its next prompt if it is idle.' });
            sessionsRes.reload();
          } else await server.send(prompt, id, wireOf(att));
        }
      }
      if (!line) { setDraft(''); setOverride(null); setPlotMode('plan'); setDismissed(false); }
      ledgerRes.reload();
      return true;
    } catch (e) {
      toast(e.status === 404
        ? { kind: 'error', title: 'Pinning is not wired up yet', body: 'This server does not keep pinned notes yet. Your text is still in the composer.' }
        : { kind: 'error', title: 'Not sent', body: e.message });
      return false;
    }
  };

  // ---- pause ------------------------------------------------------------------------
  const pauseState = ledger?.state === 'paused' ? 'paused' : ledger?.state === 'pausing' ? 'pausing' : 'run';
  const pause = {
    state: pauseState,
    sub: pauseState === 'paused' ? (ledger?.pausedAt ? `paused at ${clock(ledger.pausedAt)}` : 'paused')
      : pauseState === 'pausing' ? (ledger?.pausingStep ? `after ${ledger.pausingStep}` : 'after this step') : 'after this step',
  };
  const togglePause = () => act(`${base}/${pauseState === 'paused' ? 'resume' : 'pause'}`, {}, pauseState === 'paused' ? 'Resume' : 'Pause');

  // ---- run mode (.nexus/local.json through ui/run-mode.js, as Settings saves it) ----
  const runMode = localRunMode(localRes.status === 'ready' ? localRes.data : null);
  const setRunMode = async (m) => {
    try {
      await saveRunMode(m, api);
      localRes.reload();
    } catch (e) { toast({ kind: 'error', title: 'Run mode not saved', body: e.message }); }
  };

  // ---- the model badge (spec 54): what the SDK's init said, and a switch from the next turn ----
  const hosted = live.connected && live.status?.hosted !== false;
  const pickModel = async (pick) => {
    try {
      const r = await api(`${base}/model`, pick);
      toast({ kind: 'info', title: 'Switching', body: r?.note || 'applies from the next turn' });
    } catch (e) { toast({ kind: 'error', title: 'Not switched', body: e.message }); }
  };
  const modelBadge = hosted ? {
    model: live.status?.model || null, effort: live.status?.effort || null, pending: live.status?.modelPending || null,
    view: modelsRes.status === 'ready' ? modelsRes.data : null, onPick: pickModel,
  } : null;

  // ---- the cloud loop line -----------------------------------------------------------
  const cloud = cloudRes.status === 'ready' ? cloudRes.data : null;
  const loop = cloud ? { paused: !!cloud.paused, text: cloud.paused ? 'paused' : cloud.next ? `next ${clock(cloud.next)}` : 'on' } : null;

  // ---- what the panes show ------------------------------------------------------------
  const stage = live.stage;
  const parked = ledger?.parked || [];
  const pendingParked = parked.filter((p) => (p.state || 'pending') === 'pending');
  const lastParked = pendingParked[pendingParked.length - 1];
  const asking = live.asks.length + live.permissions.length > 0;
  const hushed = view === 'start' || view === 'review' || asking;
  const showTray = view === 'working' && pendingParked.length > 0;
  const showTether = showTray && !owner;
  const chunkLabel = ledger?.chunk?.id || (stage.current && stage.chunks[stage.current]?.stage !== 'archive' ? stage.current : '');

  // Oversight marks on the live stage (A2): each tug's path and state, each open question's age and session.
  const marks = useMemo(() => (view === 'working' ? {
    tugs: tugMarks(ledger?.tugs, { now, session }),
    questions: questionMarks({ asks: live.asks, parked: pendingParked, session, now }),
    lifted: showTether,
  } : null), [view, ledger, now, session.name, session.kind, live.asks, pendingParked, showTether]); // eslint-disable-line react-hooks/exhaustive-deps

  const stageView = useMemo(() => {
    if (view === 'start' && ledger?.questions?.length) return startStage(ledger);
    if (view === 'review' && ledger?.parked?.length) return reviewStage(ledger);
    if (view === 'package' && ledger?.closed?.length) return packageStage(ledger);
    const s = liveStage(stage, { chunkLabel });
    if (showTether && lastParked) {
      // The parked agent rests at the tray's height, tethered to the tray (Cockpit board).
      const trayTop = 'calc(100% - var(--tray-y) - 64px)';
      s.nodes.push({ key: 'parked', at: [14, 0], atTray: true, capUp: true, size: 's', state: 'tool', label: lastParked.who || 'agent', tool: 'default taken · parked', parked: true });
      s.fils.push({ key: 'parked-main', l: '14%', t: '30%', w: '36%', h: 'calc(100% - var(--tray-y) - 64px - 30%)', d: 'M100 0C100 50 0 50 0 100', dash: true });
      s.fils.push({ key: 'parked-tug', l: '0', t: trayTop, w: '14%', h: '64px', d: 'M100 0C55 0 45 100 0 100', tug: true, flow: true });
    }
    if (asking && view === 'working') {
      // A live question pulls a tug from the session orb toward the conversation.
      s.fils.push({ key: 'ask-tug', l: '0', t: '30%', w: '50%', h: 'calc(100% - var(--tray-y) - 30%)', d: 'M100 0C55 0 45 100 0 100', tug: true, flow: true });
    }
    if (marks?.tugs.length) s.fils.push(...tugFils(marks.tugs));
    return s;
  }, [view, ledger, stage, chunkLabel, showTether, lastParked, asking, marks]);

  const liveClosedCount = liveChunks(stage).filter((c) => c.closed).length;
  const basin = owner ? null : basinItems({ ledger, phase: view, stage });
  const landed = ledger?.landed || [];
  const lastLanded = landed[landed.length - 1];
  const drop = owner && lastLanded && now - new Date(lastLanded.at).getTime() < 120000
    ? { sha: lastLanded.sha, msg: `${lastLanded.chunk ? `${lastLanded.chunk} ` : ''}landed on main` } : null;
  const river = owner ? landed.slice(-3).reverse() : null;
  // The stage's particles: what the live channel says happened, a commit on main, and the hush. The landed list stays
  // undefined until this session's ledger loads (a switch in place keeps the last session's until then), so its first
  // read is a baseline and not a landing. The tug streams only where the working stage draws its ask-tug filament.
  const fxLanded = ledger && ledgerRes.path === ledgerPath ? landed : undefined;
  const fx = { live, session: id, landed: fxLanded, hushed, asking: asking && view === 'working', sess: sessClass(session) };

  const phases = phaseTrack({ ledger, owner, phase, stage, now, hrefFor });
  const layers = ctxLayers({ ledger, owner, phase: view, stage, info, sessionName: session.name, now });

  let left;
  if (view === 'start') {
    left = (
      <QuestionsStart
        name={session.name} questions={ledger?.questions} busy={busy}
        onAnswer={(index, answer, how) => act(`${base}/questions`, { index, answer, how }, 'Answering')}
        onDefaults={() => act(`${base}/questions`, { defaults: true }, 'Accepting the defaults')}
        onStart={async () => { if (await act(`${base}/start`, {}, 'Starting work')) nav(PATHS.cockpit(id)); }}
      />
    );
  } else if (view === 'review') {
    left = (
      <QuestionsEnd
        name={session.name} parked={ledger?.parked} busy={busy} packageTo={hrefFor('package')}
        onApprove={(index) => act(`${base}/parked`, { index, action: 'approve' }, 'Approving')}
        onChange={(index, pick) => act(`${base}/parked`, { index, action: 'change', pick }, 'Queueing the fix')}
        onApproveRest={() => act(`${base}/parked`, { action: 'approve-rest' }, 'Approving the rest')}
      />
    );
  } else if (view === 'package') {
    left = (
      <PackageView
        ledger={ledger} phase={phase} liveClosed={liveClosedCount} reviewTo={hrefFor('review')} busy={busy}
        onOpen={() => act(`${base}/package`, { action: 'open' }, 'Opening the pull request')}
        onSaveDescription={(description) => act(`${base}/package`, { description }, 'Saving the description')}
      />
    );
  } else {
    left = live.transcript.length || live.asks.length || live.permissions.length ? <Working live={live} session={id} pinned={ledger?.pinned?.text} onSend={(text) => send(text, [], { line: true })} /> : (
      <div className="convo" aria-live="polite">
        {formingNow
          ? <Empty sky="quiet" title={formSay.title} body={form.state === 'failed' ? `${session.name} has no worktree yet: ${formSay.sub}. Retry on the stage.` : `${session.name} starts once its worktree is ready. What it says and does shows up here.`} />
          : <Empty sky="quiet" title="Quiet so far" body="What this session says and does shows up here as it works. Nudge it below, or type / for commands." />}
      </div>
    );
  }

  const tray = showTray ? {
    count: pendingParked.length,
    item: lastParked ? { q: lastParked.q, who: lastParked.who, a: lastParked.alts?.[0], at: lastParked.at, arriving: lastParked.at && now - new Date(lastParked.at).getTime() < ARRIVING_MS } : null,
  } : null;

  const topbar = (
    <CockpitTop
      session={session} sessions={sessions} repo={ledger?.repo || listed?.repo || info.name || shell.repo} git={ledger?.git || listed?.git || null}
      branch={known.current?.branch || info.branch} owner={owner} runMode={runMode} onRunMode={setRunMode} loop={loop} pause={pause} onPause={togglePause} model={modelBadge}
    />
  );

  const phaseNav = (
    <Phases phases={phases} end={owner ? 'no package: chunks land on main' : null} />
  );

  if (ledgerRes.status === 'error' && !ledger && !live.connected) {
    return (
      <AppFrame topbar={topbar} current="cockpit" railVariant="cockpit">
        <main className="view" aria-label={`Cockpit for ${session.name}`}>
          <Err title="This session is out of reach" body="Its work and claims are safe where they are. The page could not reach the local server." detail={ledgerRes.error} actions={<button className="btn btn-s" type="button" onClick={ledgerRes.reload}>Try again</button>} />
        </main>
      </AppFrame>
    );
  }

  return (
    <AppFrame topbar={topbar} phases={phaseNav} current="cockpit" railVariant="cockpit" hushed={hushed}>
      <Panes hasRoute={routeShowing(draft, route || suggested, cmode)}>
        <section className="pane-left" aria-label="Conversation and context">
          {left}
          <Dock
            tray={tray} inboxTo={PATHS.inbox} layers={layers} short={view !== 'working'}
            composer={{
              value: draft, onChange: (v) => { setDraft(v); if (!v.trim()) { setOverride(null); setDismissed(false); } },
              route, onRoute: (r) => { if (r === 'pin') { setPinMode(true); setOverride(null); } else { setOverride(r); if (!r) setDismissed(true); } },
              suggest: suggested, onDismissSuggest: () => setDismissed(true),
              plotMode, onPlotMode: setPlotMode,
              why: route === 'plot' ? (owner ? 'Owner checkout: the plan change lands on main directly.' : 'Contributor checkout: the plan change opens a plan PR for review.') : undefined,
              mode: cmode, onTogglePin: () => setPinMode((p) => !p),
              pausedText: paused ? pause.sub.replace(/^paused/, 'Paused') : undefined, onResume: paused ? togglePause : undefined,
              formingText: formingNow ? (form.state === 'failed' ? 'No worktree yet: retry on the stage' : `Waiting on its worktree: ${formSay.sub}`) : undefined,
              onSend: send,
            }}
          />
          {showTether ? <span className="tether-l" aria-hidden="true" /> : null}
        </section>
        <section className="pane-right" aria-label="Agent stage">
          <StageView view={stageView} basin={basin} river={river} riverCap={river && river.length ? `${river.length} this session` : ''} drop={drop} marks={marks} forming={formingNow ? { form, now: tick, onRetry: retryForm, retrying } : null} fx={fx} />
        </section>
      </Panes>
      <ToastHost toasts={toasts} clear="composer" />
    </AppFrame>
  );
}

