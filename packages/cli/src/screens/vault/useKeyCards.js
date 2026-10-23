// The key cards' state, shared by the Vault and the Inbox: each card's phase (pending, saved, partial, skipped), the
// store and the retry. A value passes through here once, from the card's field to POST /api/secrets/:name, and is
// never kept: what stays is the name, the places it landed and the places that refused it.
import { useCallback, useState } from 'react';
import { server } from '../../data/index.js';
import { readSkipped, saveBody, savedPlaces, writeSkipped } from './model.js';

export function useKeyCards({ reload, onSaved } = {}) {
  const [st, setSt] = useState({});
  const [skipped, setSkipped] = useState(readSkipped);
  const put = useCallback((key, patch) => setSt((s) => ({ ...s, [key]: { ...(s[key] || {}), ...patch } })), []);

  const setSkip = useCallback((key, on) => setSkipped((cur) => {
    const next = new Set(cur);
    if (on) next.add(key); else next.delete(key);
    writeSkipped(next);
    return next;
  }), []);

  const phaseOf = (card) => st[card.key]?.phase || (skipped.has(card.key) ? 'skipped' : 'pending');

  /** The props a <KeyCard> takes for `card`. */
  const props = (card) => {
    const s = st[card.key] || {};
    return {
      card,
      phase: phaseOf(card),
      saved: s.saved,
      busy: !!s.busy,
      error: s.error || null,
      onSave: async (value, ticked) => {
        put(card.key, { busy: true, error: null });
        try {
          const r = await server.storeSecret(card.name, saveBody(value, ticked, card.adds));
          const saved = savedPlaces(r);
          put(card.key, { busy: false, phase: saved.failed.length ? 'partial' : 'saved', saved, card });
          setSkip(card.key, false);
          onSaved?.(card, saved);
          reload?.();
          return true;
        } catch (e) {
          put(card.key, { busy: false, error: e.message });
          return false;
        }
      },
      onRetry: async () => {
        const failed = s.saved?.failed || [];
        if (!failed.length) return;
        put(card.key, { busy: true });
        try {
          const r = await server.pushSecret(card.name, failed.map((f) => f.d));
          const fixed = (r.pushed || []).filter((p) => p.ok).map((p) => p.destination);
          const still = failed.filter((f) => !fixed.includes(f.d)).map((f) => ({ ...f, error: (r.pushed || []).find((p) => p.destination === f.d)?.error || f.error }));
          const places = [s.saved.places, ...failed.filter((f) => fixed.includes(f.d)).map((f) => f.label.replace('GitHub ', ''))].filter(Boolean).join(', ');
          put(card.key, { busy: false, phase: still.length ? 'partial' : 'saved', saved: { places, failed: still } });
          reload?.();
        } catch (e) {
          put(card.key, { busy: false, saved: { ...s.saved, failed: failed.map((f) => ({ ...f, error: e.message })) } });
        }
      },
      onSkip: () => { setSkip(card.key, true); put(card.key, { phase: null, error: null }); },
      onUnskip: () => { setSkip(card.key, false); put(card.key, { phase: 'pending' }); },
      onChange: () => put(card.key, { phase: 'pending', error: null }),
    };
  };

  /** Cards saved here that have left the server's requests: kept on screen, folded into their saved line. */
  const held = Object.values(st).filter((s) => s.card).map((s) => s.card);
  return { props, phaseOf, held, skipped };
}
