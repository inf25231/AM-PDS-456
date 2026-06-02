# Camera Module – Architecture

## Overview

The camera feature is split across three layers:

1. **Route** (`routes/camera/+page.svelte`) — orchestrates streams, wires stores to the UI, owns mount/destroy lifecycle.
2. **Stores** (`lib/camera/stores/`) — reactive Svelte 5 rune-based classes that isolate specific concerns.
3. **Helpers** (`lib/camera/`) — pure/stateless browser API wrappers used by stores and the route.

---

## Stores (`lib/camera/stores/`)

| File | Owns | Key methods |
|------|------|-------------|
| `preferences.svelte.ts` | `showDebugInfo`, `showPerformance`, `selectedQuality`, `selectedVideoDeviceId`, `selectedAudioDeviceId` | `load(storage)`, `persist(storage)`, `snapshot` getter |
| `devices.svelte.ts` | `videoDevices`, `audioDevices` | `refresh(cameraStream, micStream, videoId, audioId)` → normalized IDs |

Stores are instantiated **per page** (not global singletons) to avoid SSR and navigation issues.

---

## Helpers (`lib/camera/`)

| File | Responsibility |
|------|----------------|
| `controller.ts` | `startCamera`, `startMicrophone`, `stopCamera`, `stopMicrophone` — thin wrappers around `camera-core`. |
| `devices.ts` | `enumerateMediaDeviceOptions`, `normalizeSelectedDeviceId`, `detectBrowserVersion`. |
| `errors.ts` | Maps `DOMException` names to user-readable strings. |
| `performance.ts` | `getRenderedFrameCount`, frame callback helpers, format utilities. |
| `settings.ts` | Constraint builders (`buildCameraConstraints`, etc.), localStorage read/write, `getApplyConstraintCandidates`. |

---

## State Ownership Map

```
+page.svelte (route — orchestrator)
├── PreferencesStore    showDebugInfo, showPerformance, selectedQuality,
│                       selectedVideoDeviceId, selectedAudioDeviceId
├── DevicesStore        videoDevices, audioDevices
├── cameraStream        Raw MediaStream reference (camera)
├── microphoneStream    Raw MediaStream reference (microphone)
├── cameraState         'idle' | 'loading' | 'ready' | 'error'
├── microphoneState     'idle' | 'loading' | 'ready' | 'error'
├── cameraEnabled       Soft-enable flag (track.enabled, not stream stopped)
├── microphoneEnabled   Soft-enable flag
├── debug               Debug overlay snapshot (sampled on interval)
│     browser, cameraName, microphoneName,
│     microphoneLevel, microphoneLevelSnapshot, cameraMuted, microphoneMuted
└── perf                Performance overlay snapshot (sampled on interval)
      fps, renderFps, frameTimeMs, trackFrameRate, targetFrameRate, resolution
```

---

## Lifecycle Flow

```
onMount
  └─ prefs.load(localStorage)
  └─ handleStartAll()
       └─ startAllMedia(videoEl, buildMediaConstraints(prefs.snapshot))
       └─ refreshAvailableDevices()  ← devices.refresh() + normalize IDs
  └─ syncDebugInfoLoopState()
  └─ syncMicrophoneLevelLoopState()
  └─ syncPerformanceLoopState()

User: toggle camera
  └─ handleToggle()
       ├─ soft-toggle (track.enabled) if stream exists
       └─ handleStart() if no stream

User: change quality / device
  └─ handleQualityChange() → applyVideoPreferences()
       ├─ applyConstraints() on existing track (no permission prompt)
       └─ restartActiveMedia() if overconstrained or forceRestart

onDestroy
  └─ stop all loops, destroy audio analysis, stop all streams
```

---

## `applyConstraints()` Fallback Order

For quality changes, the route prefers `applyConstraints()` over a full restart:

1. Try each candidate from `getApplyConstraintCandidates(prefs.snapshot)` in order.
2. If all candidates fail with `OverconstrainedError` → fall through to full `restartActiveMedia()`.
3. If a non-overconstrained error occurs → surface it directly, no restart.

The 1080p path gets extra candidates (exact 60 fps → base → 30 fps fallback) because
some devices reject 1080p@60 but accept 1080p@30.

---

## Incremental Refactor Checklist

- [x] Step 1 — Extract `PreferencesStore` and `DevicesStore`
- [x] Step 2 — Extract `MicrophoneMeter.svelte` component + audio analysis + meter styles
- [x] Step 3 — Extract `MonitorStore` (debug/perf polling loops)
- [ ] Step 4 — Extract media lifecycle orchestration into `MediaStore`

