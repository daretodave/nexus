// A tiny toast queue for these screens: push({ kind, title, body }), each
// stays 6s (the Feedback board's rule), at most two show (ToastHost).
import { useCallback, useEffect, useRef, useState } from 'react';

export function useToasts() {
  const [toasts, setToasts] = useState([]);
  const timers = useRef([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback((t) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((list) => [...list, { ...t, id, onDismiss: () => dismiss(id) }]);
    timers.current.push(setTimeout(() => dismiss(id), 6000));
  }, [dismiss]);
  return { toasts, push };
}
