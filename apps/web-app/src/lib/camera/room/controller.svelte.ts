/**
 * RoomController
 *
 * Owns LiveKit room connection lifecycle and participant tiles, including
 * remote track stream wiring and local preview tile state.
 *
 * Lifecycle:
 *   const room = new RoomController({ media, onInfo, onError, onRoomChanged });
 *   await room.create(); // or room.join()
 *   room.rebuildParticipantTiles();
 *   await room.leave(true);
 *   room.dispose();
 */

import {
  ConnectionQuality,
  Room,
  RoomEvent,
  type RemoteParticipant,
  type RemoteTrack
} from 'livekit-client';

import { createRoom, joinRoom } from './api/rooms-api.ts';
import { getRemoteMediaState } from './core/participant-media.ts';
import { getMediaErrorMessage } from '../shared/errors.ts';
import type { MediaController } from '../media/index.ts';
import { SvelteMap } from 'svelte/reactivity';

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
  media: MediaController;
  storage?: () => Storage;
  onInfo?: (message: string) => void;
  onError?: (message: string) => void;
  onRoomChanged?: (reason: RoomChangeReason) => void;
  promptRoomName?: (previous: string) => Promise<string | null> | string | null;
  promptUserName?: (previous: string) => Promise<string | null> | string | null;
}

const ROOM_NAME_STORAGE_KEY = 'amphi.room.name';
const USER_NAME_STORAGE_KEY = 'amphi.user.name';
const ROOM_DISCONNECT_TIMEOUT_MS = 1500;

export class RoomController {
  connectionState = $state<RoomConnectionState>('disconnected');
  connectionError = $state('');
  connectionStatus = $state('');
  activeRoomName = $state<string | null>(null);

  participantTiles = $state<ParticipantTile[]>([]);

  private readonly opts: RoomControllerOptions;
  private readonly media: MediaController;
  private room: Room | null = null;

  // Incremented on every connect/leave; guards stale event handlers.
  sessionId = $state(0);
  private readonly participantStreams = new SvelteMap<string, MediaStream>();
  private lastParticipantCount = 0;
  private localPreviewStream: MediaStream | null = null;

  private disposed = false;

  constructor(opts: RoomControllerOptions) {
    this.opts = opts;
    this.media = opts.media;
  }

  get isConnected(): boolean {
    return this.connectionState === 'connected';
  }

  get livekitRoom(): Room | null {
    return this.room;
  }

  async create(): Promise<void> {
    await this.startRoomFlow('create');
  }

  async join(): Promise<void> {
    await this.startRoomFlow('join');
  }

  private async startRoomFlow(mode: 'create' | 'join'): Promise<void> {
    if (this.disposed) return;

    const requestedRoomName = await this.askRoomName();
    if (!requestedRoomName) return;

    const username = await this.askUserName();
    if (!username) return;

    try {
      this.connectionState = 'connecting';
      this.connectionStatus = mode === 'create' ? 'Creating room…' : 'Joining room…';

      let roomName = requestedRoomName;
      if (mode === 'create') {
        const createdRoom = await createRoom(requestedRoomName, requestedRoomName);
        roomName = createdRoom.room.name;
      }

      await this.connect(roomName, username);
    } catch (error) {
      this.connectionState = 'error';
      this.connectionStatus = '';
      this.connectionError = getMediaErrorMessage('media', error);
      this.opts.onError?.(this.connectionError);
    }
  }

  async leave(restartMedia = false): Promise<void> {
    if (this.disposed) return;
    this.sessionId += 1;

    if (!this.room) {
      this.resetRoomState();
      this.opts.onRoomChanged?.('disconnected');
      return;
    }

    await this.disconnectRoomWithTimeout();

    this.resetRoomState();
    this.opts.onRoomChanged?.('disconnected');

    if (restartMedia) {
      try {
        await this.media.restartActiveMedia(
          Boolean(this.media.cameraStream),
          Boolean(this.media.microphoneStream)
        );
      } catch {
        // Keep current streams if restart fails.
      }
    }
  }

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
      const remoteMediaState = getRemoteMediaState(participant.trackPublications.values());

