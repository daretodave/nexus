// The mini terminal's replay of `claude setup-token` (TokenTerm.jsx): pure frames and timing, no React.
//
// The words are what Claude Code 2.1.309 prints, read out of the installed binary: the intro, "Opening browser to
// sign in…", the success line, "Your OAuth token (valid for 1 year):", the store warning and the export hint. Only
// the start of the "Browser didn't open?" line could be read from the binary; the rest of that line is inferred.
// The words can change between Claude Code versions, and the page says so under the window.
import { FAKE_TOKEN } from '../../../shared/oauth-token.mjs';

export const COMMAND = 'claude setup-token';
/** Typing speed for the command, ms per character. */
export const TYPE_MS = 45;
/** The browser card's time on screen (the sign-in happens there, not in the terminal). */
export const BROWSER = { from: 2000, signed: 3900, to: 4600 };

/**
 * Every line, in time order: { at (ms), kind, text, note? }. kind: cmd | dim | out | ok | url | token | callout.
 * The run is about 9 s once, then it holds on the last frame.
 */
export function tokenFrames() {
  return [
    { at: 0, kind: 'cmd', text: COMMAND },
    { at: 1100, kind: 'dim', text: 'This will guide you through long-lived (1-year) auth token setup for your Claude account. Claude subscription required.' },
    { at: 1700, kind: 'out', text: 'Opening browser to sign in…' },
    // Inferred past "Browser didn": only that much of the line could be read out of the binary.
    { at: 2300, kind: 'dim', text: 'Browser didn\'t open? Use the url below to sign in' },
    { at: 2400, kind: 'url', text: 'https://claude.ai/oauth/authorize?…' },
    { at: 5000, kind: 'ok', text: '✓ Long-lived authentication token created successfully!' },
    { at: 5600, kind: 'out', text: 'Your OAuth token (valid for 1 year):' },
    { at: 6000, kind: 'token', text: FAKE_TOKEN },
    { at: 6400, kind: 'callout', text: 'this is the one: copy it whole' },
    { at: 7000, kind: 'dim', text: 'Store this token securely. You won\'t be able to see it again.' },
    { at: 7600, kind: 'dim', text: 'Use this token by setting: export CLAUDE_CODE_OAUTH_TOKEN=<token>', note: 'skip this line: the loop reads the token from the repo secret.' },
  ];
}

/** When the replay is over (the last line's time, plus a beat). */
export const END_MS = 9000;

/** How many lines show at `t` ms. */
export function shownAt(frames, t) {
  return frames.filter((f) => f.at <= t).length;
}

/** The command as typed so far at `t` (the first frame types itself). */
export function typedAt(t) {
  return COMMAND.slice(0, Math.max(0, Math.min(COMMAND.length, Math.floor(t / TYPE_MS))));
}

/** The browser card at `t`: 'hidden' | 'asking' | 'signed' | 'gone'. Reduced motion shows 'signed', still, at once. */
export function browserAt(t) {
  if (t < BROWSER.from) return 'hidden';
  if (t < BROWSER.signed) return 'asking';
  if (t < BROWSER.to) return 'signed';
  return 'gone';
}

/** The next time anything on screen changes after `t` (a line, a typed character, the browser card), or null. */
export function nextTick(frames, t) {
  const typingEnd = COMMAND.length * TYPE_MS;
  if (t < typingEnd) return Math.min(t + TYPE_MS, typingEnd);
  const times = [...frames.map((f) => f.at), BROWSER.from, BROWSER.signed, BROWSER.to, END_MS].filter((x) => x > t);
  return times.length ? Math.min(...times) : null;
}

/** The full transcript, for screen readers and the reduced render: every line as words. */
export function transcript(frames = tokenFrames()) {
  return frames.map((f) => (f.kind === 'cmd' ? `$ ${f.text}` : f.kind === 'callout' ? `(${f.text})` : f.note ? `${f.text} (${f.note})` : f.text));
}
