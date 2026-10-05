const MIRRORED = [
  "boxSizing", "width", "height", "overflowX", "overflowY", "borderTopWidth", "borderRightWidth",
  "borderBottomWidth", "borderLeftWidth", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
  "fontStyle", "fontVariant", "fontWeight", "fontStretch", "fontSize", "lineHeight", "fontFamily",
  "textAlign", "textTransform", "textIndent", "letterSpacing", "wordSpacing", "tabSize",
] as const;

/**
 * Viewport coordinates of the bottom-left of the caret at `position`, using
 * the mirror-element technique (textareas expose no caret geometry).
 */
export function caretCoordinates(el: HTMLTextAreaElement, position: number): { x: number; y: number } {
  const style = getComputedStyle(el);
  const mirror = document.createElement("div");
  for (const prop of MIRRORED) mirror.style[prop] = style[prop];
  Object.assign(mirror.style, {
    position: "absolute",
    visibility: "hidden",
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
    top: "0",
    left: "-9999px",
  });
  mirror.textContent = el.value.slice(0, position);
  const marker = document.createElement("span");
  marker.textContent = el.value.slice(position) || ".";
  mirror.appendChild(marker);
  document.body.appendChild(mirror);
  const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.4;
  const rect = el.getBoundingClientRect();
  const x = rect.left + marker.offsetLeft - el.scrollLeft;
  const y = rect.top + marker.offsetTop - el.scrollTop + lineHeight;
  mirror.remove();
  return { x, y };
}
