// Images reach the session (spec 51, A2): what the composer reads and refuses, the paste that picks a screenshot off
// the clipboard, what POST /api/send accepts, the image blocks the session hands the Agent SDK, where the images are
// kept, and the bubble that shows them.
import './jsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  MAX_IMAGE, MAX_TOTAL, base64Bytes, classify, clipboardImages, messageContent, overTotal, readAttachments, splitDataUrl, withFiles,
} from '../shared/attachments.mjs';
import { createSession } from '../server/session.mjs';
import { userMessage } from '../server/provider.mjs';
import { startServer } from '../server/server.mjs';
import { removeTree } from './helpers/tmp.mjs';

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const NO_DIST = path.join(os.tmpdir(), 'nexus-cli-no-dist');

test('classify: the four image types, sizes capped with a plain message, other files as text', () => {
  assert.deepEqual(classify({ name: 'a.png', size: 10, type: 'image/png' }), { kind: 'image', mediaType: 'image/png' });
  assert.deepEqual(classify({ name: 'shot.JPG', size: 10, type: '' }), { kind: 'image', mediaType: 'image/jpeg' }, 'by name when the type is missing');
  assert.equal(classify({ name: 'b.webp', size: 10, type: 'image/webp' }).kind, 'image');
  assert.match(classify({ name: 'big.png', size: MAX_IMAGE + 1, type: 'image/png' }).error, /^5 MB: images go up to 5 MB$/);
  assert.match(classify({ name: 'v.svg', size: 10, type: 'image/svg+xml' }).error, /PNG, JPEG, GIF or WebP only/);
  assert.deepEqual(classify({ name: 'notes.md', size: 100, type: 'text/markdown' }), { kind: 'text' });
  assert.match(classify({ name: 'huge.log', size: 300 * 1024, type: 'text/plain' }).error, /text files go up to 200 KB/);
});

test('base64 sizes, data URLs and the message cap', () => {
  assert.equal(base64Bytes(PNG), Buffer.from(PNG, 'base64').length);
  assert.deepEqual(splitDataUrl(`data:image/png;base64,${PNG}`), { mediaType: 'image/png', data: PNG });
  assert.equal(splitDataUrl('nope'), null);
  const big = 'A'.repeat(Math.ceil((MAX_TOTAL / 4) * 4 / 3));
  assert.equal(overTotal([{ kind: 'image', data: big }]), null);
  assert.match(overTotal([1, 2, 3, 4, 5].map(() => ({ kind: 'image', data: big }))), /a message carries up to 20 MB/);
});

test('readAttachments: images and text files checked, anything else refused in plain words', () => {
  const ok = readAttachments([{ name: 'a.png', kind: 'image', mediaType: 'image/png', data: PNG }, { name: 'n.md', kind: 'text', text: 'hi' }]);
  assert.deepEqual(ok, { images: [{ name: 'a.png', mediaType: 'image/png', data: PNG }], files: [{ name: 'n.md', text: 'hi' }] });
  assert.deepEqual(readAttachments(undefined), { images: [], files: [] });
  assert.match(readAttachments('x').error, /a list/);
  assert.match(readAttachments([{ name: 'v.svg', kind: 'image', mediaType: 'image/svg+xml', data: PNG }]).error, /PNG, JPEG, GIF or WebP only/);
  assert.match(readAttachments([{ name: 'a.png', kind: 'image', mediaType: 'image/png', data: 'not base64!' }]).error, /not base64/);
  assert.match(readAttachments([{ name: 'a.png', kind: 'image', mediaType: 'image/png', data: 'A'.repeat(Math.ceil(MAX_IMAGE * 4 / 3) + 8) }]).error, /^a\.png is 5 MB: images go up to 5 MB$/);
  assert.match(readAttachments([{ name: 'x', kind: 'pdf' }]).error, /an image or a text file/);
});

test('the SDK content: the plain string without images, image blocks then the text with them', () => {
  assert.equal(messageContent('hello', []), 'hello');
  const c = messageContent('what is this?', [{ name: 'a.png', mediaType: 'image/png', data: PNG }]);
  assert.deepEqual(c, [
    { type: 'image', source: { type: 'base64', media_type: 'image/png', data: PNG } },
    { type: 'text', text: 'what is this?' },
  ]);
  assert.deepEqual(messageContent('', [{ mediaType: 'image/gif', data: PNG }]).map((b) => b.type), ['image'], 'no empty text block');
  assert.deepEqual(userMessage(c).message, { role: 'user', content: c });
  assert.equal(withFiles('look', [{ name: 'n.md', text: 'body' }]), 'look\n\nAttached: n.md\n```\nbody\n```');
});

