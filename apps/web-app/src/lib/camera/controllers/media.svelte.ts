// src/lib/camera/controllers/media.svelte.ts

/**
 * MediaController
 *
 * Reactive controller for the local camera + microphone streams.
 *
 * Responsibilities:
 *  - Owns cameraStream / microphoneStream and their lifecycle states.
 *  - Provides soft-toggles (track.enabled) that avoid permission re-prompts.
 *  - Provides hard start/stop and full restart paths for device/quality changes.
 *  - Applies new video preferences via applyConstraints() first, falling back
 *    to a full stream recreation only when the device rejects the constraints
 *    with an over-constrained error.
 *  - Refreshes the available device lists and persists user preferences.
 *  - Exposes everything the UI needs as reactive $state.
 *
 * Lifecycle:
 *   const media = new MediaController({
 *       getVideoElement: () => videoEl,
 *       storage: () => localStorage,
 *       onError: (msg) => { errorBanner = msg; },
 *   });
 *   await media.startAll();           // initial boot
 *   await media.toggleCamera();       // user clicked camera button
 *   await media.applyVideoPreferences(); // after a quality change
 *   media.dispose();                  // component onDestroy
 */

import {
  buildCameraConstraints,
  buildMediaConstraints,
  buildMicrophoneConstraints,
  getApplyConstraintCandidates,
  persistCameraPreferences,
  readCameraPreferences,
  enumerateMediaDeviceOptions,
  getStreamTrackDeviceId,
  normalizeSelectedDeviceId,
  startCamera,
  startMicrophone,
  startCameraAndMicrophone,
  stopMediaStream,
  type CameraPreferences,
  type DeviceOption,
  type CameraState,
  type VideoQuality
} from '$lib/camera/core';
import { getMediaErrorMessage } from '$lib/camera/errors';

// ----------------------------------------------------------------------
// Thin browser-facing media helpers (start/stop + attach to <video>).
//
// These wrap the core getUserMedia helpers with the DOM wiring the
// route needs: attaching the stream to the <video> element and clearing it
// back out on stop. They stay here because they touch an HTMLVideoElement,
// which is camera-route-specific rather than reusable core logic.
// ----------------------------------------------------------------------

async function attachCameraStream(videoEl: HTMLVideoElement, stream: MediaStream): Promise<void> {
  videoEl.srcObject = stream;
  await videoEl.play();
}

async function startAllMedia(
  videoEl: HTMLVideoElement,
  constraints?: MediaStreamConstraints
): Promise<{ cameraStream: MediaStream; microphoneStream: MediaStream }> {
  const streams = await startCameraAndMicrophone(constraints);
  await attachCameraStream(videoEl, streams.cameraStream);
  return streams;
}

async function startCameraMedia(
  videoEl: HTMLVideoElement,
  constraints?: MediaStreamConstraints
): Promise<MediaStream> {
  return startCamera(videoEl, constraints);
}

async function startMicrophoneMedia(constraints?: MediaStreamConstraints): Promise<MediaStream> {
  return startMicrophone(constraints);
}

/**
 * Stops the active camera stream and clears the video element state.
 *
 * The route may hand in both the remembered stream reference and the current
 * srcObject stream. Cleaning both avoids stale tracks after restart flows.
 */
function stopCameraMedia(
  videoEl: HTMLVideoElement | undefined,
  cameraStream: MediaStream | null
): void {
  const elementStream = videoEl?.srcObject;
  const hasMediaStreamApi = typeof MediaStream !== 'undefined';

  stopMediaStream(cameraStream);
  if (hasMediaStreamApi && elementStream instanceof MediaStream) {
    stopMediaStream(elementStream);
  }

  if (videoEl) {
    videoEl.pause();
    videoEl.srcObject = null;
    videoEl.load();
  }
}

function stopMicrophoneMedia(microphoneStream: MediaStream | null): void {
  if (microphoneStream) {
    microphoneStream.getAudioTracks().forEach((track) => {
      track.stop();
      microphoneStream.removeTrack(track);
    });
  }

  stopMediaStream(microphoneStream);
}

// ----------------------------------------------------------------------
// Public types
// ----------------------------------------------------------------------

export interface MediaControllerOptions {
  /** Lazy accessor for the <video> element — must return the live element. */
  getVideoElement: () => HTMLVideoElement | null;

  /** Storage used for persisting preferences. Defaults to `localStorage` (lazy). */
  storage?: () => Storage;

  /**
   * Called whenever an error message is set on the controller. Use this to
   * surface errors in a banner or toast outside the controller.
   */
  onError?: (message: string) => void;

