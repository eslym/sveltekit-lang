import type { Component } from 'svelte';

export type Param = string | number | { toString(): string };
export type FormatFn = (value: Param) => string;

export type SnippetParam = Param | Snippet<[]>;
export type SnippetFormatFn = Snippet<[value: any, helper: Snippet<[value: any, param?: any]>]>;

export type ComponentParams<T extends Record<string, Param | FormatFn>> = {
    [K in keyof T]: T[K] extends FormatFn ? SnippetFormatFn : SnippetParam;
};

export type LocalizeComponent<T extends Record<string, Param | FormatFn>> = Component<
    ComponentParams<T>
>;

export type LocalizeSnippet<T extends Record<string, Param | FormatFn>> = Snippet<
    [params: ComponentParams<T>]
>;

export type TranslationValues<T extends Record<string, any>> = {
    [K in keyof T]: T[K] extends []
        ? string
        : T[K] extends [params: infer P]
          ? (params: P) => string
          : T[K] extends Record<string, any>
            ? TranslationValues<T[K]>
            : never;
};

export type TranslationSnippets<T extends Record<string, any>> = {
    [K in keyof T]: T[K] extends []
        ? Snippet<[]>
        : T[K] extends [params: infer P]
          ? Snippet<[params: P]>
          : T[K] extends Record<string, any>
            ? TranslationSnippets<T[K]>
            : never;
};

export type TranslationComponents<T extends Record<string, any>> = {
    [K in keyof T]: T[K] extends []
        ? LocalizeComponent<{}>
        : T[K] extends [params: infer P]
          ? LocalizeComponent<P>
          : T[K] extends Record<string, any>
            ? TranslationComponents<T[K]>
            : never;
};

export interface Localize<T extends Record<string, any>, L = string> {
    readonly value: string;
    readonly current: string;
    T: TranslationValues<T>;
    S: TranslationSnippets<T>;
    C: TranslationComponents<T>;
    as(locale: string): Localize<T>;
    pick<T extends { [K in L]: any } & { [key in string]?: T[L] }>(candidates: T): T[L];
}

export const localizeSymbol: unique symbol;
export function create_localize(config: { value: string }, translations: Record<string, any>): any;
