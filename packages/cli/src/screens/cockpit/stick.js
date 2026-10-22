// The transcript's scroll pin (spec 47): it opens at the newest message and
// stays there while messages stream in; scrolled up, it stays where the
// person put it (no yank) until they come back to the bottom. Pure: the
// Working board feeds it the scroller's measures.

/** How near the bottom (px) still counts as at the bottom: a stray wheel tick or a rounding error never unpins. */
export const STICK_SLACK = 24;

/** Whether a scroller's measures sit at its bottom. */
export function atBottom({ scrollTop, scrollHeight, clientHeight }, slack = STICK_SLACK) {
  return scrollHeight - clientHeight - scrollTop <= slack;
}

/** After the person scrolled: pinned again at the bottom, unpinned anywhere above it. */
export function pinAfterScroll(measures) {
  return atBottom(measures);
}

/** After the content or the box changed: the scrollTop to set (the bottom) while pinned; null leaves it alone. */
export function stickTarget(pinned, { scrollHeight, clientHeight }) {
  return pinned ? Math.max(0, scrollHeight - clientHeight) : null;
}