  /**
   * Called after device or quality changes. Useful so the parent can sync
   * downstream things like effects tracking or LiveKit publication.
   */
  onMediaChanged?: (reason: MediaChangeReason) => void;
}

export type MediaChangeReason =
  | 'camera-started'
  | 'camera-stopped'
  | 'camera-toggled'
  | 'microphone-started'
  | 'microphone-stopped'
  | 'microphone-toggled'
  | 'quality-changed'
  | 'video-device-changed'
  | 'audio-device-changed'
  | 'devices-refreshed';

export interface RestartOptions {
  restartCamera: boolean;
  restartMicrophone: boolean;
}

// ----------------------------------------------------------------------
// Controller
// ----------------------------------------------------------------------

export class MediaController {
  // --- Streams ---
  cameraStream = $state<MediaStream | null>(null);
  microphoneStream = $state<MediaStream | null>(null);

  // --- Lifecycle state ---
  cameraState = $state<CameraState>('idle');
  microphoneState = $state<CameraState>('idle');

  // --- Soft-toggle state (track.enabled mirrors these) ---
  cameraEnabled = $state(false);
  microphoneEnabled = $state(false);

  // --- Preferences ---
  selectedQuality = $state<VideoQuality>('720p');
  selectedVideoDeviceId = $state('');
  selectedAudioDeviceId = $state('');

  // --- Device lists ---
  availableVideoDevices = $state<DeviceOption[]>([]);
  availableAudioDevices = $state<DeviceOption[]>([]);

  // --- Status / messages ---
  isApplyingQuality = $state(false);
  errorMessage = $state('');

  // --- Internal ---
  readonly #opts: MediaControllerOptions;
  #disposed = false;
  #devicechangeHandler: (() => void) | null = null;

  constructor(opts: MediaControllerOptions) {
    this.#opts = opts;
  }

  // ==================================================================
  // Boot / dispose
  // ==================================================================

  /**
   * Load persisted preferences and subscribe to `devicechange`.
   * Does NOT start any stream — call `startAll()` after this.
   */
  init(): void {
    if (this.#disposed) return;

    try {
      const storage = this.#getStorage();
      if (storage) {
        this.#applyStoredPreferences(readCameraPreferences(storage));
      }
    } catch {
      // Ignore storage failures; defaults will be used.
    }

    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.addEventListener) {
      this.#devicechangeHandler = () => {
        void this.refreshAvailableDevices('devices-refreshed');
      };
      navigator.mediaDevices.addEventListener('devicechange', this.#devicechangeHandler);
    }
  }

  /**
   * Hard-stop everything and detach listeners. Intended for component onDestroy().
   */
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;

    if (
      this.#devicechangeHandler &&
      typeof navigator !== 'undefined' &&
      navigator.mediaDevices?.removeEventListener
    ) {
      navigator.mediaDevices.removeEventListener('devicechange', this.#devicechangeHandler);
    }
    this.#devicechangeHandler = null;

    this.stopCamera();
    this.stopMicrophone();
  }

  // ==================================================================
  // Start / stop
  // ==================================================================

