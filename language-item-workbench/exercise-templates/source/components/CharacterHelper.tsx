import { useMemo } from 'react';
import { helpersFor } from '../lib/characters';

/**
 * Inserts `text` at the caret of the focused answer field. It sets the value
 * through the native setter and dispatches an `input` event so React's
 * controlled `onChange` fires — meaning this works with any answer input
 * without the field needing to know the helper exists.
 */
function insertIntoActiveField(text: string) {
  let focused = document.activeElement;
  while (focused?.shadowRoot?.activeElement) focused = focused.shadowRoot.activeElement;
  const el = focused as HTMLInputElement | HTMLTextAreaElement | null;
  if (!el || (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA') || el.disabled) return;

  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement;
  const setValue = Object.getOwnPropertyDescriptor(proto.prototype, 'value')?.set;
  if (!setValue) return;

  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  setValue.call(el, el.value.slice(0, start) + text + el.value.slice(end));
  el.dispatchEvent(new Event('input', { bubbles: true }));

  const caret = start + text.length;
  el.setSelectionRange(caret, caret);
}

/** A palette of characters for the exercise language; renders nothing when none apply. */
export function CharacterHelper({ language }: { language: string }) {
  const keys = useMemo(() => helpersFor(language), [language]);
  if (keys.length === 0) return null;

  return (
    <div className="char-helper" role="toolbar" aria-label="Insert special characters">
      {keys.map((k, i) => (
        <button
          key={i}
          type="button"
          className="char-key"
          title={`Insert ${k.insert}`}
          // Keep focus in the answer field so the insert lands there.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => insertIntoActiveField(k.insert)}
        >
          {k.label}
        </button>
      ))}
    </div>
  );
}
