import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import sveltekitLang from './src/lib/vite.ts';

export default defineConfig({
	plugins: [sveltekit(), sveltekitLang({ defaultLang: 'en' })],
	build: {
		rollupOptions: {
			external: ['.lang']
		}
	}
});
