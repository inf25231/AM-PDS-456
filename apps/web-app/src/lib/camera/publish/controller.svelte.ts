// src/lib/camera/publish/controller.svelte.ts

/**
 * PublishController
 *
 * Reactive (Svelte 5 runes) controller for publishing local composition video
 * and microphone tracks to the active LiveKit room.
 *
 * Privacy rule: video source is ALWAYS the composition track (canvas output),
 * never the raw webcam track.
 *
 * Responsibilities:
 *  - Publishes / unpublishes composition video and microphone tracks as the
 *    underlying sources change.
 *  - Serialises publish operations through a Promise chain.
 *  - Aborts stale operations when the room session id changes.
 *  - Mirrors soft enabled flags onto publication mute state.
 *
 * Lifecycle:
 *   const publish = new PublishController({ media, room, onError });
 *   publish.queueSync();
 *   publish.dispose();
 */

import { Track, type LocalTrackPublication } from 'livekit-client';

import { getMediaErrorMessage } from '../shared/errors.ts';
import type { MediaController } from '../media/index.ts';
import type { RoomController } from '../room/index.ts';

// ----------------------------------------------------------------------
// Public types
// ----------------------------------------------------------------------

export interface PublishControllerOptions {
  media: MediaController;
  room: RoomController;
  onError?: (message: string) => void;

  /** The composition track to publish as video. */
  getCompositionTrack?: () => MediaStreamTrack | null;
}

// ----------------------------------------------------------------------
// Controller
// ----------------------------------------------------------------------

export class PublishController {
  lastError = $state('');
  syncing = $state(false);

  private readonly opts: PublishControllerOptions;
  private readonly media: MediaController;
  private readonly room: RoomController;

  private publishedVideoPublication: LocalTrackPublication | null = null;
  private publishedAudioPublication: LocalTrackPublication | null = null;
  private publishedVideoTrack: MediaStreamTrack | null = null;
  private publishedAudioTrack: MediaStreamTrack | null = null;

  private chain: Promise<void> = Promise.resolve();
  private disposed = false;

  constructor(opts: PublishControllerOptions) {
    this.opts = opts;
    this.media = opts.media;
    this.room = opts.room;
  }

  // ==================================================================
  // Public API
  // ==================================================================

  queueSync(): Promise<void> {
    const capturedSession = this.room.sessionId;

    this.chain = this.chain
      .then(async () => {
        if (this.disposed) return;
        this.syncing = true;
        try {
          await this.sync(capturedSession);
        } finally {
          this.syncing = false;
        }
      })
      .catch((error) => {
        const message = getMediaErrorMessage('media', error);
        this.lastError = message;
        this.opts.onError?.(message);
      });

    return this.chain;
  }

  onRoomChanged = (
    reason:
      | 'connected'
      | 'disconnected'
      | 'participant-joined'
      | 'participant-left'
      | 'tracks-changed'
      | 'media-toggled'
  ): void => {
    if (this.disposed) return;
    if (reason === 'disconnected') {
      this.clearPublicationRefs();
      return;
    }
    if (reason === 'connected') {
      // Do not publish yet: a fresh composition track is created per session,
      // and onCompositionReady is the single source of truth for initial sync.
      this.clearPublicationRefs();
      return;
    }
    if (reason === 'media-toggled') {
      void this.queueSync();
    }
  };

