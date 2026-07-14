/**
 * CameraController
 *
 * Root orchestrator for the camera page. It wires media, room, effects,
 * and publish controllers together, and routes info/error banners + room
 * prompt flow.
 *
 * Lifecycle:
 *   const camera = new CameraController({ getVideoElement, getPreviewContainer });
 *   await camera.mount();
 *   camera.syncEffectsReactivity();
 *   camera.syncParticipantTilesReactivity();
 *   camera.dispose();
 */

import { EffectsController } from './effects/index.ts';
import { MediaController } from './media/index.ts';
import { PublishController } from './publish/index.ts';
import { RoomController } from './room/index.ts';
import { BannerStore } from './shared/banner-store.svelte.ts';

import type { EffectsControllerOptions } from './effects/index.ts';
import type { MediaChangeReason } from './media/index.ts';
import type { RoomChangeReason } from './room/index.ts';

export interface CameraControllerOptions {
  getVideoElement: () => HTMLVideoElement | null;
  getPreviewContainer: () => HTMLDivElement | null;
}

export interface RoomPromptState {
  kind: 'room' | 'user';
  initialValue: string;
}

export class CameraController {
  readonly banner = new BannerStore();
  readonly media: MediaController;
  readonly room: RoomController;
  readonly effects: EffectsController;
  readonly publish: PublishController;

  roomPrompt = $state<RoomPromptState | null>(null);
  private resolveRoomPrompt: ((value: string | null) => void) | null = null;
  private readonly opts: CameraControllerOptions;

  constructor(opts: CameraControllerOptions) {
    this.opts = opts;

    this.media = new MediaController({
      getVideoElement: this.opts.getVideoElement,
      onError: (message) => this.banner.showError(message),
      onMediaChanged: (reason) => this.onMediaChanged(reason)
    });

    this.room = new RoomController({
      media: this.media,
      promptRoomName: (previous) => this.requestRoomPrompt('room', previous),
      promptUserName: (previous) => this.requestRoomPrompt('user', previous),
      onInfo: (message) => this.banner.showInfo(message),
      onError: (message) => this.banner.showError(message),
      onRoomChanged: (reason) => this.onRoomChanged(reason)
    });

    const effectsOptions: EffectsControllerOptions = {
      getCameraEnabled: () => this.media.cameraEnabled,
      getCameraState: () => this.media.cameraState,
      getIsRoomConnected: () => this.room.isConnected,
      onInfo: (message) => this.banner.showInfo(message),
      onError: (message) => this.banner.showError(message),
      onCompositionReady: () => {
        this.publish?.queueSync();
      }
    };
    this.effects = new EffectsController(effectsOptions);

    this.publish = new PublishController({
      media: this.media,
      room: this.room,
      getCompositionTrack: () => this.effects.compositionTrack,
      onError: (message) => this.banner.showError(message)
    });
  }

  get hasErrorBanner(): boolean {
    return (
      this.media.cameraState === 'error' ||
      this.media.microphoneState === 'error' ||
      Boolean(this.banner.error)
    );
  }

  completeRoomPrompt(value: string | null): void {
    const resolve = this.resolveRoomPrompt;
    this.resolveRoomPrompt = null;
    this.roomPrompt = null;
    resolve?.(value);
  }

  syncEffectsReactivity(): void {
    this.media.cameraStream;
    this.media.cameraEnabled;
    this.media.cameraState;

    this.effects.state.webcamVisibility;
    this.effects.state.showLandmarksDebug;
    this.effects.state.background.kind;
    this.effects.state.background.imageUrl;
    this.effects.state.model.enabled;
    this.effects.state.model.url;
    this.effects.state.model.scale;
    this.effects.state.model.offsetX;
    this.effects.state.model.offsetY;
    this.effects.state.model.rotationY;

    this.room.connectionState;

    this.effects.syncAll();
  }

  syncParticipantTilesReactivity(): void {
    if (this.room.isConnected) {
      this.room.rebuildParticipantTiles();
    }
  }

  async mount(): Promise<void> {
    this.media.init();
    this.effects.init();
    await this.media.startAll();

    const video = this.opts.getVideoElement();
    const previewContainer = this.opts.getPreviewContainer();
    if (!video || !previewContainer) {
      this.banner.showError('Camera stage is not ready. Please refresh the page.');
      return;
    }

    this.effects.attachElements({
      video,
      previewContainer
    });
    this.effects.syncAll();

    if ((import.meta as any).env?.DEV) {
      (window as any).debug = {
        media: this.media,
        room: this.room,
        effects: this.effects,
        publish: this.publish
      };
    }
  }

  dispose(): void {
    this.completeRoomPrompt(null);
    this.publish.dispose();
    this.effects.dispose();
    this.room.dispose();
    this.media.dispose();
    this.banner.dispose();
  }

  private requestRoomPrompt(
    kind: RoomPromptState['kind'],
    previous: string
  ): Promise<string | null> {
    return new Promise((resolve) => {
      this.resolveRoomPrompt = resolve;
      this.roomPrompt = {
        kind,
        initialValue: previous || (kind === 'room' ? 'amphi-room' : 'guest')
      };
    });
  }

  private onMediaChanged(reason: MediaChangeReason): void {
    this.publish.onMediaChanged(reason);

    if (this.shouldRestartComposition(reason) && this.room.isConnected) {
      this.effects.restartCompositionIfNeeded();
    }

    if (this.shouldSyncTracking(reason)) {
      this.effects.syncTracking();
    }
  }

  private onRoomChanged(reason: RoomChangeReason): void {
    this.publish.onRoomChanged(reason);

    if (reason === 'connected') {
      this.effects.startCompositionSession();
    }

    if (reason === 'disconnected') {
      this.effects.stopCompositionSession();
    }
  }

  private shouldRestartComposition(reason: MediaChangeReason): boolean {
    return reason === 'camera-started' || reason === 'video-device-changed';
  }

  private shouldSyncTracking(reason: MediaChangeReason): boolean {
    return (
      reason === 'camera-started' ||
      reason === 'camera-stopped' ||
      reason === 'camera-toggled' ||
      reason === 'video-device-changed' ||
      reason === 'quality-changed'
    );
  }
}
