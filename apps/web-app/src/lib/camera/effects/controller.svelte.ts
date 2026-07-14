/**
 * EffectsController
 *
 * Reactive controller for local camera effects preview and composition
 * output used for publishing.
 *
 * Lifecycle:
 *   const effects = new EffectsController({ getCameraEnabled, getCameraState, getIsRoomConnected, onError });
 *   effects.init();
 *   effects.attachElements({ video, previewContainer });
 *   effects.syncAll();
 *   effects.startCompositionSession(); // when room connects
 *   effects.stopCompositionSession();  // when room disconnects
 *   effects.dispose();
 */

import {
  createDefaultCameraEffectsState,
  normalizeEffectsState,
  setBackgroundImage,
  setDemoModel,
  setModelFile,
  type CameraEffectsState,
  type WebcamVisibility
} from './state.ts';
import { drawLandmarksDebug } from './renderers/landmarks-debug-renderer.ts';
import { ThreeMaskRenderer } from './renderers/three-mask-renderer.ts';
import { startFaceTracking, type FaceLandmarkerResult } from './tracking.ts';
import { getMediaErrorMessage } from '../shared/errors.ts';
import { COMPOSITION_FPS, FACE_TRACKING_FPS } from '../shared/constants.ts';
import { CompositionController } from './composition.svelte.ts';

export function shouldTrackFace(state: CameraEffectsState): boolean {
  return state.model.enabled || state.showLandmarksDebug;
}

export interface EffectsControllerOptions {
  getCameraEnabled: () => boolean;
  getCameraState: () => 'idle' | 'loading' | 'ready' | 'error';
  getIsRoomConnected: () => boolean;
  onInfo?: (message: string) => void;
  onError?: (message: string) => void;
  onCompositionReady?: () => void;
}

export interface AttachedElements {
  video: HTMLVideoElement;
  previewContainer: HTMLDivElement;
}

const DEFAULT_MOBILE_QUERY = '(max-width: 900px)';

type ActiveMaskRenderer = ThreeMaskRenderer;

export class EffectsController {
  state = $state<CameraEffectsState>(createDefaultCameraEffectsState());
  showPanel = $state(false);
  latestFaceResult = $state<FaceLandmarkerResult | null>(null);
  tracking = $state(false);

  private readonly opts: EffectsControllerOptions;

  private elements: AttachedElements | null = null;
  private modelRenderer: ActiveMaskRenderer | null = null;
  private modelCanvas: HTMLCanvasElement | null = null;
  private stopFaceTracking: (() => void) | null = null;

  private composition: CompositionController | null = null;

  private backgroundImage: HTMLImageElement | null = null;
  private backgroundUrl: string | null = null;

  private isMobileViewport = false;
  private mediaQueryList: MediaQueryList | null = null;
  private readonly mediaQueryListener = (event: MediaQueryListEvent): void => {
    this.isMobileViewport = event.matches;
    this.syncCompositionFps();
    if (this.stopFaceTracking) {
      this.stopFaceTracking();
      this.stopFaceTracking = null;
      this.syncTracking();
    }
  };

  private disposed = false;

  constructor(opts: EffectsControllerOptions) {
    this.opts = opts;
  }

  // Attach the DOM nodes used for preview + composition.
  attachElements(elements: AttachedElements): void {
    if (this.disposed) return;

    this.detachElements();

    this.elements = elements;

    this.modelCanvas = document.createElement('canvas');

    this.ensureRenderer();

    this.composition = new CompositionController({
      getVideoElement: () => this.elements?.video ?? null,
      getEffectsState: () => this.state,
      getFaceResult: () => this.latestFaceResult,
      getCameraEnabled: this.opts.getCameraEnabled,
      renderBackground: (ctx, state) =>
        this.drawBackgroundFrame(ctx, ctx.canvas.width, ctx.canvas.height, state),
      renderModel: (ctx, state, faceResult) => this.renderModelLayer(ctx, state, faceResult),
      renderLandmarks: (ctx, state, faceResult) =>
        this.renderLandmarksLayer(ctx, state, faceResult),
      onReady: () => {
        this.opts.onCompositionReady?.();
      },
      onError: (msg) => this.opts.onError?.(msg)
    });

    const previewCanvas = this.composition.previewCanvas;
    previewCanvas.classList.add('composition-preview-canvas');
    elements.previewContainer.replaceChildren(previewCanvas);

    this.syncCompositionFps();
    this.composition.startRenderLoop();
    this.syncAll();
  }

  detachElements(): void {
    this.stopTracking();
    this.elements?.previewContainer.replaceChildren();
    this.modelRenderer?.dispose();
    this.modelRenderer = null;
    this.modelCanvas = null;
    this.disposeComposition();
    this.elements = null;
  }

