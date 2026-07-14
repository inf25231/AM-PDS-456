/**
 * MediaController
 *
 * Owns local camera/microphone streams, selected devices/quality, and
 * reacts to browser device-change events.
 *
 * Lifecycle:
 *   const media = new MediaController({ getVideoElement, onError, onMediaChanged });
 *   media.init();
 *   await media.startAll(); // or startCamera/startMicrophone separately
 *   media.dispose();
 */

import {
  buildCameraConstraints,
  buildMediaConstraints,
  buildMicrophoneConstraints,
  persistCameraPreferences,
  readCameraPreferences
} from './core/settings.ts';
import {
  enumerateMediaDeviceOptions,
  getStreamTrackDeviceId,
  normalizeSelectedDeviceId,
  type DeviceOption
} from './core/devices.ts';
import {
  attachStreamToVideo,
  startCameraStream,
  startCameraAndMicrophoneStreams,
  startMicrophoneStream,
  stopCameraStream,
  stopMicrophoneStream,
  setStreamTrackEnabled,
  type CameraState,
  type VideoQuality
} from './core/media.ts';
import { getMediaErrorMessage } from '../shared/errors.ts';

export interface MediaControllerOptions {
  getVideoElement: () => HTMLVideoElement | null;
  storage?: () => Storage;
  onError?: (message: string) => void;
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

export class MediaController {
  cameraStream = $state<MediaStream | null>(null);
  microphoneStream = $state<MediaStream | null>(null);
  cameraState = $state<CameraState>('idle');
  microphoneState = $state<CameraState>('idle');
  cameraEnabled = $state(false);
  microphoneEnabled = $state(false);
  selectedQuality = $state<VideoQuality>('720p');
  selectedVideoDeviceId = $state('');
  selectedAudioDeviceId = $state('');
  availableVideoDevices = $state<DeviceOption[]>([]);
  availableAudioDevices = $state<DeviceOption[]>([]);
  isApplyingQuality = $state(false);
  errorMessage = $state('');

  readonly #opts: MediaControllerOptions;
  #disposed = false;
  #devicechangeHandler: (() => void) | null = null;

  constructor(opts: MediaControllerOptions) {
    this.#opts = opts;
  }

  init(): void {
    if (this.#disposed) return;

    // Restore saved camera settings if storage is available.
    try {
      const storage = this.#getStorage();
      if (storage) {
        const saved = readCameraPreferences(storage);
        this.selectedQuality = saved.selectedQuality;
        this.selectedVideoDeviceId = saved.selectedVideoDeviceId;
        this.selectedAudioDeviceId = saved.selectedAudioDeviceId;
      }
    } catch {
      // ignore storage errors
    }

    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.addEventListener) {
      this.#devicechangeHandler = () => {
        void this.refreshAvailableDevices('devices-refreshed');
      };
      navigator.mediaDevices.addEventListener('devicechange', this.#devicechangeHandler);
    }
  }

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

