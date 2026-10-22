// A ledger progress line as a session prints it (spec 49, A3): scripts/plan/progress.mjs `bar` writes
// `[####....] 2 of 5 chunks · 40%`, ASCII so it reads the same in every terminal, and a heads-down session prints it
// at each iteration, so it is often a session's last word. The fleet tile draws it as its .tile-bar instead of the
// raw characters. Shared by the server (a session's last word carries it as `progress`) and the GUI (the tile).

// The bar: brackets around #, ., =, -, spaces or the block cells; optional backticks; then "N of M chunk(s)".
const LINE = /^\s*`?\[[#.=\-\s\u2588\u2591\u2593\u2592]*\]`?\s+(\d+)\s+of\s+(\d+)\s+chunks?\b/;

/** Whether this one line is a progress bar line. */
export const isProgressLine = (line) => LINE.test(String(line || ''));

/** The first progress bar line in a text as { done, total, pct, label } (label: "15 of 15 chunks"), or null. */
export function progressLine(text) {
  for (const line of String(text || '').split(/\r?\n/)) {
    const m = LINE.exec(line);
    if (!m) continue;
    const done = Number(m[1]);
    const total = Number(m[2]);
    if (!(total > 0) || done > total) continue;
    return { done, total, pct: Math.round((100 * done) / total), label: `${done} of ${total} chunks` };
  }
  return null;
}
