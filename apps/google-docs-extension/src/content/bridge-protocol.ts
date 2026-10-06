/**
 * Synchronous request/response protocol between the isolated-world content
 * script and the MAIN-world bridge. Both directions use CustomEvents on
 * `document` with JSON string details (strings cross the world boundary;
 * object wrappers do not). dispatchEvent is synchronous, so a request
 * returns its response before `request()` returns.
 */
export const REQUEST_EVENT = "amper:bridge-request";
export const RESPONSE_EVENT = "amper:bridge-response";

export type InsertStrategy = "keypress" | "paste";

export type BridgeRequest =
  | { op: "ping" }
  | { op: "moveLeft"; count: number }
  | { op: "moveRight"; count: number }
  | { op: "selectBack"; count: number }
  /** Reads the current selection through a synthetic copy event; never touches the system clipboard. */
  | { op: "copySelection" }
  /** Same, but returns Docs' text/html, whose spans carry vertical-align (baseline/sub). */
  | { op: "copySelectionHtml" }
  | { op: "selectForward"; count: number }
  | { op: "insert"; text: string; strategy: InsertStrategy }
  /** Docs' native subscript toggle (⌘/Ctrl + ,) on the current selection. Experimental. */
  | { op: "toggleSubscript" }
  | { op: "probe" };

export type BridgeResponse =
  | { ok: true; text?: string | null; report?: Record<string, unknown> }
  | { ok: false; error: string };
