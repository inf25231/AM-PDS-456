export type CameraEffectMode = "off" | "funny-mask" | "mask-3d";

export interface EffectFeaturePlacement {
    alpha: number;
    offsetX: number;
    offsetY: number;
    scale: number;
}

export interface EffectAsset {
    url: string | null;
    name: string;
    opacity: number;
    offsetX: number;
    offsetY: number;
    scale: number;
}

export interface CameraEffectsState {
    showLandmarksDebug: boolean;
    mode: CameraEffectMode;
    overlayBackgroundAlpha: number;
    eyes: EffectFeaturePlacement;
    mouth: EffectFeaturePlacement;
    funnyMask: EffectAsset;
    mask3d: EffectAsset;
    background: EffectAsset;
}

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

export function createDefaultCameraEffectsState(): CameraEffectsState {
    return {
        showLandmarksDebug: false,
        mode: "off",
        overlayBackgroundAlpha: 0.18,
        eyes: {
            alpha: 1,
            offsetX: 0,
            offsetY: 0,
            scale: 1.5,
        },
        mouth: {
            alpha: 1,
            offsetX: 0,
            offsetY: 0,
            scale: 1.35,
        },
        funnyMask: {
            url: null,
            name: "",
            opacity: 1,
            offsetX: 0,
            offsetY: 0,
            scale: 1.38,
        },
        mask3d: {
            url: null,
            name: "",
            opacity: 0.92,
            offsetX: 0,
            offsetY: 0,
            scale: 1.06,
        },
        background: {
            url: null,
            name: "",
            opacity: 1,
            offsetX: 0,
            offsetY: 0,
            scale: 1,
        },
    };
}

export function normalizeEffectsState(state: CameraEffectsState): CameraEffectsState {
    return {
        ...state,
        overlayBackgroundAlpha: clamp(state.overlayBackgroundAlpha, 0, 1),
        eyes: {
            ...state.eyes,
            alpha: clamp(state.eyes.alpha, 0, 1),
            scale: clamp(state.eyes.scale, 0.5, 3),
            offsetX: clamp(state.eyes.offsetX, -0.75, 0.75),
            offsetY: clamp(state.eyes.offsetY, -0.75, 0.75),
        },
        mouth: {
            ...state.mouth,
            alpha: clamp(state.mouth.alpha, 0, 1),
            scale: clamp(state.mouth.scale, 0.5, 3),
            offsetX: clamp(state.mouth.offsetX, -0.75, 0.75),
            offsetY: clamp(state.mouth.offsetY, -0.75, 0.75),
        },
        funnyMask: {
            ...state.funnyMask,
            opacity: clamp(state.funnyMask.opacity, 0, 1),
            scale: clamp(state.funnyMask.scale, 0.5, 3),
            offsetX: clamp(state.funnyMask.offsetX, -0.75, 0.75),
            offsetY: clamp(state.funnyMask.offsetY, -0.75, 0.75),
        },
        mask3d: {
            ...state.mask3d,
            opacity: clamp(state.mask3d.opacity, 0, 1),
            scale: clamp(state.mask3d.scale, 0.5, 3),
            offsetX: clamp(state.mask3d.offsetX, -0.75, 0.75),
            offsetY: clamp(state.mask3d.offsetY, -0.75, 0.75),
        },
        background: {
            ...state.background,
            opacity: clamp(state.background.opacity, 0, 1),
            scale: clamp(state.background.scale, 0.5, 3),
            offsetX: clamp(state.background.offsetX, -0.75, 0.75),
            offsetY: clamp(state.background.offsetY, -0.75, 0.75),
        },
    };
}

export function updateEffectAsset(
    previousAsset: EffectAsset,
    file: File | null,
): EffectAsset {
    if (previousAsset.url) {
        URL.revokeObjectURL(previousAsset.url);
    }

    if (!file) {
        return {
            ...previousAsset,
            url: null,
            name: "",
        };
    }

    return {
        ...previousAsset,
        url: URL.createObjectURL(file),
        name: file.name,
    };
}


