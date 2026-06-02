<script lang="ts">
    /**
     * Microphone level meter.
     *
     * Owns the full Web Audio analysis graph and renders live microphone levels
     * as a row of colored bars. Intended to sit next to the microphone toggle
     * button inside a `.microphone-control` wrapper in the parent.
     *
     * ### Audio model
     * The meter uses a weighted peak + RMS signal:
     * - peak keeps speech onset visually responsive (attack blend)
     * - RMS prevents the bars from flickering on quiet sustained signals
     * - decay smoothing brings bars down gradually after peaks
     *
     * ### Props
     * - `stream`  — active MediaStream from the microphone, or null when off
     * - `enabled` — whether the user has soft-enabled the microphone
     * - `ready`   — whether the microphone stream is in the "ready" state
     * - `level`   — `$bindable`; exposes the smoothed level [0–1] so the parent
     *               can snapshot it for the debug overlay
     */

    const SAMPLE_INTERVAL_MS = 48;
    const GAIN = 4.4;
    const DECAY_FACTOR = 0.4;
    const ATTACK_BLEND = 0.96;
    const BAR_COUNT = 8;

    type Props = {
        stream: MediaStream | null;
        enabled: boolean;
        ready: boolean;
        level?: number;
    };

    let { stream, enabled, ready, level = $bindable(0) }: Props = $props();

    /**
     * True when all conditions for active audio sampling are met.
     *
     * Reads track.muted directly; track-muted changes in practice always
     * coincide with stream/state changes that re-trigger this derived.
     */
    const shouldSample = $derived(
        stream !== null &&
            enabled &&
            ready &&
            !(stream.getAudioTracks()[0]?.muted ?? true),
    );

    let audioContext: AudioContext | null = null;
    let audioSource: MediaStreamAudioSourceNode | null = null;
    let audioAnalyser: AnalyserNode | null = null;
    let loopTimeoutId: number | null = null;

    /**
     * Lazily creates the Web Audio analysis graph when not already running.
     *
     * Smaller FFT windows (512) make the visual meter react faster to speech
     * attacks. Low smoothingTimeConstant lets raw data drive peak detection.
     */
    function ensureAudioAnalysis() {
        if (!stream || audioContext || audioSource || audioAnalyser) return;

        try {
            audioContext = new AudioContext();
            audioAnalyser = audioContext.createAnalyser();
            audioAnalyser.fftSize = 512;
            audioAnalyser.smoothingTimeConstant = 0.12;
            audioSource = audioContext.createMediaStreamSource(stream);
            audioSource.connect(audioAnalyser);
            void audioContext.resume();
        } catch {
            destroyAudioAnalysis();
        }
    }

    /**
     * Computes the next smoothed level from the analyser's time-domain data.
     *
     * The weighted peak + RMS blend is intentional: peak drives attack, RMS
     * stabilises the meter on quiet sustained audio.
     */
    function updateLevel() {
        if (!audioAnalyser) return;

        const buffer = new Uint8Array(audioAnalyser.fftSize);
        audioAnalyser.getByteTimeDomainData(buffer);

        let sumSquares = 0;
        let peak = 0;
        for (let i = 0; i < buffer.length; i++) {
            const normalized = (buffer[i] - 128) / 128;
            sumSquares += normalized * normalized;
            peak = Math.max(peak, Math.abs(normalized));
        }

        const rms = Math.sqrt(sumSquares / buffer.length);
        const weightedLevel = peak * 0.72 + rms * 0.28;
        const nextLevel = Math.max(0, Math.min(1, weightedLevel * GAIN));

        if (nextLevel >= level) {
            level = level * (1 - ATTACK_BLEND) + nextLevel * ATTACK_BLEND;
            return;
        }

        level = Math.max(nextLevel, level * DECAY_FACTOR);
    }

    /** Tears down the Web Audio graph and releases all node references. */
    function destroyAudioAnalysis() {
        if (audioSource) {
            try {
                audioSource.disconnect();
            } catch {
                // Ignore cleanup errors.
            }
            audioSource = null;
        }

        if (audioAnalyser) {
            try {
                audioAnalyser.disconnect();
            } catch {
                // Ignore cleanup errors.
            }
            audioAnalyser = null;
        }

        if (audioContext && audioContext.state !== "closed") {
            void audioContext.close();
        }

        audioContext = null;
    }

    /** Clears the sampling loop and resets the visible level to zero. */
    function stopLoop() {
        if (loopTimeoutId !== null) {
            clearTimeout(loopTimeoutId);
            loopTimeoutId = null;
        }
        level = 0;
        destroyAudioAnalysis();
    }

    /** Starts the sampling loop; tears down any previous loop first. */
    function startLoop() {
        stopLoop();

        const step = () => {
            if (shouldSample) {
                ensureAudioAnalysis();
                updateLevel();
                loopTimeoutId = window.setTimeout(step, SAMPLE_INTERVAL_MS);
            } else {
                level = 0;
                destroyAudioAnalysis();
                loopTimeoutId = null;
            }
        };

        step();
    }

    /**
     * Reacts to `shouldSample` changes: starts or stops the audio loop.
     * The cleanup function ensures the loop is always torn down on unmount.
     */
    $effect(() => {
        if (shouldSample) {
            startLoop();
        } else {
            stopLoop();
        }

        return () => stopLoop();
    });

    /** Returns an array of booleans indicating which bars are lit. */
    function getBars() {
        const activeBars = Math.max(
            0,
            Math.min(BAR_COUNT, Math.round(level * BAR_COUNT)),
        );
        return Array.from({ length: BAR_COUNT }, (_, i) => i < activeBars);
    }

    /** Returns the CSS color class for a bar at the given index. */
    function getBarTone(index: number) {
        const ratio = (index + 1) / BAR_COUNT;
        if (ratio >= 0.875) return "bar-red";
        if (ratio >= 0.625) return "bar-orange";
        return "bar-green";
    }
