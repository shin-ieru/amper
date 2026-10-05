import type { ChemlySuggestion } from "@chemly/core";

const STYLES = `
:host { all: initial; }
.list {
  position: fixed; z-index: 2147483647; min-width: 180px; max-width: 320px;
  margin: 0; padding: 4px; list-style: none;
  background: #fff; color: #1f1f1f; border: 1px solid #dadce0; border-radius: 8px;
  box-shadow: 0 2px 6px rgba(60, 64, 67, .15), 0 1px 2px rgba(60, 64, 67, .3);
  font: 13px/1.35 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
.list[hidden] { display: none; }
.item {
  display: flex; align-items: baseline; gap: 12px; justify-content: space-between;
  padding: 5px 8px; border-radius: 5px; cursor: pointer;
}
.item[aria-selected="true"] { background: #e8f0fe; outline: 1px solid #1a73e8; outline-offset: -1px; }
.label { color: #444746; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.glyph { font-size: 16px; font-weight: 600; color: #1f1f1f; }
.hint { padding: 4px 8px 2px; color: #5f6368; font-size: 11px; border-top: 1px solid #f1f3f4; margin-top: 2px; }
kbd { font: inherit; font-weight: 600; }
`;

export interface SuggestionListOptions {
  /** Called on pointer selection. Keyboard selection is handled by the controller. */
  onPick?: (index: number) => void;
  /** Footer hint; defaults to the keyboard contract. */
  hint?: string;
}

/**
 * Quiet, framework-free autocomplete popup. Rendered in a shadow root so host
 * page CSS (Google Docs) cannot restyle it and it cannot leak styles back.
 * Focus never moves into it: the caret stays in the editor, the list mirrors
 * the session's selection, and it is aria-hidden from live announcements so
 * typing does not cause screen-reader chatter (spec §46).
 */
export class SuggestionList {
  readonly host: HTMLElement;
  private readonly list: HTMLUListElement;
  private readonly options: SuggestionListOptions;

  constructor(parent: Node, options: SuggestionListOptions = {}) {
    this.options = options;
    const doc = parent.ownerDocument ?? (parent as Document);
    this.host = doc.createElement("chemly-suggestions");
    const root = this.host.attachShadow({ mode: "open" });
    const style = doc.createElement("style");
    style.textContent = STYLES;
    this.list = doc.createElement("ul");
    this.list.className = "list";
    this.list.id = "chemly-suggestion-list";
    this.list.setAttribute("role", "listbox");
    this.list.setAttribute("aria-label", "Chemly suggestions");
    this.list.hidden = true;
    // Keep focus in the editor when the user clicks a suggestion.
    this.list.addEventListener("mousedown", (event) => {
      event.preventDefault();
      const item = (event.target as Element).closest?.("[data-index]");
      if (item) this.options.onPick?.(Number(item.getAttribute("data-index")));
    });
    root.append(style, this.list);
    parent.appendChild(this.host);
  }

  get visible(): boolean {
    return !this.list.hidden;
  }

  show(items: readonly ChemlySuggestion[], selected: number, anchor: { x: number; y: number }): void {
    const doc = this.list.ownerDocument;
    this.list.replaceChildren(
      ...items.map((item, index) => {
        const li = doc.createElement("li");
        li.className = "item";
        li.id = `chemly-suggestion-${index}`;
        li.dataset.index = String(index);
        li.setAttribute("role", "option");
        li.setAttribute("aria-selected", String(index === selected));
        const label = doc.createElement("span");
        label.className = "label";
        label.textContent = item.label;
        const glyph = doc.createElement("span");
        glyph.className = "glyph";
        glyph.textContent = item.replacement;
        li.append(label, glyph);
        return li;
      }),
    );
    const hint = doc.createElement("li");
    hint.className = "hint";
    hint.setAttribute("role", "presentation");
    // No innerHTML: Google Docs enforces Trusted Types, so markup sinks would throw there.
    if (this.options.hint) {
      hint.textContent = this.options.hint;
    } else {
      const kbd = (text: string) => Object.assign(doc.createElement("kbd"), { textContent: text });
      hint.append(kbd("Tab"), " accept · ", kbd("Esc"), " dismiss");
    }
    this.list.append(hint);
    this.list.setAttribute("aria-activedescendant", `chemly-suggestion-${selected}`);
    this.list.hidden = false;

    const view = doc.defaultView;
    const width = this.list.offsetWidth;
    const height = this.list.offsetHeight;
    const maxX = (view?.innerWidth ?? 0) - width - 8;
    const below = anchor.y + 4;
    const fitsBelow = !view || below + height < view.innerHeight;
    this.list.style.left = `${Math.max(8, Math.min(anchor.x, maxX))}px`;
    this.list.style.top = `${fitsBelow ? below : Math.max(8, anchor.y - height - 24)}px`;
  }

  hide(): void {
    this.list.hidden = true;
    this.list.replaceChildren();
  }

  dispose(): void {
    this.host.remove();
  }
}
