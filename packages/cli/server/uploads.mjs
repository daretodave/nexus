// The images a person sent to a session (spec 51, A2), kept on disk so the transcript carries a reference, not
// megabytes of base64 on every replay: `.nexus/uploads/<session>/<sha256 prefix>.<ext>` at the primary checkout's
// root (gitignored with the rest of .nexus/), served back to the GUI by GET /api/uploads/<session>/<file>.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { extOf, IMAGE_TYPES } from '../shared/attachments.mjs';

export const UPLOADS = path.join('.nexus', 'uploads');
const SAFE = /^[\w.-]+$/;
const TYPE_OF = Object.fromEntries(IMAGE_TYPES.map((t) => [extOf(t), t]));

/** Write each image once (named by its content) and return { name, mediaType, url } for the transcript. */
export function saveUploads(root, session, images) {
  if (!images || !images.length) return [];
  const sid = SAFE.test(String(session)) ? String(session) : 'session';
  const dir = path.join(root, UPLOADS, sid);
  fs.mkdirSync(dir, { recursive: true });
  return images.map((i) => {
    const buf = Buffer.from(i.data, 'base64');
    const file = `${crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16)}.${extOf(i.mediaType)}`;
    const full = path.join(dir, file);
    if (!fs.existsSync(full)) fs.writeFileSync(full, buf);
    return { name: i.name, mediaType: i.mediaType, url: `/api/uploads/${encodeURIComponent(sid)}/${file}` };
  });
}

/** The file GET /api/uploads/<session>/<file> names, with its type, or null (unknown, outside, or not an image). */
export function uploadFile(root, session, file) {
  if (!SAFE.test(session) || !SAFE.test(file) || session.startsWith('.') || file.startsWith('.')) return null;
  const type = TYPE_OF[path.extname(file).slice(1)];
  if (!type) return null;
  const full = path.join(root, UPLOADS, session, file);
  return fs.existsSync(full) ? { full, type } : null;
}
