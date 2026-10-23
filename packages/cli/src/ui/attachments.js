// Reading what the composer is given (spec 51, A2): a picked, pasted or dropped file becomes an attachment, an image
// as base64 with its media type and a preview, a text file as its text, or a chip saying plainly why not. The rules
// (types, sizes) are shared/attachments.mjs; this is the browser half.
import { useState } from 'react';
import { classify, overTotal, sizeWords, splitDataUrl } from '../../shared/attachments.mjs';

/** Does a drag carry files (not text being moved)? */
export const hasFiles = (dt) => [...(dt?.types || [])].includes('Files');

/**
 * Files dropped on a box: `props` go on it (drag over, leave, drop), `over` is true while files hover it. Shared by the
 * composer and the answer box. Off (or no `onFiles`): no props, nothing taken.
 */
export function useFileDrop(onFiles, { off = false } = {}) {
  const [over, setOver] = useState(false);
  const props = onFiles && !off ? {
    onDragOver: (e) => { if (hasFiles(e.dataTransfer)) { e.preventDefault(); setOver(true); } },
    onDragLeave: (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(false); },
    onDrop: (e) => { setOver(false); const f = [...(e.dataTransfer?.files || [])]; if (f.length) { e.preventDefault(); onFiles(f); } },
  } : {};
  return { over: over && !off && !!onFiles, props };
}

let seq = 0;

const dataUrlOf = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result || ''));
  r.onerror = () => reject(r.error || new Error('could not read it'));
  r.readAsDataURL(file);
});

/** A pasted screenshot comes as "image.png": number them so two pastes are two chips with names a person can tell apart. */
const nameOf = (file, kind) => (file.name && file.name !== 'image.png' ? file.name : kind === 'image' ? `pasted-${seq}.${(file.type || 'image/png').split('/')[1]}` : file.name || 'file');

/**
 * One file read for the composer: { id, name, kind: 'image', mediaType, data, preview, meta } or
 * { id, name, kind: 'text', text, meta }, or { id, name, state: 'error', meta, title } (too big, not an image the
 * model reads, not text). `read` is the seam tests use in place of FileReader.
 */
export async function readAttachment(file, { read = dataUrlOf } = {}) {
  seq += 1;
  const id = `a${seq}`;
  const c = classify({ name: file.name, size: file.size, type: file.type });
  const name = nameOf(file, c.kind);
  if (c.error) return { id, name, state: 'error', meta: c.error, title: `${name}: ${c.error}` };
  if (c.kind === 'image') {
    const url = await read(file);
    const split = splitDataUrl(url);
    if (!split) return { id, name, state: 'error', meta: 'could not read it', title: `${name}: could not read it` };
    return { id, name, kind: 'image', mediaType: c.mediaType, data: split.data, preview: url, meta: sizeWords(file.size) };
  }
  const text = await file.text();
  // Binary files carry NULs; only text goes into a prompt.
  if (text.includes('\u0000')) return { id, name, state: 'error', meta: 'not text or an image', title: `${name}: not text or a PNG, JPEG, GIF or WebP image` };
  return { id, name, kind: 'text', text, meta: sizeWords(file.size) };
}

/** The attachments that go: read without an error. */
export const readyOf = (list) => (list || []).filter((a) => a.kind && a.state !== 'error');

/** POST /api/send's `attachments` for the ready ones. */
export function wireOf(list) {
  return readyOf(list).map((a) => (a.kind === 'image'
    ? { name: a.name, kind: 'image', mediaType: a.mediaType, data: a.data }
    : { name: a.name, kind: 'text', text: a.text }));
}

/** The plain message over the chips when the ready ones are over the message cap, else null. */
export const noteOf = (list) => overTotal(readyOf(list));
