import { ACTIVE_EVENT, REQUEST_EVENT, RESPONSE_EVENT, type BridgeRequest, type BridgeResponse } from "./bridge-protocol";

/** Keep the MAIN-world document bridge dormant until consent and enabled state allow processing. */
export function setBridgeActive(active: boolean): void {
  document.dispatchEvent(new CustomEvent(ACTIVE_EVENT, { detail: active }));
}

/** Isolated-world side of the bridge: a synchronous call into the MAIN world. */
export function bridgeRequest(request: BridgeRequest): BridgeResponse {
  let raw: string | undefined;
  const onResponse = (event: Event) => {
    raw = (event as CustomEvent<string>).detail;
  };
  document.addEventListener(RESPONSE_EVENT, onResponse);
  try {
    document.dispatchEvent(new CustomEvent(REQUEST_EVENT, { detail: JSON.stringify(request) }));
  } finally {
    document.removeEventListener(RESPONSE_EVENT, onResponse);
  }
  if (typeof raw !== "string") return { ok: false, error: "bridge did not answer" };
  try {
    return JSON.parse(raw) as BridgeResponse;
  } catch {
    return { ok: false, error: "malformed bridge response" };
  }
}
