// Grill me's question (0.5.1): where it sits, the question at display size, then the answer box at its large size
// (ui/answer-box.jsx) with Back and Skip beside it. A question already kept opens settled, with Change and Next.
import { Icon, Markdown, cx } from '../../ui/index.js';
import { AnswerBox } from '../../ui/answer-box.jsx';
import { shownOptions } from '../../ui/answer-logic.js';
import { KeptAnswer } from '../oversight/AnswerCard.jsx';

export function Question({ boxRef, x, spec, index, total, entry, onAsk, onKeep, onSkip, onBack, onNext, onChange, settled, hint, onEmpty, arriving, wandOn }) {
  const options = shownOptions(entry, x);
  return (
    <section className={cx('grill-q', arriving && 'is-arriving')} aria-label={`Question ${index + 1} of ${total}`} key={x.id}>
      <div className="grill-q-where">
        {spec.n ? <><span className="n">{spec.n}</span><span>{spec.title}</span><span aria-hidden="true">·</span></> : null}
        <span>question {index + 1} of {total}</span>
      </div>
      {settled ? (
        <>
          <KeptAnswer x={x} d={settled} onChange={onChange} />
          <div className="grill-acts">
            <button className="btn btn-ghost btn-s" type="button" onClick={onBack}><Icon name="chevronLeft" size={14} />Back</button>
            <span className="spacer" />
            <button className="btn btn-primary btn-s" type="button" onClick={onNext}>Next<Icon name="arrowRight" size={14} /></button>
          </div>
        </>
      ) : (
        <>
          <div className="grill-q-text"><Markdown text={x.q} /></div>
          <div className="grill-q-file">{x.raw.file}:{x.raw.line}</div>
          <AnswerBox
            ref={boxRef} key={x.id} item={x} draftKey={x.id} entry={entry} options={options} onAsk={wandOn ? onAsk : null} onKeep={onKeep}
            keepLabel="Keep and next" size="l" autoFocus stagger={arriving} emptyHint={hint} onEmpty={onEmpty}
            loadingLabel={spec.n ? `Thinking through spec ${spec.n}...` : 'Thinking it through...'}
          />
          <div className="grill-acts">
            <button className="btn btn-ghost btn-s" type="button" onClick={onBack} disabled={index === 0}><Icon name="chevronLeft" size={14} />Back</button>
            <button className="btn btn-ghost btn-s" type="button" onClick={onSkip}>Skip <span className="kbd">S</span></button>
            <span className="spacer" />
            <span className="grill-acts-note t-body-s c-3 tb-long">You decide <span className="kbd">D</span></span>
          </div>
        </>
      )}
    </section>
  );
}