  async startAll(): Promise<void> {
    if (this.#disposed) return;

    this.#clearError();
    this.cameraState = 'loading';
    this.microphoneState = 'loading';

    try {
      const videoElement = this.#requireVideoElement();
      const streams = await startCameraAndMicrophoneStreams(
        buildMediaConstraints(this.#preferences())
      );
      await attachStreamToVideo(videoElement, streams.cameraStream);

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

  async startCamera(): Promise<void> {
    if (this.#disposed) return;

    this.#clearError();
    this.cameraState = 'loading';

    try {
      const videoElement = this.#requireVideoElement();
      this.cameraStream = await startCameraStream(
        videoElement,
        buildCameraConstraints(this.#preferences())
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

  async startMicrophone(): Promise<void> {
    if (this.#disposed) return;

    this.#clearError();
    this.microphoneState = 'loading';

    try {
      this.microphoneStream = await startMicrophoneStream(
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

  stopCamera(): void {
    stopCameraStream(this.#opts.getVideoElement(), this.cameraStream);
    this.cameraStream = null;
    this.cameraEnabled = false;
    this.cameraState = 'idle';
    this.#opts.onMediaChanged?.('camera-stopped');
  }

  stopMicrophone(): void {
    stopMicrophoneStream(this.microphoneStream);
    this.microphoneStream = null;
    this.microphoneEnabled = false;
    this.microphoneState = 'idle';
    this.#opts.onMediaChanged?.('microphone-stopped');
  }

  async toggleCamera(): Promise<void> {
    if (
      this.cameraStream &&
      setStreamTrackEnabled(this.cameraStream, 'video', !this.cameraEnabled)
    ) {
      this.cameraEnabled = !this.cameraEnabled;
      if (this.cameraEnabled) {
        // Resume preview playback after re-enabling the camera track.
        void this.#opts
          .getVideoElement()
          ?.play()
          .catch(() => {});
      }
      this.#opts.onMediaChanged?.('camera-toggled');
      return;
    }

    await this.startCamera();
  }

  async toggleMicrophone(): Promise<void> {
    if (
      this.microphoneStream &&
      setStreamTrackEnabled(this.microphoneStream, 'audio', !this.microphoneEnabled)
    ) {
      this.microphoneEnabled = !this.microphoneEnabled;
      this.#opts.onMediaChanged?.('microphone-toggled');
      return;
    }

    await this.startMicrophone();
  }

  async setQuality(quality: VideoQuality): Promise<void> {
    this.selectedQuality = quality;
    this.#savePreferences();
    await this.applyVideoPreferences();
    this.#opts.onMediaChanged?.('quality-changed');
  }

  async setVideoDevice(deviceId: string): Promise<void> {
    this.selectedVideoDeviceId = deviceId;
    this.#savePreferences();

    if (!this.cameraStream) {
      await this.refreshAvailableDevices('video-device-changed');
      return;
    }

    const hasMicrophone = Boolean(this.microphoneStream);
    this.cameraState = 'loading';
    if (hasMicrophone) this.microphoneState = 'loading';

    try {
      await this.restartActiveMedia(true, hasMicrophone);
      this.cameraState = 'ready';
      if (hasMicrophone) this.microphoneState = 'ready';
      this.#opts.onMediaChanged?.('video-device-changed');
    } catch (error) {
      this.cameraState = 'error';
      if (hasMicrophone) this.microphoneState = 'error';
      this.#setError(getMediaErrorMessage(hasMicrophone ? 'media' : 'camera', error));
    }
  }

  async setAudioDevice(deviceId: string): Promise<void> {
    this.selectedAudioDeviceId = deviceId;
    this.#savePreferences();

    if (!this.microphoneStream) {
      await this.refreshAvailableDevices('audio-device-changed');
      return;
    }

    const hasCamera = Boolean(this.cameraStream);
    this.microphoneState = 'loading';
    if (hasCamera) this.cameraState = 'loading';

    try {
      await this.restartActiveMedia(hasCamera, true);
      this.microphoneState = 'ready';
      if (hasCamera) this.cameraState = 'ready';
      this.#opts.onMediaChanged?.('audio-device-changed');
    } catch (error) {
      this.microphoneState = 'error';
      if (hasCamera) this.cameraState = 'error';
      this.#setError(getMediaErrorMessage(hasCamera ? 'media' : 'microphone', error));
    }
  }

  async refreshAvailableDevices(reason: MediaChangeReason = 'devices-refreshed'): Promise<void> {
    if (this.#disposed) return;

    const { videoInputs, audioInputs } = await enumerateMediaDeviceOptions();
    this.availableVideoDevices = videoInputs;
    this.availableAudioDevices = audioInputs;

    const activeVideoDeviceId = getStreamTrackDeviceId(this.cameraStream, 'video');
    const activeAudioDeviceId = getStreamTrackDeviceId(this.microphoneStream, 'audio');

    const nextVideoDeviceId = normalizeSelectedDeviceId(
      this.selectedVideoDeviceId,
      this.availableVideoDevices,
      activeVideoDeviceId
    );
    const nextAudioDeviceId = normalizeSelectedDeviceId(
      this.selectedAudioDeviceId,
      this.availableAudioDevices,
      activeAudioDeviceId
    );

    if (
      nextVideoDeviceId !== this.selectedVideoDeviceId ||
      nextAudioDeviceId !== this.selectedAudioDeviceId
    ) {
      this.selectedVideoDeviceId = nextVideoDeviceId;
      this.selectedAudioDeviceId = nextAudioDeviceId;
      this.#savePreferences();
    }

    this.#opts.onMediaChanged?.(reason);
  }

  async restartActiveMedia(restartCamera: boolean, restartMicrophone: boolean): Promise<void> {
    if (this.#disposed) return;

    const shouldEnableCamera = this.cameraEnabled;
    const shouldEnableMicrophone = this.microphoneEnabled;
    const videoElement = this.#requireVideoElement();

    if (restartCamera) {
      stopCameraStream(videoElement, this.cameraStream);
      this.cameraStream = null;
      this.cameraEnabled = false;
    }
    if (restartMicrophone) {
      stopMicrophoneStream(this.microphoneStream);
      this.microphoneStream = null;
      this.microphoneEnabled = false;
    }

    if (restartCamera && restartMicrophone) {
      // One getUserMedia call for both tracks.
      const streams = await startCameraAndMicrophoneStreams(
        buildMediaConstraints(this.#preferences())
      );
      await attachStreamToVideo(videoElement, streams.cameraStream);
      this.cameraStream = streams.cameraStream;
      this.microphoneStream = streams.microphoneStream;
      this.#restoreTrackEnabledFlags(shouldEnableCamera, shouldEnableMicrophone);
      await this.refreshAvailableDevices();
      return;
    }

    if (restartCamera) {
      this.cameraStream = await startCameraStream(
        videoElement,
        buildCameraConstraints(this.#preferences())
      );
      this.#restoreTrackEnabledFlags(shouldEnableCamera, this.microphoneEnabled);
    }

    if (restartMicrophone) {
      this.microphoneStream = await startMicrophoneStream(
        buildMicrophoneConstraints(this.selectedAudioDeviceId)
      );
      this.#restoreTrackEnabledFlags(this.cameraEnabled, shouldEnableMicrophone);
    }

    await this.refreshAvailableDevices();
  }

  async applyVideoPreferences(): Promise<void> {
    if (this.#disposed) return;
    if (!this.cameraStream) return;

    // Simpler behavior: quality change always restarts active streams.
    const hasMicrophone = Boolean(this.microphoneStream);
    this.isApplyingQuality = true;
    this.#clearError();
    this.cameraState = 'loading';
    if (hasMicrophone) this.microphoneState = 'loading';

    try {
      await this.restartActiveMedia(true, hasMicrophone);
      this.cameraState = 'ready';
      if (hasMicrophone) this.microphoneState = 'ready';
    } catch (error) {
      this.cameraStream = null;
      this.cameraEnabled = false;
      this.cameraState = 'error';

      if (hasMicrophone) {
        this.microphoneStream = null;
        this.microphoneEnabled = false;
        this.microphoneState = 'error';
      }
      this.#setError(getMediaErrorMessage(hasMicrophone ? 'media' : 'camera', error));
    } finally {
      this.isApplyingQuality = false;
    }
  }

  #preferences() {
    return {
      selectedQuality: this.selectedQuality,
      selectedVideoDeviceId: this.selectedVideoDeviceId,
      selectedAudioDeviceId: this.selectedAudioDeviceId
    };
  }

  #savePreferences(): void {
    const storage = this.#getStorage();
    if (!storage) return;
    try {
      persistCameraPreferences(storage, this.#preferences());
    } catch {
      // ignore storage errors
    }
  }

  #restoreTrackEnabledFlags(cameraEnabled: boolean, microphoneEnabled: boolean): void {
    if (this.cameraStream) {
      setStreamTrackEnabled(this.cameraStream, 'video', cameraEnabled);
      this.cameraEnabled = cameraEnabled;
    }
    if (this.microphoneStream) {
      setStreamTrackEnabled(this.microphoneStream, 'audio', microphoneEnabled);
      this.microphoneEnabled = microphoneEnabled;
    }
  }

  #requireVideoElement(): HTMLVideoElement {
    const element = this.#opts.getVideoElement();
    if (!element) {
      throw new Error('MediaController: <video> element is not mounted yet.');
    }
    return element;
  }

  #getStorage(): Storage | null {
    try {
      if (this.#opts.storage) return this.#opts.storage();
      if (typeof localStorage !== 'undefined') return localStorage;
    } catch {
      // ignore storage errors
    }
    return null;
  }

  #setError(message: string): void {
    this.errorMessage = message;
    this.#opts.onError?.(message);
  }

  #clearError(): void {
    if (this.errorMessage !== '') this.errorMessage = '';
  }
}
