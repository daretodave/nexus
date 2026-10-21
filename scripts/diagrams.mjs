#!/usr/bin/env node
// scripts/diagrams.mjs — every SVG under assets/, from one style table.
//
// The README's diagrams are generated, never hand-drawn, so they
// share one art style and the gate can notice a stale one. Edit
// STYLE or a diagram below, then regenerate; a hand edit to an
// assets/*.svg fails the gate's `diagrams` leg.
//
//   node scripts/diagrams.mjs           # write assets/*.svg
//   node scripts/diagrams.mjs --check   # regenerate in memory; exit 1
//                                       # on any diff, naming the file
//   node scripts/diagrams.mjs --dir <p> # either, on another folder
//
// Each SVG carries both themes: light by default, dark under a
// prefers-color-scheme media query in its own <style>. No
// external fonts, no scripts, no links: a system font stack and
// inline shapes only. Output is byte-identical across runs and
// operating systems (\n line endings, integer-or-one-decimal
// coordinates, no timestamps); .gitattributes keeps the
// committed files LF on Windows checkouts.

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..')
export const ASSETS = path.join(ROOT, 'assets')

// --- the style table -----------------------------------------------------
// One place for palette, stroke, corner radius, type and arrowheads.

export const STYLE = {
  font: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif",
  mono: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace",
  // Font sizes, and the average glyph width (in em) used to size boxes
  // without font metrics. Generous on purpose: a box a little wide
  // beats a label that spills.
  type: { heading: 16, title: 15, sub: 12.5, edge: 12, sansEm: 0.53, monoEm: 0.61 },
  stroke: 1.5,
  radius: 10,
  arrow: { length: 9, width: 8 },
  pad: 28, // panel inset
  boxPadX: 18, // box text inset
  palette: {
    light: {
      panel: '#ffffff', border: '#d0d7de', ink: '#1f2328', muted: '#59636e',
      box: '#f6f8fa', boxLine: '#afb8c1', edge: '#6e7781',
      accent: '#0969da', accentBox: '#ddf4ff',
      done: '#1a7f37', doneBox: '#dafbe1',
    },
    dark: {
      panel: '#0d1117', border: '#30363d', ink: '#e6edf3', muted: '#9198a1',
      box: '#161b22', boxLine: '#484f58', edge: '#8b949e',
      accent: '#4493f8', accentBox: '#0c2d6b',
      done: '#3fb950', doneBox: '#0f3320',
    },
  },
}

// --- primitives ----------------------------------------------------------

const n = (v) => {
  const r = Math.round(v * 10) / 10
  return Object.is(r, -0) ? '0' : String(r)
}
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function textWidth(s, size, mono = false) {
  return [...String(s)].length * size * (mono ? STYLE.type.monoEm : STYLE.type.sansEm)
}

// Box kinds map to CSS classes: plain, accent (the thing acted on),
// done (where work ends up).
const KIND = { plain: ['box', 'ink'], accent: ['box-accent', 'ink-accent'], done: ['box-done', 'ink-done'] }

function css() {
  const rules = (p) => [
    `.panel{fill:${p.panel};stroke:${p.border}}`,
    `.box{fill:${p.box};stroke:${p.boxLine}}`,
    `.box-accent{fill:${p.accentBox};stroke:${p.accent}}`,
    `.box-done{fill:${p.doneBox};stroke:${p.done}}`,
    `.tile{fill:${p.accentBox};stroke:${p.accent}}`,
    `.ink{fill:${p.ink}}`,
    `.ink-accent{fill:${p.accent}}`,
    `.ink-done{fill:${p.done}}`,
    `.muted{fill:${p.muted}}`,
    `.edge{fill:none;stroke:${p.edge}}`,
    `.head{fill:${p.edge}}`,
    `.wait{fill:none;stroke:${p.edge};stroke-dasharray:3 4}`,
  ]
  const { light, dark } = STYLE.palette
  return [
    `text{font-family:${STYLE.font}}`,
    `.mono{font-family:${STYLE.mono}}`,
    `.heading{font-size:${STYLE.type.heading}px;font-weight:600}`,
    `.title{font-size:${STYLE.type.title}px;font-weight:600}`,
    `.sub{font-size:${STYLE.type.sub}px}`,
    `.label{font-size:${STYLE.type.edge}px}`,
    `.panel,.box,.box-accent,.box-done,.tile,.edge,.wait{stroke-width:${STYLE.stroke}}`,
    `.edge,.wait{stroke-linecap:round;stroke-linejoin:round}`,
    ...rules(light),
    '@media (prefers-color-scheme: dark){',
    ...rules(dark).map((r) => `  ${r}`),
    '}',
  ]
}