      tiles.push({
        id: identity,
        name: participant.name || identity,
        isLocal: false,
        isSpeaking: participant.isSpeaking,
        connectionQuality: this.qualityLabel(participant.connectionQuality),
        cameraOn: remoteMediaState.cameraOn,
        microphoneOn: remoteMediaState.microphoneOn,
        stream: this.participantStreams.get(identity) ?? null
      });
    }

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

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    void this.leave();
  }

  private async connect(roomName: string, username: string): Promise<void> {
    let room: Room | null = null;
    this.connectionError = '';
    this.connectionState = 'connecting';
    this.connectionStatus = 'Connecting…';

    try {
      if (this.room) {
        await this.leave(false);
      }
      this.sessionId += 1;
      const activeSession = this.sessionId;

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
      this.connectionStatus = '';
      this.lastParticipantCount = 0;

      this.rememberSession(joinResponse.room, joinResponse.username);

      if (joinResponse.username !== username) {
        this.opts.onInfo?.(`Your name was adjusted to ${joinResponse.username}.`);
      }

      // Pick up tracks that might already be subscribed.
      for (const participant of room.remoteParticipants.values()) {
        for (const pub of participant.trackPublications.values()) {
          if (pub.isSubscribed && pub.track) {
            this.addParticipantTrack(participant.identity, pub.track.mediaStreamTrack, false);
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
        // ignore cleanup failure
      }
      this.room = null;
      this.activeRoomName = null;
      const message = getMediaErrorMessage('media', error);
      this.connectionState = 'error';
      this.connectionError = message;
      this.opts.onError?.(message);
    }
  }

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
      (track: RemoteTrack, _publication, participant: RemoteParticipant) => {
        if (!isActiveSession()) return;
        this.addParticipantTrack(participant.identity, track.mediaStreamTrack);
        this.opts.onRoomChanged?.('tracks-changed');
      }
    );

    room.on(
      RoomEvent.TrackUnsubscribed,
      (track: RemoteTrack, _publication, participant: RemoteParticipant) => {
        if (!isActiveSession()) return;
        this.removeParticipantTrack(participant.identity, track.mediaStreamTrack);
        this.opts.onRoomChanged?.('tracks-changed');
      }
    );

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

  private addParticipantTrack(
    identity: string,
    mediaTrack: MediaStreamTrack,
    rebuildTiles = true
  ): void {
    const stream = this.getOrCreateParticipantStream(identity);
    for (const existingTrack of stream.getTracks()) {
      if (existingTrack.id === mediaTrack.id || existingTrack.kind === mediaTrack.kind) {
        stream.removeTrack(existingTrack);
        break;
      }
    }
    stream.addTrack(mediaTrack);
    if (rebuildTiles) this.rebuildParticipantTiles();
  }

  private removeParticipantTrack(identity: string, mediaTrack: MediaStreamTrack): void {
    const stream = this.participantStreams.get(identity);
    if (!stream) return;

    for (const existingTrack of stream.getTracks()) {
      if (existingTrack.id === mediaTrack.id || existingTrack.kind === mediaTrack.kind) {
        stream.removeTrack(existingTrack);
      }
    }

    if (stream.getTracks().length === 0) {
      this.participantStreams.delete(identity);
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

  private resetRoomState(): void {
    this.room = null;
    this.activeRoomName = null;
    this.connectionState = 'disconnected';
    this.connectionError = '';
    this.connectionStatus = '';
    this.participantStreams.clear();
    this.participantTiles = [];
    this.lastParticipantCount = 0;
    this.localPreviewStream = null;
  }

  private async disconnectRoomWithTimeout(): Promise<void> {
    if (!this.room) return;

    // Never block UI forever if disconnect hangs.
    await Promise.race([
      Promise.resolve(this.room.disconnect()),
      new Promise<void>((resolve) => window.setTimeout(resolve, ROOM_DISCONNECT_TIMEOUT_MS))
    ]);
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
    const labelFromEnum = ConnectionQuality[quality];
    if (typeof labelFromEnum === 'string') {
      return labelFromEnum.toLowerCase();
    }
    return String(quality).toLowerCase();
  }

  isSessionActive(capturedId: number): boolean {
    return capturedId === this.sessionId && this.isConnected;
  }
}