  // Window-only setup for viewport-dependent fps/tracking.
  init(): void {
    if (this.disposed) return;
    if (typeof window === 'undefined') return;
    if (typeof window.matchMedia !== 'function') return;

    this.mediaQueryList = window.matchMedia(DEFAULT_MOBILE_QUERY);
    this.isMobileViewport = this.mediaQueryList.matches;
    this.mediaQueryList.addEventListener('change', this.mediaQueryListener);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    if (this.mediaQueryList) {
      this.mediaQueryList.removeEventListener('change', this.mediaQueryListener);
      this.mediaQueryList = null;
    }

    this.detachElements();

    if (this.state.background.imageUrl) {
      URL.revokeObjectURL(this.state.background.imageUrl);
    }
    if (this.state.model.source === 'custom' && this.state.model.url) {
      URL.revokeObjectURL(this.state.model.url);
    }

    this.backgroundImage = null;
    this.backgroundUrl = null;
  }

  get compositionTrack(): MediaStreamTrack | null {
    return this.composition?.track ?? null;
  }

  startCompositionSession(): void {
    if (this.disposed) return;
    this.syncCompositionFps();
    this.composition?.startNewSessionTrack();
  }

  stopCompositionSession(): void {
    if (this.disposed) return;
    this.composition?.stopSessionTrack();
    this.syncCompositionFps();
  }

  syncAll(): void {
    if (this.disposed || !this.elements) return;
    normalizeEffectsState(this.state);
    this.syncTracking();
    void this.sync3dMaskModel();
  }

  syncTracking(): void {
    if (this.disposed || !this.elements) {
      this.stopTracking();
      return;
    }

    const canTrack =
      shouldTrackFace(this.state) &&
      this.opts.getCameraEnabled() &&
      this.opts.getCameraState() === 'ready';

    if (!canTrack) {
      this.stopTracking();
      return;
    }

    if (this.stopFaceTracking) return;

    const targetFps = this.isMobileViewport ? FACE_TRACKING_FPS.MOBILE : FACE_TRACKING_FPS.DESKTOP;

    try {
      this.stopFaceTracking = startFaceTracking(
        this.elements.video,
        (result) => {
          this.latestFaceResult = result;
        },
        { targetFps, suspendWhenHidden: true }
      );
      this.tracking = true;
    } catch (error) {
      this.opts.onError?.(getMediaErrorMessage('camera', error));
      this.tracking = false;
    }
  }

  stopTracking(): void {
    if (this.stopFaceTracking) {
      this.stopFaceTracking();
      this.stopFaceTracking = null;
    }
    this.tracking = false;
    this.latestFaceResult = null;
  }

  async sync3dMaskModel(): Promise<number> {
    this.ensureRenderer();
    if (!this.modelRenderer) return 0;

    try {
      if (!this.state.model.enabled || !this.state.model.url) {
        await this.modelRenderer.setModelUrl(null);
        this.modelRenderer.clear();
        return 0;
      }

      return await this.modelRenderer.setModelUrl(this.state.model.url);
    } catch (error) {
      this.opts.onError?.(getMediaErrorMessage('camera', error));
      return 0;
    }
  }

  clearBackground(): void {
    if (this.state.background.imageUrl) {
      URL.revokeObjectURL(this.state.background.imageUrl);
    }
    this.state.background = { kind: 'none', imageUrl: null, imageName: '' };
    this.backgroundImage = null;
    this.backgroundUrl = null;
  }

  handleUploadBackground(file: File | null): void {
    this.state.background = setBackgroundImage(this.state.background, file);
    this.backgroundImage = null;
    this.backgroundUrl = null;

    const url = this.state.background.imageUrl;
    if (!url) return;

    const image = new Image();
    image.onload = () => {
      if (this.state.background.imageUrl === url) {
        this.backgroundImage = image;
        this.backgroundUrl = url;
      }
    };
    image.onerror = () => {
      if (this.state.background.imageUrl === url) {
        this.opts.onError?.('Failed to load background image.');
      }
    };
    image.src = url;
  }

  setModelEnabled(enabled: boolean): void {
    this.state.model = { ...this.state.model, enabled };
    void this.sync3dMaskModel();
    this.syncTracking();
  }

  toggleModelEnabled(): void {
    this.setModelEnabled(!this.state.model.enabled);
  }

  toggleDemoModel(): void {
    if (this.state.model.source !== 'none') {
      void this.handleUploadModel(null);
      return;
    }

    this.state.model = setDemoModel(this.state.model);
    void this.sync3dMaskModel();
    this.syncTracking();
  }

  setModelScale(scale: number): void {
    this.state.model = { ...this.state.model, scale };
  }

  setModelOffsetX(offsetX: number): void {
    this.state.model = { ...this.state.model, offsetX };
  }

  setModelOffsetY(offsetY: number): void {
    this.state.model = { ...this.state.model, offsetY };
  }

  setModelRotationY(rotationY: number): void {
    this.state.model = { ...this.state.model, rotationY };
  }

