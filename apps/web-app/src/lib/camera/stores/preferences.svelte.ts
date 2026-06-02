import {
    readCameraPreferences,
    persistCameraPreferences,
    type CameraPreferences,
} from "$lib/camera/settings";
import type { VideoQuality } from "camera-core";

/**
 * Reactive store for user camera preferences.
 *
 * Owns the five persistent settings that survive page reloads:
 * - `showDebugInfo` / `showPerformance`: overlay visibility toggles
 * - `selectedQuality`: video quality preset
 * - `selectedVideoDeviceId` / `selectedAudioDeviceId`: chosen hardware IDs
 *
 * ### Usage
 * ```ts
 * const prefs = new PreferencesStore();
 *
 * // Hydrate from localStorage during onMount:
 * prefs.load(localStorage);
 *
 * // Write back whenever a setting changes:
 * prefs.persist(localStorage);
 *
 * // Pass the current state to constraint builders:
 * buildCameraConstraints(prefs.snapshot);
 * ```
 */
export class PreferencesStore {
    showDebugInfo = $state(false);
    showPerformance = $state(false);
    selectedQuality = $state<VideoQuality>("480p");
    selectedVideoDeviceId = $state("");
    selectedAudioDeviceId = $state("");

    /**
     * Returns the current preferences as a plain `CameraPreferences` object.
     *
     * Used by constraint builders and handlers that need a snapshot of the
     * current settings without a reactive dependency on the store instance.
     */
    get snapshot(): CameraPreferences {
        return {
            showDebugInfo: this.showDebugInfo,
            showPerformance: this.showPerformance,
            selectedQuality: this.selectedQuality,
            selectedVideoDeviceId: this.selectedVideoDeviceId,
            selectedAudioDeviceId: this.selectedAudioDeviceId,
        };
    }

    /**
     * Hydrates all preferences from `localStorage` on page mount.
     *
     * Applies compatibility fallbacks for older storage keys automatically
     * via `readCameraPreferences`.
     */
    load(storage: Storage) {
        const prefs = readCameraPreferences(storage);
        this.showDebugInfo = prefs.showDebugInfo;
        this.showPerformance = prefs.showPerformance;
        this.selectedQuality = prefs.selectedQuality;
        this.selectedVideoDeviceId = prefs.selectedVideoDeviceId;
        this.selectedAudioDeviceId = prefs.selectedAudioDeviceId;
    }

    /**
     * Writes the current preferences to `localStorage`.
     *
     * Call this after any user-facing preference change so the state survives
     * page reloads.
     */
    persist(storage: Storage) {
        persistCameraPreferences(storage, this.snapshot);
    }
}