function text(x, y, s, cls, anchor = 'middle') {
  return `<text x="${n(x)}" y="${n(y)}" text-anchor="${anchor}" class="${cls}">${esc(s)}</text>`
}

// A box: a title line, then up to two sub lines. Lines starting with
// '`' are set in the mono face (the backtick is dropped).
function boxHeight(lines) {
  return 22 + 22 + (lines.length - 1) * 18
}

function boxWidth(lines) {
  const widths = lines.map((l, i) => {
    const mono = l.startsWith('`')
    const s = mono ? l.slice(1) : l
    return textWidth(s, i === 0 ? STYLE.type.title : STYLE.type.sub, mono)
  })
  return Math.ceil(Math.max(...widths) + STYLE.boxPadX * 2)
}

function box({ x, y, w, h, lines, kind = 'plain' }) {
  const [boxCls, titleCls] = KIND[kind]
  const out = [`<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${STYLE.radius}" class="${boxCls}"/>`]
  const block = (lines.length - 1) * 18 + 15
  let ty = y + (h - block) / 2 + 12
  lines.forEach((l, i) => {
    const mono = l.startsWith('`')
    const s = mono ? l.slice(1) : l
    const cls = [i === 0 ? `title ${titleCls}` : 'sub muted', mono ? 'mono' : ''].filter(Boolean).join(' ')
    out.push(text(x + w / 2, ty + (i === 0 ? 0 : 2), s, cls))
    ty += 18
  })
  return out
}

// An arrow along a polyline; the head sits on the last point.
function arrow(points, cls = 'edge') {
  const { length, width } = STYLE.arrow
  const [ax, ay] = points[points.length - 2]
  const [bx, by] = points[points.length - 1]
  const d = Math.hypot(bx - ax, by - ay)
  const ux = (bx - ax) / d
  const uy = (by - ay) / d
  const shaft = points.slice(0, -1).concat([[bx - ux * length * 0.8, by - uy * length * 0.8]])
  const pathD = shaft.map(([x, y], i) => `${i ? 'L' : 'M'}${n(x)} ${n(y)}`).join(' ')
  const bx0 = bx - ux * length
  const by0 = by - uy * length
  const head = [[bx, by], [bx0 - uy * width / 2, by0 + ux * width / 2], [bx0 + uy * width / 2, by0 - ux * width / 2]]
  return [
    `<path d="${pathD}" class="${cls}"/>`,
    `<path d="M${head.map(([x, y]) => `${n(x)} ${n(y)}`).join(' L')} Z" class="head"/>`,
  ]
}

