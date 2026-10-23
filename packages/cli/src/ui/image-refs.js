// An answer's images (0.5.1): picked, pasted or dropped, each read (ui/attachments.js readAttachment), checked (only
// images, at most six) and uploaded at once (POST /api/oversight/uploads), so the draft holds small references, not
// base64, and a reload or another tab keeps them. The references live beside the answer's text in the draft store,
// at `<draftKey>:img` as JSON [{ file, name, mediaType }]; a kept answer carries them to .nexus/answers.json.
import { useCallback, useRef, useState } from 'react';
import { readAttachment } from './attachments.js';
import { useDrafts } from '../data/drafts.js';
import { MAX_ANSWER_IMAGES, imageRefs } from '../../shared/choices.mjs';

const client = () => import('../data/client.js');
let TOKEN = '';
client().then((c) => { TOKEN = c.TOKEN; }).catch(() => {});

export const imgKey = (draftKey) => `${draftKey}:img`;

/** The refs a draft holds at `<key>:img`. */
export function readRefs(raw) {
  try { return imageRefs(JSON.parse(raw || '[]')); } catch { return []; }
}

/** Write (or clear) a draft's refs. */
export function writeRefs(drafts, draftKey, refs) {
  const list = imageRefs(refs);
  if (list.length) drafts.save(imgKey(draftKey), JSON.stringify(list));
  else drafts.clear(imgKey(draftKey));
}

// Local previews of what was uploaded here (a data URL), so a chip shows at once and the demo, which keeps nothing,
// still draws its thumbnail.
const previews = new Map();

/** Where an uploaded image is shown from: its local preview, else the server (with the launch token). */
export const thumbOf = (file) => previews.get(file) || `/api/uploads/oversight/${encodeURIComponent(file)}?t=${encodeURIComponent(TOKEN)}`;

/** Read and upload one file -> { file, name, mediaType } or { error }. */
export async function uploadImage(file, { read } = {}) {
  const a = await readAttachment(file, read ? { read } : undefined);
  if (a.state === 'error') return { error: a.meta, name: a.name };
  if (a.kind !== 'image') return { error: 'Only images go with an answer.', name: a.name };
  try {
    const c = await client();
    const r = await c.server.uploadAnswerImage({ name: a.name, mediaType: a.mediaType, data: a.data });
    previews.set(r.file, a.preview);
    return { file: r.file, name: r.name || a.name, mediaType: r.mediaType || a.mediaType, demo: !!r.demo, preview: a.preview };
  } catch (e) {
    return { error: e?.message || 'it did not upload', name: a.name, preview: a.preview };
  }
}

let seq = 0;

/**
 * The images of one answer: { refs (uploaded), chips (for FileChip, uploading and failed ones too), add(files),
 * remove(key), clear(), restore(refs) }. No key: nothing (an answer that takes no images).
 */
export function useAnswerImages(draftKey) {
  const drafts = useDrafts();
  const [pending, setPending] = useState([]); // [{ key, name, preview, state: 'uploading'|'error', meta, file? }]
  const files = useRef(new Map()); // pending key -> File, for a retry
  const refs = draftKey ? readRefs(drafts.get(imgKey(draftKey))) : [];
  const refsRef = useRef(refs);
  refsRef.current = refs;

  const upload = useCallback(async (key, file) => {
    const r = await uploadImage(file);
    if (r.error) {
      setPending((p) => p.map((c) => (c.key === key ? { ...c, state: 'error', meta: `Not uploaded: ${r.error}`, preview: c.preview || r.preview } : c)));
      return;
    }
    files.current.delete(key);
    setPending((p) => p.filter((c) => c.key !== key));
    writeRefs(drafts, draftKey, [...refsRef.current, { file: r.file, name: r.name, mediaType: r.mediaType }]);
  }, [draftKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const add = useCallback((list) => {
    if (!draftKey) return;
    let room = MAX_ANSWER_IMAGES - refsRef.current.length - pending.filter((c) => c.state === 'uploading').length;
    const next = [];
    for (const f of [...(list || [])]) {
      seq += 1;
      const key = `up${seq}`;
      const name = f.name || 'image';
      if (!String(f.type || '').startsWith('image/') && !/\.(png|jpe?g|gif|webp)$/i.test(name)) { next.push({ key, name, state: 'error', meta: 'Only images go with an answer.' }); continue; }
      if (room <= 0) { next.push({ key, name, state: 'error', meta: 'Six images per answer.' }); continue; }
      room -= 1;
      files.current.set(key, f);
      next.push({ key, name, state: 'uploading', meta: 'uploading' });
      upload(key, f);
    }
    if (next.length) setPending((p) => [...p, ...next]);
  }, [draftKey, pending, upload]);

  const retry = (key) => {
    const f = files.current.get(key);
    if (!f) { setPending((p) => p.filter((c) => c.key !== key)); return; }
    setPending((p) => p.map((c) => (c.key === key ? { ...c, state: 'uploading', meta: 'uploading' } : c)));
    upload(key, f);
  };

  const remove = (key) => {
    if (refsRef.current.some((r) => r.file === key)) writeRefs(drafts, draftKey, refsRef.current.filter((r) => r.file !== key));
    else { files.current.delete(key); setPending((p) => p.filter((c) => c.key !== key)); }
  };

  const chips = [
    ...refs.map((r) => ({ key: r.file, name: r.name, thumb: thumbOf(r.file), onRemove: () => remove(r.file) })),
    ...pending.map((c) => ({
      key: c.key, name: c.name, state: c.state === 'error' ? 'error' : undefined, meta: c.meta, title: c.state === 'error' ? `${c.name}: ${c.meta}${files.current.has(c.key) ? ' (click to try again)' : ''}` : undefined,
      onRemove: () => remove(c.key), onRetry: c.state === 'error' && files.current.has(c.key) ? () => retry(c.key) : undefined,
    })),
  ];

  return {
    refs,
    chips,
    uploading: pending.some((c) => c.state === 'uploading'),
    add,
    remove,
    clear: () => { setPending([]); files.current.clear(); if (draftKey) drafts.clear(imgKey(draftKey)); },
    restore: (list) => { if (draftKey) writeRefs(drafts, draftKey, list); },
  };
}
