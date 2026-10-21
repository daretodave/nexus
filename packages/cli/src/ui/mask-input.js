// The paste field's input (.mask-field), kept uncontrolled: a controlled <input value={...}> has React write the
// value attribute too, which puts the paste in the serialized DOM (outerHTML, CSS attribute selectors, extensions,
// DOM snapshots) before Save. Here the value lives only in the input's own property; the parent hears each change
// through onChange and clears the field by handing back '' (clearPaste), never by rendering a value.

/** The input's props: never `value` or `defaultValue`. */
export function maskInputProps({ show = false, onChange, label, placeholder, autoFocus, onEnter, inputRef } = {}) {
  return {
    ref: inputRef,
    type: show ? 'text' : 'password',
    onChange: (e) => onChange?.(e.target.value),
    autoComplete: 'off',
    spellCheck: false,
    'aria-label': label,
    placeholder,
    autoFocus,
    name: 'nexus-vault-value',
    'data-lpignore': 'true',
    'data-1p-ignore': 'true',
    onKeyDown: onEnter ? (e) => { if (e.key === 'Enter') onEnter(); } : undefined,
  };
}

/** The parent's value went back to '' (a Save that landed): empty the input through its property. */
export function clearPaste(el, value) {
  if (el && value === '' && el.value !== '') el.value = '';
}
