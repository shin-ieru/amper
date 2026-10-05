import {
  ChemlyController,
  ChemlySession,
  confidenceBand,
  createEngine,
  resolveSettings,
  type ChemlySettings,
  type ChemlyTransaction,
  type ControllerEvent,
  type CustomRule,
  type EngineDecision,
  type ToggleableCategory,
} from "@chemly/core";
import { SuggestionList } from "@chemly/shared-ui";
import { TextareaAdapter } from "./textarea-adapter";

const STORAGE_KEY = "chemly.playground.settings";
const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;

function loadSettings(): ChemlySettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return resolveSettings(raw ? (JSON.parse(raw) as Partial<ChemlySettings>) : {});
  } catch {
    return resolveSettings();
  }
}

function saveSettings(settings: ChemlySettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage unavailable (private window, blocked): settings simply do not persist.
  }
}

let settings = loadSettings();

const editor = $<HTMLTextAreaElement>("#editor");
const engine = createEngine();
const session = new ChemlySession(engine, () => settings);
let controller: ChemlyController;
const overlay = new SuggestionList(document.body, { onPick: (index) => controller.accept(index) });
const adapter = new TextareaAdapter(editor, overlay);
controller = new ChemlyController(adapter, session, { onEvent: onControllerEvent });
controller.start();

// ---- settings UI ------------------------------------------------------------

function parseCustomRules(text: string): CustomRule[] {
  return text
    .split("\n")
    .map((line) => line.split("=>"))
    .filter((parts): parts is [string, string] => parts.length === 2 && !!parts[0]!.trim() && !!parts[1]!.trim())
    .map(([input, output], i) => ({
      id: `pg-${i}`,
      input: input.trim(),
      output: output.trim(),
      caseSensitive: false,
      triggerMode: "automatic" as const,
      enabled: true,
    }));
}

function renderSettings() {
  document.querySelectorAll<HTMLInputElement>("input[name=mode]").forEach((r) => (r.checked = r.value === settings.mode));
  document.querySelectorAll<HTMLInputElement>("[data-setting]").forEach((box) => {
    box.checked = Boolean(settings[box.dataset.setting as keyof ChemlySettings]);
  });
  document.querySelectorAll<HTMLInputElement>("[data-category]").forEach((box) => {
    box.checked = settings.categories[box.dataset.category as ToggleableCategory];
  });
  $<HTMLTextAreaElement>("#never").value = settings.neverConvert.join("\n");
  $<HTMLTextAreaElement>("#custom").value = settings.customRules.map((r) => `${r.input} => ${r.output}`).join("\n");
}

function update(patch: Partial<ChemlySettings>) {
  settings = resolveSettings({ ...settings, ...patch });
  saveSettings(settings);
  session.reset();
}

document.querySelectorAll<HTMLInputElement>("input[name=mode]").forEach((radio) =>
  radio.addEventListener("change", () => {
    update({ mode: radio.value as ChemlySettings["mode"] });
    status(`${radio.value === "chemistry" ? "Chemistry" : "Standard"} Mode`);
  }),
);
document.querySelectorAll<HTMLInputElement>("[data-setting]").forEach((box) =>
  box.addEventListener("change", () => update({ [box.dataset.setting!]: box.checked })),
);
document.querySelectorAll<HTMLInputElement>("[data-category]").forEach((box) =>
  box.addEventListener("change", () =>
    update({ categories: { ...settings.categories, [box.dataset.category!]: box.checked } }),
  ),
);
$<HTMLTextAreaElement>("#never").addEventListener("input", (e) =>
  update({ neverConvert: (e.target as HTMLTextAreaElement).value.split("\n").map((s) => s.trim()).filter(Boolean) }),
);
$<HTMLTextAreaElement>("#custom").addEventListener("input", (e) =>
  update({ customRules: parseCustomRules((e.target as HTMLTextAreaElement).value) }),
);
renderSettings();

// ---- debug panel ------------------------------------------------------------

const debugEl = $<HTMLDListElement>("#debug");
const logEl = $<HTMLOListElement>("#log");
const statusEl = $<HTMLDivElement>("#status");

