import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

// In production deploy, set VITE_SIGNALING_URL to the signaling server's public URL.
// In development it defaults to http://localhost:8080 and the Vite proxy handles CORS.
const signalingTarget = process.env.VITE_SIGNALING_URL || 'http://localhost:8080';

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  server: {
    allowedHosts: ['.trycloudflare.com'],
    proxy: {
      '/api': {
        target: signalingTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      }
    }
  }
});
