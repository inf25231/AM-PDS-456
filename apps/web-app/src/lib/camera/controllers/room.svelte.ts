// src/lib/camera/controllers/room.svelte.ts

/**
 * RoomController
 *
 * Reactive (Svelte 5 runes) controller for the LiveKit room lifecycle.
 *
 * Responsibilities:
 *  - Owns the LiveKit Room instance and connection state.
 *  - Handles create / join / leave flows, including the "ensure media is ready"
 *    pre-call step delegated to MediaController.
 *  - Registers LiveKit room events and translates them into reactive state
 *    the UI can render directly (participantTiles).
 *  - Tracks remote participant MediaStreams in a dedicated Map so <video>
 *    elements can bind to a single stable stream per participant.
 *  - Uses a monotonically increasing session id so events from previous
 *    rooms cannot corrupt state after a fast reconnect.
 *
 * Lifecycle:
 *   const room = new RoomController({
 *       media,
 *       storage: () => localStorage,
 *       onInfo: (msg) => banner.showInfo(msg),
 *       onError: (msg) => banner.showError(msg),
 *   });
 *   await room.create();
 *   await room.join();
 *   await room.leave();
 *   room.dispose();
 */

import {
  ConnectionQuality,
  Room,
  RoomEvent,
  Track,
  type Participant,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication
} from 'livekit-client';

import { createRoom, joinRoom } from '$lib/calls/rooms-api';
import { getMediaErrorMessage } from '$lib/camera/errors';
import type { MediaController } from './media.svelte.js';
import { SvelteMap } from 'svelte/reactivity';

// ----------------------------------------------------------------------
// Public types
// ----------------------------------------------------------------------

export type RoomConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface ParticipantTile {
  id: string;
  name: string;
  isLocal: boolean;
  isSpeaking: boolean;
  connectionQuality: string;
  cameraOn: boolean;
  microphoneOn: boolean;
  stream: MediaStream | null;
}

export type RoomChangeReason =
  | 'connected'
  | 'disconnected'
  | 'participant-joined'
  | 'participant-left'
  | 'tracks-changed'
  | 'media-toggled';

export interface RoomControllerOptions {
  /** The MediaController whose streams will be used for the call. */
  media: MediaController;

  /** Storage used for remembering the last room/user name. Defaults to localStorage. */
  storage?: () => Storage;

  /**
   * Called whenever the UI should show an info banner (e.g. "X joined").
   */
  onInfo?: (message: string) => void;

  /**
   * Called whenever the UI should show an error (connection failed, etc.).
   */
  onError?: (message: string) => void;

  /**
   * Called after any change that the publishing layer should react to.
   */
  onRoomChanged?: (reason: RoomChangeReason) => void;

  /**
   * Async function that asks the user for the room name. Defaults to
   * window.prompt(). Override for custom UI.
   */
  promptRoomName?: (previous: string) => Promise<string | null> | string | null;

  /**
   * Async function that asks the user for their display name. Defaults to
   * window.prompt(). Override for custom UI.
   */
  promptUserName?: (previous: string) => Promise<string | null> | string | null;
}

const ROOM_NAME_STORAGE_KEY = 'amphi.room.name';
const USER_NAME_STORAGE_KEY = 'amphi.user.name';

// ----------------------------------------------------------------------
// Controller
// ----------------------------------------------------------------------

export class RoomController {
  // --- Connection state ---
  connectionState = $state<RoomConnectionState>('disconnected');
  connectionError = $state('');
  activeRoomName = $state<string | null>(null);

  // --- Participants ---
  participantTiles = $state<ParticipantTile[]>([]);

  // --- Internals ---
  private readonly opts: RoomControllerOptions;
  private readonly media: MediaController;

  /** The current LiveKit Room instance, or null when disconnected. */
  private room: Room | null = null;

