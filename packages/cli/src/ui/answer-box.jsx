// The answer box (0.5.1): the biggest thing on a question. Numbered choices above (the wand's, or the question's own
// recommendation; several can be picked), then a textarea that takes pasted, dropped or picked images, then a bar:
// attach, You decide, the draft's quiet state word, Keep. Picking a choice toggles it in the box and never keeps by
// itself (answer-logic.js togglePick: your words are never lost). Kept answers carry the choices shown and which were
// picked (choicesOf), so the session reads "the first one" right. Used by the Oversight panel and Grill me.
//
// Keys in the box: Enter is a new line, Ctrl/Cmd+Enter keeps, Alt+1..4 picks or unpicks, Alt+W runs the wand, Esc blurs; none
// while an IME is composing. The text is a draft (data/drafts.js) at `draftKey`, the images at `<draftKey>:img`
// (ui/image-refs.js). CSS: styles/answer-card.css.
import { useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Icon } from './icons.jsx';
import { FileChip, Kbd, cx } from './controls.jsx';
import { SyntaxTextarea } from './code.jsx';
import { pasteFiles } from './composer.jsx';
import { useFileDrop } from './attachments.js';
import { useDraft, DRAFT_WORDS } from '../data/drafts.js';
import { useAnswerImages } from './image-refs.js';
import { ChoiceList } from './wand.jsx';
import { choicesOf, howOf, togglePick } from './answer-logic.js';
import '../styles/answer-card.css';
import '../styles/attachments.css';
import '../styles/answers.css';

export { togglePick } from './answer-logic.js';

const ACCEPT = 'image/png,image/jpeg,image/gif,image/webp';

/**
 * @param {object} p
 * @param {object} p.item         the question (headsdown-inbox/inboxModel.js item)
 * @param {string} p.draftKey     where its words are kept as typed
 * @param {object} p.entry        the wand's store entry (data/choices.js)
 * @param {Array}  p.options      the choices to draw (the wand's, or the row's own)
 * @param {(fresh: boolean) => void} [p.onAsk]   run the wand (none: no wand here)
 * @param {(text, images, how, choices) => void} p.onKeep   choices: { options, picked } or null
 * @param {string} [p.keepLabel]
 * @param {boolean} [p.allowImages]
 * @param {boolean} [p.allowDecide]
 * @param {'m'|'l'} [p.size]
 * @param {string} [p.loadingLabel]
 * @param {string} [p.emptyHint]  said under the bar when Keep is pressed with nothing in the box
 */
