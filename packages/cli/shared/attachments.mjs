// What a message carries besides its text (spec 51, A2): images as base64 with their media type, text files as
// text. Pure, shared by the composer (what it reads, what it refuses, what it sends) and the server (what POST
// /api/send accepts, and the content the session hands the Agent SDK).
//
// An image goes to the session as an Anthropic Messages image block,
//   { type: 'image', source: { type: 'base64', media_type, data } }
// beside one { type: 'text', text } block: SDKUserMessage.message is a MessageParam whose content is a string or
// an array of content blocks (@anthropic-ai/claude-agent-sdk sdk.d.ts; Base64ImageSource in @anthropic-ai/sdk).
// A text file is inlined into the text, as before.

/** The image types the API accepts. */
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
export const MAX_IMAGE = 5 * 1024 * 1024;
export const MAX_TEXT_FILE = 200 * 1024;
export const MAX_TOTAL = 20 * 1024 * 1024;
/** POST /api/send's body cap: the total in base64 (4/3) plus the text and JSON around it. */
export const MAX_SEND_BODY = Math.ceil(MAX_TOTAL * 4 / 3) + 2 * 1024 * 1024;

const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };
const BY_EXT = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };

export const extOf = (mediaType) => EXT[mediaType] || 'bin';

/** "1.2 MB", "34 KB": a size the way a person reads it. */
export function sizeWords(bytes) {
  const n = Number(bytes) || 0;
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1).replace(/\.0$/, '')} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

/** An image's media type from its type or, failing that (a clipboard file with none), its name; null if not one. */
export function imageType({ type, name } = {}) {
  if (IMAGE_TYPES.includes(type)) return type;
  if (type && type.startsWith('image/')) return null;
  const ext = /\.([a-z0-9]+)$/i.exec(String(name || ''))?.[1]?.toLowerCase();
  return (!type && ext && BY_EXT[ext]) || null;
}

/**
 * What a picked, pasted or dropped file becomes before it is read: { kind: 'image', mediaType } or { kind: 'text' },
 * or { error } in plain words (too big, or an image type the model cannot read).
 */
export function classify({ name, size, type } = {}) {
  const mediaType = imageType({ name, type });
  if (mediaType) {
    if (size > MAX_IMAGE) return { error: `${sizeWords(size)}: images go up to ${sizeWords(MAX_IMAGE)}` };
    return { kind: 'image', mediaType };
  }
  if (type && type.startsWith('image/')) return { error: 'PNG, JPEG, GIF or WebP only' };
  if (size > MAX_TEXT_FILE) return { error: `${sizeWords(size)}: text files go up to ${sizeWords(MAX_TEXT_FILE)}` };
  return { kind: 'text' };
}

/** Decoded bytes of a base64 string, without decoding it. */
export function base64Bytes(data) {
  const s = String(data || '');
  const pad = s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor(s.length * 3 / 4) - pad);
}

/** One attachment's weight toward the message cap. */
export const weight = (a) => (a.kind === 'image' ? base64Bytes(a.data) : String(a.text || '').length);

/** A plain message when the attachments together are over the cap, else null. */
export function overTotal(list) {
  const total = (list || []).reduce((n, a) => n + weight(a), 0);
  return total > MAX_TOTAL ? `${sizeWords(total)} attached: a message carries up to ${sizeWords(MAX_TOTAL)}` : null;
}

/** "data:image/png;base64,...": a read file's data URL split into its media type and base64 data. */
export function splitDataUrl(url) {
  const m = /^data:([^;,]+);base64,(.*)$/s.exec(String(url || ''));
  return m ? { mediaType: m[1], data: m[2] } : null;
}

/** The image files on a paste's clipboardData (a screenshot): its items first, its files if it has no items. */
export function clipboardImages(cd) {
  if (!cd) return [];
  const out = [];
  for (const it of [...(cd.items || [])]) {
    if (it && it.kind === 'file' && String(it.type || '').startsWith('image/')) {
      const f = it.getAsFile?.();
      if (f) out.push(f);
    }
  }
  if (out.length) return out;
  return [...(cd.files || [])].filter((f) => String(f?.type || '').startsWith('image/'));
}

/**
 * POST /api/send's `attachments`, checked: { images: [{ name, mediaType, data }], files: [{ name, text }] }, or
 * { error } in plain words. Anything else in the list is refused, not dropped.
 */
export function readAttachments(raw) {
  if (raw == null) return { images: [], files: [] };
  if (!Array.isArray(raw)) return { error: 'attachments is a list' };
  const images = [];
  const files = [];
  for (const a of raw) {
    const name = String(a?.name || (a?.kind === 'image' ? 'image' : 'file')).slice(0, 200);
    if (a?.kind === 'image') {
      if (!IMAGE_TYPES.includes(a.mediaType)) return { error: `${name}: PNG, JPEG, GIF or WebP only` };
      if (typeof a.data !== 'string' || !a.data || !/^[A-Za-z0-9+/]+={0,2}$/.test(a.data)) return { error: `${name}: not base64 image data` };
      if (base64Bytes(a.data) > MAX_IMAGE) return { error: `${name} is ${sizeWords(base64Bytes(a.data))}: images go up to ${sizeWords(MAX_IMAGE)}` };
      images.push({ name, mediaType: a.mediaType, data: a.data });
    } else if (a?.kind === 'text') {
      if (typeof a.text !== 'string') return { error: `${name}: no text` };
      if (a.text.length > MAX_TEXT_FILE) return { error: `${name} is ${sizeWords(a.text.length)}: text files go up to ${sizeWords(MAX_TEXT_FILE)}` };
      files.push({ name, text: a.text });
    } else return { error: `${name}: an attachment is an image or a text file` };
  }
  const over = overTotal([...images.map((i) => ({ kind: 'image', data: i.data })), ...files.map((f) => ({ kind: 'text', text: f.text }))]);
  return over ? { error: over } : { images, files };
}

/** The text with each text file inlined after it, as the composer always sent them. */
export function withFiles(text, files) {
  return `${text || ''}${(files || []).map((f) => `\n\nAttached: ${f.name}\n\`\`\`\n${f.text}\n\`\`\``).join('')}`;
}

/**
 * A user message's content for the Agent SDK: the plain string when there are no images (as before), else the
 * image blocks then one text block (left out when there is no text: the API refuses an empty text block).
 */
export function messageContent(text, images) {
  if (!images || !images.length) return text;
  const blocks = images.map((i) => ({ type: 'image', source: { type: 'base64', media_type: i.mediaType, data: i.data } }));
  if (String(text || '').trim()) blocks.push({ type: 'text', text });
  return blocks;
}
