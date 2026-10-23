// A cron schedule as tokens (tokens.js kinds), field by field: numbers as numbers, * as an operator, the separators
// as punctuation. Pure. Each field carries its name, so a reader can hover a field and learn what it sets.

/** The five fields of a cron line, in order. */
export const CRON_FIELDS = ['minute', 'hour', 'day of month', 'month', 'day of week'];

/**
 * A cron's tokens: [{ t, v, field? }], lossless (the values, joined, are the input). A field's tokens carry its
 * index in CRON_FIELDS; the spaces between fields carry none. Anything past the fifth field (or not a cron at all)
 * stays plain text.
 */
export function cronTokens(cron) {
  const s = String(cron ?? '');
  const out = [];
  let field = -1;
  for (const m of s.matchAll(/(\s+)|(\S+)/g)) {
    if (m[1]) { out.push({ t: 'ws', v: m[1] }); continue; }
    field += 1;
    if (field >= CRON_FIELDS.length || !/^[\d*,/-]+$/.test(m[2])) { out.push({ t: 'text', v: m[2] }); continue; }
    for (const p of m[2].matchAll(/(\d+)|(\*)|([,/-])/g)) {
      out.push({ t: p[1] ? 'num' : p[2] ? 'op' : 'punct', v: p[0], field });
    }
  }
  return out;
}

const DAYS = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
const two = (n) => String(n).padStart(2, '0');
const num = (s) => (/^\d+$/.test(s) ? Number(s) : null);

/** The days a day-of-week field names, in words ("weekdays", "Mondays and Thursdays"), or null when it is not plain. */
function daysWords(f) {
  if (f === '*') return '';
  if (f === '1-5') return 'weekdays';
  if (f === '0,6' || f === '6,0') return 'weekends';
  const parts = f.split(',').map((p) => num(p));
  if (parts.some((p) => p == null || p > 7)) return null;
  const names = parts.map((p) => DAYS[p % 7]);
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
}

/**
 * A cron in plain words, UTC as GitHub runs it ("every day at 03:30 UTC", "weekdays at 09:00 UTC", "every 15
 * minutes"), or '' for a shape it does not say (the cron then speaks for itself). Day of month and month must be *.
 */
export function cronWords(cron) {
  const f = String(cron ?? '').trim().split(/\s+/);
  if (f.length !== 5 || f[2] !== '*' || f[3] !== '*') return '';
  const [mi, hr, , , dw] = f;
  const days = daysWords(dw);
  if (days == null) return '';
  const on = days ? ` on ${days}` : '';
  const step = /^\*\/(\d+)$/.exec(mi);
  if (step && hr === '*') return `every ${step[1]} minutes${on}`;
  if (mi === '*' && hr === '*') return `every minute${on}`;
  const m = num(mi);
  if (m == null || m > 59) return '';
  if (hr === '*') return `every hour at :${two(m)}${on}`;
  const hstep = /^\*\/(\d+)$/.exec(hr);
  if (hstep) return `every ${hstep[1]} hours at :${two(m)}${on}`;
  const hs = hr.split(',').map(num);
  if (hs.some((h) => h == null || h > 23)) return '';
  const at = hs.map((h) => `${two(h)}:${two(m)}`).join(', ');
  return `${days || 'every day'} at ${at} UTC`;
}
