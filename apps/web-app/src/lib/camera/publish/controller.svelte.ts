/**
 * PublishController
 *
 * Syncs local composition video + microphone tracks to LiveKit local
 * publications. Handles re-publish when sources change and mute/unmute sync.
 *
 * Lifecycle:
 *   const publish = new PublishController({ media, room, getCompositionTrack, onError });
 *   publish.onRoomChanged(reason);
 *   publish.onMediaChanged(reason);
 *   await publish.queueSync();
 *   publish.dispose();
 */

import { Track, type LocalTrackPublication } from 'livekit-client';

import { getMediaErrorMessage } from '../shared/errors.ts';
import type { MediaController, MediaChangeReason } from '../media/index.ts';
import type { RoomController, RoomChangeReason } from '../room/index.ts';

type PublishKind = 'video' | 'audio';

export interface PublishControllerOptions {
  media: MediaController;
  room: RoomController;
  onError?: (message: string) => void;
  getCompositionTrack?: () => MediaStreamTrack | null;
}

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

  private syncQueue: Promise<void> = Promise.resolve();
  private disposed = false;

  constructor(opts: PublishControllerOptions) {
    this.opts = opts;
    this.media = opts.media;
    this.room = opts.room;
  }

  queueSync(): Promise<void> {
    const sessionId = this.room.sessionId;

    this.syncQueue = this.syncQueue
      .then(async () => {
        if (this.disposed) return;
        this.syncing = true;
        try {
          await this.syncPublications(sessionId);
        } finally {
          this.syncing = false;
        }
      })
      .catch((error) => {
        const message = getMediaErrorMessage('media', error);
        this.lastError = message;
        this.opts.onError?.(message);
      });

    return this.syncQueue;
  }

  onRoomChanged = (reason: RoomChangeReason): void => {
    if (this.disposed) return;

    if (reason === 'connected' || reason === 'disconnected') {
      this.clearPublicationRefs();
      return;
    }

    if (reason === 'media-toggled') {
      void this.queueSync();
    }
  };

  onMediaChanged = (reason: MediaChangeReason): void => {
    if (this.disposed) return;
    if (!this.room.isConnected) return;
    if (reason === 'devices-refreshed') return;
    void this.queueSync();
  };

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearPublicationRefs();
  }

  private async syncPublications(sessionId: number): Promise<void> {
    if (!this.room.isSessionActive(sessionId)) return;

    const livekitRoom = this.room.livekitRoom;
    if (!livekitRoom) return;

    // Video is always composition output, never raw webcam.
    const nextVideoTrack = this.opts.getCompositionTrack?.() ?? null;
    const nextAudioTrack = this.media.microphoneStream?.getAudioTracks()[0] ?? null;

    this.clearDroppedPublicationRefs();

    await this.maybeUnpublish(
      'video',
      this.publishedVideoPublication,
      this.publishedVideoTrack,
      nextVideoTrack,
      sessionId
    );
    await this.maybeUnpublish(
      'audio',
      this.publishedAudioPublication,
      this.publishedAudioTrack,
      nextAudioTrack,
      sessionId
    );

    if (!this.room.isSessionActive(sessionId)) return;

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

    if (nextVideoTrack && !this.publishedVideoPublication) {
      if (!this.room.isSessionActive(sessionId)) return;
      const publication = await livekitRoom.localParticipant.publishTrack(nextVideoTrack, {
        source: Track.Source.Camera
      });
      this.publishedVideoPublication = publication;
      this.publishedVideoTrack = nextVideoTrack;
    }

    if (nextAudioTrack && !this.publishedAudioPublication) {
      if (!this.room.isSessionActive(sessionId)) return;
      const publication = await livekitRoom.localParticipant.publishTrack(nextAudioTrack, {
        source: Track.Source.Microphone
      });
      this.publishedAudioPublication = publication;
      this.publishedAudioTrack = nextAudioTrack;
    }

    if (!this.room.isSessionActive(sessionId)) return;

    await this.syncMuteState(this.publishedAudioPublication, this.media.microphoneEnabled);
    await this.syncMuteState(this.publishedVideoPublication, this.media.cameraEnabled);
  }

  private clearDroppedPublicationRefs(): void {
    const videoTrack = this.publishedVideoPublication?.track?.mediaStreamTrack;
    if (
      this.publishedVideoPublication &&
      (!this.publishedVideoPublication.track || videoTrack?.readyState === 'ended')
    ) {
      this.publishedVideoPublication = null;
      this.publishedVideoTrack = null;
    }

    if (this.publishedAudioPublication && !this.publishedAudioPublication.track) {
      this.publishedAudioPublication = null;
      this.publishedAudioTrack = null;
    }
  }

  private async maybeUnpublish(
    kind: PublishKind,
    publication: LocalTrackPublication | null,
    publishedTrack: MediaStreamTrack | null,
    nextTrack: MediaStreamTrack | null,
    sessionId: number
  ): Promise<void> {
    if (!publication) return;

    const sourceChanged = Boolean(nextTrack) && publishedTrack !== nextTrack;
    const noLongerNeeded = !nextTrack;
    if (!sourceChanged && !noLongerNeeded) return;
    if (!this.room.isSessionActive(sessionId)) return;

    const livekitRoom = this.room.livekitRoom;
    if (!livekitRoom) return;

    try {
      if (publication.track) {
        await livekitRoom.localParticipant.unpublishTrack(publication.track);
      }
    } catch {
      // ignore: publication may already be gone remotely
    }

    if (kind === 'video') {
      this.publishedVideoPublication = null;
      this.publishedVideoTrack = null;
      return;
    }

    this.publishedAudioPublication = null;
    this.publishedAudioTrack = null;
  }

  private findPublishedTrackById(kind: PublishKind, trackId: string): LocalTrackPublication | null {
    const livekitRoom = this.room.livekitRoom;
    if (!livekitRoom) return null;

    for (const publication of livekitRoom.localParticipant.trackPublications.values()) {
      const mediaTrack = publication.track?.mediaStreamTrack;
      if (publication.kind === kind && mediaTrack && mediaTrack.id === trackId) {
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
      // ignore: next sync retries
    }
  }

  private clearPublicationRefs(): void {
    this.publishedVideoPublication = null;
    this.publishedAudioPublication = null;
    this.publishedVideoTrack = null;
    this.publishedAudioTrack = null;
  }
}
