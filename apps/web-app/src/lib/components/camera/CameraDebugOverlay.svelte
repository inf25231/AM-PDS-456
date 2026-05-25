<script lang="ts">
    type Props = {
        browser: string;
        cameraMuted: boolean;
        cameraName: string;
        microphoneMuted: boolean;
        microphoneLevel: number;
        microphoneName: string;
    };

    let {
        browser,
        cameraMuted,
        cameraName,
        microphoneMuted,
        microphoneLevel,
        microphoneName,
    }: Props = $props();

    const debugInfo = $derived({
        browser,
        cameraMuted,
        cameraName,
        microphoneMuted,
        microphoneLevel,
        microphoneName,
    });
</script>

<div class="debug-overlay">
    <pre>{JSON.stringify(debugInfo, null, 2)}</pre>
</div>

<style>
    .debug-overlay {
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
        .debug-overlay {
            font-size: 0.72rem;
        }
    }
</style>