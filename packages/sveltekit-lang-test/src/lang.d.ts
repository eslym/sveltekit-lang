declare module "$lang" {
    import type { Snippet } from 'svelte';
    
    type Param = string | number | { toString(): string };
    type FormatFn = (value: Param) => string;

    type SnippetParam = Param | Snippet<[]>;
    type SnippetFormatFn = Snippet<[value: any, helper: Snippet<[value: any, param?: any]>]>;

    export type AvailableLang = "en" | "zh";

    export const availableLangs: AvailableLang[];
    export const defaultLocale = "en" as AvailableLang;

    type Translations = {readonly "test": {readonly "function": (params: {name: FormatFn}) => string,readonly "param": (params: {name: Param}) => string,readonly "simple": string,},};
    type Snippets = {readonly "test": {readonly "function": Snippet<[{name: SnippetFormatFn}]>,},};

    type KeyMapping = {"test.function": [param: {name: FormatFn}],"test.param": [param: {name: Param}],"test.simple": [],};
    type SnippetMapping = {"test.function": [param: {name: SnippetFormatFn}]};

    export type TranslationKeys = keyof KeyMapping;

    export class Localize {
        public lang: string;
        public readonly translations: Translations;
        public readonly snippets: Snippets;

        tryLangs(resolve: (lang: string) => [AvailableLang, ...AvailableLang[]]): this;

        get<K extends TranslationKeys>(key: K, ...args: KeyMapping[K]): string;
        snippet<K extends keyof SnippetMapping>(key: K): Snippet<SnippetMapping[K]>;
    }
}
