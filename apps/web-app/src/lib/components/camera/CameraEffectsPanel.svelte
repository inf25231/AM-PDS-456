<script lang="ts">
    import type { CameraEffectsState, CameraEffectMode } from "$lib/camera/effects";

    type Props = {
        open: boolean;
        effects: CameraEffectsState;
        publishMaskOnly?: boolean;
        onClose?: () => void;
        onUploadFunnyMask?: (file: File | null) => void;
        onUploadMask3d?: (file: File | null) => void;
        onUploadBackground?: (file: File | null) => void;
        onPublishMaskOnlyToggle?: () => void;
    };

    let {
        open = false,
        effects = $bindable(),
        publishMaskOnly = $bindable(false),
        onClose,
        onUploadFunnyMask,
        onUploadMask3d,
        onUploadBackground,
        onPublishMaskOnlyToggle,
    }: Props = $props();

    function handleModeChange(mode: CameraEffectMode) {
        effects.mode = mode;
    }

    function formatPercent(value: number) {
        return `${Math.round(value * 100)}%`;
    }
</script>

{#if open}
    <div class="effects-panel popover-panel" role="dialog" aria-label="Camera effects" id="camera-effects-panel">
        <div class="effects-panel-header">
            <h3>Effects</h3>
            <button type="button" onclick={onClose} aria-label="Close effects panel">x</button>
        </div>

        <section class="effects-group">
            <label class="row row-checkbox">
                <input type="checkbox" bind:checked={effects.showLandmarksDebug} />
                <span>Show landmarks debug</span>
            </label>

            <label class="row row-checkbox">
                <input
                    type="checkbox"
                    bind:checked={publishMaskOnly}
                    onchange={onPublishMaskOnlyToggle}
                />
                <span>Hide camera image (mask output only)</span>
            </label>

            <label class="row">
                <span>Overlay background alpha ({formatPercent(effects.overlayBackgroundAlpha)})</span>
                <input type="range" min="0" max="1" step="0.01" bind:value={effects.overlayBackgroundAlpha} />
            </label>
        </section>

        <section class="effects-group">
            <div class="group-title">Active mode (only one at a time)</div>
            <label class="row row-radio">
                <input
                    type="radio"
                    name="effectMode"
                    checked={effects.mode === "off"}
                    onchange={() => handleModeChange("off")}
                />
                <span>Off</span>
            </label>
            <label class="row row-radio">
                <input
                    type="radio"
                    name="effectMode"
                    checked={effects.mode === "funny-mask"}
                    onchange={() => handleModeChange("funny-mask")}
                />
                <span>Funny mask (PNG/JPG)</span>
            </label>
            <label class="row row-radio">
                <input
                    type="radio"
                    name="effectMode"
                    checked={effects.mode === "mask-3d"}
                    onchange={() => handleModeChange("mask-3d")}
                />
                <span>3D mask (GLB/GLTF)</span>
            </label>
        </section>

        <section class="effects-group">
            <div class="group-title">Upload your files (client-side only)</div>
            <label class="row">
                <span>Funny mask image</span>
                <input type="file" accept="image/*" onchange={(event) => onUploadFunnyMask?.((event.currentTarget as HTMLInputElement).files?.[0] ?? null)} />
            </label>
            <div class="hint">{effects.funnyMask.name || "No funny mask uploaded"}</div>

            <label class="row">
                <span>3D mask model (.glb or .gltf)</span>
                <input type="file" accept=".glb,.gltf,model/gltf+json,model/gltf-binary" onchange={(event) => onUploadMask3d?.((event.currentTarget as HTMLInputElement).files?.[0] ?? null)} />
            </label>
            <div class="hint">{effects.mask3d.name || "No 3D mask file uploaded"}</div>

            <label class="row">
                <span>Background image</span>
                <input type="file" accept="image/*" onchange={(event) => onUploadBackground?.((event.currentTarget as HTMLInputElement).files?.[0] ?? null)} />
            </label>
            <div class="hint">{effects.background.name || "No background uploaded"}</div>
        </section>

        <section class="effects-group">
            <div class="group-title">Mask placement</div>
            <label class="row">
                <span>Background opacity ({formatPercent(effects.background.opacity)})</span>
                <input type="range" min="0" max="1" step="0.01" bind:value={effects.background.opacity} />
            </label>
            <label class="row">
                <span>Background scale ({effects.background.scale.toFixed(2)}x)</span>
                <input type="range" min="0.5" max="2.4" step="0.01" bind:value={effects.background.scale} />
            </label>
            <label class="row">
                <span>Background offset X ({effects.background.offsetX.toFixed(2)})</span>
                <input type="range" min="-0.5" max="0.5" step="0.01" bind:value={effects.background.offsetX} />
            </label>
            <label class="row">
                <span>Background offset Y ({effects.background.offsetY.toFixed(2)})</span>
                <input type="range" min="-0.5" max="0.5" step="0.01" bind:value={effects.background.offsetY} />
            </label>
            <label class="row">
                <span>Funny mask opacity ({formatPercent(effects.funnyMask.opacity)})</span>
                <input type="range" min="0" max="1" step="0.01" bind:value={effects.funnyMask.opacity} />
            </label>
            <label class="row">
                <span>Funny mask scale ({effects.funnyMask.scale.toFixed(2)}x)</span>
                <input type="range" min="0.5" max="2.4" step="0.01" bind:value={effects.funnyMask.scale} />
            </label>
            <label class="row">
                <span>Funny mask offset X ({effects.funnyMask.offsetX.toFixed(2)})</span>
                <input type="range" min="-0.5" max="0.5" step="0.01" bind:value={effects.funnyMask.offsetX} />
            </label>
            <label class="row">
                <span>Funny mask offset Y ({effects.funnyMask.offsetY.toFixed(2)})</span>
                <input type="range" min="-0.5" max="0.5" step="0.01" bind:value={effects.funnyMask.offsetY} />
            </label>
            <label class="row">
                <span>3D mask opacity ({formatPercent(effects.mask3d.opacity)})</span>
                <input type="range" min="0" max="1" step="0.01" bind:value={effects.mask3d.opacity} />
            </label>
            <label class="row">
                <span>3D mask scale ({effects.mask3d.scale.toFixed(2)}x)</span>
                <input type="range" min="0.5" max="2.4" step="0.01" bind:value={effects.mask3d.scale} />
            </label>
            <label class="row">
                <span>3D mask offset X ({effects.mask3d.offsetX.toFixed(2)})</span>
                <input type="range" min="-0.5" max="0.5" step="0.01" bind:value={effects.mask3d.offsetX} />
            </label>
            <label class="row">
                <span>3D mask offset Y ({effects.mask3d.offsetY.toFixed(2)})</span>
                <input type="range" min="-0.5" max="0.5" step="0.01" bind:value={effects.mask3d.offsetY} />
            </label>
        </section>

        <section class="effects-group">
            <div class="group-title">Eyes and mouth cutout tuning</div>
            <label class="row">
                <span>Eyes alpha ({formatPercent(effects.eyes.alpha)})</span>
                <input type="range" min="0" max="1" step="0.01" bind:value={effects.eyes.alpha} />
            </label>
            <label class="row">
                <span>Eyes scale ({effects.eyes.scale.toFixed(2)}x)</span>
                <input type="range" min="0.7" max="2.5" step="0.01" bind:value={effects.eyes.scale} />
            </label>
            <label class="row">
                <span>Eyes offset X ({effects.eyes.offsetX.toFixed(2)})</span>
                <input type="range" min="-0.5" max="0.5" step="0.01" bind:value={effects.eyes.offsetX} />
            </label>
            <label class="row">
                <span>Eyes offset Y ({effects.eyes.offsetY.toFixed(2)})</span>
                <input type="range" min="-0.5" max="0.5" step="0.01" bind:value={effects.eyes.offsetY} />
            </label>
            <label class="row">
                <span>Mouth alpha ({formatPercent(effects.mouth.alpha)})</span>
                <input type="range" min="0" max="1" step="0.01" bind:value={effects.mouth.alpha} />
            </label>
            <label class="row">
                <span>Mouth scale ({effects.mouth.scale.toFixed(2)}x)</span>
                <input type="range" min="0.7" max="2.5" step="0.01" bind:value={effects.mouth.scale} />
            </label>
            <label class="row">
                <span>Mouth offset X ({effects.mouth.offsetX.toFixed(2)})</span>
                <input type="range" min="-0.5" max="0.5" step="0.01" bind:value={effects.mouth.offsetX} />
            </label>
            <label class="row">
                <span>Mouth offset Y ({effects.mouth.offsetY.toFixed(2)})</span>
                <input type="range" min="-0.5" max="0.5" step="0.01" bind:value={effects.mouth.offsetY} />
            </label>
        </section>
    </div>
{/if}

<style>
    .effects-panel {
        position: absolute;
        z-index: 25;
        left: 50%;
        transform: translateX(-50%);
        bottom: 5.9rem;
        width: min(420px, calc(100vw - 1.5rem));
        max-height: min(72dvh, 620px);
        overflow: auto;
        border-radius: 16px;
        padding: 0.85rem;
        box-sizing: border-box;
        border: 1px solid rgba(255, 255, 255, 0.14);
        background: rgba(0, 0, 0, 0.82);
        backdrop-filter: blur(16px);
        color: rgba(255, 255, 255, 0.92);
        display: grid;
        gap: 0.65rem;
    }

    .effects-panel.popover-panel {
        max-width: none;
        max-height: min(70dvh, 620px);
        transform-origin: bottom center;
    }

    .effects-panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
    }

    .effects-panel-header h3 {
        margin: 0;
        font-size: 0.95rem;
    }

    .effects-panel-header button {
        border: 1px solid rgba(255, 255, 255, 0.22);
        border-radius: 999px;
        width: 1.9rem;
        height: 1.9rem;
        background: rgba(255, 255, 255, 0.08);
        color: rgba(255, 255, 255, 0.92);
        cursor: pointer;
    }

    .effects-group {
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 12px;
        padding: 0.55rem;
        display: grid;
        gap: 0.45rem;
    }

    .group-title {
        font-size: 0.78rem;
        font-weight: 600;
        color: rgba(255, 255, 255, 0.72);
    }

    .row {
        display: grid;
        gap: 0.3rem;
        font-size: 0.8rem;
    }

    .row-checkbox,
    .row-radio {
        grid-template-columns: auto 1fr;
        align-items: center;
    }

    .row input[type="range"] {
        width: 100%;
    }

    .hint {
        font-size: 0.72rem;
        color: rgba(255, 255, 255, 0.66);
        overflow-wrap: anywhere;
    }

    @media (max-width: 640px) {
        .effects-panel {
            left: 50%;
            transform: translateX(-50%);
            bottom: 5.75rem;
            width: calc(100vw - 1.5rem);
            max-height: 72dvh;
        }
    }
</style>









