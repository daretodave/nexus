// A set of questions answered as given (spec 51, A1), pure: the Send button's words and what it sends. A live
// ask goes from its first answer on; the questions left take their defaults (the server fills them in:
// shared/times.mjs completeAnswers), and one with no default goes as "no answer" so the agent proceeds.
import { askDefault } from '../../shared/times.mjs';

const s = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/**
 * "Send 2 answers · 3 take their defaults", "Send answers" once every one is answered, or null before the first.
 * `unanswered`: left with no default to take.
 */
export function sendLabel({ total, answered, defaults = 0, unanswered = 0 }) {
  if (!answered) return null;
  if (answered >= total) return 'Send answers';
  const parts = [`Send ${s(answered, 'answer', 'answers')}`];
  if (defaults) parts.push(defaults === 1 ? '1 takes its default' : `${defaults} take their defaults`);
  if (unanswered) parts.push(`${unanswered} unanswered`);
  return parts.join(' · ');
}

/** The cockpit's start bar from the first answer on: "Start with 1 answer · 3 take their defaults". */
export function startLabel({ total, answered }) {
  const rest = total - answered;
  if (!answered || rest <= 0) return null;
  return `Start with ${s(answered, 'answer', 'answers')} · ${rest === 1 ? '1 takes its default' : `${rest} take their defaults`}`;
}

/**
 * A live ask and what has been answered of it (by question text) -> { payload, answers, how, label, answered,
 * defaults, unanswered }. `payload` is what POST /api/ask/:id carries (the answered ones: the server fills the rest);
 * `answers` is the whole set as it will reach the session, `how` says which were given and which took a default.
 */
export function askSend(questions = [], picked = {}) {
  const payload = {};
  const answers = {};
  const how = {};
  let answered = 0;
  let defaults = 0;
  let unanswered = 0;
  for (const q of questions) {
    const key = q?.question;
    if (key == null) continue;
    const a = picked[key] != null ? String(picked[key]).trim() : '';
    if (a) { payload[key] = a; answers[key] = a; how[key] = 'answered'; answered++; continue; }
    const d = askDefault(q);
    how[key] = 'default';
    if (d == null) { unanswered++; answers[key] = null; } else { defaults++; answers[key] = d; }
  }
  const total = answered + defaults + unanswered;
  return { payload, answers, how, answered, defaults, unanswered, label: sendLabel({ total, answered, defaults, unanswered }) };
}
