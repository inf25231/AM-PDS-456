import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCameraConstraints,
  buildMediaConstraints,
  buildMicrophoneConstraints,
  persistCameraPreferences,
  readCameraPreferences,
  type CameraPreferences
} from '../src/lib/camera/media/core/settings.ts';
import {
  getStreamTrackDeviceId,
  normalizeSelectedDeviceId,
  type DeviceOption
} from '../src/lib/camera/media/core/devices.ts';
import { setStreamTrackEnabled, stopStream } from '../src/lib/camera/media/core/media.ts';

class MemoryStorage implements Storage {
  private data = new Map<string, string>();

  get length() {
    return this.data.size;
  }

  clear(): void {
    this.data.clear();
  }

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.data.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

function toTrackConstraints(
  value: MediaTrackConstraints | boolean | undefined
): MediaTrackConstraints {
  if (!value || typeof value === 'boolean') {
    throw new Error('Expected MediaTrackConstraints object');
  }
  return value;
}

function createStreamWithDeviceIds(deviceIds: { video?: unknown; audio?: unknown }): MediaStream {
  return {
    getVideoTracks() {
      if (deviceIds.video === undefined) return [];
      return [{ getSettings: () => ({ deviceId: deviceIds.video }) }] as MediaStreamTrack[];
    },
    getAudioTracks() {
      if (deviceIds.audio === undefined) return [];
      return [{ getSettings: () => ({ deviceId: deviceIds.audio }) }] as MediaStreamTrack[];
    }
  } as MediaStream;
}

describe('media settings', () => {
  test('readCameraPreferences returns defaults for empty storage', () => {
    const storage = new MemoryStorage();
    assert.deepEqual(readCameraPreferences(storage), {
      selectedQuality: '720p',
      selectedVideoDeviceId: '',
      selectedAudioDeviceId: ''
    });
  });

  test('readCameraPreferences falls back to 720p for invalid quality', () => {
    const storage = new MemoryStorage();
    storage.setItem('camera-video-quality', '4k');
    storage.setItem('camera-video-device-id', 'cam-1');
    storage.setItem('camera-audio-device-id', 'mic-1');

    assert.deepEqual(readCameraPreferences(storage), {
      selectedQuality: '720p',
      selectedVideoDeviceId: 'cam-1',
      selectedAudioDeviceId: 'mic-1'
    });
  });

  test('persistCameraPreferences writes all fields', () => {
    const storage = new MemoryStorage();
    const preferences: CameraPreferences = {
      selectedQuality: '480p',
      selectedVideoDeviceId: 'cam-42',
      selectedAudioDeviceId: 'mic-99'
    };

    persistCameraPreferences(storage, preferences);

    assert.equal(storage.getItem('camera-video-quality'), '480p');
    assert.equal(storage.getItem('camera-video-device-id'), 'cam-42');
    assert.equal(storage.getItem('camera-audio-device-id'), 'mic-99');
  });

  test('buildCameraConstraints includes selected video device id', () => {
    const constraints = buildCameraConstraints({
      selectedQuality: '720p',
      selectedVideoDeviceId: 'cam-7'
    });
    const video = toTrackConstraints(constraints.video);
    assert.deepEqual(video.deviceId, { exact: 'cam-7' });
  });

  test('buildCameraConstraints includes quality dimensions', () => {
    const constraints = buildCameraConstraints({
      selectedQuality: '360p',
      selectedVideoDeviceId: 'cam-2'
    });
    const video = toTrackConstraints(constraints.video);
    assert.deepEqual(video.width, { ideal: 640 });
    assert.deepEqual(video.height, { ideal: 360 });
  });

  test('buildMicrophoneConstraints uses browser default for empty device id', () => {
    const constraints = buildMicrophoneConstraints('');
    assert.equal(constraints.audio, true);
  });

  test('buildMediaConstraints uses selected audio device id', () => {
    const constraints = buildMediaConstraints({
      selectedQuality: '1080p',
      selectedVideoDeviceId: '',
      selectedAudioDeviceId: 'mic-5'
    });
    const audio = toTrackConstraints(constraints.audio);
    assert.deepEqual(audio.deviceId, { exact: 'mic-5' });
  });
});

describe('media devices', () => {
  const options: DeviceOption[] = [
    { value: 'cam-1', label: 'Camera 1' },
    { value: 'cam-2', label: 'Camera 2' }
  ];

  test('normalizeSelectedDeviceId keeps selected id when available', () => {
    assert.equal(normalizeSelectedDeviceId('cam-2', options, 'cam-1'), 'cam-2');
  });

  test('normalizeSelectedDeviceId falls back to active id', () => {
    assert.equal(normalizeSelectedDeviceId('missing', options, 'cam-1'), 'cam-1');
  });

  test('normalizeSelectedDeviceId returns empty string if nothing matches', () => {
    assert.equal(normalizeSelectedDeviceId('missing', options, 'missing-too'), '');
  });

  test('getStreamTrackDeviceId returns video device id', () => {
    const stream = createStreamWithDeviceIds({ video: 'cam-55' });
    assert.equal(getStreamTrackDeviceId(stream, 'video'), 'cam-55');
  });

  test('getStreamTrackDeviceId returns empty string for non-string settings', () => {
    const stream = createStreamWithDeviceIds({ audio: 12345 });
    assert.equal(getStreamTrackDeviceId(stream, 'audio'), '');
  });

  test('getStreamTrackDeviceId returns empty string when track is missing', () => {
    const stream = createStreamWithDeviceIds({});
    assert.equal(getStreamTrackDeviceId(stream, 'video'), '');
  });
});

describe('media runtime helpers', () => {
  test('setStreamTrackEnabled returns false when stream has no matching track', () => {
    const stream = createStreamWithDeviceIds({});
    assert.equal(setStreamTrackEnabled(stream, 'video', true), false);
  });

  test('setStreamTrackEnabled updates track.enabled and returns true', () => {
    const track = { enabled: false };
    const stream = {
      getVideoTracks: () => [track],
      getAudioTracks: () => []
    } as unknown as MediaStream;

    const changed = setStreamTrackEnabled(stream, 'video', true);
    assert.equal(changed, true);
    assert.equal(track.enabled, true);
  });

  test('stopStream stops all tracks', () => {
    let stopped = 0;
    const stream = {
      getTracks: () => [{ stop: () => (stopped += 1) }, { stop: () => (stopped += 1) }]
    } as unknown as MediaStream;

    stopStream(stream);
    assert.equal(stopped, 2);
  });
});
