// The plan answers' writer (spec 53; 0.5.1), shared by the Oversight panel (screens/Inbox.jsx) and Grill me
// (screens/Grill.jsx), so an answer kept in one reads "answered · not sent yet" in the other at once.
//
//   keep(entries)   [[item, words, how, images, choices]]: kept on the server (PUT /api/plan-answers), shown at once;
//                   the draft's words and images clear once the server has it (a failed save keeps them, and says so)
//   reopen(item)    Change answer: the words and images go back into the draft, the kept answer leaves the store
//   send(list, target, key)   a spec's Continue (or Grill me's hand-off): every answer in one message to one session,
//                   then marked sent -> { ok, session, name, note } or { error }
//
// The pure half (keys, targets, the body) is planAnswers.js.
import { useEffect, useRef, useState } from 'react';
import { server, usePlanAnswers, useSessions } from '../../data/index.js';
import { useDrafts } from '../../data/drafts.js';
import { writeRefs } from '../../ui/image-refs.js';
import { DECIDE_TEXT, IMAGE_ONLY_TEXT } from '../../../shared/choices.mjs';
import { continueBody, keepsAnswer, keptDone, planKey } from './planAnswers.js';

/**
 * @param {object} o
 * @param {Array} o.items          the plan items on screen (for `kept`)
 * @param {(ids: string[], why: string) => void} [o.onFail]  an answer that did not keep
 */
export function useOversightAnswers({ items = [], onFail } = {}) {
  // The store as last read or written here; a poll waits while a write is out.
  const keptRes = usePlanAnswers(8000);
  const sessionsRes = useSessions(8000);
  const sessions = sessionsRes.status === 'ready' && Array.isArray(sessionsRes.data) ? sessionsRes.data : [];
  const drafts = useDrafts();
  const [store, setStore] = useState({});
  const [errors, setErrors] = useState({});
  const [sending, setSending] = useState(null); // the key of the send on its way
  const writing = useRef(0);
  useEffect(() => {
    if (keptRes.status === 'ready' && !writing.current) setStore(keptRes.data?.answers || {});
  }, [keptRes.data]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Write a patch ({ "<file:line>": { answer, how, images, choices } | null }): shown at once; one that did not keep comes back off. */
  async function write(patch, ids = []) {
    setStore((st) => {
      const c = { ...st };
      for (const [k, v] of Object.entries(patch)) { if (v) c[k] = { ...v, at: Date.now() }; else delete c[k]; }
      return c;
    });
    writing.current += 1;
    try {
      const r = await server.savePlanAnswers(patch);
      setStore(r.answers || {});
      const skipped = (r.skipped || []).filter((k) => patch[k]);
      if (skipped.length) {
        const gone = ids.filter((id, i) => skipped.includes(Object.keys(patch)[i]));
        setErrors((er) => ({ ...er, ...Object.fromEntries(gone.map((id) => [id, 'Not kept: this question changed in the plan since you opened it. Read it again.'])) }));
        onFail?.(gone, 'changed');
      }
      return r;
    } catch (e) {
      setErrors((er) => ({ ...er, ...Object.fromEntries(ids.map((id) => [id, `Not kept: ${e.message}`])) }));
      onFail?.(ids, e.message);
      keptRes.reload();
      return null;
    } finally {
      writing.current -= 1;
    }
  }

  /** Keep these answers: [[item, words, how, images, choices]]. The drafts clear only for what the server kept. */
  async function keep(entries) {
    const patch = {};
    const ids = [];
    for (const [x, a, how, images, choices] of entries) {
      if (!keepsAnswer(x)) continue;
      const h = how === 'decide' ? 'decide' : how === 'default' || how === 'approved' ? 'default' : 'answered';
      patch[planKey(x)] = { answer: a, how: h, ...(images && images.length ? { images } : {}), ...(choices ? { choices } : {}) };
      ids.push(x.id);
    }
    if (!ids.length) return null;
    // Kept again: an earlier failure for it is old news.
    setErrors((er) => (ids.some((id) => er[id]) ? Object.fromEntries(Object.entries(er).filter(([k]) => !ids.includes(k))) : er));
    const r = await write(patch, ids);
    if (!r) return null;
    const keys = Object.keys(patch);
    ids.forEach((id, i) => {
      if ((r.skipped || []).includes(keys[i])) return;
      drafts.clear(id);
      drafts.clear(`${id}:img`);
    });
    return r;
  }

  /** Change answer: the words and images back into the draft, the kept one out of the store. */
  function reopen(x) {
    const e = store[planKey(x)];
    if (!e) return Promise.resolve(null);
    const words = String(e.answer || '');
    if (words && words !== DECIDE_TEXT && words !== IMAGE_ONLY_TEXT) drafts.save(x.id, words);
    if (e.images?.length) writeRefs(drafts, x.id, e.images);
    return write({ [planKey(x)]: null });
  }

  /** Send these settled answers to `target` in one message, then mark them sent. */
  async function send(list, target, key, done) {
    if (!list.length) return { error: 'nothing to send' };
    setSending(key);
    try {
      const body = continueBody(list, done, target);
      const r = await server.continueAnswers(body.answers, body.session);
      const to = r.session || body.session;
      setStore((st) => { const c = { ...st }; for (const i of list) if (c[planKey(i)]) c[planKey(i)] = { ...c[planKey(i)], sent: Date.now(), to }; return c; });
      keptRes.reload();
      sessionsRes.reload();
      return { ok: true, session: to, name: r.name || (target.kind === 'new' ? '' : target.name), note: r.note || '', fresh: body.session === 'new' };
    } catch (e) {
      setErrors((er) => ({ ...er, [`continue:${key}`]: e.message }));
      return { error: e.message };
    } finally {
      setSending(null);
    }
  }

  return {
    store,
    kept: keptDone(items, store),
    ready: keptRes.status === 'ready',
    keep,
    reopen,
    send,
    sending,
    sessions,
    errors,
    dismiss: (id) => setErrors((e) => { const c = { ...e }; delete c[id]; return c; }),
    reload: () => keptRes.reload(),
  };
}
