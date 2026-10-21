#!/usr/bin/env node
// scripts/gifs.mjs — the README's GIFs, checked (the gate's gifs leg).
//
// The README shows the GUI in motion: GIFs recorded from scripted
// demo scenarios (packages/cli: `npm run record -- <scenario>`),
// each with a still poster beside it for readers who ask for less
// motion. Recordings are not byte-stable, so nothing here compares
// bytes. It checks what a reader depends on, for every GIF the
// README references:
//
//   - the file exists and is a GIF that parses to its trailer;
//   - it runs 5 to 8 seconds and weighs at most 3 MB (the budget
//     packages/cli/scripts/record.mjs enforces when it records);
//   - its alt text says what happens (four words or more);
//   - its poster (the same path, .png) exists, is a PNG, and the
//     README links it.
//
//   node scripts/gifs.mjs        # print what it found; exit 1 on a problem
//
// Zero dependencies: a minimal GIF reader lives here rather than
// importing the recorder's (packages/cli is its own package).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MB = 1024 * 1024

/** The README's budget for a GIF; the recorder holds the same one. */
export const BUDGET = Object.freeze({ minMs: 5000, maxMs: 8000, maxBytes: 3 * MB })

/**
 * Walk a GIF's blocks to its trailer: size, frame count and length.
 * Throws a sentence when the bytes are not a whole GIF.
 * @param {Uint8Array} b
 * @returns {{ width: number, height: number, frames: number, durationMs: number }}
 */
export function readGifInfo(b) {
  const sig = String.fromCharCode(...b.subarray(0, 6))
  if (sig !== 'GIF89a' && sig !== 'GIF87a') throw new Error('not a GIF (no GIF89a or GIF87a signature)')
  if (b.length < 13) throw new Error('cut short in its header')
  let p = 6
  const u16 = () => { const v = b[p] | (b[p + 1] << 8); p += 2; return v }
  const width = u16()
  const height = u16()
  const flags = b[p]
  p += 3
  if (flags & 0x80) p += 3 * (1 << ((flags & 7) + 1))
  const skipBlocks = () => {
    for (;;) {
      if (p >= b.length) throw new Error('cut short inside a data block')
      const len = b[p++]
      if (!len) return
      p += len
    }
  }
  let frames = 0
  let cs = 0
  for (;;) {
    if (p >= b.length) throw new Error('no trailer (the file is cut short)')
    const t = b[p++]
    if (t === 0x3b) break
    if (t === 0x21) {
      const label = b[p++]
      if (label === 0xf9 && b[p] >= 4) cs += b[p + 2] | (b[p + 3] << 8)
      skipBlocks()
      continue
    }
    if (t !== 0x2c) throw new Error(`unexpected block 0x${t.toString(16)} at byte ${p - 1}`)
    p += 8
    const f = b[p++]
    if (f & 0x80) p += 3 * (1 << ((f & 7) + 1))
    p += 1
    skipBlocks()
    frames++
  }
  if (!frames) throw new Error('holds no frames')
  return { width, height, frames, durationMs: cs * 10 }
}

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const isPng = (b) => b.length > 8 && PNG_SIG.every((x, i) => b[i] === x)

/** Every local GIF a markdown file shows, as markdown images or <img> tags, outside code fences. */
export function gifRefs(text) {
  const refs = []
  let fenced = false
  text.split(/\r?\n/).forEach((line, i) => {
    if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; return }
    if (fenced) return
    for (const m of line.matchAll(/!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) refs.push({ line: i + 1, alt: m[1], src: m[2] })
    for (const m of line.matchAll(/<img\b[^>]*>/gi)) {
      const src = /\bsrc\s*=\s*"([^"]*)"/i.exec(m[0])
      const alt = /\balt\s*=\s*"([^"]*)"/i.exec(m[0])
      if (src) refs.push({ line: i + 1, alt: alt ? alt[1] : '', src: src[1] })
    }
  })
  return refs.filter((r) => /\.gif([?#].*)?$/i.test(r.src) && !/^[a-z][a-z0-9+.-]*:/i.test(r.src))
}

/** Every local link target in a markdown file, resolved against the file's folder. */
function linkTargets(text, dir) {
  const out = new Set()
  for (const m of text.matchAll(/\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) {
    const src = m[1].replace(/[?#].*$/, '')
    if (!/^[a-z][a-z0-9+.-]*:/i.test(src)) out.add(path.resolve(dir, src))
  }
  return out
}

/**
 * Check every GIF a markdown file references.
 * @param {{ root?: string, file?: string, budget?: typeof BUDGET }} [o]
 * @returns {{ problems: string[], gifs: { rel: string, bytes: number, frames: number, durationMs: number }[] }}
 */
export function check({ root = ROOT, file = 'README.md', budget = BUDGET } = {}) {
  const problems = []
  const gifs = []
  const abs = path.join(root, file)
  if (!fs.existsSync(abs)) return { problems: [`${file}: missing`], gifs }
  const text = fs.readFileSync(abs, 'utf-8')
  const dir = path.dirname(abs)
  const links = linkTargets(text, dir)
  const s = (ms) => `${(ms / 1000).toFixed(1)} s`
  for (const ref of gifRefs(text)) {
    const at = `${file}:${ref.line}`
    const gifAbs = path.resolve(dir, ref.src.replace(/[?#].*$/, ''))
    const rel = path.relative(root, gifAbs).split(path.sep).join('/')
    if ((ref.alt || '').trim().split(/\s+/).filter(Boolean).length < 4) problems.push(`${at}: ${rel} needs alt text that says what happens (four words or more)`)
    if (!fs.existsSync(gifAbs)) { problems.push(`${at}: ${rel} does not exist (record it: npm run record in packages/cli)`); continue }
    const bytes = fs.readFileSync(gifAbs)
    let info
    try { info = readGifInfo(bytes) } catch (e) { problems.push(`${rel}: ${e.message}`); continue }
    gifs.push({ rel, bytes: bytes.length, frames: info.frames, durationMs: info.durationMs })
    if (info.durationMs < budget.minMs) problems.push(`${rel}: ${s(info.durationMs)} long, under the ${budget.minMs / 1000} s budget`)
    if (info.durationMs > budget.maxMs) problems.push(`${rel}: ${s(info.durationMs)} long, over the ${budget.maxMs / 1000} s budget`)
    if (bytes.length > budget.maxBytes) problems.push(`${rel}: ${(bytes.length / MB).toFixed(2)} MB, over the ${(budget.maxBytes / MB).toFixed(0)} MB budget`)
    const posterAbs = gifAbs.replace(/\.gif$/i, '.png')
    const poster = rel.replace(/\.gif$/i, '.png')
    if (!fs.existsSync(posterAbs)) problems.push(`${rel}: its poster ${poster} does not exist (the recorder writes both)`)
    else if (!isPng(fs.readFileSync(posterAbs))) problems.push(`${poster}: not a PNG`)
    if (!links.has(posterAbs)) problems.push(`${at}: ${rel} needs a link to its poster ${poster}, for readers who ask for less motion`)
  }
  return { problems, gifs }
}

function main() {
  const { problems, gifs } = check()
  for (const g of gifs) console.log(`  ${g.rel}  ${(g.durationMs / 1000).toFixed(2)} s · ${(g.bytes / MB).toFixed(2)} MB · ${g.frames} frames`)
  for (const p of problems) console.error(`  ✗ ${p}`)
  if (problems.length) process.exit(1)
  console.log(`  ✓ ${gifs.length} GIF${gifs.length === 1 ? '' : 's'} in README.md within budget, each with its poster`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main()
