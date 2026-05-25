# Amphi-Calls Web App

This package contains the SvelteKit client for the camera and calling UI.

## Current architecture

The camera page has already grown beyond a simple route component. The page is still fine as the entry point, but the actual implementation should be split by responsibility:

- Route-level orchestration stays in `src/routes/camera/+page.svelte`.
- Reusable camera UI stays in `src/lib/components/camera`.
- Media and device logic stays in `src/lib/camera` for now, and only the device-agnostic parts should move into `packages/camera-core` later.

## What should stay in the web app

Keep these in the Svelte app, because they are presentation or route concerns:

- page layout and route state
- settings popover UI
- debug overlay UI
- browser-specific permissions flow
- localStorage persistence
- UI events such as open/close, select changes, and toggle buttons

## What is worth moving into `camera-core`

`camera-core` should contain camera behavior that is reusable and not tied to Svelte:

- camera and microphone stream startup helpers
- video quality presets and `MediaStreamConstraints` helpers
- device selection helpers
- track inspection helpers such as `getSettings()` wrappers
- debug/stat helpers if they are pure functions

Do not move UI components, Svelte stores, or browser page markup into `camera-core`. That package should stay framework-agnostic.

## Practical guidance for `+page.svelte`

The route file is now doing too much. A good next split would be:

1. Extract the settings panel into its own component.
2. Extract the debug overlay into its own component.
3. Extract camera device and quality state into a small camera controller module.
4. Move the pure media helpers into `packages/camera-core` once the API is stable.

That keeps the page readable while preserving the current product logic in the web app.

## Notes on `camera-core`

The `packages/camera-core` workspace exists as a shell package, but it does not yet contain source files. That is a good place to move the non-UI media logic once the API shape is clear.
