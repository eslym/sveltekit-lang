import glob from 'tiny-glob';
import CommentJSON from 'comment-json';
import { join } from 'path';
import type { Plugin } from 'vite';
import type { PluginOptions } from './types';
import { compile_template, parse_template } from './template';
import { readFile, writeFile } from 'fs/promises';
import { concat, T } from './generate';

const DEFAULT_OPTIONS = {
    langPath: './lang',
    sveltePath: './.svelte-kit/generated/lang.svelte.js',
    typesPath: './src/lang.d.ts',
    alias: '$lang',
    svelteSnippets: false
};

const broken_path = Symbol('broken_path');

function get(obj: any, path: (string | number)[]) {
    return path.reduce((acc, key) => {
        if (typeof acc === 'undefined') return undefined;
        if (typeof acc !== 'object') return broken_path;
        return acc?.[key];
    }, obj);
}

function set(obj: any, path: (string | number)[], value: any): boolean {
    path = [...path];
    const last = path.pop()!;
    const parent = path.reduce((acc, key) => {
        if (typeof acc !== 'object') return undefined;
        if (!acc[key]) acc[key] = {};
        return acc[key];
    }, obj);
    if (!parent) return false;
    parent[last] = value;
    return true;
}

function compare_signature(
    a: { params: Set<string>; fns: Set<string> },
    b: { params: Set<string>; fns: Set<string> }
) {
    if (a.params.size !== b.params.size || a.fns.size !== b.fns.size) return false;
    for (const v of new Set([...a.params, ...b.params])) {
        if (!a.params.has(v) || !b.params.has(v)) return false;
    }
    for (const f of new Set([...a.fns, ...b.fns])) {
        if (!a.fns.has(f) || !b.fns.has(f)) return false;
    }
    return true;
}

function travel(
    obj: any,
    path: (string | number)[],
    cb: (value: string, path: (string | number)[]) => void
) {
    if (obj === null || obj === undefined) return;
    if (typeof obj === 'object') {
        if (Array.isArray(obj)) {
            for (let i = 0; i < obj.length; i++) {
                travel(obj[i], [...path, i], cb);
            }
        } else {
            for (const key in obj) {
                travel(obj[key], [...path, key], cb);
            }
        }
    } else if (typeof obj === 'string') {
        cb(obj, path);
    }
}

function path_accessor(path: (string | number)[]) {
    return path.map((p) => `[${JSON.stringify(p)}]`).join('');
}

