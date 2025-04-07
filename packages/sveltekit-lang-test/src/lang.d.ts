declare module "$lang" {
  import type { Param, FormatFn, LocalizeFn } from "@eslym/sveltekit-lang/runtime";

  export type AvailableLocale = "en" | "zh"
  export type DefaultLocale = "en";
  export declare const availableLocales: Omit<Set<string>, "has"> & { has(value: any): value is AvailableLocale };
  export declare const defaultLocale: DefaultLocale;
  export declare const localize: LocalizeFn<{
    test: {
      function: [{
        name: FormatFn
      }],
      param: [{
        name: Param
      }],
      simple: []
    }
  }, DefaultLocale, AvailableLocale>;
}