  onMediaChanged = (
    reason:
      | 'camera-started'
      | 'camera-stopped'
      | 'camera-toggled'
      | 'microphone-started'
      | 'microphone-stopped'
      | 'microphone-toggled'
      | 'quality-changed'
      | 'video-device-changed'
      | 'audio-device-changed'
      | 'devices-refreshed'
  ): void => {
    if (this.disposed) return;
    if (!this.room.isConnected) return;

    switch (reason) {
      case 'camera-started':
      case 'camera-stopped':
      case 'camera-toggled':
      case 'microphone-started':
      case 'microphone-stopped':
      case 'microphone-toggled':
      case 'quality-changed':
      case 'video-device-changed':
      case 'audio-device-changed':
        void this.queueSync();
        break;
      case 'devices-refreshed':
        break;
    }
  };

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearPublicationRefs();
  }

  // ==================================================================
  // Core sync
  // ==================================================================

  /**
   * Publish composition video + microphone tracks to the room.
   * Drops stale publications when the source track has changed.
   */
  private async sync(capturedSession: number): Promise<void> {
    if (!this.room.isSessionActive(capturedSession)) {
      return;
    }

    const livekitRoom = this.room.livekitRoom;
    if (!livekitRoom) return;

    // 1) Video source = composition track ONLY. The raw webcam never goes
    //    to the network (privacy). If composition isn't ready yet, we don't
    //    publish video this cycle — onCompositionReady triggers a re-sync.
    const nextVideoTrack = this.opts.getCompositionTrack?.() ?? null;
    const nextAudioTrack = this.media.microphoneStream?.getAudioTracks()[0] ?? null;

    // 2) Detect publications whose track was silently dropped.
    const vTrack = this.publishedVideoPublication?.track?.mediaStreamTrack;
    if (
      this.publishedVideoPublication &&
      (!this.publishedVideoPublication.track || vTrack?.readyState === 'ended')
    ) {
      this.publishedVideoPublication = null;
      this.publishedVideoTrack = null;
    }
    if (this.publishedAudioPublication && !this.publishedAudioPublication.track) {
      this.publishedAudioPublication = null;
      this.publishedAudioTrack = null;
    }

    // 3) Unpublish stale sources.
    await this.maybeUnpublish(
      'video',
      this.publishedVideoPublication,
      this.publishedVideoTrack,
      nextVideoTrack,
      capturedSession
    );
    await this.maybeUnpublish(
      'audio',
      this.publishedAudioPublication,
      this.publishedAudioTrack,
      nextAudioTrack,
      capturedSession
    );

    if (!this.room.isSessionActive(capturedSession)) return;

    // 4) Reconcile against any existing publication for the same track id.
    if (nextVideoTrack && !this.publishedVideoPublication) {
      const existing = this.findPublishedTrackById('video', nextVideoTrack.id);
      if (existing) {
        this.publishedVideoPublication = existing;
        this.publishedVideoTrack = nextVideoTrack;
      }
    }
    if (nextAudioTrack && !this.publishedAudioPublication) {
      const existing = this.findPublishedTrackById('audio', nextAudioTrack.id);
      if (existing) {
        this.publishedAudioPublication = existing;
        this.publishedAudioTrack = nextAudioTrack;
      }
    }

    // 5) Publish whatever isn't published yet.
    if (nextVideoTrack && !this.publishedVideoPublication) {
      if (!this.room.isSessionActive(capturedSession)) return;
      const pub = await livekitRoom.localParticipant.publishTrack(nextVideoTrack, {
        source: Track.Source.Camera
      });
      this.publishedVideoPublication = pub;
      this.publishedVideoTrack = nextVideoTrack;
    }

    if (nextAudioTrack && !this.publishedAudioPublication) {
      if (!this.room.isSessionActive(capturedSession)) return;
      const pub = await livekitRoom.localParticipant.publishTrack(nextAudioTrack, {
        source: Track.Source.Microphone
      });
      this.publishedAudioPublication = pub;
      this.publishedAudioTrack = nextAudioTrack;
    }

    if (!this.room.isSessionActive(capturedSession)) return;

    // 6) Mirror soft enabled flags onto publication mute state.
    // Audio mirrors mic, video mirrors camera. This lets remote participants
    // show a proper camera-off state instead of rendering a black stream.
    await this.syncMuteState(this.publishedAudioPublication, this.media.microphoneEnabled);
    await this.syncMuteState(this.publishedVideoPublication, this.media.cameraEnabled);
  }

  // ==================================================================
  // Helpers
  // ==================================================================

  private async maybeUnpublish(
    kind: 'video' | 'audio',
    publication: LocalTrackPublication | null,
    publishedTrack: MediaStreamTrack | null,
    nextTrack: MediaStreamTrack | null,
    capturedSession: number
  ): Promise<void> {
    if (!publication) return;

    const sourceChanged = Boolean(nextTrack) && publishedTrack !== nextTrack;
    const noLongerWanted = !nextTrack;

    if (!sourceChanged && !noLongerWanted) return;
    if (!this.room.isSessionActive(capturedSession)) return;

    const livekitRoom = this.room.livekitRoom;
    if (!livekitRoom) return;

    try {
      if (publication.track) {
        await livekitRoom.localParticipant.unpublishTrack(publication.track);
      }
    } catch {
      // Ignore — publication may already be gone from the server.
    }

    if (kind === 'video') {
      this.publishedVideoPublication = null;
      this.publishedVideoTrack = null;
    } else {
      this.publishedAudioPublication = null;
      this.publishedAudioTrack = null;
    }
  }

  private findPublishedTrackById(
    kind: 'video' | 'audio',
    trackId: string
  ): LocalTrackPublication | null {
    const livekitRoom = this.room.livekitRoom;
    if (!livekitRoom) return null;

    for (const publication of livekitRoom.localParticipant.trackPublications.values()) {
      const media = publication.track?.mediaStreamTrack;
      if (publication.kind === kind && media && media.id === trackId) {
        return publication as LocalTrackPublication;
      }
    }
    return null;
  }

  private async syncMuteState(
    publication: LocalTrackPublication | null,
    enabled: boolean
  ): Promise<void> {
    if (!publication) return;

    try {
      if (enabled && publication.isMuted) {
        await publication.unmute();
      } else if (!enabled && !publication.isMuted) {
        await publication.mute();
      }
    } catch {
      // Non-fatal; next sync will retry.
    }
  }

  private clearPublicationRefs(): void {
    this.publishedVideoPublication = null;
    this.publishedAudioPublication = null;
    this.publishedVideoTrack = null;
    this.publishedAudioTrack = null;
  }
}