async function compile(opts: {
    lang_path: string;
    svelte_path: string;
    types_path: string;
    alias: string;
    default_locale: string;
}) {
    const availables = new Set<string>();
    const keys = new Set<string>();
    const mappings = new Map<string, string>();
    const compiled = new Map<
        string,
        { params: Set<string>; fns: Set<string>; js: Map<string, string> }
    >();
    const trans: Record<string, any> = {};
    const json_paths = await glob('*.json', { cwd: opts.lang_path, absolute: false });

    await Promise.all(
        json_paths.map(async (json_path) => {
            const lang = json_path.replace(/\.json$/, '');
            availables.add(lang);
            const content = await readFile(join(opts.lang_path, json_path), 'utf-8');
            const json = CommentJSON.parse(content);
            travel(json, [], (value, path) => {
                const check = get(trans, path);
                if (
                    check === broken_path ||
                    (typeof check !== 'string' && typeof check !== 'undefined')
                ) {
                    throw new Error(`Translations structure mis-match: ${path.join('.')}`);
                }
                const key = path.join('.');
                if (typeof check === 'undefined') {
                    set(trans, path, key);
                    keys.add(key);
                    mappings.set(key, path_accessor(path));
                }
                const res = compile_template(parse_template(value));
                const existing = compiled.get(key);
                if (existing) {
                    if (!compare_signature(existing, res)) {
                        throw new Error(`Parameter mismatch: ${key}`);
                    }
                    existing.js.set(lang, res.js);
                } else {
                    compiled.set(key, {
                        params: res.params,
                        fns: res.fns,
                        js: new Map([[lang, res.js]])
                    });
                }
            });
        })
    );

    function walk_js(
        obj: any,
        path: (string | number)[]
    ): { js: Iterable<string>; dts: Iterable<string> } {
        const current_key = path.join('.');
        if (typeof obj === 'string') {
            const com = compiled.get(current_key)!;
            const js = T.obj([
                ['[path]', T.stringify(path.join('.'))],
                ...com.js.entries()
            ]);
            const dts = com.params.size
                ? concat(
                      '[',
                      T.obj(
                          Array.from(com.params).map(
                              (p) => [p, com.fns.has(p) ? 'FormatFn' : 'Param'] as const
                          )
                      ),
                      ']'
                  )
                : '[]';
            return { js, dts };
        }
        const keys = Object.keys(obj);
        const jss: [Iterable<string>, Iterable<string>][] = [];
        const dtss: [Iterable<string>, Iterable<string>][] = [];
        for (const key of keys) {
            const { js, dts } = walk_js(obj[key], [...path, key]);
            jss.push([key, js]);
            dtss.push([key, dts]);
        }
        const js = T.obj(jss);
        const dts = T.obj(dtss);
        return { js, dts };
    }

    const { js, dts } = walk_js(trans, []);

    const lang_svelte_js = T.str(
        T.lf([
            'import { localize_symbol as path, create_localize } from "@eslym/sveltekit-lang/runtime";',
            '',
            'const oa = Object.assign.bind(Object);',
            '',
            T.code`export const availableLocales = new Set(${T.stringify(Array.from(availables))});`,
            T.code`export const defaultLocale = ${T.stringify(opts.default_locale)};`,
            '',
            T.code`const translations = ${js};`,
            '',
            'export const localize = oa((config = {})=>{',
            '  let value = $state(defaultLocale);',
            '  return create_localize({',
            '    get value(){',
            '      return value;',
            '    },',
            '    set value(v){',
            '      value = v;',
            '    },',
            '    get resolve(){',
            '      return config.resolve;',
            '    },',
            '    get tries(){',
            '      return config.tries;',
            '    },',
            '  }, translations);',
            '}, {',
            '  derived(getter, config = {}){',
            '    let value = $derived.by(getter);',
            '    return create_localize({',
            '      get value(){',
            '        return value;',
            '      },',
            '      get resolve(){',
            '        return config.resolve;',
            '      },',
            '      get tries(){',
            '        return config.tries;',
            '      },',
            '    }, translations);',
            '  },',
            '});'
        ])
    );
    const lang_dts = T.str(
        T.lf([
            'declare module "$lang" {',
            '  import type { Param, FormatFn, LocalizeFn } from "@eslym/sveltekit-lang/runtime";',
            '',
            T.code`  export type AvailableLocale = ${T.join(
                T.map(Array.from(availables), (l) => T.stringify(l)),
                ' | '
            )}`,
            T.code`  export type DefaultLocale = ${T.stringify(opts.default_locale)};`,
            '  export declare const availableLocales: Omit<Set<string>, "has"> & { has(value: any): value is AvailableLocale };',
            '  export declare const defaultLocale: DefaultLocale;',
            T.code`  export declare const localize: LocalizeFn<${T.indent(dts)}, DefaultLocale, AvailableLocale>;`,
            '}'
        ])
    );

    await writeFile(opts.svelte_path, lang_svelte_js, 'utf-8');
    await writeFile(opts.types_path, lang_dts, 'utf-8');
}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function create_debounce(callback: () => Promise<void>, ms: number) {
    let should_run = false;
    let running = false;
    return async () => {
        should_run = true;
        if (running) return;
        running = true;
        try {
            while (should_run) {
                should_run = false;
                await callback();
                await sleep(ms);
            }
        } finally {
            running = false;
        }
    };
}

export default function sveltekitLang(options: PluginOptions): Plugin {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    return {
        name: 'sveltekit-lang',
        configureServer(server) {
            const root = server.config.root ?? process.cwd();
            const c_opt = {
                lang_path: join(root, opts.langPath),
                svelte_path: join(root, opts.sveltePath),
                types_path: join(root, opts.typesPath),
                alias: opts.alias,
                default_locale: opts.defaultLocale
            };
            const compile_files = create_debounce(compile.bind(null, c_opt), 1000);
            const onChange = (file: string) => {
                if (file.startsWith(c_opt.lang_path)) {
                    compile_files().catch((err) => {
                        server.config.logger.error(err.message);
                    });
                }
            };
            server.watcher.add(c_opt.lang_path + '/**/*');
            server.watcher.on('change', onChange);
            server.watcher.on('add', onChange);
            server.watcher.on('unlink', onChange);
        },
        async config(cfg) {
            const root = cfg.root ?? process.cwd();
            const c_opt = {
                lang_path: join(root, opts.langPath),
                svelte_path: join(root, opts.sveltePath),
                types_path: join(root, opts.typesPath),
                alias: opts.alias,
                default_locale: opts.defaultLocale
            };
            await compile(c_opt);
            return { resolve: { alias: { [opts.alias]: c_opt.svelte_path } } };
        }
    };
}
