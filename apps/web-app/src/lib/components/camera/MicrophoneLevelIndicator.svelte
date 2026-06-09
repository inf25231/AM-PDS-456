<script lang="ts">
    type Props = {
        level: number;
        active: boolean;
    };

    let { level = 0, active = false }: Props = $props();

    function getBars() {
        const barCount = 8;
        const activeBars = Math.max(0, Math.min(barCount, Math.round(level * barCount)));
        return Array.from({ length: barCount }, (_, index) => index < activeBars);
    }

    function getTone(index: number, barCount = 8) {
        const ratio = (index + 1) / barCount;
        if (ratio >= 0.875) {
            return "bar-red";
        }

        if (ratio >= 0.625) {
            return "bar-orange";
        }

        return "bar-green";
    }
</script>

<div class="microphone-level-indicator" aria-hidden="true" data-active={active}>
    {#each getBars() as isActive, index}
        {@const tone = getTone(index)}
        <span
            class="microphone-level-bar"
            class:microphone-level-bar-active={isActive}
            class:bar-green={isActive && tone === "bar-green"}
            class:bar-orange={isActive && tone === "bar-orange"}
            class:bar-red={isActive && tone === "bar-red"}
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

    .microphone-level-indicator[data-active="false"] .microphone-level-bar-active,
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


