<script lang="ts">
    import type { DeviceOption } from "$lib/camera/devices";
    import MediaPopover from "$lib/components/camera/MediaPopover.svelte";
    import type { CameraState, VideoQuality } from "camera-core";

    type Props = {
        showDebugInfo: boolean;
        showPerformance: boolean;
        selectedQuality: VideoQuality;
        selectedVideoDeviceId: string;
        selectedAudioDeviceId: string;
        videoDeviceOptions?: DeviceOption[];
        audioDeviceOptions?: DeviceOption[];
        isApplyingQuality?: boolean;
        cameraState?: CameraState;
        microphoneState?: CameraState;
        onDebugInfoToggle?: () => void | Promise<void>;
        onPerformanceToggle?: () => void | Promise<void>;
        onQualityChange?: () => void | Promise<void>;
        onVideoDeviceChange?: () => void | Promise<void>;
        onAudioDeviceChange?: () => void | Promise<void>;
    };

    let {
        showDebugInfo = $bindable(false),
        showPerformance = $bindable(false),
        selectedQuality = $bindable("480p"),
        selectedVideoDeviceId = $bindable(""),
        selectedAudioDeviceId = $bindable(""),
        videoDeviceOptions = $bindable([]),
        audioDeviceOptions = $bindable([]),
        isApplyingQuality = false,
        cameraState = "idle",
        microphoneState = "idle",
        onDebugInfoToggle,
        onPerformanceToggle,
        onQualityChange,
        onVideoDeviceChange,
        onAudioDeviceChange,
    }: Props = $props();

    const VIDEO_QUALITY_LABELS: Record<VideoQuality, string> = {
        "360p": "360p (30 fps)",
        "480p": "480p (30 fps)",
        "720p": "720p (30 fps)",
        "1080p": "1080p (60 fps)",
    };

    const hasVideoDeviceOptions = $derived(videoDeviceOptions.length > 0);
    const hasAudioDeviceOptions = $derived(audioDeviceOptions.length > 0);
</script>

