<!--
    CameraSettingsMenu.svelte

    Controlled settings popover for the camera page. Renders form rows for:
      - Video quality
      - Camera device
      - Microphone device

    All state changes are forwarded to the parent via `on*Change` callbacks —
    no internal mutation, no $bindable. The MediaController is the single
    source of truth.
-->
<script lang="ts">
    import type { DeviceOption } from "camera-core";
    import MediaPopover from "$lib/components/camera/MediaPopover.svelte";
    import settingsIcon from "$lib/images/settings.svg";
    import closeIcon from "$lib/images/x-close.svg";
    import type { CameraState, VideoQuality } from "camera-core";

    type Props = {
        selectedQuality: VideoQuality;
        selectedVideoDeviceId: string;
        selectedAudioDeviceId: string;
        videoDeviceOptions?: DeviceOption[];
        audioDeviceOptions?: DeviceOption[];
        isApplyingQuality?: boolean;
        cameraState?: CameraState;
        microphoneState?: CameraState;
        onQualityChange: (q: VideoQuality) => void | Promise<void>;
        onVideoDeviceChange: (id: string) => void | Promise<void>;
        onAudioDeviceChange: (id: string) => void | Promise<void>;
    };

    let {
        selectedQuality,
        selectedVideoDeviceId,
        selectedAudioDeviceId,
        videoDeviceOptions = [],
        audioDeviceOptions = [],
        isApplyingQuality = false,
        cameraState = "idle",
        microphoneState = "idle",
        onQualityChange,
        onVideoDeviceChange,
        onAudioDeviceChange,
    }: Props = $props();

    // Resolution only -- the delivered frame rate is capped separately by
    // COMPOSITION_FPS (see constants.ts) and doesn't change with quality, so
    // no fps claim belongs in this label.
    const VIDEO_QUALITY_LABELS: Record<VideoQuality, string> = {
        "360p": "360p",
        "480p": "480p",
        "720p": "720p",
        "1080p": "1080p",
    };

    const hasVideoDeviceOptions = $derived(videoDeviceOptions.length > 0);
    const hasAudioDeviceOptions = $derived(audioDeviceOptions.length > 0);

    const isCameraBusy = $derived(isApplyingQuality || cameraState === "loading");
    const isMicBusy = $derived(microphoneState === "loading");
</script>

<MediaPopover openIcon={settingsIcon} closeIcon={closeIcon}>
    <div class="settings-menu">
        <label class="settings-row">
            <span class="settings-copy">
                <span class="settings-title">Video Quality</span>
                <span class="settings-hint">Changes quality</span>
            </span>
            <span class="select-wrap">
                <select
                        value={selectedQuality}
                        onchange={(e) => onQualityChange(e.currentTarget.value as VideoQuality)}
                        disabled={isCameraBusy}
                >
                    {#each Object.entries(VIDEO_QUALITY_LABELS) as [quality, label]}
                        <option value={quality}>{label}</option>
                    {/each}
                </select>
            </span>
        </label>

        <label class="settings-row">
            <span class="settings-copy">
                <span class="settings-title">Camera Device</span>
                <span class="settings-hint">Specific camera source</span>
            </span>
            <span class="select-wrap">
                <select
                        value={selectedVideoDeviceId}
                        onchange={(e) => onVideoDeviceChange(e.currentTarget.value)}
                        disabled={isCameraBusy}
                >
                    <option value="">
                        {hasVideoDeviceOptions ? "Auto" : "No cameras found"}
                    </option>
                    {#each videoDeviceOptions as device}
                        <option value={device.value}>{device.label}</option>
                    {/each}
                </select>
            </span>
        </label>

        <label class="settings-row">
            <span class="settings-copy">
                <span class="settings-title">Microphone Device</span>
                <span class="settings-hint">Specific input source</span>
            </span>
            <span class="select-wrap">
                <select
                        value={selectedAudioDeviceId}
                        onchange={(e) => onAudioDeviceChange(e.currentTarget.value)}
                        disabled={isMicBusy}
                >
                    <option value="">
                        {hasAudioDeviceOptions ? "System default" : "No microphones found"}
                    </option>
                    {#each audioDeviceOptions as device}
                        <option value={device.value}>{device.label}</option>
                    {/each}
                </select>
            </span>
        </label>
    </div>
</MediaPopover>

<style>
    .settings-menu {
        display: grid;
        gap: 0;
        min-width: 300px;
    }

    .settings-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        padding: 0.75rem 0;
    }

    .settings-row + .settings-row {
        border-top: 1px solid var(--surface-border);
    }
    .settings-copy {
        display: grid;
        gap: 0.15rem;
        flex: 1 1 auto;
        min-width: 0;
    }

    .settings-title {
        color: var(--text-primary);
        font-size: 0.9rem;
        line-height: 1.2;
    }

    .settings-hint {
        color: var(--text-secondary);
        font-size: 0.78rem;
        line-height: 1.2;
    }

    .select-wrap {
        flex: 0 0 auto;
        width: 50%;
    }

    .select-wrap select {
        appearance: none;
        width: 100%;
        min-width: 0;
        padding: 0.45rem 0.65rem;
        background: var(--surface-bg-soft);
        border: 1px solid var(--surface-border);
        border-radius: var(--surface-radius-inner);
        color: var(--text-primary);
        font-size: 0.83rem;
        line-height: 1.2;
        cursor: pointer;
        text-overflow: ellipsis;
        white-space: nowrap;
        overflow: hidden;
        transition: border-color 160ms ease, background 160ms ease;
    }

    .select-wrap select:hover:not(:disabled) {
        border-color: rgba(255, 255, 255, 0.28);
    }

    .select-wrap select:focus-visible {
        outline: none;
        border-color: rgba(255, 255, 255, 0.45);
        background: rgba(255, 255, 255, 0.08);
    }

    .select-wrap select:disabled {
        opacity: 0.5;
        cursor: wait;
    }

    @media (max-width: 560px) {
        .select-wrap {
            width: min(6.5rem, 30vw);
        }

        .settings-title {
            font-size: 0.85rem;
        }

        .settings-hint {
            font-size: 0.74rem;
        }
    }
</style>