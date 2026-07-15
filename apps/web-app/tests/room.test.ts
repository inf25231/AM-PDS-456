import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Track } from 'livekit-client';

import {
  getRemoteMediaState,
  hasEnabledTrack,
  type TrackPublicationLike
} from '../src/lib/camera/room/core/participant-media.ts';

const CAMERA_SOURCE = 'camera';
const MICROPHONE_SOURCE = 'microphone';

describe('hasEnabledTrack', () => {
  test('returns true when matching kind/source has a track and is not muted', () => {
    const publications: TrackPublicationLike[] = [
      { kind: 'video', source: CAMERA_SOURCE, track: null, isMuted: false },
      { kind: 'video', source: CAMERA_SOURCE, track: { id: 'v1' }, isMuted: false }
    ];

    assert.equal(hasEnabledTrack(publications, 'video', CAMERA_SOURCE), true);
  });

  test('returns false when matching publication is muted', () => {
    const publications: TrackPublicationLike[] = [
      { kind: 'audio', source: MICROPHONE_SOURCE, track: { id: 'a1' }, isMuted: true }
    ];

    assert.equal(hasEnabledTrack(publications, 'audio', MICROPHONE_SOURCE), false);
  });

  test('returns false when track is missing', () => {
    const publications: TrackPublicationLike[] = [
      { kind: 'audio', source: MICROPHONE_SOURCE, track: undefined, isMuted: false }
    ];

    assert.equal(hasEnabledTrack(publications, 'audio', MICROPHONE_SOURCE), false);
  });

  test('returns false when no publication matches kind/source', () => {
    const publications: TrackPublicationLike[] = [
      { kind: 'video', source: CAMERA_SOURCE, track: { id: 'v1' }, isMuted: false }
    ];

    assert.equal(hasEnabledTrack(publications, 'audio', MICROPHONE_SOURCE), false);
  });
});

describe('getRemoteMediaState', () => {
  test('returns cameraOn and microphoneOn from one publications iterable', () => {
    const publications: TrackPublicationLike[] = [
      { kind: 'video', source: Track.Source.Camera, track: { id: 'v1' }, isMuted: false },
      { kind: 'audio', source: Track.Source.Microphone, track: { id: 'a1' }, isMuted: false }
    ];

    assert.deepEqual(getRemoteMediaState(publications), {
      cameraOn: true,
      microphoneOn: true
    });
  });

  test('ignores muted or missing tracks', () => {
    const publications: TrackPublicationLike[] = [
      { kind: 'video', source: Track.Source.Camera, track: { id: 'v1' }, isMuted: true },
      { kind: 'audio', source: Track.Source.Microphone, track: null, isMuted: false }
    ];

    assert.deepEqual(getRemoteMediaState(publications), {
      cameraOn: false,
      microphoneOn: false
    });
  });
});
