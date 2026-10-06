import { matches, shortcutGroups, type ShortcutEntry, type ShortcutGroup } from "./catalog";

const groups = shortcutGroups();
const container = document.getElementById("groups")!;
const nav = document.getElementById("nav")!;
const search = document.getElementById("q") as HTMLInputElement;
const count = document.getElementById("count")!;
const empty = document.getElementById("empty")!;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}) =>
  Object.assign(document.createElement(tag), props);

/** The output as Google Docs shows it: a state label is rendered as real subscript. */
function renderOutput(entry: ShortcutEntry): HTMLElement {
  const out = el("span", { className: "out" });
  if (entry.stateLabel && entry.output.endsWith(entry.stateLabel)) {
    out.append(entry.output.slice(0, -entry.stateLabel.length), el("sub", { textContent: entry.stateLabel }));
    out.setAttribute("aria-label", `${entry.output}, state label subscripted`);
  } else {
    out.textContent = entry.output;
  }
  return out;
}

function renderRow(entry: ShortcutEntry): HTMLLIElement {
  const li = el("li", { className: entry.badge === "recommended" ? "recommended" : "" });
  const to = el("span", { className: "to", textContent: "→" });
  to.setAttribute("aria-label", "becomes");
  const meta = el("span", { className: "meta" });
  if (entry.badge) meta.append(el("span", { className: `badge ${entry.badge}`, textContent: entry.badge }));
  if (entry.hint) meta.append(entry.hint);
  li.append(el("kbd", { textContent: entry.input }), to, renderOutput(entry), meta);
  return li;
}

const rendered: { group: ShortcutGroup; section: HTMLElement; rows: { entry: ShortcutEntry; li: HTMLLIElement }[] }[] = [];
for (const group of groups) {
  const section = el("section", { id: group.id, className: group.id === "greek" || group.id === "symbols" ? "two-col" : "" });
  section.setAttribute("aria-labelledby", `${group.id}-title`);
  const list = el("ul");
  const rows = group.entries.map((entry) => ({ entry, li: renderRow(entry) }));
  list.append(...rows.map((r) => r.li));
  section.append(el("h2", { id: `${group.id}-title`, textContent: group.title }), list);
  container.append(section);
  nav.append(el("a", { href: `#${group.id}`, textContent: group.title }));
  rendered.push({ group, section, rows });
}

function filter() {
  let shown = 0;
  for (const { group, section, rows } of rendered) {
    let visible = 0;
    for (const { entry, li } of rows) {
      const hit = matches(entry, group, search.value);
      li.hidden = !hit;
      if (hit) visible++;
    }
    section.hidden = visible === 0;
    shown += visible;
  }
  const total = rendered.reduce((n, r) => n + r.rows.length, 0);
  count.textContent = search.value.trim() ? `${shown} of ${total}` : `${total} shortcuts`;
  empty.hidden = shown > 0;
}

search.addEventListener("input", filter);
document.addEventListener("keydown", (e) => {
  if (e.key === "/" && document.activeElement !== search) {
    e.preventDefault();
    search.focus();
  } else if (e.key === "Escape" && document.activeElement === search && search.value) {
    search.value = "";
    filter();
  }
});
filter();
search.focus();
