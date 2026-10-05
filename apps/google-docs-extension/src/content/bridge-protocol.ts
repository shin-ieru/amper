/**
 * Synchronous request/response protocol between the isolated-world content
 * script and the MAIN-world bridge. Both directions use CustomEvents on
 * `document` with JSON string details (strings cross the world boundary;
 * object wrappers do not). dispatchEvent is synchronous, so a request
 * returns its response before `request()` returns.
 */
export const REQUEST_EVENT = "chemly:bridge-request";
export const RESPONSE_EVENT = "chemly:bridge-response";

export type InsertStrategy = "keypress" | "paste";

export type BridgeRequest =
  | { op: "ping" }
  | { op: "moveLeft"; count: number }
  | { op: "moveRight"; count: number }
  | { op: "selectBack"; count: number }
  /** Reads the current selection through a synthetic copy event; never touches the system clipboard. */
  | { op: "copySelection" }
  | { op: "insert"; text: string; strategy: InsertStrategy }
  | { op: "probe" };

export type BridgeResponse =
  | { ok: true; text?: string | null; report?: Record<string, unknown> }
  | { ok: false; error: string };