test('the composer reader: an image as base64 with a preview, text as text, binary refused', async () => {
  const { readAttachment, readyOf, wireOf } = await import('../src/ui/attachments.js');
  const read = async (f) => `data:${f.type};base64,${Buffer.from(await f.arrayBuffer()).toString('base64')}`;
  const img = await readAttachment(new File([Buffer.from(PNG, 'base64')], 'image.png', { type: 'image/png' }), { read });
  assert.equal(img.kind, 'image');
  assert.equal(img.mediaType, 'image/png');
  assert.equal(img.data, PNG);
  assert.match(img.preview, /^data:image\/png;base64,/);
  assert.match(img.name, /^pasted-\d+\.png$/, 'a pasted screenshot gets its own name');
  const txt = await readAttachment(new File(['# notes'], 'notes.md', { type: 'text/markdown' }), { read });
  assert.deepEqual([txt.kind, txt.text], ['text', '# notes']);
  const bin = await readAttachment(new File([new Uint8Array([0, 1, 2])], 'x.bin'), { read });
  assert.equal(bin.state, 'error');
  const big = await readAttachment({ name: 'big.png', size: MAX_IMAGE + 1, type: 'image/png' }, { read });
  assert.deepEqual([big.state, big.meta], ['error', '5 MB: images go up to 5 MB']);
  assert.deepEqual(readyOf([img, txt, bin, big]).map((a) => a.kind), ['image', 'text']);
  assert.deepEqual(wireOf([img, txt, bin]), [
    { name: img.name, kind: 'image', mediaType: 'image/png', data: PNG },
    { name: 'notes.md', kind: 'text', text: '# notes' },
  ]);
});

test('paste: the clipboard\'s image items go to the composer; plain text pastes as text', async () => {
  const { pasteFiles } = await import('../src/ui/composer.jsx');
  const shot = { name: 'image.png', type: 'image/png' };
  const item = (kind, type, file) => ({ kind, type, getAsFile: () => file });
  const ev = (cd) => ({ clipboardData: cd, prevented: false, preventDefault() { this.prevented = true; } });
  assert.deepEqual(clipboardImages({ items: [item('string', 'text/plain'), item('file', 'image/png', shot)] }), [shot]);
  assert.deepEqual(clipboardImages({ items: [], files: [shot, { name: 'a.txt', type: 'text/plain' }] }), [shot], 'files when there are no items');

  let got = null;
  const e1 = ev({ items: [item('file', 'image/png', shot)], types: ['Files'] });
  assert.equal(pasteFiles(e1, (f) => { got = f; }), true);
  assert.deepEqual(got, [shot]);
  assert.equal(e1.prevented, true, 'an image alone: nothing else to paste');

  const e2 = ev({ items: [item('string', 'text/plain'), item('file', 'image/png', shot)], types: ['text/plain', 'Files'] });
  pasteFiles(e2, () => {});
  assert.equal(e2.prevented, false, 'its text still lands in the box');

  got = null;
  const e3 = ev({ items: [item('string', 'text/plain')], types: ['text/plain'] });
  assert.equal(pasteFiles(e3, (f) => { got = f; }), false);
  assert.equal(got, null);
  assert.equal(e3.prevented, false);
});

test('the composer shows image thumbnails, a plain note, and sends with only an attachment', async () => {
  const { Composer } = await import('../src/ui/composer.jsx');
  const chips = [{ key: 'a1', name: 'pasted-1.png', meta: '1 KB', thumb: `data:image/png;base64,${PNG}` }, { key: 'a2', name: 'notes.md', meta: '1 KB' }];
  const html = renderToStaticMarkup(createElement(Composer, { value: '', chips, attached: 2, onFiles: () => {} }));
  assert.match(html, /<span class="chip has-thumb"[^>]*><img class="chip-thumb" src="data:image\/png;base64,/);
  assert.match(html, /<span class="chip-name">notes\.md<\/span>/);
  assert.match(html, /<button class="send" type="button" aria-label="Send">/, 'enabled with no text');
  const over = renderToStaticMarkup(createElement(Composer, { value: 'hi', chips, attached: 2, note: '24 MB attached: a message carries up to 20 MB' }));
  assert.match(over, /<div class="composer-note" role="alert">24 MB attached: a message carries up to 20 MB<\/div>/);
  assert.match(over, /aria-label="Send" disabled=""/);
  assert.match(renderToStaticMarkup(createElement(Composer, { value: '', attached: 0 })), /aria-label="Send" disabled=""/);
});

test('the bubble: thumbnails that open full size, files by name, no empty text bubble', async () => {
  const { MsgYou } = await import('../src/ui/shell.jsx');
  const html = renderToStaticMarkup(createElement(MsgYou, { time: '10:02', text: '', images: [{ name: 'pasted-1.png', src: '/api/uploads/s1/ab.png?t=x' }], files: ['notes.md'] }));
  assert.match(html, /<div class="msg-attach"><a class="msg-thumb" href="\/api\/uploads\/s1\/ab\.png\?t=x" target="_blank" rel="noreferrer" title="pasted-1\.png"><img src="\/api\/uploads\/s1\/ab\.png\?t=x" alt="pasted-1\.png"\/><\/a>/);
  assert.match(html, /<span class="chip-name">notes\.md<\/span>/);
  assert.doesNotMatch(html, /bubble/);
  assert.doesNotMatch(renderToStaticMarkup(createElement(MsgYou, { time: '', text: 'hi' })), /msg-attach/);
});

test('the session sends image blocks to the SDK, keeps only references in its transcript, and holds them while paused', async () => {
  const pushed = [];
  const s = await createSession({ id: 's1', cwd: os.tmpdir(), provider: () => ({ kind: 'fake', send(c) { pushed.push(c); }, async stop() {} }) });
  const images = [{ name: 'shot.png', mediaType: 'image/png', data: PNG, url: '/api/uploads/s1/ab.png' }];
  await s.send('what does this show?', { images, files: [{ name: 'n.md', text: 'x' }] });
  assert.deepEqual(pushed[0], [
    { type: 'image', source: { type: 'base64', media_type: 'image/png', data: PNG } },
    { type: 'text', text: 'what does this show?\n\nAttached: n.md\n```\nx\n```' },
  ]);
  const tx = s.hub.transcript.find((t) => t.kind === 'user');
  assert.deepEqual(tx, { kind: 'user', text: 'what does this show?', at: tx.at, images: [{ name: 'shot.png', mediaType: 'image/png', url: '/api/uploads/s1/ab.png' }], files: ['n.md'] });
  assert.doesNotMatch(JSON.stringify(s.hub.transcript), new RegExp(PNG.slice(0, 20)), 'no base64 in the replay');

  s.pauseAfterStep();
  assert.equal((await s.send('later', { images })).held, true);
  await s.resume();
  assert.equal(pushed.length, 2);
  assert.equal(pushed[1][0].type, 'image', 'the held prompt kept its image');
  await s.send('plain');
  assert.equal(pushed[2], 'plain', 'text alone is still a string');
});

function req(port, { method = 'GET', pathname, headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, method, path: pathname, headers: { host: `127.0.0.1:${port}`, ...headers } }, (res) => {
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'], buf: Buffer.concat(chunks) }));
    });
    r.on('error', reject);
    r.end(body);
  });
}