  /**
   * Start both camera and microphone — the standard initial boot path.
   */
  async startAll(): Promise<void> {
    if (this.#disposed) return;

    this.#clearError();
    this.cameraState = 'loading';
    this.microphoneState = 'loading';

    try {
      const videoEl = this.#requireVideoElement();
      const streams = await startAllMedia(
        videoEl,
        buildMediaConstraints(this.getCurrentPreferences())
      );
      this.cameraStream = streams.cameraStream;
      this.microphoneStream = streams.microphoneStream;
      this.cameraEnabled = true;
      this.microphoneEnabled = true;
      this.cameraState = 'ready';
      this.microphoneState = 'ready';

      await this.refreshAvailableDevices('devices-refreshed');
      this.#opts.onMediaChanged?.('camera-started');
      this.#opts.onMediaChanged?.('microphone-started');
    } catch (error) {
      this.cameraState = 'error';
      this.microphoneState = 'error';
      this.#setError(getMediaErrorMessage('media', error));
    }
  }

  /** Start only the camera stream. */
  async startCamera(): Promise<void> {
    if (this.#disposed) return;

    this.#clearError();
    this.cameraState = 'loading';

    try {
      const videoEl = this.#requireVideoElement();
      this.cameraStream = await startCameraMedia(
        videoEl,
        buildCameraConstraints(this.getCurrentPreferences())
      );
      this.cameraEnabled = true;
      this.cameraState = 'ready';

      await this.refreshAvailableDevices('devices-refreshed');
      this.#opts.onMediaChanged?.('camera-started');
    } catch (error) {
      this.cameraState = 'error';
      this.#setError(getMediaErrorMessage('camera', error));
    }
  }

  /** Start only the microphone stream. */
  async startMicrophone(): Promise<void> {
    if (this.#disposed) return;

    this.#clearError();
    this.microphoneState = 'loading';

    try {
      this.microphoneStream = await startMicrophoneMedia(
        buildMicrophoneConstraints(this.selectedAudioDeviceId)
      );
      this.microphoneEnabled = true;
      this.microphoneState = 'ready';

      await this.refreshAvailableDevices('devices-refreshed');
      this.#opts.onMediaChanged?.('microphone-started');
    } catch (error) {
      this.microphoneState = 'error';
      this.#setError(getMediaErrorMessage('microphone', error));
    }
  }

  /** Hard-stop the camera stream and reset state. */
  stopCamera(): void {
    const videoEl = this.#opts.getVideoElement();
    stopCameraMedia(videoEl, this.cameraStream);
    this.cameraStream = null;
    this.cameraEnabled = false;
    this.cameraState = 'idle';
    this.#opts.onMediaChanged?.('camera-stopped');
  }

  /** Hard-stop the microphone stream and reset state. */
  stopMicrophone(): void {
    stopMicrophoneMedia(this.microphoneStream);
    this.microphoneStream = null;
    this.microphoneEnabled = false;
    this.microphoneState = 'idle';
    this.#opts.onMediaChanged?.('microphone-stopped');
  }

  // ==================================================================
  // Soft toggles
  // ==================================================================

  /**
   * User-facing camera toggle.
   *
   * Tries a soft track.enabled toggle first to avoid extra permission prompts
   * and keep the page responsive. Falls back to a hard start if no stream
   * exists yet.
   */
  async toggleCamera(): Promise<void> {
    if (
      this.cameraStream &&
      this.#setTrackEnabled(this.cameraStream, 'video', !this.cameraEnabled)
    ) {
      this.cameraEnabled = !this.cameraEnabled;
      if (this.cameraEnabled) {
        // Re-prime <video> playback after a soft re-enable.
        void this.#opts
          .getVideoElement()
          ?.play()
          .catch(() => {
            // Ignore autoplay/playback recovery errors.
          });
      }
      this.#opts.onMediaChanged?.('camera-toggled');
      return;
    }

    await this.startCamera();
  }

  /** User-facing microphone toggle. */
  async toggleMicrophone(): Promise<void> {
    if (
      this.microphoneStream &&
      this.#setTrackEnabled(this.microphoneStream, 'audio', !this.microphoneEnabled)
    ) {
      this.microphoneEnabled = !this.microphoneEnabled;
      this.#opts.onMediaChanged?.('microphone-toggled');
      return;
    }

    await this.startMicrophone();
  }

  // ==================================================================
  // Preferences & device changes
  // ==================================================================

  /** Snapshot of the current preferences used to build constraints. */
  getCurrentPreferences(): CameraPreferences {
    return {
      selectedQuality: this.selectedQuality,
      selectedVideoDeviceId: this.selectedVideoDeviceId,
      selectedAudioDeviceId: this.selectedAudioDeviceId
    };
  }

  /** Persist the current preferences to storage. Safe to call frequently. */
  persistPreferences(): void {
    const storage = this.#getStorage();
    if (!storage) return;
    try {
      persistCameraPreferences(storage, this.getCurrentPreferences());
    } catch {
      // Ignore quota/serialization issues — preferences are non-critical.
    }
  }

  /**
   * Persist + apply a new quality preset. Uses applyConstraints() first and
   * only restarts the stream if the device rejects the requested constraints.
   */
  async setQuality(quality: VideoQuality): Promise<void> {
    this.selectedQuality = quality;
    this.persistPreferences();
    await this.applyVideoPreferences();
    this.#opts.onMediaChanged?.('quality-changed');
  }

  /** Persist + apply a new video device selection. */
  async setVideoDevice(deviceId: string): Promise<void> {
    this.selectedVideoDeviceId = deviceId;
    this.persistPreferences();

    if (!this.cameraStream) {
      await this.refreshAvailableDevices('video-device-changed');
      return;
    }

    this.cameraState = 'loading';
    if (this.microphoneStream) {
      this.microphoneState = 'loading';
    }

    try {
      await this.restartActiveMedia({
        restartCamera: true,
        restartMicrophone: Boolean(this.microphoneStream)
      });
      this.cameraState = 'ready';
      if (this.microphoneStream) {
        this.microphoneState = 'ready';
      }
      this.#opts.onMediaChanged?.('video-device-changed');
    } catch (error) {
      this.cameraState = 'error';
      if (this.microphoneStream) {
        this.microphoneState = 'error';
        this.#setError(getMediaErrorMessage('media', error));
      } else {
        this.#setError(getMediaErrorMessage('camera', error));
      }
    }
  }

  /** Persist + apply a new audio device selection. */
  async setAudioDevice(deviceId: string): Promise<void> {
    this.selectedAudioDeviceId = deviceId;
    this.persistPreferences();

    if (!this.microphoneStream) {
      await this.refreshAvailableDevices('audio-device-changed');
      return;
    }

    this.microphoneState = 'loading';
    if (this.cameraStream) {
      this.cameraState = 'loading';
    }

    try {
      await this.restartActiveMedia({
        restartCamera: Boolean(this.cameraStream),
        restartMicrophone: true
      });
      this.microphoneState = 'ready';
      if (this.cameraStream) {
        this.cameraState = 'ready';
      }
      this.#opts.onMediaChanged?.('audio-device-changed');
    } catch (error) {
      this.microphoneState = 'error';
      if (this.cameraStream) {
        this.cameraState = 'error';
        this.#setError(getMediaErrorMessage('media', error));
      } else {
        this.#setError(getMediaErrorMessage('microphone', error));
      }
    }
  }

  /**
   * Refresh the list of cameras/microphones the user can select.
   * Reconciles the persisted selection with what's actually available.
   */
  async refreshAvailableDevices(reason: MediaChangeReason = 'devices-refreshed'): Promise<void> {
    if (this.#disposed) return;

    const { videoInputs, audioInputs } = await enumerateMediaDeviceOptions();
    this.availableVideoDevices = videoInputs;
    this.availableAudioDevices = audioInputs;

    const activeVideoDeviceId = getStreamTrackDeviceId(this.cameraStream, 'video');
    const activeAudioDeviceId = getStreamTrackDeviceId(this.microphoneStream, 'audio');

    const normalizedVideoDeviceId = normalizeSelectedDeviceId(
      this.selectedVideoDeviceId,
      this.availableVideoDevices,
      activeVideoDeviceId
    );
    const normalizedAudioDeviceId = normalizeSelectedDeviceId(
      this.selectedAudioDeviceId,
      this.availableAudioDevices,
      activeAudioDeviceId
    );

    if (
      normalizedVideoDeviceId !== this.selectedVideoDeviceId ||
      normalizedAudioDeviceId !== this.selectedAudioDeviceId
    ) {
      this.selectedVideoDeviceId = normalizedVideoDeviceId;
      this.selectedAudioDeviceId = normalizedAudioDeviceId;
      this.persistPreferences();
    }

    this.#opts.onMediaChanged?.(reason);
  }

  // ==================================================================
  // Restart paths
  // ==================================================================

  /**
   * Restart whichever streams are currently required. Preserves the soft
   * enabled flags across the restart.
   */
  async restartActiveMedia(options: RestartOptions): Promise<void> {
    if (this.#disposed) return;

    const shouldEnableCamera = this.cameraEnabled;
    const shouldEnableMicrophone = this.microphoneEnabled;
    const videoEl = this.#requireVideoElement();

    if (options.restartCamera) {
      stopCameraMedia(videoEl, this.cameraStream);
      this.cameraStream = null;
      this.cameraEnabled = false;
    }
    if (options.restartMicrophone) {
      stopMicrophoneMedia(this.microphoneStream);
      this.microphoneStream = null;
      this.microphoneEnabled = false;
    }

    if (options.restartCamera && options.restartMicrophone) {
      const streams = await startAllMedia(
        videoEl,
        buildMediaConstraints(this.getCurrentPreferences())
      );
      this.cameraStream = streams.cameraStream;
      this.microphoneStream = streams.microphoneStream;
      this.#applySoftEnabled(shouldEnableCamera, shouldEnableMicrophone);
      await this.refreshAvailableDevices();
      return;
    }

    if (options.restartCamera) {
      this.cameraStream = await startCameraMedia(
        videoEl,
        buildCameraConstraints(this.getCurrentPreferences())
      );
      this.#applySoftEnabled(shouldEnableCamera, this.microphoneEnabled);
    }

    if (options.restartMicrophone) {
      this.microphoneStream = await startMicrophoneMedia(
        buildMicrophoneConstraints(this.selectedAudioDeviceId)
      );
      this.#applySoftEnabled(this.cameraEnabled, shouldEnableMicrophone);
    }

    await this.refreshAvailableDevices();
  }

  /**
   * Apply new video preferences. Tries `applyConstraints()` first and only
   * falls back to a full stream recreation when the device rejects the
   * requested constraints with an over-constrained error.
   */
  async applyVideoPreferences(forceRestart = false): Promise<void> {
    if (this.#disposed) return;
    if (!this.cameraStream) return;

    const videoEl = this.#opts.getVideoElement();
    if (!videoEl) return;

    const hasMicrophone = Boolean(this.microphoneStream);
    const [videoTrack] = this.cameraStream.getVideoTracks();

    this.isApplyingQuality = true;
    this.#clearError();
    this.cameraState = 'loading';
    if (hasMicrophone) this.microphoneState = 'loading';

    try {
      if (forceRestart) {
        throw new DOMException('Restart required', 'OverconstrainedError');
      }

      if (!videoTrack || typeof videoTrack.applyConstraints !== 'function') {
        throw new Error('applyConstraints is not supported.');
      }

      let lastConstraintError: unknown = null;
      let applied = false;

      for (const constraints of getApplyConstraintCandidates(this.getCurrentPreferences())) {
        try {
          await videoTrack.applyConstraints(constraints);
          applied = true;
          break;
        } catch (err) {
          lastConstraintError = err;
        }
      }

      if (!applied) throw lastConstraintError;

      this.cameraState = 'ready';
      if (hasMicrophone) this.microphoneState = 'ready';
    } catch (error) {
      const shouldRestart =
        !(error instanceof DOMException) ||
        error.name === 'OverconstrainedError' ||
        error.name === 'ConstraintNotSatisfiedError';

      if (!shouldRestart) {
        this.cameraState = 'error';
        if (hasMicrophone) {
          this.microphoneState = 'error';
          this.#setError(getMediaErrorMessage('media', error));
        } else {
          this.#setError(getMediaErrorMessage('camera', error));
        }
        this.isApplyingQuality = false;
        return;
      }

      try {
        await this.restartActiveMedia({
          restartCamera: true,
          restartMicrophone: hasMicrophone
        });
        this.cameraState = 'ready';
        if (hasMicrophone) this.microphoneState = 'ready';
      } catch (restartError) {
        this.cameraStream = null;
        this.cameraEnabled = false;
        this.cameraState = 'error';

        if (hasMicrophone) {
          this.microphoneStream = null;
          this.microphoneEnabled = false;
          this.microphoneState = 'error';
          this.#setError(getMediaErrorMessage('media', restartError));
        } else {
          this.#setError(getMediaErrorMessage('camera', restartError));
        }
      }
    } finally {
      this.isApplyingQuality = false;
    }
  }

  // ==================================================================
  // Internals
  // ==================================================================

  #applyStoredPreferences(prefs: CameraPreferences): void {
    this.selectedQuality = prefs.selectedQuality;
    this.selectedVideoDeviceId = prefs.selectedVideoDeviceId;
    this.selectedAudioDeviceId = prefs.selectedAudioDeviceId;
  }

  #setTrackEnabled(stream: MediaStream | null, kind: 'video' | 'audio', enabled: boolean): boolean {
    const track = kind === 'video' ? stream?.getVideoTracks()[0] : stream?.getAudioTracks()[0];
    if (!track) return false;
    track.enabled = enabled;
    return true;
  }

  /**
   * Apply soft-enabled flags after a restart. Each call also pushes the value
   * down to the underlying track so .enabled stays consistent with our state.
   */
  #applySoftEnabled(cameraEnabled: boolean, microphoneEnabled: boolean): void {
    if (this.cameraStream) {
      this.#setTrackEnabled(this.cameraStream, 'video', cameraEnabled);
      this.cameraEnabled = cameraEnabled;
    }
    if (this.microphoneStream) {
      this.#setTrackEnabled(this.microphoneStream, 'audio', microphoneEnabled);
      this.microphoneEnabled = microphoneEnabled;
    }
  }

  #requireVideoElement(): HTMLVideoElement {
    const el = this.#opts.getVideoElement();
    if (!el) {
      throw new Error('MediaController: <video> element is not mounted yet.');
    }
    return el;
  }

  #getStorage(): Storage | null {
    try {
      if (this.#opts.storage) return this.#opts.storage();
      if (typeof localStorage !== 'undefined') return localStorage;
    } catch {
      // Storage may be blocked (Safari private mode, etc.).
    }
    return null;
  }

  #setError(message: string): void {
    this.errorMessage = message;
    this.#opts.onError?.(message);
  }

  #clearError(): void {
    if (this.errorMessage !== '') {
      this.errorMessage = '';
    }
  }
}