function svg({ name, title, desc, width, height, heading, caption, body }) {
  const id = name.replace(/\W/g, '-')
  const head = []
  if (heading) head.push(text(STYLE.pad, STYLE.pad + 14, heading, 'heading ink', 'start'))
  if (caption) head.push(text(width - STYLE.pad, STYLE.pad + 14, caption, 'sub muted', 'end'))
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="${id}-title ${id}-desc">`,
    `<!-- Generated by scripts/diagrams.mjs. Edit the script, not this file. -->`,
    `<title id="${id}-title">${esc(title)}</title>`,
    `<desc id="${id}-desc">${esc(desc)}</desc>`,
    '<style>',
    ...css(),
    '</style>',
    `<rect x="0.75" y="0.75" width="${n(width - 1.5)}" height="${n(height - 1.5)}" rx="${STYLE.radius + 4}" class="panel"/>`,
    ...head,
    ...body,
    '</svg>',
    '',
  ].join('\n')
}

const TOP = STYLE.pad + 40 // first row under a heading

// --- diagram: the plan shape -----------------------------------------------

function planShape() {
  const steps = [
    { lines: ['spec', '`plan/NN-slug.md', 'before the code'] },
    { lines: ['chunk', 'S, M or L', 'one session at most'], kind: 'accent' },
    { lines: ['A-ID', '`A1 · A2 · A3', 'never renumbered'] },
    { lines: ['archive', '`plan/ARCHIVE.md', 'one line per chunk'], kind: 'done' },
  ]
  const edges = ['ends in', 'closes', 'lands as']
  const w = Math.max(...steps.map((s) => boxWidth(s.lines)))
  const h = boxHeight(steps[0].lines)
  const gap = Math.ceil(Math.max(...edges.map((e) => textWidth(e, STYLE.type.edge))) + 24)
  const width = STYLE.pad * 2 + steps.length * w + (steps.length - 1) * gap
  const y = TOP + 10
  const body = []
  steps.forEach((s, i) => {
    const x = STYLE.pad + i * (w + gap)
    body.push(...box({ x, y, w, h, lines: s.lines, kind: s.kind }))
    if (i < edges.length) {
      const x0 = x + w + 4
      const x1 = x + w + gap - 4
      body.push(text((x0 + x1) / 2, y + h / 2 - 8, edges[i], 'label muted'))
      body.push(...arrow([[x0, y + h / 2], [x1, y + h / 2]]))
    }
  })
  return svg({
    name: 'plan-shape',
    title: 'The plan shape',
    desc: 'A spec ends in chunks; each chunk closes acceptance IDs; a finished chunk leaves the plan as one archive line.',
    width,
    height: y + h + STYLE.pad,
    heading: 'The plan shape',
    caption: 'the plan only shrinks: progress is what is left',
    body,
  })
}

// --- diagram: the landing split --------------------------------------------

function landing() {
  const start = { lines: ['a chunk, built', 'the gate green'], kind: 'accent' }
  const owner = { lines: ['owner mode', 'straight to main', '`git push origin main'] }
  const contrib = { lines: ['contributor mode', 'one branch per chunk', '`next/<id> → pull request'] }
  const main = { lines: ['origin/main', 'the source of truth'], kind: 'done' }
  const ws = boxWidth(start.lines)
  const wm = Math.max(boxWidth(owner.lines), boxWidth(contrib.lines))
  const we = boxWidth(main.lines)
  const hs = boxHeight(start.lines)
  const hm = boxHeight(owner.lines)
  const labelW = (s) => Math.ceil(textWidth(s, STYLE.type.edge))
  const fork = 44 + labelW('has .owner') + 34 // start to the branches
  const join = labelW('reviewed') + 30 + 44 // the branches to main
  const rowGap = 28
  const width = STYLE.pad * 2 + ws + fork + wm + join + we
  const yOwner = TOP
  const yContrib = TOP + hm + rowGap
  const mid = TOP + hm + rowGap / 2
  const xs = STYLE.pad
  const xm = xs + ws + fork
  const xe = xm + wm + join
  const yOwnerC = yOwner + hm / 2
  const yContribC = yContrib + hm / 2
  const body = [
    ...box({ x: xs, y: mid - hs / 2, w: ws, h: hs, ...start }),
    ...box({ x: xm, y: yOwner, w: wm, h: hm, ...owner }),
    ...box({ x: xm, y: yContrib, w: wm, h: hm, ...contrib }),
    ...box({ x: xe, y: mid - boxHeight(main.lines) / 2, w: we, h: boxHeight(main.lines), ...main }),
  ]
  const bx = xs + ws + 44 // the branch point
  body.push(`<path d="M${n(xs + ws + 4)} ${n(mid)} L${n(bx)} ${n(mid)}" class="edge"/>`)
  body.push(...arrow([[bx, mid], [bx, yOwnerC], [xm - 4, yOwnerC]]))
  body.push(...arrow([[bx, mid], [bx, yContribC], [xm - 4, yContribC]]))
  body.push(text(bx + 10, yOwnerC - 8, 'has .owner', 'label muted', 'start'))
  body.push(text(bx + 10, yContribC - 8, 'no .owner', 'label muted', 'start'))
  const jx = xe - 44 // the join point
  const ex = xm + wm + 4
  body.push(`<path d="M${n(ex)} ${n(yOwnerC)} L${n(jx)} ${n(yOwnerC)} L${n(jx)} ${n(mid)}" class="edge"/>`)
  body.push(`<path d="M${n(ex)} ${n(yContribC)} L${n(jx)} ${n(yContribC)} L${n(jx)} ${n(mid)}" class="edge"/>`)
  body.push(...arrow([[jx, mid], [xe - 4, mid]]))
  body.push(text(ex + 8, yOwnerC - 8, 'pushed', 'label muted', 'start'))
  body.push(text(ex + 8, yContribC - 8, 'reviewed', 'label muted', 'start'))
  return svg({
    name: 'landing',
    title: 'How work lands',
    desc: 'A built chunk with a green gate lands one of two ways: in owner mode (a .owner file) it is pushed to main; in contributor mode it becomes a pull request on next/<id>, reviewed and merged. Both end on origin/main.',
    width,
    height: yContrib + hm + STYLE.pad,
    heading: 'How work lands',
    caption: 'the same verbs for everyone; the checkout decides',
    body,
  })
}

