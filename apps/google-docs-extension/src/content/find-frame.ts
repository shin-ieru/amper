/**
 * Locates Docs' hidden text-event iframe. The class name is Google-internal and
 * may change; the structural fallback (a same-origin about:blank frame holding
 * a contenteditable role="textbox") was observed alongside it in the spike.
 */
export const FRAME_CLASS_SELECTOR = "iframe.docs-texteventtarget-iframe";

export function findTextEventFrame(root: Document = document): HTMLIFrameElement | undefined {
  const byClass = root.querySelector<HTMLIFrameElement>(FRAME_CLASS_SELECTOR);
  if (byClass?.contentDocument) return byClass;
  for (const frame of root.querySelectorAll<HTMLIFrameElement>("iframe")) {
    try {
      if (frame.contentDocument?.querySelector('[contenteditable="true"][role="textbox"]')) return frame;
    } catch {
      // Cross-origin frame: not the text-event target.
    }
  }
  return undefined;
}
