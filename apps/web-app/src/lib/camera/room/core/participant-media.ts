import { Track } from 'livekit-client';

export interface TrackPublicationLike {
  kind?: unknown;
  source?: unknown;
  track?: unknown;
  isMuted?: boolean;
}

export interface RemoteMediaState {
  cameraOn: boolean;
  microphoneOn: boolean;
}

export function hasEnabledTrack(
  publications: Iterable<TrackPublicationLike>,
  kind: unknown,
  source: unknown
): boolean {
  for (const publication of publications) {
    if (
      publication.kind === kind &&
      publication.source === source &&
      Boolean(publication.track) &&
      !publication.isMuted
    ) {
      return true;
    }
  }

  return false;
}

export function getRemoteMediaState(publications: Iterable<TrackPublicationLike>): RemoteMediaState {
  let cameraOn = false;
  let microphoneOn = false;

  for (const publication of publications) {
    if (!publication.track || publication.isMuted) {
      continue;
    }

    if (publication.kind === 'video' && publication.source === Track.Source.Camera) {
      cameraOn = true;
    } else if (publication.kind === 'audio' && publication.source === Track.Source.Microphone) {
      microphoneOn = true;
    }

    if (cameraOn && microphoneOn) {
      break;
    }
  }

  return { cameraOn, microphoneOn };
}
