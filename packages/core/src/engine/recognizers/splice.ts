/**
 * Replaces tokens inside `text` with their renderings, preserving the user's
 * whitespace between them, starting from the first token whose rendering
 * differs. Returns undefined when nothing changes.
 *
 * Starting at the first *changed* token keeps transactions honest: Backspace
 * restores exactly what was there before this conversion, not text that an
 * earlier conversion already changed.
 */
export function spliceTokens(
  text: string,
  rendered: readonly { start: number; end: number; text: string }[],
  frozen: ReadonlySet<string> = new Set(),
): { start: number; end: number; replacement: string } | undefined {
  // Tokens the user reverted stay as typed; the last token is the one being evaluated now.
  const tokens = rendered.map((t, i) => {
    const original = text.slice(t.start, t.end);
    return i < rendered.length - 1 && frozen.has(original) ? { ...t, text: original } : t;
  });
  const first = tokens.findIndex((t) => text.slice(t.start, t.end) !== t.text);
  if (first < 0) return undefined;
  const start = tokens[first]!.start;
  const end = tokens[tokens.length - 1]!.end;
  let replacement = "";
  let cursor = start;
  for (const token of tokens.slice(first)) {
    replacement += text.slice(cursor, token.start) + token.text;
    cursor = token.end;
  }
  return { start, end, replacement };
}