  /**
   * Monotonic id incremented on every connect / leave. LiveKit event handlers
   * capture the id at registration time and skip if it has moved on — this
   * prevents events from a previous room (still draining) from mutating new
   * state.
   */
  sessionId = $state(0);

  /** Remote participant streams, keyed by participant identity. */
  private readonly participantStreams = new SvelteMap<string, MediaStream>();

  /** Previous participant count, used to emit join/leave info banners. */
  private lastParticipantCount = 0;

  /** Optional MediaStream used by the local preview tile. */
  private localPreviewStream: MediaStream | null = null;

  private disposed = false;

  constructor(opts: RoomControllerOptions) {
    this.opts = opts;
    this.media = opts.media;
  }

  // ==================================================================
  // Public API
  // ==================================================================

  /** True while the controller is connected to a room. */
  get isConnected(): boolean {
    return this.connectionState === 'connected';
  }

  /** The underlying LiveKit room, or null when disconnected. Read-only escape hatch. */
  get livekitRoom(): Room | null {
    return this.room;
  }

  /**
   * Create a brand-new room and join it.
   *
   * Prompts the user for the room name and their display name, ensures
   * camera + microphone are ready, then connects.
   */
  async create(): Promise<void> {
    if (this.disposed) return;

    const requestedRoomName = await this.askRoomName();
    if (!requestedRoomName) return;

    const username = await this.askUserName();
    if (!username) return;

    try {
      await this.media.ensureReadyForCall();
      const createdRoom = await createRoom(requestedRoomName, requestedRoomName);
      await this.connect(createdRoom.room.name, username);
    } catch (error) {
      this.connectionState = 'error';
      this.connectionError = getMediaErrorMessage('media', error);
      this.opts.onError?.(this.connectionError);
    }
  }

  /**
   * Join an existing room.
   *
   * Prompts the user for the room name and their display name, ensures
   * camera + microphone are ready, then connects.
   */
  async join(): Promise<void> {
    if (this.disposed) return;

    const roomName = await this.askRoomName();
    if (!roomName) return;

    const username = await this.askUserName();
    if (!username) return;

    try {
      await this.media.ensureReadyForCall();
      await this.connect(roomName, username);
    } catch (error) {
      this.connectionState = 'error';
      this.connectionError = getMediaErrorMessage('media', error);
      this.opts.onError?.(this.connectionError);
    }
  }

  /**
   * Leave the current room. Safe to call when already disconnected.
   *
   * Pass `restartMedia: true` to fully recycle the local camera + microphone
   * streams after leaving (recovery flow). The default is a clean leave.
   */
  async leave(options: { restartMedia?: boolean } = {}): Promise<void> {
    if (this.disposed) return;

    const { restartMedia = false } = options;
    this.sessionId += 1;

    if (!this.room) {
      this.resetRoomState();
      this.opts.onRoomChanged?.('disconnected');
      return;
    }

    // Race the disconnect against a short timeout so the UI never freezes
    // waiting for a stuck server connection to acknowledge.
    await Promise.race([
      Promise.resolve(this.room.disconnect()),
      new Promise((resolve) => window.setTimeout(resolve, 1500))
    ]);

    this.resetRoomState();
    this.opts.onRoomChanged?.('disconnected');

    if (restartMedia) {
      try {
        await this.media.restartActiveMedia({
          restartCamera: Boolean(this.media.cameraStream),
          restartMicrophone: Boolean(this.media.microphoneStream)
        });
      } catch {
        // Keep current streams if restart fails — the user can still
        // toggle them manually from the controls.
      }
    }
  }

