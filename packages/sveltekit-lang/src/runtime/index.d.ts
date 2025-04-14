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

export type TranslationValues<T extends Readonly<Record<string, any>>> = {
    readonly [K in keyof T]: T[K] extends []
        ? string
        : T[K] extends [params: infer P]
          ? (params: P) => string
          : T[K] extends Readonly<Record<string, any>>
            ? TranslationValues<T[K]>
            : never;
};

export type TranslationSnippets<T extends Readonly<Record<string, any>>> = {
    readonly [K in keyof T]: T[K] extends []
        ? Snippet<[]>
        : T[K] extends [params: infer P]
          ? Snippet<[params: P]>
          : T[K] extends Readonly<Record<string, any>>
            ? TranslationSnippets<T[K]>
            : never;
};

export type TranslationComponents<T extends Readonly<Record<string, any>>> = {
    readonly [K in keyof T]: T[K] extends []
        ? LocalizeComponent<{}>
        : T[K] extends [params: infer P]
          ? LocalizeComponent<P>
          : T[K] extends Readonly<Record<string, any>>
            ? TranslationComponents<T[K]>
            : never;
};

export interface Localize<
    T extends Readonly<Record<string, any>>,
    D extends string,
    L extends string
> {
    readonly value: string;
    readonly current: string;
    T: TranslationValues<T>;
    S: TranslationSnippets<T>;
    C: TranslationComponents<T>;
    as(locale: string | (() => string)): Localize<T, D, L>;
    pick<T extends { [K in D]: any } & { [key in L]?: T[D] }>(candidates: T): T[D];
}

export type WritableLocalize<
    T extends Readonly<Record<string, any>>,
    D extends string,
    L extends string
> = Omit<Localize<T, D, L>, 'value'> & { value: string };

export type LocalizeFn<
    T extends Readonly<Record<string, any>>,
    D extends string,
    L extends string
> = {
    (config?: {
        resolve?: (value: string) => L;
        tries?: (value: L) => [L, ...L[]];
    }): WritableLocalize<T, D, L>;
    derived(
        getter: () => string,
        config?: { resolve?: (value: string) => L; tries?: (value: L) => [L, ...L[]] }
    ): Localize<T, D, L>;
};

export const localize_symbol: unique symbol;
export function create_localize(
    config: { value: string },
    translations: Readonly<Record<string, any>>
): any;

export declare class TranslationMissingError extends Error {
    tries: string[];
    key: string;
    constructor(tries: string[], key: string);
}
