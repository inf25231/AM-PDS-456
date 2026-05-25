<script lang="ts">
    type Props = {
        measuredFps: number | null;
        renderFps: number | null;
        frameTimeMs: number | null;
        resolution: { width: number | null; height: number | null } | null;
        trackFrameRate: number | null;
        targetFrameRate: number | ConstrainULong | null;
        quality: string;
    };

    let {
        measuredFps,
        renderFps,
        frameTimeMs,
        resolution,
        trackFrameRate,
        targetFrameRate,
        quality,
    }: Props = $props();

    const performanceInfo = $derived({
        measuredFps,
        renderFps,
        frameTimeMs,
        resolution,
        trackFrameRate,
        targetFrameRate,
        quality,
    });
</script>

<div class="performance-overlay">
    <pre>{JSON.stringify(performanceInfo, null, 2)}</pre>
</div>

<style>
    .performance-overlay {
        color: #fff;
        font-family: "Consolas", "Courier New", monospace;
        font-size: 0.78rem;
        line-height: 1.35;
        text-shadow: 0px 1px 2px rgba(0, 0, 0, 0.9);
        white-space: pre-wrap;
        max-width: 100%;
    }

    pre {
        margin: 0;
    }

    @media (max-width: 640px) {
        .performance-overlay {
            font-size: 0.72rem;
        }
    }
</style>