  /**
   * Rebuild the visible participant tile list from the current LiveKit
   * room state. Safe to call any time; cheap when nothing changed.
   */
  rebuildParticipantTiles(): void {
    if (!this.room || !this.isConnected) {
      this.participantTiles = [];
      return;
    }

    const local = this.room.localParticipant;
    const tiles: ParticipantTile[] = [
      {
        id: local.identity || 'local',
        name: local.name || local.identity || 'You',
        isLocal: true,
        isSpeaking: local.isSpeaking,
        connectionQuality: this.qualityLabel(local.connectionQuality),
        cameraOn: this.media.cameraEnabled,
        microphoneOn: this.media.microphoneEnabled,
        stream: this.buildLocalPreviewStream()
      }
    ];

    for (const participant of this.room.remoteParticipants.values()) {
      const identity = participant.identity;

      const hasRemoteCamera = [...participant.trackPublications.values()].some(
        (p) =>
          p.kind === 'video' && p.source === Track.Source.Camera && Boolean(p.track) && !p.isMuted
      );
      const hasRemoteMic = [...participant.trackPublications.values()].some(
        (p) =>
          p.kind === 'audio' &&
          p.source === Track.Source.Microphone &&
          Boolean(p.track) &&
          !p.isMuted
      );

      tiles.push({
        id: identity,
        name: participant.name || identity,
        isLocal: false,
        isSpeaking: participant.isSpeaking,
        connectionQuality: this.qualityLabel(participant.connectionQuality),
        cameraOn: hasRemoteCamera,
        microphoneOn: hasRemoteMic,
        stream: this.participantStreams.get(identity) ?? null
      });
    }

    // Emit join/leave info banners based on count changes.
    if (this.isConnected && this.lastParticipantCount !== 0) {
      if (tiles.length > this.lastParticipantCount) {
        this.opts.onInfo?.('A participant joined the room.');
      } else if (tiles.length < this.lastParticipantCount) {
        this.opts.onInfo?.('A participant left the room.');
      }
    }
    this.lastParticipantCount = tiles.length;

    this.participantTiles = tiles;
  }

  /** Dispose the controller. Disconnects and clears all state. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    void this.leave();
  }

  // ==================================================================
  // Connection internals
  // ==================================================================

  /**
   * Low-level connect path used by both `create()` and `join()`.
   */
  private async connect(roomName: string, username: string): Promise<void> {
    this.sessionId += 1;
    let activeSession = this.sessionId;

    let room: Room | null = null;
    this.connectionError = '';
    this.connectionState = 'connecting';

    try {
      if (this.room) {
        await this.leave({ restartMedia: false });
        // Allocate a fresh session id after the forced leave.
        this.sessionId += 1;
        activeSession = this.sessionId;
      }

      const joinResponse = await joinRoom(roomName, username);
      room = new Room({
        adaptiveStream: true,
        dynacast: true
      });

      this.room = room;
      this.registerRoomEvents(room, activeSession);

      await room.connect(joinResponse.livekitUrl, joinResponse.token);
      this.activeRoomName = joinResponse.room;
      this.connectionState = 'connected';
      this.lastParticipantCount = 0;

      this.rememberSession(joinResponse.room, joinResponse.username);

      if (joinResponse.username !== username) {
        this.opts.onInfo?.(`Your name was adjusted to ${joinResponse.username}.`);
      }

      // Seed any tracks already subscribed before our event handlers
      // were attached (rare but possible for fast-connecting peers).
      for (const participant of room.remoteParticipants.values()) {
        for (const pub of participant.trackPublications.values()) {
          if (pub.isSubscribed && pub.track) {
            this.addTrackToParticipantStream(participant, pub.track);
          }
        }
      }

      this.opts.onRoomChanged?.('connected');
      this.rebuildParticipantTiles();
      this.opts.onInfo?.(`Connected to room ${joinResponse.room}.`);
    } catch (error) {
      try {
        await room?.disconnect();
      } catch {
        // Ignore cleanup failures after a failed join attempt.
      }
      this.room = null;
      this.activeRoomName = null;
      const message = getMediaErrorMessage('media', error);
      this.connectionState = 'error';
      this.connectionError = message;
      this.opts.onError?.(message);
    }
  }