// --- diagram: the loop -----------------------------------------------------

function loop() {
  const rows = [
    { cmd: '/next', note: ['one chunk', 'pick, build, gate, land'], tiles: 1, mode: 'one' },
    { cmd: '/heads-down', note: ['many chunks', 'questions first, then no stops'], tiles: 4, mode: 'many' },
    { cmd: '/march', note: ['on a timer', 'one tick per interval, unattended'], tiles: 3, mode: 'timed' },
  ]
  const pillW = Math.ceil(Math.max(...rows.map((r) => textWidth(r.cmd, STYLE.type.title, true))) + STYLE.boxPadX * 2)
  const noteW = Math.max(...rows.map((r) => boxWidth(r.note)))
  const tile = { w: 34, h: 26 }
  const trackW = 320
  const rowH = boxHeight(rows[0].note)
  const rowGap = 22
  const lead = 52 // pill to track
  const tail = 28 // track to note
  const width = STYLE.pad * 2 + pillW + lead + trackW + tail + noteW
  const xPill = STYLE.pad
  const xTrack = xPill + pillW + lead
  const xNote = xTrack + trackW + tail
  const body = []
  rows.forEach((r, i) => {
    const y = TOP + i * (rowH + rowGap)
    const cy = y + rowH / 2
    const pillH = 34
    body.push(`<rect x="${n(xPill)}" y="${n(cy - pillH / 2)}" width="${pillW}" height="${pillH}" rx="${pillH / 2}" class="box-accent"/>`)
    body.push(text(xPill + pillW / 2, cy + 5, r.cmd, 'title ink-accent mono'))
    body.push(...arrow([[xPill + pillW + 6, cy], [xTrack - 6, cy]]))
    const ty = cy - tile.h / 2
    const tileAt = (x) => `<rect x="${n(x)}" y="${n(ty)}" width="${tile.w}" height="${tile.h}" rx="6" class="tile"/>`
    if (r.mode === 'one') {
      body.push(tileAt(xTrack + 6))
      body.push(text(xTrack + 6 + tile.w + 12, cy + 4, 'then stop', 'label muted', 'start'))
    } else if (r.mode === 'many') {
      const qW = 76
      body.push(`<rect x="${n(xTrack)}" y="${n(ty)}" width="${qW}" height="${tile.h}" rx="6" class="box"/>`)
      body.push(text(xTrack + qW / 2, cy + 4, 'ask once', 'label ink'))
      const step = tile.w + 30
      const x0 = xTrack + qW + 30
      body.push(...arrow([[xTrack + qW + 3, cy], [x0 - 3, cy]]))
      for (let k = 0; k < r.tiles; k++) {
        const x = x0 + k * step
        body.push(tileAt(x))
        if (k < r.tiles - 1) body.push(...arrow([[x + tile.w + 3, cy], [x + step - 3, cy]]))
      }
    } else {
      const wait = 64
      const step = tile.w + wait
      for (let k = 0; k < r.tiles; k++) {
        const x = xTrack + 6 + k * step
        body.push(tileAt(x))
        if (k < r.tiles - 1) {
          body.push(`<path d="M${n(x + tile.w + 6)} ${n(cy)} L${n(x + step - 6)} ${n(cy)}" class="wait"/>`)
          body.push(text(x + tile.w + wait / 2, cy - 8, 'wait', 'label muted'))
        }
      }
      const last = xTrack + 6 + (r.tiles - 1) * step + tile.w
      body.push(`<path d="M${n(last + 6)} ${n(cy)} L${n(last + 40)} ${n(cy)}" class="wait"/>`)
    }
    body.push(...box({ x: xNote, y, w: noteW, h: rowH, lines: r.note }))
  })
  return svg({
    name: 'loop',
    title: 'The loop',
    desc: '/next builds one chunk and stops; /heads-down asks every question up front, then builds many chunks without stopping; /march runs one tick per interval, unattended.',
    width,
    height: TOP + rows.length * rowH + (rows.length - 1) * rowGap + STYLE.pad,
    heading: 'The loop',
    caption: 'every tile is one chunk, done fully',
    body,
  })
}