test('POST /api/send: attachments in, images kept under .nexus/uploads and served back, limits said plainly', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-attach-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  const sent = [];
  const provider = { kind: 'fake', active: false, send(c) { sent.push(c); }, async interrupt() {}, async stop() {}, async fresh() {} };
  const app = await startServer({ repo: dir, provider, pollRuns: false, dist: NO_DIST });
  const { port, token } = app;
  const post = (b) => req(port, { method: 'POST', pathname: '/api/send', headers: { 'x-nexus-token': token, 'content-type': 'application/json', origin: `http://127.0.0.1:${port}` }, body: JSON.stringify(b) });
  const json = (r) => JSON.parse(r.buf.toString('utf8'));
  try {
    // An image alone (no text) goes; a body over the old 1 MB cap is fine on this route.
    const pad = 'A'.repeat(1.5 * 1024 * 1024);
    const r = await post({ text: '', attachments: [{ name: 'shot.png', kind: 'image', mediaType: 'image/png', data: PNG }, { name: 'pad.png', kind: 'image', mediaType: 'image/png', data: pad }] });
    assert.equal(r.status, 200, r.buf.toString());
    assert.deepEqual(sent[0].map((b) => b.type), ['image', 'image']);
    assert.equal(sent[0][0].source.data, PNG);
    const tx = app.hub.transcript.find((t) => t.kind === 'user');
    const url = tx.images[0].url;
    assert.match(url, /^\/api\/uploads\/[\w.-]+\/[0-9a-f]{16}\.png$/);
    const [, sid, file] = /^\/api\/uploads\/([^/]+)\/(.+)$/.exec(url);
    assert.ok(fs.existsSync(path.join(dir, '.nexus', 'uploads', sid, file)), 'kept under .nexus/uploads/<session>/');
    const got = await req(port, { pathname: `${url}?t=${encodeURIComponent(token)}` });
    assert.equal(got.status, 200);
    assert.equal(got.type, 'image/png');
    assert.equal(got.buf.toString('base64'), PNG);
    assert.equal((await req(port, { pathname: url })).status, 403, 'needs the token');
    assert.equal((await req(port, { pathname: `/api/uploads/${sid}/..%2F..%2Fx.png?t=${encodeURIComponent(token)}` })).status, 404);

    // Text files are inlined into the text, as before.
    assert.equal((await post({ text: 'read this', attachments: [{ name: 'n.md', kind: 'text', text: 'body' }] })).status, 200);
    assert.equal(sent[1], 'read this\n\nAttached: n.md\n```\nbody\n```');

    const big = await post({ text: 'x', attachments: [{ name: 'big.png', kind: 'image', mediaType: 'image/png', data: 'A'.repeat(Math.ceil(MAX_IMAGE * 4 / 3) + 8) }] });
    assert.equal(big.status, 413);
    assert.match(json(big).error, /^big\.png is 5 MB: images go up to 5 MB$/);
    const svg = await post({ text: 'x', attachments: [{ name: 'v.svg', kind: 'image', mediaType: 'image/svg+xml', data: PNG }] });
    assert.equal(svg.status, 400);
    assert.equal((await post({ text: '  ' })).status, 400, 'nothing at all is still an empty prompt');
    assert.equal(sent.length, 2);
  } finally {
    await app.close();
    await removeTree(dir);
  }
});