  /**
   * Register LiveKit event handlers for a freshly connected room.
   * All handlers verify the captured session id before mutating state.
   */
  private registerRoomEvents(room: Room, sessionId: number): void {
    const isActiveSession = () => sessionId === this.sessionId && room === this.room;

    room.on(RoomEvent.ParticipantConnected, () => {
      if (!isActiveSession()) return;
      this.rebuildParticipantTiles();
      this.opts.onRoomChanged?.('participant-joined');
    });

    room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
      if (!isActiveSession()) return;
      this.participantStreams.delete(participant.identity);
      this.rebuildParticipantTiles();
      this.opts.onRoomChanged?.('participant-left');
    });

    room.on(
      RoomEvent.TrackSubscribed,
      (
        track: RemoteTrack,
        _publication: RemoteTrackPublication,
        participant: RemoteParticipant
      ) => {
        if (!isActiveSession()) return;
        this.addTrackToParticipantStream(participant, track);
        this.opts.onRoomChanged?.('tracks-changed');
      }
    );

    room.on(
      RoomEvent.TrackUnsubscribed,
      (
        track: RemoteTrack,
        _publication: RemoteTrackPublication,
        participant: RemoteParticipant
      ) => {
        if (!isActiveSession()) return;
        this.removeTrackFromParticipantStream(participant, track);
        this.opts.onRoomChanged?.('tracks-changed');
      }
    );

    // Mute / unmute events are noisy but cheap — rebuild tiles so the
    // mic/camera badges stay correct without flicker.
    const muteEvents = [
      RoomEvent.TrackMuted,
      RoomEvent.TrackUnmuted,
      RoomEvent.LocalTrackPublished,
      RoomEvent.LocalTrackUnpublished,
      RoomEvent.TrackPublished,
      RoomEvent.TrackUnpublished
    ];
    for (const evt of muteEvents) {
      room.on(evt, () => {
        if (!isActiveSession()) return;
        this.rebuildParticipantTiles();
        this.opts.onRoomChanged?.('media-toggled');
      });
    }

    room.on(RoomEvent.Disconnected, () => {
      if (sessionId !== this.sessionId) return;
      this.connectionState = 'disconnected';
      this.opts.onInfo?.('You left the room.');
      this.resetRoomState();
      this.opts.onRoomChanged?.('disconnected');
    });
  }

  // ==================================================================
  // Participant stream bookkeeping
  // ==================================================================

  private addTrackToParticipantStream(
    participant: Participant | RemoteParticipant,
    track: unknown
  ): void {
    const mediaTrack = this.toMediaStreamTrack(track);
    if (!mediaTrack) return;

    const stream = this.getOrCreateParticipantStream(participant.identity);
    const existing = stream
      .getTracks()
      .find((item) => item.id === mediaTrack.id || item.kind === mediaTrack.kind);
    if (existing) {
      stream.removeTrack(existing);
    }
    stream.addTrack(mediaTrack);
    this.rebuildParticipantTiles();
  }

  private removeTrackFromParticipantStream(
    participant: Participant | RemoteParticipant,
    track: unknown
  ): void {
    const mediaTrack = this.toMediaStreamTrack(track);
    if (!mediaTrack) return;

    const stream = this.participantStreams.get(participant.identity);
    if (!stream) return;

    for (const item of stream.getTracks()) {
      if (item.id === mediaTrack.id || item.kind === mediaTrack.kind) {
        stream.removeTrack(item);
      }
    }

    if (stream.getTracks().length === 0) {
      this.participantStreams.delete(participant.identity);
    }

    this.rebuildParticipantTiles();
  }

  private getOrCreateParticipantStream(identity: string): MediaStream {
    const existing = this.participantStreams.get(identity);
    if (existing) return existing;

    const stream = new MediaStream();
    this.participantStreams.set(identity, stream);
    return stream;
  }

  private buildLocalPreviewStream(): MediaStream | null {
    const videoTrack = this.media.cameraStream?.getVideoTracks()[0] ?? null;
    const audioTrack = this.media.microphoneStream?.getAudioTracks()[0] ?? null;

    if (!videoTrack && !audioTrack) {
      this.localPreviewStream = null;
      return null;
    }

    const stream = this.localPreviewStream ?? new MediaStream();
    const currentVideoTrack = stream.getVideoTracks()[0] ?? null;
    const currentAudioTrack = stream.getAudioTracks()[0] ?? null;

    if (!videoTrack && currentVideoTrack) {
      stream.removeTrack(currentVideoTrack);
    }
    if (videoTrack && (!currentVideoTrack || currentVideoTrack.id !== videoTrack.id)) {
      if (currentVideoTrack) stream.removeTrack(currentVideoTrack);
      stream.addTrack(videoTrack);
    }

    if (!audioTrack && currentAudioTrack) {
      stream.removeTrack(currentAudioTrack);
    }
    if (audioTrack && (!currentAudioTrack || currentAudioTrack.id !== audioTrack.id)) {
      if (currentAudioTrack) stream.removeTrack(currentAudioTrack);
      stream.addTrack(audioTrack);
    }

    this.localPreviewStream = stream;
    return stream;
  }

  // ==================================================================
  // Helpers
  // ==================================================================

  private resetRoomState(): void {
    this.room = null;
    this.activeRoomName = null;
    this.connectionState = 'disconnected';
    this.connectionError = '';
    this.participantStreams.clear();
    this.participantTiles = [];
    this.lastParticipantCount = 0;
    this.localPreviewStream = null;
  }

  private rememberSession(roomName: string, userName: string): void {
    const storage = this.getStorage();
    if (!storage) return;
    try {
      storage.setItem(ROOM_NAME_STORAGE_KEY, roomName);
      storage.setItem(USER_NAME_STORAGE_KEY, userName);
    } catch {
      // Ignore storage failures.
    }
  }

  private getStorage(): Storage | null {
    try {
      if (this.opts.storage) return this.opts.storage();
      if (typeof localStorage !== 'undefined') return localStorage;
    } catch {
      // Storage may be blocked.
    }
    return null;
  }

  private async askRoomName(): Promise<string> {
    const previous = this.getStorage()?.getItem(ROOM_NAME_STORAGE_KEY) || '';

    if (this.opts.promptRoomName) {
      const result = await this.opts.promptRoomName(previous);
      return (result ?? '').trim();
    }

    if (typeof window === 'undefined') return '';
    return window.prompt('Room name', previous || 'amphi-room')?.trim() || '';
  }

  private async askUserName(): Promise<string> {
    const previous = this.getStorage()?.getItem(USER_NAME_STORAGE_KEY) || '';

    if (this.opts.promptUserName) {
      const result = await this.opts.promptUserName(previous);
      return (result ?? '').trim();
    }

    if (typeof window === 'undefined') return '';
    return window.prompt('Your name', previous || 'guest')?.trim() || '';
  }

  private qualityLabel(quality: ConnectionQuality | undefined): string {
    if (quality === undefined) return 'unknown';
    const label =
      typeof quality === 'number'
        ? String((ConnectionQuality as unknown as Record<number, string>)[quality] || 'unknown')
        : String(quality);
    return label.toLowerCase();
  }

  private toMediaStreamTrack(track: unknown): MediaStreamTrack | null {
    if (!track || typeof track !== 'object') return null;
    const maybe = (track as { mediaStreamTrack?: MediaStreamTrack }).mediaStreamTrack;
    return maybe instanceof MediaStreamTrack ? maybe : null;
  }

  /**
   * Returns true if the given captured session id still matches the current
   * session AND the controller is connected. Used by other controllers
   * (PublishController, EffectsController) to abort long-running async work
   * after a disconnect or reconnect.
   */
  isSessionActive(capturedId: number): boolean {
    return capturedId === this.sessionId && this.isConnected;
  }
}
