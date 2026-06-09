<script lang="ts">
    import CameraDebugOverlay from "$lib/components/camera/CameraDebugOverlay.svelte";
    import CameraPerformanceOverlay from "$lib/components/camera/CameraPerformanceOverlay.svelte";
    import type { VideoQuality } from "camera-core";

    type Props = {
        showPerformance: boolean;
        showDebugInfo: boolean;
        performanceFps: number | null;
        performanceRenderFps: number | null;
        performanceFrameTimeMs: number | null;
        performanceResolution: {
            width: number | null;
            height: number | null;
        } | null;
        performanceTrackFrameRate: number | null;
        performanceTargetFrameRate: number | ConstrainULong | null;
        selectedQuality: VideoQuality;
        infoBrowser: string;
        infoCameraMuted: boolean;
        infoCameraName: string;
        infoMicrophoneMuted: boolean;
        infoMicrophoneLevelSnapshot: number;
        infoMicrophoneName: string;
    };

    let {
        showPerformance,
        showDebugInfo,
        performanceFps,
        performanceRenderFps,
        performanceFrameTimeMs,
        performanceResolution,
        performanceTrackFrameRate,
        performanceTargetFrameRate,
        selectedQuality,
        infoBrowser,
        infoCameraMuted,
        infoCameraName,
        infoMicrophoneMuted,
        infoMicrophoneLevelSnapshot,
        infoMicrophoneName,
    }: Props = $props();
</script>

{#if showPerformance || showDebugInfo}
    <div class="overlay-stack">
        {#if showPerformance}
            <CameraPerformanceOverlay
                measuredFps={performanceFps}
                renderFps={performanceRenderFps}
                frameTimeMs={performanceFrameTimeMs}
                resolution={performanceResolution}
                trackFrameRate={performanceTrackFrameRate}
                targetFrameRate={performanceTargetFrameRate}
                quality={selectedQuality}
            />
        {/if}

        {#if showDebugInfo}
            <CameraDebugOverlay
                browser={infoBrowser}
                cameraMuted={infoCameraMuted}
                cameraName={infoCameraName}
                microphoneMuted={infoMicrophoneMuted}
                microphoneLevel={infoMicrophoneLevelSnapshot}
                microphoneName={infoMicrophoneName}
            />
        {/if}
    </div>
{/if}

<style>
    .overlay-stack {
        position: fixed;
        top: 1rem;
        left: 1rem;
        z-index: 120;
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        pointer-events: none;
        max-width: calc(100vw - 2rem);
    }

    @media (max-width: 640px) {
        .overlay-stack {
            top: 0.75rem;
            left: 0.75rem;
            max-width: calc(100vw - 1.5rem);
        }
    }
</style>



