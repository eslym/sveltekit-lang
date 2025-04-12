# @eslym/sveltekit-lang

A very simple localization library for SvelteKit (mainly for SPA).

## Installation

```bash
npm install -d @eslym/sveltekit-lang
```
```bash
yarn add -D @eslym/sveltekit-lang
```
```bash
pnpm add -D @eslym/sveltekit-lang
```
```bash
bun add -d @eslym/sveltekit-lang
```

## Configuration

create `lang` folder under project root, localization format will be `lang/{locale}.json`

```ts
// vite.config.ts
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import lang from '@eslym/sveltekit-lang';

export default defineConfig({
	plugins: [sveltekit(), lang({
		defaultLocale: 'en',
	})],
});
```

## Usage

```ts
// src/lib/lang.svelte.ts

import { availableLocales, localize, type AvailableLocale } from '$lang';

// The config should be reactive.
import { config } from '$lib/config.svelte';

let system = $state(import.meta.env.SSR ? 'en' : navigator.language);

export const L = localize.derived(() => config.lang ?? system, {
    resolve(lang: string): AvailableLocale {
        if (availableLocales.has(lang)) {
            return lang;
        }
        const fallback = lang.split('-')[0];
        return availableLocales.has(fallback) ? fallback : 'en';
    },
    tries(l: AvailableLocale) {
        return [l, 'en'] as const;
    }
});

if (!import.meta.env.SSR) {
    window.addEventListener('languagechange', () => {
        system = navigator.language;
    });
}
```
```json
// lang/en.json
{
    // comment and template-literal like syntax is supported
    "hello": "Hello ${ name }!",
    // function call with simple arguments is supported,
    // but only support 1 argument and JSON string is supported.
    "link": "Please check the ${ link(\"document\") } for more information.",
}
```
```svelte
<script lang ="ts">
    import { L } from '$lib/lang.svelte';
</script>
<!-- The localization object is type safe, use `L.T` to access translation as value -->
<h1>{L.T.hello({ name: "World" })}</h1>
<p>
    <!-- Use `L.C` to access translation as component, so no `{@html ...}` needed -->
    <L.C.link>
        {#snippet link(label: string)}
            <a href="/doc">{label}</a>
        {/snippet}
    </L.C.link>
</p>
```