<MediaPopover>
    <div class="settings-menu">
        <label class="settings-row settings-row-checkbox">
            <span class="checkbox-wrap">
                <input
                    type="checkbox"
                    bind:checked={showDebugInfo}
                    onchange={onDebugInfoToggle}
                />
                <span class="checkbox-mark" aria-hidden="true"></span>
            </span>

            <span class="settings-copy">
                <span class="settings-title">Debug Info</span>
                <span class="settings-hint">Shows device and media info</span>
            </span>
        </label>

        <label class="settings-row settings-row-checkbox">
            <span class="checkbox-wrap">
                <input
                    type="checkbox"
                    bind:checked={showPerformance}
                    onchange={onPerformanceToggle}
                />
                <span class="checkbox-mark" aria-hidden="true"></span>
            </span>

            <span class="settings-copy">
                <span class="settings-title">Show Performance</span>
                <span class="settings-hint">Shows FPS and frame timing</span>
            </span>
        </label>

        <label class="settings-row settings-row-select">
            <span class="settings-copy">
                <span class="settings-title">Video Quality</span>
                <span class="settings-hint">Changes quality</span>
            </span>

            <div class="select-wrap">
                <select
                    bind:value={selectedQuality}
                    onchange={onQualityChange}
                    disabled={isApplyingQuality || cameraState === "loading"}
                >
                    {#each Object.entries(VIDEO_QUALITY_LABELS) as [quality, label]}
                        <option value={quality}>{label}</option>
                    {/each}
                </select>
            </div>
        </label>

        <label class="settings-row settings-row-select">
            <span class="settings-copy">
                <span class="settings-title">Camera Device</span>
                <span class="settings-hint">Specific camera source</span>
            </span>

            <div class="select-wrap">
                <select
                    bind:value={selectedVideoDeviceId}
                    onchange={onVideoDeviceChange}
                    disabled={isApplyingQuality || cameraState === "loading"}
                >
                    <option value=""
                        >{hasVideoDeviceOptions
                            ? "Auto"
                            : "No cameras found"}</option
                    >
                    {#each videoDeviceOptions as device}
                        <option value={device.value}>{device.label}</option>
                    {/each}
                </select>
            </div>
        </label>

        <label class="settings-row settings-row-select">
            <span class="settings-copy">
                <span class="settings-title">Microphone Device</span>
                <span class="settings-hint">Specific input source</span>
            </span>

            <div class="select-wrap">
                <select
                    bind:value={selectedAudioDeviceId}
                    onchange={onAudioDeviceChange}
                    disabled={microphoneState === "loading"}
                >
                    <option value=""
                        >{hasAudioDeviceOptions
                            ? "System default"
                            : "No microphones found"}</option
                    >
                    {#each audioDeviceOptions as device}
                        <option value={device.value}>{device.label}</option>
                    {/each}
                </select>
            </div>
        </label>
    </div>
</MediaPopover>

<style>
    .settings-menu {
        display: grid;
        gap: 0.8rem;
        min-width: 260px;
    }

    .settings-row {
        border-radius: 12px;
        border: 1px solid rgba(255, 255, 255, 0.14);
        background: rgba(255, 255, 255, 0.04);
        padding: 0.7rem 0.8rem;
        display: flex;
        gap: 0.7rem;
        align-items: center;
    }

    .settings-row-checkbox {
        cursor: pointer;
    }

    .settings-copy {
        display: grid;
        gap: 0.2rem;
    }

    .settings-title {
        color: rgba(255, 255, 255, 0.95);
        font-size: 0.9rem;
        line-height: 1.2;
    }

    .settings-hint {
        color: rgba(255, 255, 255, 0.62);
        font-size: 0.78rem;
        line-height: 1.2;
    }

    .checkbox-wrap {
        position: relative;
        width: 20px;
        height: 20px;
        flex: 0 0 auto;
    }

    .checkbox-wrap input {
        position: absolute;
        inset: 0;
        opacity: 0;
        margin: 0;
        cursor: pointer;
    }

    .checkbox-mark {
        position: absolute;
        inset: 0;
        border-radius: 6px;
        border: 1px solid rgba(255, 255, 255, 0.3);
        background: rgba(255, 255, 255, 0.06);
        transition:
            background 180ms ease,
            border-color 180ms ease,
            box-shadow 180ms ease;
    }

    .checkbox-mark::after {
        content: "";
        position: absolute;
        left: 6px;
        top: 2px;
        width: 5px;
        height: 10px;
        border-right: 2px solid #fff;
        border-bottom: 2px solid #fff;
        transform: rotate(45deg) scale(0.7);
        opacity: 0;
        transition:
            opacity 140ms ease,
            transform 180ms ease;
    }

    .checkbox-wrap input:checked + .checkbox-mark {
        border-color: rgba(255, 255, 255, 0.65);
        background: rgba(255, 255, 255, 0.2);
        box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.12);
    }

    .checkbox-wrap input:checked + .checkbox-mark::after {
        opacity: 1;
        transform: rotate(45deg) scale(1);
    }

    .settings-row-select {
        justify-content: space-between;
        align-items: center;
        gap: 1rem;
    }

    .settings-row-select .settings-copy {
        flex: 1 1 auto;
        min-width: 0;
    }

    .select-wrap {
        flex: 0 0 auto;
        width: min(7.25rem, 34vw);
    }

    .select-wrap select {
        appearance: none;
        border: 1px solid rgba(255, 255, 255, 0.24);
        border-radius: 10px;
        background: rgba(0, 0, 0, 0.4);
        color: rgba(255, 255, 255, 0.92);
        padding: 0.45rem 0.65rem;
        font-size: 0.83rem;
        line-height: 1.2;
        width: 100%;
        min-width: 0;
        cursor: pointer;
        text-overflow: ellipsis;
        white-space: nowrap;
        overflow: hidden;
    }

    .select-wrap select:disabled {
        opacity: 0.6;
        cursor: wait;
    }

    @media (max-width: 560px) {
        .settings-row-select {
            align-items: center;
            flex-direction: row;
            gap: 0.75rem;
        }

        .settings-row-select .settings-copy {
            flex: 1 1 auto;
            min-width: 0;
        }

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
