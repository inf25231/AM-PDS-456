import type { CameraEffectsState } from '$lib/camera/effects/state.js';
import type { FaceLandmarkerResult } from '$lib/camera/effects/tracking.js';

export interface CompositionControllerOptions {
  getVideoElement: () => HTMLVideoElement | null;
  getEffectsState: () => CameraEffectsState;
  getFaceResult: () => FaceLandmarkerResult | null;
  getCameraEnabled: () => boolean;
  renderBackground?: (ctx: CanvasRenderingContext2D, state: CameraEffectsState) => void;
  renderModel?: (
    ctx: CanvasRenderingContext2D,
    state: CameraEffectsState,
    faceResult: FaceLandmarkerResult | null
  ) => void;
  renderLandmarks?: (
    ctx: CanvasRenderingContext2D,
    state: CameraEffectsState,
    faceResult: FaceLandmarkerResult | null
  ) => void;
  onReady?: () => void;
  onError?: (message: string) => void;
  targetFps?: number;
}

const DEFAULT_FPS = 30;

export class CompositionController {
  track = $state<MediaStreamTrack | null>(null);

  private readonly opts: CompositionControllerOptions;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private targetFps: number;

  private stream: MediaStream | null = null;
  private rafHandle: number | null = null;
  private lastFrameTime = 0;
  private startRetryHandle: number | null = null;
  private disposed = false;

  constructor(opts: CompositionControllerOptions) {
    this.opts = opts;
    this.targetFps = this.opts.targetFps ?? DEFAULT_FPS;

    this.canvas = document.createElement('canvas');
    this.canvas.width = 1280;
    this.canvas.height = 720;

    const ctx = this.canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Composition: failed to get 2D context');
    this.ctx = ctx;
  }

  get previewCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  /**
   * Adjust the render/capture target fps (e.g. lower on mobile, or while
   * idle outside a room). Takes effect on the next render-loop tick; the
   * published captureStream fps updates on the next session track restart.
   */
  setTargetFps(fps: number): void {
    this.targetFps = Math.max(1, Math.round(fps));
  }

  startRenderLoop(): void {
    if (this.disposed || this.rafHandle !== null) return;
    this.lastFrameTime = 0;
    const tick = (now: number): void => {
      if (this.disposed || this.rafHandle === null) return;
      const minIntervalMs = 1000 / this.targetFps;
      if (now - this.lastFrameTime >= minIntervalMs) {
        // Advance by the ideal interval (not the actual elapsed time) so
        // the loop doesn't accumulate drift under load; if we fell far
        // behind (e.g. tab was hidden), just resync to now.
        this.lastFrameTime += minIntervalMs;
        if (now - this.lastFrameTime >= minIntervalMs) {
          this.lastFrameTime = now;
        }
        this.paintFrame();
      }
      this.rafHandle = requestAnimationFrame(tick);
    };
    this.rafHandle = requestAnimationFrame(tick);
    this.paintFrame();
  }

  stopRenderLoop(): void {
    if (this.rafHandle !== null) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
    }
  }

  startNewSessionTrack(): void {
    if (this.disposed) return;

    this.startRenderLoop();

    const videoEl = this.opts.getVideoElement();
    if (!videoEl || !videoEl.videoWidth || !videoEl.videoHeight) {
      this.scheduleStartRetry();
      return;
    }

    this.syncCanvasSize(videoEl.videoWidth, videoEl.videoHeight);
    this.paintFrame();

    this.teardownStreamOnly();
    this.stream = this.canvas.captureStream(this.targetFps);
    const videoTrack = this.stream.getVideoTracks()[0] ?? null;
    if (!videoTrack) {
      this.opts.onError?.('Composition: captureStream produced no track.');
      this.stream = null;
      return;
    }

    this.track = videoTrack;
    this.opts.onReady?.();
  }

  stopSessionTrack(): void {
    if (this.disposed) return;
    if (this.startRetryHandle !== null) {
      clearTimeout(this.startRetryHandle);
      this.startRetryHandle = null;
    }
    this.teardownStreamOnly();
    console.log('[composition] stopped session track');
  }

  restartIfEnded(): void {
    if (this.disposed) return;
    if (this.track && this.track.readyState !== 'ended') return;
    console.log('[composition] track ended -> recreating');
    this.startNewSessionTrack();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    this.stopSessionTrack();
    this.stopRenderLoop();
  }

  private scheduleStartRetry(): void {
    if (this.disposed || this.startRetryHandle !== null) return;
    this.startRetryHandle = window.setTimeout(() => {
      this.startRetryHandle = null;
      this.startNewSessionTrack();
    }, 150);
  }

  private paintFrame(): void {
    const state = this.opts.getEffectsState();
    const videoEl = this.opts.getVideoElement();

    if (videoEl?.videoWidth && videoEl.videoHeight) {
      this.syncCanvasSize(videoEl.videoWidth, videoEl.videoHeight);
    }

    const { width, height } = this.canvas;
    const ctx = this.ctx;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);

    if (!this.opts.getCameraEnabled()) return;
    if (!videoEl || !videoEl.videoWidth || !videoEl.videoHeight) return;

    if (state.webcamVisibility === 'visible') {
      this.drawCover(ctx, videoEl, width, height);
    }

    const faceResult = this.opts.getFaceResult();

    try {
      this.opts.renderBackground?.(ctx, state);
      this.opts.renderModel?.(ctx, state, faceResult);
      this.opts.renderLandmarks?.(ctx, state, faceResult);
    } catch (error) {
      this.opts.onError?.(`Composition render error: ${String(error)}`);
    }
  }

  private drawCover(
    ctx: CanvasRenderingContext2D,
    video: HTMLVideoElement,
    targetW: number,
    targetH: number
  ): void {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const cover = Math.max(targetW / vw, targetH / vh);
    const dw = vw * cover;
    const dh = vh * cover;
    const dx = (targetW - dw) / 2;
    const dy = (targetH - dh) / 2;
    ctx.drawImage(video, dx, dy, dw, dh);
  }

  private syncCanvasSize(width: number, height: number): void {
    const nextWidth = Math.max(1, Math.round(width));
    const nextHeight = Math.max(1, Math.round(height));
    if (this.canvas.width === nextWidth && this.canvas.height === nextHeight) {
      return;
    }
    this.canvas.width = nextWidth;
    this.canvas.height = nextHeight;
  }

  private teardownStreamOnly(): void {
    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.stop();
      }
      this.stream = null;
    }
    this.track = null;
  }
}