// --- the set -----------------------------------------------------------------

export const DIAGRAMS = { 'plan-shape.svg': planShape, 'landing.svg': landing, 'loop.svg': loop }

export function render() {
  return Object.fromEntries(Object.entries(DIAGRAMS).map(([file, make]) => [file, make()]))
}

export function write(dir = ASSETS) {
  fs.mkdirSync(dir, { recursive: true })
  const out = render()
  for (const [file, body] of Object.entries(out)) fs.writeFileSync(path.join(dir, file), body)
  return Object.keys(out)
}

// Problems, one line each, naming the file; empty means in sync.
export function check(dir = ASSETS) {
  const problems = []
  const rel = (f) => `assets/${f}`
  const out = render()
  for (const [file, body] of Object.entries(out)) {
    const abs = path.join(dir, file)
    if (!fs.existsSync(abs)) { problems.push(`${rel(file)}: missing (run node scripts/diagrams.mjs)`); continue }
    const disk = fs.readFileSync(abs, 'utf-8')
    if (disk === body) continue
    const a = disk.split('\n')
    const b = body.split('\n')
    let line = 0
    while (line < Math.max(a.length, b.length) && a[line] === b[line]) line++
    problems.push(`${rel(file)}: differs from the generator at line ${line + 1} (edit scripts/diagrams.mjs, then run it)`)
  }
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir).sort()) {
      if (f.endsWith('.svg') && !(f in out)) problems.push(`${rel(f)}: not generated by scripts/diagrams.mjs (add it there, or delete it)`)
    }
  }
  return problems
}

function main() {
  const argv = process.argv.slice(2)
  const at = argv.indexOf('--dir')
  const dir = at === -1 ? ASSETS : path.resolve(argv[at + 1] || '.')
  if (argv.includes('--check')) {
    const problems = check(dir)
    for (const p of problems) process.stderr.write(`diagrams: ${p}\n`)
    if (problems.length) process.exit(1)
    process.stdout.write(`diagrams: ${Object.keys(DIAGRAMS).length} SVGs match the generator\n`)
    return
  }
  const files = write(dir)
  const shown = path.relative(ROOT, dir).split(path.sep).join('/') || '.'
  process.stdout.write(`diagrams: wrote ${files.map((f) => `${shown}/${f}`).join(', ')}\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main()
