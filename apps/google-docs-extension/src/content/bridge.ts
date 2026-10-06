/**
 * MAIN-world bridge (runs in the page's JavaScript world).
 *
 * Why it exists: Google Docs only acts on synthetic key events that carry the
 * legacy keyCode/charCode fields, and Chrome's KeyboardEvent constructor does
 * not set them. They must be defined as own properties on the event, and a
 * content script's isolated world cannot do that in a way the page's code
 * sees. So this file does the dispatching and nothing else: no chemistry, no
 * settings, no document text retained.
 *
 * Evidence: docs/google-docs-spike.md (probes in docs/spike/).
 */
import { ACTIVE_EVENT, REQUEST_EVENT, RESPONSE_EVENT, type BridgeRequest, type BridgeResponse } from "./bridge-protocol";
import { FRAME_CLASS_SELECTOR, findTextEventFrame } from "./find-frame";

declare const __AMPER_DEVELOPMENT__: boolean;

const KEY = { Enter: 13, ArrowLeft: 37, ArrowRight: 39 } as const;
const IS_MAC = /mac/i.test(navigator.platform);

function target(): { doc: Document; win: Window & typeof globalThis; el: Element } | undefined {
  const doc = findTextEventFrame()?.contentDocument;
  const win = doc?.defaultView as (Window & typeof globalThis) | null | undefined;
  if (!doc || !win) return undefined;
  return { doc, win, el: doc.querySelector("[contenteditable]") ?? doc.body };
}

function legacy<T extends Event>(event: T, fields: Record<string, number>): T {
  for (const [name, value] of Object.entries(fields)) Object.defineProperty(event, name, { get: () => value });
  return event;
}

function key(t: NonNullable<ReturnType<typeof target>>, name: keyof typeof KEY, shiftKey = false) {
  const code = KEY[name];
  const init = { key: name, code: name, shiftKey, bubbles: true, cancelable: true };
  t.el.dispatchEvent(legacy(new t.win.KeyboardEvent("keydown", init), { keyCode: code, which: code }));
  t.el.dispatchEvent(legacy(new t.win.KeyboardEvent("keyup", init), { keyCode: code, which: code }));
}

function typeChar(t: NonNullable<ReturnType<typeof target>>, ch: string) {
  if (ch === "\n") {
    key(t, "Enter");
    return;
  }
  const code = ch.codePointAt(0)!;
  const init = { key: ch, bubbles: true, cancelable: true };
  t.el.dispatchEvent(legacy(new t.win.KeyboardEvent("keypress", init), { keyCode: code, charCode: code, which: code }));
}

function handle(request: BridgeRequest): BridgeResponse {
  const t = target();
  if (!t) return { ok: false, error: "text event target not found" };
  switch (request.op) {
    case "ping":
      return { ok: true };
    case "moveLeft":
      for (let i = 0; i < request.count; i++) key(t, "ArrowLeft");
      return { ok: true };
    case "moveRight":
      for (let i = 0; i < request.count; i++) key(t, "ArrowRight");
      return { ok: true };
    case "selectBack":
      for (let i = 0; i < request.count; i++) key(t, "ArrowLeft", true);
      return { ok: true };
    case "selectForward":
      for (let i = 0; i < request.count; i++) key(t, "ArrowRight", true);
      return { ok: true };
    case "copySelectionHtml": {
      const data = new t.win.DataTransfer();
      t.el.dispatchEvent(new t.win.ClipboardEvent("copy", { clipboardData: data, bubbles: true, cancelable: true }));
      return { ok: true, text: data.types.includes("text/html") ? data.getData("text/html") : null };
    }
    case "copySelection": {
      const data = new t.win.DataTransfer();
      t.el.dispatchEvent(new t.win.ClipboardEvent("copy", { clipboardData: data, bubbles: true, cancelable: true }));
      return { ok: true, text: data.types.includes("text/plain") ? data.getData("text/plain") : null };
    }
    case "insert":
      if (request.strategy === "paste") {
        const data = new t.win.DataTransfer();
        data.setData("text/plain", request.text);
        t.el.dispatchEvent(new t.win.ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
      } else {
        for (const ch of request.text) typeChar(t, ch);
      }
      return { ok: true };
    case "toggleSubscript": {
      const init = { key: ",", code: "Comma", metaKey: IS_MAC, ctrlKey: !IS_MAC, bubbles: true, cancelable: true };
      t.el.dispatchEvent(legacy(new t.win.KeyboardEvent("keydown", init), { keyCode: 188, which: 188 }));
      t.el.dispatchEvent(legacy(new t.win.KeyboardEvent("keyup", init), { keyCode: 188, which: 188 }));
      return { ok: true };
    }
    case "probe":
      if (__AMPER_DEVELOPMENT__) return { ok: true, report: probe() };
      return { ok: false, error: "unsupported operation" };
  }
}

/** Environment facts for the spike checklist. Structure only; never document text. */
function probe(): Record<string, unknown> {
  const count = (s: string) => document.querySelectorAll(s).length;
  const caret = document.querySelector(".kix-cursor-caret")?.getBoundingClientRect();
  return {
    canvasTiles: count("canvas.kix-canvas-tile-content"),
    legacyDomWordNodes: count(".kix-wordhtmlgenerator-word-node"),
    textEventFrameByClass: !!document.querySelector(FRAME_CLASS_SELECTOR),
    textEventFrameFound: !!findTextEventFrame(),
    caretElement: !!caret,
    caretVisible: !!caret && caret.height > 0,
    pageless: count(".kix-page-paginated") === 0,
    annotatedCanvasFlag: typeof (window as { _docs_annotate_canvas_by_ext?: unknown })._docs_annotate_canvas_by_ext,
    suggestingModeHint: /suggesting/i.test(document.querySelector("[aria-label*='mode' i]")?.getAttribute("aria-label") ?? ""),
  };
}

function onRequest(event: Event) {
  let response: BridgeResponse;
  try {
    response = handle(JSON.parse((event as CustomEvent<string>).detail) as BridgeRequest);
  } catch (error) {
    response = { ok: false, error: String(error) };
  }
  document.dispatchEvent(new CustomEvent(RESPONSE_EVENT, { detail: JSON.stringify(response) }));
}

// The MAIN-world bridge is loaded by the manifest, but it does not accept
// editing or read-back requests until the isolated-world consent gate opens.
document.addEventListener(ACTIVE_EVENT, (event) => {
  if ((event as CustomEvent<boolean>).detail === true) document.addEventListener(REQUEST_EVENT, onRequest);
  else document.removeEventListener(REQUEST_EVENT, onRequest);
});