export function AnswerBox({ ref, item, draftKey, entry, options = [], onAsk, onKeep, keepLabel = 'Keep answer', allowImages = true, allowDecide = true, size = 'm', autoFocus = false, loadingLabel, emptyHint, stagger = false, onEmpty }) {
  const d = useDraft(draftKey);
  const imgs = useAnswerImages(allowImages ? draftKey : null);
  const area = useRef(null);
  const pickFile = useRef(null);
  const text = d.value;
  const labels = options.map((o) => o.label);
  const has = !!text.trim() || imgs.refs.length > 0;
  const word = DRAFT_WORDS[d.state] || '';
  const [wait, setWait] = useState(false);
  useEffect(() => { if (!imgs.uploading) setWait(false); }, [imgs.uploading]);

  const focusEnd = () => {
    const el = area.current;
    if (!el) return;
    el.focus();
    requestAnimationFrame(() => { try { el.setSelectionRange(el.value.length, el.value.length); el.scrollTop = el.scrollHeight; } catch { /* not focusable */ } });
  };
  const pick = (i) => {
    const o = options[i];
    if (!o) return;
    d.set(togglePick(text, o.label, labels));
    focusEnd();
  };
  // The images stay in the draft until the answer is saved or sent: whoever saves it clears them, so a failed save
  // keeps them. An image still uploading holds Keep back, from the keys as from the button.
  const keep = (decide = false) => {
    if (imgs.uploading) { setWait(true); return false; }
    if (!has && !decide) { onEmpty?.(); area.current?.focus(); return false; }
    onKeep?.(text.trim(), imgs.refs, howOf(item, text, options, decide), choicesOf(text, options));
    return true;
  };
  useImperativeHandle(ref, () => ({ pick, keep: () => keep(false), decide: () => keep(true), focus: focusEnd, has: () => has, addFiles: (f) => imgs.add(f), blur: () => area.current?.blur() }));

  const { over, props: drop } = useFileDrop(allowImages ? imgs.add : null);

  const keyDown = (e) => {
    if (e.isComposing || e.nativeEvent?.isComposing) return;
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.stopPropagation(); keep(false); return; }
    if (e.altKey && /^[1-4]$/.test(e.key)) { e.preventDefault(); e.stopPropagation(); pick(Number(e.key) - 1); return; }
    if (e.altKey && (e.key === 'w' || e.key === 'W' || e.code === 'KeyW') && onAsk) { e.preventDefault(); e.stopPropagation(); onAsk(true); return; }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); e.currentTarget.blur(); }
  };

  return (
    <div className={cx('abx', `is-${size}`, over && 'is-drop')} {...drop}>
      <ChoiceList entry={entry} options={options} box={text} onPick={(_, i) => pick(i)} onAsk={onAsk} canAsk={!!onAsk} loadingLabel={loadingLabel} stagger={stagger} />
      <label className="abx-label" htmlFor={`abx-${draftKey}`}>Your answer</label>
      <SyntaxTextarea
        ref={area} id={`abx-${draftKey}`} className="abx-field" rows={size === 'l' ? 5 : 4} value={text} autoFocus={autoFocus}
        placeholder={allowImages ? 'Write your answer, pick one above and edit it, or paste a screenshot.' : 'Write your answer, or pick one above and edit it.'}
        onChange={(e) => d.set(e.target.value)} onBlur={d.blur} onKeyDown={keyDown}
        onPaste={allowImages ? (e) => pasteFiles(e, imgs.add) : undefined}
      />
      {over ? <div className="abx-drop" aria-hidden="true">Drop images to attach</div> : null}
      {imgs.chips.length ? (
        <div className="abx-chips">
          {imgs.chips.map(({ key, onRetry, ...c }) => (onRetry
            ? <button key={key} type="button" className="abx-retry" onClick={onRetry} title={c.title}><FileChip {...c} icon="image" /></button>
            : <FileChip key={key} {...c} icon="image" />))}
        </div>
      ) : null}
      <div className="abx-bar">
        {allowImages ? (
          <>
            <button className={cx('tool-btn', imgs.refs.length > 0 && 'is-on')} type="button" aria-label="Attach images" title="Attach images (or paste, or drop)" onClick={() => pickFile.current?.click()}>
              <Icon name="paperclip" />{imgs.refs.length ? imgs.refs.length : null}
            </button>
            <input ref={pickFile} type="file" multiple accept={ACCEPT} hidden onChange={(e) => { imgs.add([...(e.target.files || [])]); e.target.value = ''; }} />
          </>
        ) : null}
        {allowDecide ? <button className="btn btn-ghost btn-s" type="button" onClick={() => keep(true)} title="Leave it to the session: it takes the option it judges best and says why">You decide</button> : null}
        <span className="spacer" />
        {word ? <span className={`ans-state is-${d.state}`} aria-live="polite">{word}</span> : null}
        <button className="btn btn-primary btn-s abx-keep" type="button" onClick={() => keep(false)} disabled={(!has && !onEmpty) || imgs.uploading}>{keepLabel}<Kbd>Ctrl ⏎</Kbd></button>
      </div>
      {wait ? <div className="abx-hint" role="status">An image is still uploading. Keep the answer once it is done.</div> : emptyHint ? <div className="abx-hint" role="status">{emptyHint}</div> : null}
    </div>
  );
}
