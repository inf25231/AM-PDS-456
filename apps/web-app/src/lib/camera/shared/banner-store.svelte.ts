/**
 * BannerStore
 *
 * Reactive store for the camera page banners (info + error). Each message
 * auto-dismisses after a configurable timeout. Timeouts are tracked per
 * channel so that setting a new message correctly cancels the previous one,
 * and dispose() guarantees no leaked timers on unmount.
 *
 * Usage:
 *   const banners = new BannerStore();
 *   banners.showInfo("Joined room");
 *   banners.showError("Mic blocked");
 *
 *   // In templates:
 *   {#if banners.info}  <Banner message={banners.info} />               {/if}
 *   {#if banners.error} <Banner message={banners.error} tone="error" /> {/if}
 *
 *   // In onDestroy:
 *   banners.dispose();
 */

export type BannerChannel = 'info' | 'error';

export interface BannerStoreOptions {
  /** How long a banner stays visible before auto-dismiss. Defaults to 4000ms. */
  autoDismissMs?: number;
}

export class BannerStore {
  info = $state('');
  error = $state('');

  private readonly autoDismissMs: number;
  private readonly timeouts: Record<BannerChannel, number | null> = {
    info: null,
    error: null
  };
  private disposed = false;

  constructor(opts: BannerStoreOptions = {}) {
    this.autoDismissMs = opts.autoDismissMs ?? 4_000;
  }

  /** Show an informational banner. Replaces any active info banner. */
  showInfo(message: string): void {
    this.setBanner('info', message);
  }

  /** Show an error banner. Replaces any active error banner. */
  showError(message: string): void {
    this.setBanner('error', message);
  }

  /** Stop all pending timeouts. Call from onDestroy. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelTimeout('info');
    this.cancelTimeout('error');
  }

  private setBanner(channel: BannerChannel, message: string): void {
    if (this.disposed) return;

    // Cancel any in-flight dismissal for this channel.
    this.cancelTimeout(channel);
    this[channel] = message;

    // Empty message → no auto-dismiss needed.
    if (!message) return;

    // Guard against non-browser environments (SSR).
    if (typeof window === 'undefined') return;

    this.timeouts[channel] = window.setTimeout(() => {
      this.timeouts[channel] = null;
      if (!this.disposed) this[channel] = '';
    }, this.autoDismissMs);
  }

  private cancelTimeout(channel: BannerChannel): void {
    const id = this.timeouts[channel];
    if (id !== null && typeof window !== 'undefined') {
      window.clearTimeout(id);
    }
    this.timeouts[channel] = null;
  }
}
