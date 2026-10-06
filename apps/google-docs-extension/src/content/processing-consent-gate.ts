/**
 * Controls whether Google Docs typing listeners may be attached.
 *
 * Kept separate from chemistry settings so a saved enabled=true value from an
 * older release cannot activate document processing before current consent.
 */
export class ProcessingConsentGate {
  private active = false;

  constructor(
    private readonly start: () => void,
    private readonly stop: () => void,
  ) {}

  update(consentAccepted: boolean, enabled: boolean): void {
    const next = consentAccepted && enabled;
    if (next === this.active) return;
    this.active = next;
    if (next) this.start();
    else this.stop();
  }
}
