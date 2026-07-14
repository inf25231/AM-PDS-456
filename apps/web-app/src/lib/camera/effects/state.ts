export type WebcamVisibility = 'visible' | 'hidden';

export type BackgroundKind = 'none' | 'image';

export interface BackgroundState {
  kind: BackgroundKind;
  imageUrl: string | null;
  imageName: string;
}

/**
 * 3D model overlay. The model is positioned and scaled relative to the
 * face landmarks; ARKit-style blendshapes drive its facial morphs.
 */
export interface ModelState {
  enabled: boolean;
  url: string | null;
  name: string;
  source: 'none' | 'demo' | 'custom';
  scale: number;
  offsetX: number;
  offsetY: number;
  rotationY: number;
}

export interface CameraEffectsState {
  webcamVisibility: WebcamVisibility;
  showLandmarksDebug: boolean;
  background: BackgroundState;
  model: ModelState;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function createDefaultCameraEffectsState(): CameraEffectsState {
  return {
    webcamVisibility: 'visible',
    showLandmarksDebug: false,
    background: {
      kind: 'none',
      imageUrl: null,
      imageName: ''
    },
    model: {
      enabled: false,
      url: null,
      name: '',
      source: 'none',
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      rotationY: 0
    }
  };
}

export function normalizeEffectsState(state: CameraEffectsState): CameraEffectsState {
  return {
    ...state,
    model: {
      ...state.model,
      scale: clamp(state.model.scale, 0.1, 5),
      offsetX: clamp(state.model.offsetX, -1, 1),
      offsetY: clamp(state.model.offsetY, -1, 1),
      rotationY: clamp(state.model.rotationY, -180, 180)
    }
  };
}

export function setBackgroundImage(previous: BackgroundState, file: File | null): BackgroundState {
  if (previous.imageUrl) {
    URL.revokeObjectURL(previous.imageUrl);
  }

  if (!file) {
    return { kind: 'none', imageUrl: null, imageName: '' };
  }

  return {
    kind: 'image',
    imageUrl: URL.createObjectURL(file),
    imageName: file.name
  };
}

export function setModelFile(previous: ModelState, file: File | null): ModelState {
  if (previous.source === 'custom' && previous.url) {
    URL.revokeObjectURL(previous.url);
  }

  if (!file) {
    return {
      ...previous,
      enabled: false,
      url: null,
      name: '',
      source: 'none'
    };
  }

  return {
    ...previous,
    enabled: true,
    url: URL.createObjectURL(file),
    name: file.name,
    source: 'custom'
  };
}

export const DEMO_RACCOON_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-tasks/face_landmarker/raccoon_head.glb';

export function setDemoModel(previous: ModelState): ModelState {
  if (previous.source === 'custom' && previous.url) {
    URL.revokeObjectURL(previous.url);
  }

  return {
    ...previous,
    enabled: true,
    url: DEMO_RACCOON_MODEL_URL,
    name: 'Raccoon head (demo)',
    source: 'demo'
  };
}