  async handleUploadModel(file: File | null): Promise<void> {
    // Only .glb (binary glTF) is supported. Reject anything else up front so
    // we never create an object URL for an unusable file.
    if (file && !file.name.toLowerCase().endsWith('.glb')) {
      this.opts.onError?.('Only .glb models are supported.');
      return;
    }

    this.state.model = setModelFile(this.state.model, file);
    try {
      const blendshapeCount = await this.sync3dMaskModel();
      this.syncTracking();

      // Report the outcome of an actual upload (not a clear).
      if (file) {
        if (blendshapeCount > 0) {
          this.opts.onInfo?.(`Model loaded — ${blendshapeCount} blendshapes found.`);
        } else {
          this.opts.onInfo?.(
            "Model loaded, but no blendshapes found — facial animation won't work."
          );
        }
      }
    } catch (error) {
      this.opts.onError?.(getMediaErrorMessage('camera', error));
    }
  }

  resetModelTransform(): void {
    this.state.model = { ...this.state.model, scale: 1, offsetX: 0, offsetY: 0, rotationY: 0 };
  }

  setLandmarksDebug(enabled: boolean): void {
    if (this.state.showLandmarksDebug === enabled) return;
    this.state.showLandmarksDebug = enabled;
    this.syncTracking();
  }

  toggleLandmarksDebug(): void {
    this.setLandmarksDebug(!this.state.showLandmarksDebug);
  }

  setWebcamVisibility(visibility: WebcamVisibility): void {
    if (this.state.webcamVisibility === visibility) return;
    this.state.webcamVisibility = visibility;
  }

  toggleWebcamVisibility(): void {
    this.setWebcamVisibility(this.state.webcamVisibility === 'visible' ? 'hidden' : 'visible');
  }

  togglePanel(): void {
    this.showPanel = !this.showPanel;
  }

  private renderModelLayer(
    ctx: CanvasRenderingContext2D,
    state: CameraEffectsState,
    faceResult: FaceLandmarkerResult | null
  ): void {
    if (!state.model.enabled) {
      this.modelRenderer?.clear();
      return;
    }

    const video = this.elements?.video;
    const renderer = this.modelRenderer;
    if (!video || !renderer || !video.videoWidth || !video.videoHeight) {
      return;
    }

    renderer.resize(video.videoWidth, video.videoHeight);
    renderer.render(faceResult, video, state);

    const modelCanvas = renderer.canvas;
    if (modelCanvas.width > 0 && modelCanvas.height > 0) {
      ctx.drawImage(modelCanvas, 0, 0, ctx.canvas.width, ctx.canvas.height);
    }
  }

  private renderLandmarksLayer(
    ctx: CanvasRenderingContext2D,
    state: CameraEffectsState,
    faceResult: FaceLandmarkerResult | null
  ): void {
    const video = this.elements?.video;
    if (!video || !state.showLandmarksDebug) return;
    drawLandmarksDebug(ctx, video, faceResult);
  }

  private disposeComposition(): void {
    this.composition?.dispose();
    this.composition = null;
  }

  private syncCompositionFps(): void {
    if (!this.composition) return;

    let fps: number = COMPOSITION_FPS.IDLE;
    if (this.opts.getIsRoomConnected()) {
      fps = this.isMobileViewport
        ? COMPOSITION_FPS.CONNECTED_MOBILE
        : COMPOSITION_FPS.CONNECTED_DESKTOP;
    }

    this.composition.setTargetFps(fps);
  }

  private drawBackgroundFrame(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    state: CameraEffectsState = this.state
  ): void {
    const bg = state.background;

    if (bg.kind === 'image' && bg.imageUrl) {
      this.updateBackgroundImageCache(bg.imageUrl);
      if (!this.backgroundImage) return;

      const iw = Math.max(1, this.backgroundImage.naturalWidth || width);
      const ih = Math.max(1, this.backgroundImage.naturalHeight || height);
      const cover = Math.max(width / iw, height / ih);
      const dw = iw * cover;
      const dh = ih * cover;
      const dx = (width - dw) / 2;
      const dy = (height - dh) / 2;

      ctx.drawImage(this.backgroundImage, dx, dy, dw, dh);
    }
  }

  private updateBackgroundImageCache(url: string | null): void {
    if (!url) {
      this.backgroundImage = null;
      this.backgroundUrl = null;
      return;
    }
    if (this.backgroundUrl === url && this.backgroundImage?.complete) return;

    this.backgroundUrl = url;
    this.backgroundImage = null;

    const image = new Image();
    image.onload = () => {
      if (this.backgroundUrl !== url) return;
      this.backgroundImage = image;
    };
    image.onerror = () => {
      if (this.backgroundUrl !== url) return;
      this.opts.onError?.('Failed to load background image.');
    };
    image.src = url;
  }

  private ensureRenderer(): void {
    const canvas = this.modelCanvas;
    if (!canvas) return;
    if (this.modelRenderer) return;

    try {
      this.modelRenderer = new ThreeMaskRenderer(canvas);
    } catch (error) {
      this.opts.onError?.(getMediaErrorMessage('camera', error));
    }
  }

  restartCompositionIfNeeded(): void {
    this.composition?.restartIfEnded();
  }
}
