import { Plugin } from 'vite';

export type PluginOptions = {
    sveltekitPath?: string;
    langPath?: string;
    alias?: string;
    svelteSnippets?: boolean;
    defaultLocale: string;
};

export default function sveltekitLang(options?: PluginOptions): Plugin;
