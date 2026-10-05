import { ChemlyController, ChemlySession, createEngine, type ChemlySettings, type ControllerEvent, type Disposable } from "@chemly/core";
import { SuggestionList } from "@chemly/shared-ui";
import { loadState, onStateChange, type ExtensionOptions } from "../settings";
import { bridgeRequest } from "./bridge-client";
import { DocsAdapter } from "./docs-adapter";
import { findTextEventFrame } from "./find-frame";

let settings: ChemlySettings;
let options: ExtensionOptions;
const engine = createEngine();
const session = new ChemlySession(engine, () => settings);
let overlay: SuggestionList | undefined;
let attached: { frame: HTMLIFrameElement; adapter: DocsAdapter; controller: Disposable } | undefined;
const counters = { conversions: 0, restores: 0, applyFailures: 0, suggestionsShown: 0 };

function log(event: string, data?: Record<string, unknown>) {
  // Event names, rule ids, counts and lengths only: never document text (spec §45, §61).
  if (options?.diagnostics) console.debug(`[Chemly] ${event}`, data ?? "");
}

function onControllerEvent(event: ControllerEvent) {
  switch (event.type) {
    case "applied":
      if (event.transaction.kind === "restore") counters.restores++;
      else counters.conversions++;
      log(event.transaction.kind, { rule: event.transaction.ruleId, category: event.transaction.category, trigger: event.transaction.trigger });
      break;
    case "apply-failed":
      counters.applyFailures++;
      log("apply-failed", { rule: event.transaction.ruleId });
      break;
    case "suggestions":
      counters.suggestionsShown++;
      break;
    case "decision":
      if (event.decision.action !== "none") log("decision", { action: event.decision.action, ms: +event.decision.debug.elapsedMs.toFixed(2) });
      break;
    case "reset":
      break;
  }
}

/** Docs may create or replace the text-event iframe at any time; follow it. */
function attachTo(frame: HTMLIFrameElement) {
  if (attached?.frame === frame) return;
  detach();
  if (!frame.contentDocument) return;
  overlay ??= new SuggestionList(document.body, { onPick: (i) => controllerRef?.accept(i) });
  const adapter = new DocsAdapter(frame, overlay, {
    strategy: options.strategy,
    verify: options.verifyBeforeReplace,
    log,
  });
  adapter.attach();
  const controller = new ChemlyController(adapter, session, { onEvent: onControllerEvent });
  controllerRef = controller;
  attached = { frame, adapter, controller: controller.start() };
  log("attached");
}
let controllerRef: ChemlyController | undefined;

function detach() {
  if (!attached) return;
  attached.controller.dispose();
  attached.adapter.dispose();
  attached = undefined;
  session.reset();
}

/**
 * Discovery without document scanning: watch the subtree only until the frame
 * exists, then only the frame's parent (to notice Docs replacing it).
 */
let observer: MutationObserver | undefined;
function scan() {
  const frame = findTextEventFrame();
  if (frame) attachTo(frame);
  else detach();
  observer?.disconnect();
  observer = new MutationObserver(scan);
  const parent = attached?.frame.parentNode;
  if (parent) observer.observe(parent, { childList: true });
  else observer.observe(document.body, { childList: true, subtree: true });
}

async function main() {
  ({ settings, options } = await loadState());
  onStateChange((state) => {
    const reattach = state.options.strategy !== options.strategy || state.options.verifyBeforeReplace !== options.verifyBeforeReplace;
    ({ settings, options } = state);
    session.reset();
    if (reattach && attached) {
      const frame = attached.frame;
      detach();
      attachTo(frame);
    }
  });
  scan();
}

chrome.runtime.onMessage.addListener((message: { type?: string }, _sender, reply) => {
  if (message.type !== "chemly:probe") return false;
  const bridge = bridgeRequest({ op: "probe" });
  reply({
    attached: !!attached,
    bridge: bridge.ok ? "ok" : bridge.error,
    environment: bridge.ok ? bridge.report : undefined,
    counters,
    bufferLength: attached?.adapter.buffer.text.length ?? 0,
    settings: { enabled: settings.enabled, mode: settings.mode },
    options,
  });
  return false;
});

void main();
