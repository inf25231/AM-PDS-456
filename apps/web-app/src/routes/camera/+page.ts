// The camera page is purely client-side: it uses browser-only APIs such as
// MediaDevices, AudioContext, WebGL, and localStorage.
// Disable SSR so Vercel/Node never tries to render it on the server.
export const ssr = false;

