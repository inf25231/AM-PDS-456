import adapter from '@sveltejs/adapter-auto';
import adapterNode from '@sveltejs/adapter-node';

const useNodeAdapter = process.env.SVELTEKIT_ADAPTER === 'node';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  compilerOptions: {
    runes: true
  },
  kit: {
    adapter: useNodeAdapter ? adapterNode() : adapter()
  }
};

export default config;