</script>

<div
    class="microphone-level-indicator"
    aria-hidden="true"
    data-active={shouldSample}
>
    {#each getBars() as isActive, index}
        <span
            class={`microphone-level-bar ${isActive ? getBarTone(index) : ""}`}
            class:microphone-level-bar-active={isActive}
            style={`height: ${0.4 + index * 0.12}rem;`}
        ></span>
    {/each}
</div>

<style>
    .microphone-level-indicator {
        display: inline-flex;
        align-items: flex-end;
        gap: 0.16rem;
        min-width: 3rem;
        height: 1.5rem;
        padding: 0 0.1rem;
    }

    .microphone-level-bar {
        width: 0.22rem;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.22);
        opacity: 0.28;
        transition:
            opacity 140ms ease,
            background-color 140ms ease,
            transform 140ms ease;
    }

    .microphone-level-bar-active {
        opacity: 1;
        transform: translateY(-0.02rem);
    }

    .microphone-level-bar-active.bar-green {
        background: #7cff7c;
        box-shadow: 0 0 0.35rem rgba(124, 255, 124, 0.35);
    }

    .microphone-level-bar-active.bar-orange {
        background: #ffb347;
        box-shadow: 0 0 0.35rem rgba(255, 179, 71, 0.35);
    }

    .microphone-level-bar-active.bar-red {
        background: #ff5b5b;
        box-shadow: 0 0 0.35rem rgba(255, 91, 91, 0.35);
    }

    /* When inactive, override any lingering active styles. */
    .microphone-level-indicator[data-active="false"]
        .microphone-level-bar-active,
    .microphone-level-indicator[data-active="false"] .microphone-level-bar {
        background: rgba(255, 255, 255, 0.22);
        opacity: 0.28;
    }

    @media (max-width: 640px) {
        .microphone-level-indicator {
            min-width: 2.6rem;
        }
    }
</style>

