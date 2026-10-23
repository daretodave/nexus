// The Oversight panel's answer card (0.5.1): a plan question, or a question a session parked, answer first. Where it
// sits and its wand on top, the question at reading size (clamped, "Show all"), then the answer box (ui/answer-box.jsx:
// choices, your words, images, You decide, Keep) as the largest, brightest thing on the card. Once kept it folds to
// what you answered, with Change answer. Live asks, permissions and secrets keep their own cards (screens/Inbox.jsx).
// CSS: styles/answer-card.css.
import { useState } from 'react';
import { Icon, Markdown, SessTag, cx } from '../../ui/index.js';
import { AnswerBox } from '../../ui/answer-box.jsx';
import { WandBtn } from '../../ui/wand.jsx';
import { shownOptions } from '../../ui/answer-logic.js';
import { thumbOf } from '../../ui/image-refs.js';
import { DECIDE_TEXT, IMAGE_ONLY_TEXT } from '../../../shared/choices.mjs';
import '../../styles/answer-card.css';

const LONG = 420;

/** Where the question sits: "11 Sharing · plan/11-sharing.md:119", or the session and chunk that parked it. */
function Source({ x, repo }) {
  if (x.src === 'durable') {
    return (
      <>
        {x.spec ? <><span className="n">{x.spec.n}</span><span>{x.spec.title}</span><span aria-hidden="true">·</span></> : null}
        <span className="f">{x.raw.file}:{x.raw.line}</span>
        <span className="k">{x.who}</span>
      </>
    );
  }
  if (x.kind === 'cloud') return <><Icon name="cloud" size={14} /><span className="f">{repo ? `${repo} loop` : 'cloud run'} {x.run}{x.chunk ? ` · ${x.chunk}` : ''}</span></>;
  return <>{x.session ? <SessTag session={x.session} /> : null}<span className="f">{[x.who, x.chunk, x.at ? `parked ${x.at}` : ''].filter(Boolean).join(' · ')}</span></>;
}

/** What was kept: the words as given (line breaks kept), its images, and where it stands. */
export function KeptAnswer({ x, d, onChange }) {
  const decided = d.how === 'decide';
  const words = d.a === DECIDE_TEXT || d.a === IMAGE_ONLY_TEXT ? '' : d.a;
  return (
    <div className="acard is-kept" role="group" aria-label="Your answer">
      <div className="acard-src"><Source x={x} /></div>
      <div className="acard-q" style={{ fontSize: 14, lineHeight: '21px', color: 'var(--text-2)' }}><Markdown text={x.q} /></div>
      {decided ? (
        <div className="acard-kept"><Icon name="check" /><span>You left this one to the session. It takes the option it judges best and says why.{words ? <> Your notes: <b>{words}</b></> : null}</span></div>
      ) : (
        <div className="acard-kept"><Icon name="check" /><span><b>You answered:</b></span></div>
      )}
      {!decided && words ? <p className="acard-answer">{words}</p> : null}
      {d.images?.length ? <div className="acard-thumbs">{d.images.map((i) => <img key={i.file} src={thumbOf(i.file)} alt={i.name || 'attached image'} title={i.name} />)}</div> : null}
      <div className="acard-acts">
        <span className={cx('chk-state', d.sent ? 'is-ok' : 'pans-kept')}><Icon name={d.sent ? 'check' : 'clock'} size={14} />{d.sent ? `sent${d.to && d.toName ? ` to ${d.toName}` : ''}` : 'not sent yet'}</span>
        {onChange ? <button className="btn btn-ghost btn-s" type="button" onClick={onChange}>Change answer</button> : null}
      </div>
    </div>
  );
}

/**
 * @param {object} p
 * @param {object} p.x          the question
 * @param {object} p.entry      its wand's entry (data/choices.js), or null where the wand cannot run
 * @param {(fresh) => void} [p.onAsk]
 * @param {(text, images, how) => void} p.onKeep
 * @param {React.ReactNode} [p.foot]   under the box: the spec's Continue once something is kept
 */
export function AnswerCard({ x, entry, onAsk, onKeep, repo, foot, footNote }) {
  const [all, setAll] = useState(false);
  const long = String(x.q || '').length > LONG;
  const options = shownOptions(entry, x);
  const plan = x.src === 'durable';
  return (
    <div className={cx('acard', plan && 'is-plan')} role="group" aria-label={plan ? 'Plan question' : 'Parked question'}>
      <div className="acard-src">
        <Source x={x} repo={repo} />
        {onAsk ? <WandBtn state={entry?.status} onClick={() => onAsk(entry?.status === 'ready')} small /> : null}
      </div>
      <div className={cx('acard-q', long && !all && 'is-clamped')}><Markdown text={x.q} /></div>
      {long ? <button className="btn btn-ghost btn-s acard-more" type="button" onClick={() => setAll((a) => !a)}>{all ? 'Show less' : 'Show all'}</button> : null}
      <AnswerBox
        key={x.id} item={x} draftKey={x.id} entry={entry} options={options} onAsk={onAsk} onKeep={onKeep}
        keepLabel={plan ? 'Keep answer' : 'Send answer'} allowImages allowDecide={plan}
        loadingLabel={x.spec ? `Thinking through spec ${x.spec.n}...` : 'Thinking it through...'}
      />
      {foot || (footNote ? <div className="acard-foot">{footNote}</div> : null)}
    </div>
  );
}
