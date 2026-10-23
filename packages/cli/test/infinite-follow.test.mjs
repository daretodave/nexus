// Infinite's follow selector: drawn only while infinite is picked (and not when a session here opens instead), two
// keyboard-driven radiogroups, an owner-only step that stays visible, tokens-only CSS that holds still for reduced
// motion, and the choice kept per checkout after a start. Checks the source, like the Start empty test.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const pick = read('../src/screens/fleet/StartPick.jsx');
const sel = read('../src/screens/fleet/InfiniteFollow.jsx');
const css = read('../src/styles/infinite-follow.css');

test('StartPick opens the selector only for infinite, and not when a session here opens instead', () => {
  assert.match(pick, /<InfiniteFollow [^>]*open=\{following\}/);
  assert.match(pick, /const following = infinite && !opensHere;/);
  assert.match(pick, /const infinite = chosen\?\.value === INFINITE;/);
  assert.match(pick, /startPrompt\(chosen\.value, infinite \? fit : undefined\)/);
});

test('two radiogroups with roving focus, arrows and Home/End, an owner-only step marked disabled', () => {
  assert.match(sel, /role="radiogroup"/);
  assert.equal((sel.match(/<Radios /g) || []).length, 2);
  assert.match(sel, /aria-checked=\{chosen\}/);
  for (const k of ['ArrowLeft', 'ArrowRight', 'Home', 'End']) assert.ok(sel.includes(`'${k}'`), k);
  assert.match(sel, /aria-disabled=\{off \|\| undefined\}/);
  assert.match(sel, /tabIndex=\{chosen \? 0 : -1\}/);
  assert.match(sel, /aria-live="polite"/);
  assert.match(sel, /inert=\{!open\}/);
});

test('the CSS holds still for reduced motion and uses theme tokens only', () => {
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i, 'no hex colours');
  assert.doesNotMatch(css, /rgba?\(/i, 'no raw colours');
});

test('a successful start keeps the choice in prefs, best-effort', () => {
  assert.match(pick, /try \{\s*const r = await act\('\/api\/prefs', \{ infinite: serializeFollow\(f\) \}\);/);
  assert.match(pick, /if \(infinite\) await keepFollow\(fit\);/);
});