function status(text: string) {
  statusEl.textContent = text;
}

function row(term: string, value: string | Node) {
  const dt = document.createElement("dt");
  dt.textContent = term;
  const dd = document.createElement("dd");
  dd.append(value);
  return [dt, dd];
}

function list(items: string[]) {
  const ul = document.createElement("ul");
  ul.append(...items.map((text) => Object.assign(document.createElement("li"), { textContent: text })));
  return ul;
}

function renderDecision(decision: EngineDecision) {
  const nodes: Node[] = [];
  const time = `${decision.debug.elapsedMs.toFixed(2)} ms`;
  if (decision.action === "autocorrect") {
    const r = decision.recognition;
    const band = Object.assign(document.createElement("span"), { className: "band-auto", textContent: `${r.confidence.toFixed(2)} → autocorrect` });
    nodes.push(
      ...row("Candidate", r.original),
      ...row("Recognizer", `${r.recognizer} / ${r.ruleId}`),
      ...row("Confidence", band),
      ...row("Replacement", r.replacement),
      ...row("Reason", list(r.reasons)),
    );
  } else if (decision.action === "suggest") {
    const [top] = decision.suggestions;
    const band = Object.assign(document.createElement("span"), { className: "band-suggest", textContent: `${top!.confidence.toFixed(2)} → suggest` });
    nodes.push(
      ...row("Candidate", top!.original),
      ...row("Suggested", decision.suggestions.map((s) => `${s.label} → ${s.replacement}`).join(", ")),
      ...row("Confidence", band),
    );
    const reasons = decision.debug.recognitions[0]?.reasons;
    if (reasons) nodes.push(...row("Reason", list(reasons)));
  } else {
    nodes.push(...row("Decision", "no action"));
  }
  if (decision.debug.rejections.length) {
    nodes.push(...row("Rejected", list(decision.debug.rejections.map((r) => `${r.candidate}: ${r.reason}`))));
  }
  nodes.push(...row("Time", time));
  const pending = session.pendingTransaction;
  nodes.push(...row("Backspace", pending ? `restores "${pending.restoreText}"` : "normal"));
  debugEl.replaceChildren(...nodes);
}

function renderTransaction(tx: ChemlyTransaction) {
  const li = document.createElement("li");
  const kind = Object.assign(document.createElement("span"), { className: "kind", textContent: tx.kind });
  const from = Object.assign(document.createElement("code"), { textContent: tx.kind === "convert" ? tx.originalText : tx.originalText });
  const to = Object.assign(document.createElement("code"), { textContent: tx.replacementText });
  li.append(kind, from, " → ", to, ` · ${tx.ruleId} · ${tx.trigger}`);
  if (tx.kind === "restore") {
    const never = Object.assign(document.createElement("button"), { type: "button", textContent: "Never convert" });
    never.addEventListener("click", () => {
      update({ neverConvert: [...new Set([...settings.neverConvert, tx.replacementText])] });
      renderSettings();
      never.disabled = true;
      never.textContent = "Added";
      editor.focus();
    });
    li.append(never);
  }
  logEl.prepend(li);
}

function onControllerEvent(event: ControllerEvent) {
  switch (event.type) {
    case "decision":
      renderDecision(event.decision);
      break;
    case "applied":
      renderTransaction(event.transaction);
      status(
        event.transaction.kind === "restore"
          ? `Restored "${event.transaction.replacementText}"`
          : `${event.transaction.originalText} → ${event.transaction.replacementText} · Backspace to undo`,
      );
      break;
    case "apply-failed":
      status("Could not apply the change; nothing was modified.");
      break;
    case "suggestions":
      status(`${event.items.length} suggestion${event.items.length === 1 ? "" : "s"} · Tab to accept`);
      break;
    case "reset":
      break;
  }
}

// Exposed for E2E tests and manual debugging in DevTools.
Object.assign(window, { chemly: { engine, session, get settings() { return settings; }, confidenceBand, adapter } });

editor.focus();
