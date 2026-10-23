// In the plan's body (spec 47, A7; spec 53; 0.5.1): a header per spec (its number, title and open count, then its wand,
// "Suggest for 4", and Grill me for that spec) over its questions; other files after, by path. Under each group its
// Continue: "Send 2 answers (1 image) to vega and continue", live from the first kept answer.
import { Link } from 'react-router-dom';
import { cx } from '../../ui/controls.jsx';
import { WandBtn } from '../../ui/wand.jsx';
import { choiceId } from '../../ui/answer-logic.js';
import { PATHS } from '../../routes.js';
import { planGroups } from './inboxModel.js';
import { continueChoices, continueTarget, imageCount, keepsAnswer, sendable } from './planAnswers.js';
import { ContinueBar } from './ContinueBar.jsx';

/** The open, unanswered questions of a group the wand can draft (no secret, none kept). */
export const wandable = (items, isDone) => items.filter((i) => keepsAnswer(i) && !isDone(i));

export function PlanGroups({ items, row, isDone, done, sessions, sendTo, continuing, onPick, onContinue, choices, wandOn = true }) {
  const targets = continueChoices(sessions);
  return planGroups(items).map((pg) => {
    const list = sendable(pg.items, done);
    const found = continueTarget(pg, sessions);
    const target = targets.find((c) => c.id === sendTo[pg.key]) || found;
    const words = pg.items.some(keepsAnswer);
    const open = wandable(pg.items, isDone);
    const ids = open.map(choiceId).filter(Boolean);
    const busy = ids.some((id) => choices?.get(id).status === 'loading');
    return (
      <div key={pg.key} className="ibx-spec" role="group" aria-label={pg.n ? `Spec ${pg.n} ${pg.title}` : pg.file}>
        <div className="ibx-spec-h">
          {pg.n ? <><span className="ibx-spec-n">{pg.n}</span><span className="ibx-spec-t">{pg.title || pg.file}</span></> : <span className="ibx-spec-t is-file">{pg.file}</span>}
          <span className="ibx-spec-c">{pg.items.filter((i) => !isDone(i)).length} open</span>
          {open.length ? (
            <span className="ibx-spec-acts">
              {wandOn && choices ? (
                <WandBtn
                  state={busy ? 'loading' : 'idle'} label={`Suggest for ${open.length}`} title={`Claude drafts choices for ${open.length === 1 ? 'this question' : `these ${open.length} questions`}`}
                  onClick={() => choices.ask(ids)}
                />
              ) : null}
              <Link className={cx('btn btn-ghost btn-s')} to={PATHS.grill(pg.n ? { spec: pg.n } : {})}>Grill me</Link>
            </span>
          ) : null}
        </div>
        {pg.items.map(row)}
        {words ? (
          <ContinueBar
            count={list.length} images={imageCount(list, done)} target={target} asked={target.id === found.id && found.why === 'asked'} choices={targets}
            sending={continuing === pg.key} onPick={(id) => onPick(pg.key, id)} onSend={() => onContinue(pg, target)}
          />
        ) : null}
      </div>
    );
  });
}
