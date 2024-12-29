import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import lang from '@eslym/sveltekit-lang';

export default defineConfig({
	plugins: [sveltekit(), lang({
		defaultLocale: 'en'
	})]
});
