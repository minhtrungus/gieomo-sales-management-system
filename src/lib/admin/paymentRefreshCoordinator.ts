export type RefreshOptions = { force?: boolean; reportError?: boolean };

export class PaymentRefreshCoordinator<T> {
  private active = true;
  private sequence = 0;
  private inFlight: Promise<boolean> | null = null;
  private readonly load: () => Promise<T>;
  private readonly apply: (value: T) => void;
  private readonly reject: (error: unknown, reportError: boolean) => void;

  constructor(
    load: () => Promise<T>,
    apply: (value: T) => void,
    reject: (error: unknown, reportError: boolean) => void,
  ) {
    this.load = load;
    this.apply = apply;
    this.reject = reject;
  }

  start() { this.active = true; }
  stop() { this.active = false; this.sequence += 1; }

  async refresh(options: RefreshOptions = {}): Promise<boolean> {
    const reportError = options.reportError !== false;
    if (!this.active) return false;
    if (options.force && this.inFlight) await this.inFlight;
    if (!this.active) return false;
    if (!options.force && this.inFlight) return this.inFlight;

    const requestSequence = ++this.sequence;
    const flight = this.load().then((value) => {
      if (!this.active || requestSequence !== this.sequence) return false;
      this.apply(value);
      return true;
    }).catch((error: unknown) => {
      if (this.active && requestSequence === this.sequence) this.reject(error, reportError);
      return false;
    }).finally(() => {
      if (this.inFlight === flight) this.inFlight = null;
    });
    this.inFlight = flight;
    return flight;
  }
}

export function shouldRefreshPayments(visibilityState: DocumentVisibilityState): boolean {
  return visibilityState === "visible";
}
