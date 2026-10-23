// Which answer a polled screen draws (data/hooks.js useResource). Each ask is numbered as it starts; the server may
// answer a repeat ask at once from what it last read, marked stale, while a fresh read runs behind it
// (server/swr.mjs). An answer that started before the one already drawn never draws over it, and while a fresh read
// is on its way a poll's stale answer is older than what that read brings, so it is not drawn and asks for nothing.

/**
 * @param {object} a
 * @param {number} a.n         this answer's number
 * @param {number} a.drawn     the number of the answer on screen (0 for none)
 * @param {boolean} a.stale    the server served it from what it last read
 * @param {boolean} a.fresh    this ask waited for the server's fresh read
 * @param {number} a.freshing  fresh asks still on their way
 */
export function drawsAnswer({ n, drawn, stale, fresh, freshing }) {
  if (n < drawn) return false;
  return !(stale && !fresh && freshing > 0);
}
