// The README's GIFs: every one it references exists, parses, fits
// the 5 to 8 s and 3 MB budget, says what happens, and has its poster.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { BUDGET, check, gifRefs, readGifInfo } from '../gifs.mjs'

const scratch = () => fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-gifs-'))
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])

/** A 1x1 GIF89a with one frame per delay (centiseconds), looping, two colours. */
function gif(delays) {
  const parts = [Buffer.from('GIF89a', 'latin1'), Buffer.from([1, 0, 1, 0, 0x80, 0, 0]), Buffer.from([0, 0, 0, 255, 255, 255])]
  parts.push(Buffer.from([0x21, 0xff, 11, ...Buffer.from('NETSCAPE2.0', 'latin1'), 3, 1, 0, 0, 0]))
  for (const d of delays) {
    parts.push(Buffer.from([0x21, 0xf9, 4, 0, d & 255, d >> 8, 0, 0]))
    parts.push(Buffer.from([0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 0x44, 0x01, 0]))
  }
  parts.push(Buffer.from([0x3b]))
  return Buffer.concat(parts)
}

const ALT = 'the fleet breathes, vega asks and the owner answers'

function repo({ readme, files = {} }) {
  const root = scratch()
  fs.writeFileSync(path.join(root, 'README.md'), readme)
  for (const [rel, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true })
    fs.writeFileSync(path.join(root, rel), body)
  }
  return root
}

test('the reader walks a GIF to its trailer: frames and length from the delays', () => {
  assert.deepEqual(readGifInfo(gif([300, 250, 100])), { width: 1, height: 1, frames: 3, durationMs: 6500 })
  assert.throws(() => readGifInfo(Buffer.from('not a gif at all')), /not a GIF/)
  const cut = gif([300, 300])
  assert.throws(() => readGifInfo(cut.subarray(0, cut.length - 1)), /no trailer|cut short/)
})

test('references: markdown images and <img> tags, local GIFs only, never inside a code fence', () => {
  const refs = gifRefs([
    `![${ALT}](./assets/gifs/a.gif)`,
    '<img alt="b in motion here" src="assets/gifs/b.gif" width="960">',
    '![remote](https://example.com/c.gif)',
    '![a diagram](./assets/plan.svg)',
    '```',
    '![fenced](./assets/gifs/d.gif)',
    '```',
  ].join('\n'))
  assert.deepEqual(refs.map((r) => [r.line, r.src, r.alt]), [[1, './assets/gifs/a.gif', ALT], [2, 'assets/gifs/b.gif', 'b in motion here']])
})

test('a GIF in budget with alt text and a linked poster is green', () => {
  const root = repo({
    readme: `![${ALT}](./assets/gifs/a.gif)\n\nStill: [poster](./assets/gifs/a.png)\n`,
    files: { 'assets/gifs/a.gif': gif([300, 300, 100]), 'assets/gifs/a.png': PNG },
  })
  const { problems, gifs } = check({ root })
  assert.deepEqual(problems, [])
  assert.deepEqual(gifs.map((g) => [g.rel, g.frames, g.durationMs]), [['assets/gifs/a.gif', 3, 7000]])
})

test('every miss is named: missing, short, long, heavy, no alt, no poster, poster unlinked or not a PNG', () => {
  const root = repo({
    readme: [
      `![${ALT}](./assets/gifs/gone.gif)`,
      `![${ALT}](./assets/gifs/short.gif) [p](./assets/gifs/short.png)`,
      `![${ALT}](./assets/gifs/long.gif) [p](./assets/gifs/long.png)`,
      '![x](./assets/gifs/mute.gif) [p](./assets/gifs/mute.png)',
      `![${ALT}](./assets/gifs/bare.gif)`,
      `![${ALT}](./assets/gifs/unlinked.gif)`,
      `![${ALT}](./assets/gifs/fake.gif) [p](./assets/gifs/fake.png)`,
    ].join('\n'),
    files: {
      'assets/gifs/short.gif': gif([200, 200]), 'assets/gifs/short.png': PNG,
      'assets/gifs/long.gif': gif([500, 500]), 'assets/gifs/long.png': PNG,
      'assets/gifs/mute.gif': gif([600]), 'assets/gifs/mute.png': PNG,
      'assets/gifs/bare.gif': gif([600]),
      'assets/gifs/unlinked.gif': gif([600]), 'assets/gifs/unlinked.png': PNG,
      'assets/gifs/fake.gif': gif([600]), 'assets/gifs/fake.png': 'not a png',
    },
  })
  const { problems } = check({ root })
  const has = (re) => assert.ok(problems.some((p) => re.test(p)), `expected ${re} in:\n${problems.join('\n')}`)
  has(/README\.md:1: assets\/gifs\/gone\.gif does not exist/)
  has(/short\.gif: 4\.0 s long, under the 5 s budget/)
  has(/long\.gif: 10\.0 s long, over the 8 s budget/)
  has(/README\.md:4: assets\/gifs\/mute\.gif needs alt text/)
  has(/bare\.gif: its poster assets\/gifs\/bare\.png does not exist/)
  has(/README\.md:6: assets\/gifs\/unlinked\.gif needs a link to its poster/)
  has(/fake\.png: not a PNG/)
  assert.equal(problems.length, 8, problems.join('\n')) // bare.gif misses its poster twice: on disk and as a link
})

test('the size budget holds', () => {
  const root = repo({
    readme: `![${ALT}](./assets/gifs/a.gif) [p](./assets/gifs/a.png)`,
    files: { 'assets/gifs/a.gif': gif([600]), 'assets/gifs/a.png': PNG },
  })
  assert.deepEqual(check({ root }).problems, [])
  const { problems } = check({ root, budget: { ...BUDGET, maxBytes: 10 } })
  assert.match(problems.join('\n'), /a\.gif: 0\.00 MB, over the 0 MB budget/)
})

test('the budget is the recorder\'s: 5 to 8 seconds, 3 MB', () => {
  assert.deepEqual({ ...BUDGET }, { minMs: 5000, maxMs: 8000, maxBytes: 3 * 1024 * 1024 })
})
