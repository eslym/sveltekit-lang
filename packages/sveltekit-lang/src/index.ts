import glob from 'tiny-glob';
import CommentJSON from 'comment-json';
import generateLangDTS from './lang.d.ts.hbs';
import generateLangSvelte from './lang.svelte.hbs';
import generateSnippet from './snippet.hbs';
import { join, dirname } from 'path';
import type { Plugin } from 'vite';
import type { PluginOptions } from './types';
import { compile_template, parse_template } from './template';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';

type LangDTSParams = {
    alias: string;
    availableLangs: string;
    defaultLocale: string;
    translationMapping: string;
    snippetMapping: string;
    translationsType: string;
    snippetsType: string;
};

type LangSvelteParams = {
    availableLangs: string;
    defaultLocale: string;
    translations: string;
    svelteSnippetStruct: string;
    keysMapping: string;
    snippetsMapping: string;
    snippets: string;
};

const DEFAULT_OPTIONS = {
    langPath: './lang',
    sveltePath: './.svelte-kit/generated/lang.svelte',
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
        {
            params: Set<string>;
            fns: Set<string>;
            snippets: Map<string, string>;
            js: Map<string, string>;
        }
    >();
    const trans: Record<string, any> = {};
    const snippets: Record<string, any> = {};
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
                    if (res.fns.size) {
                        existing.snippets.set(lang, res.svelte);
                    }
                    existing.js.set(lang, res.js);
                } else {
                    compiled.set(key, {
                        params: res.params,
                        fns: res.fns,
                        snippets: res.fns.size ? new Map([[lang, res.svelte]]) : new Map(),
                        js: new Map([[lang, res.js]])
                    });
                    if (res.fns.size) set(snippets, path, key);
                }
            });
        })
    );

    const dtsParams: LangDTSParams = {
        alias: JSON.stringify(opts.alias),
        availableLangs: [...availables].map((l) => JSON.stringify(l)).join(' | '),
        defaultLocale: JSON.stringify(opts.default_locale),
        translationMapping: '{',
        snippetMapping: '{',
        translationsType: '',
        snippetsType: ''
    };

    const svelteParams: LangSvelteParams = {
        availableLangs: JSON.stringify([...availables]),
        defaultLocale: JSON.stringify(opts.default_locale),
        translations: '',
        svelteSnippetStruct: '',
        keysMapping: '',
        snippetsMapping: '',
        snippets: ''
    };

    function walk_js(obj: any, path: (string | number)[]) {
        const current_key = path.join('.');
        if (typeof obj === 'string') {
            const com = compiled.get(current_key)!;
            svelteParams.translations += `this.#wrapReactive(${JSON.stringify(current_key)},{`;
            for (const [lang, js] of com.js) {
                svelteParams.translations += `${lang}: ${js},`;
            }
            svelteParams.translations += `})`;
            svelteParams.keysMapping += `[${JSON.stringify(current_key)}, (t) => t${mappings.get(current_key)}],`;

            dtsParams.translationMapping += `${JSON.stringify(current_key)}: `;

            if (com.params.size) {
                const params = [...com.params]
                    .map((p) => `${p}: ${com.fns.has(p) ? 'FormatFn' : 'Param'}`)
                    .join(',');
                dtsParams.translationsType += `(params: {${params}}) => string`;
                dtsParams.translationMapping += `[param: {${params}}],`;
            } else {
                dtsParams.translationsType += `string`;
                dtsParams.translationMapping += `[],`;
            }

            return;
        }
        const keys = Object.keys(obj);
        const should_reactive = new Set<string>();
        for (const key of keys) {
            if (typeof obj[key] === 'string') {
                should_reactive.add(key);
            }
        }
        dtsParams.translationsType += `{`;
        svelteParams.translations += `Object.freeze(`;
        if (should_reactive.size) {
            svelteParams.translations += `Object.defineProperties({`;
            for (const key of keys) {
                if (should_reactive.has(key)) continue;
                svelteParams.translations += `${JSON.stringify(key)}:`;
                dtsParams.translationsType += `readonly ${JSON.stringify(key)}: `;
                walk_js(obj[key], [...path, key]);
                svelteParams.translations += ',';
                dtsParams.translationsType += `,`;
            }
            svelteParams.translations += `},{`;
            for (const key of should_reactive) {
                svelteParams.translations += `${JSON.stringify(key)}: `;
                dtsParams.translationsType += `readonly ${JSON.stringify(key)}: `;
                walk_js(obj[key], [...path, key]);
                svelteParams.translations += ',';
                dtsParams.translationsType += `,`;
            }
            svelteParams.translations += `})`;
        } else {
            svelteParams.translations += `{`;
            for (const key of keys) {
                svelteParams.translations += `${JSON.stringify(key)}: `;
                dtsParams.translationsType += `readonly ${JSON.stringify(key)}: `;
                walk_js(obj[key], [...path, key]);
                svelteParams.translations += ',';
                dtsParams.translationsType += `,`;
            }
            svelteParams.translations += `}`;
        }
        svelteParams.translations += `)`;
        dtsParams.translationsType += `}`;
    }

    walk_js(trans, []);

    dtsParams.translationMapping += '}';

    let snippet_id = 0;

    function walk_snippets(obj: any, path: (string | number)[]) {
        const current_key = path.join('.');
        if (typeof obj === 'string') {
            const com = compiled.get(current_key)!;
            svelteParams.svelteSnippetStruct += `this.#wrapReactive(${JSON.stringify(current_key)},{`;
            for (const [lang, svelte] of com.snippets) {
                svelteParams.snippets += generateSnippet({
                    name: `snippet_${snippet_id}`,
                    body: svelte
                });
                svelteParams.svelteSnippetStruct += `${lang}: snippet_${snippet_id},`;
                snippet_id++;
            }
            svelteParams.svelteSnippetStruct += `})`;
            svelteParams.snippetsMapping += `[${JSON.stringify(current_key)}, (s) => s${mappings.get(current_key)}],`;

            dtsParams.snippetMapping += `${JSON.stringify(current_key)}: `;

            if (com.params.size) {
                const params = [...com.params]
                    .map((p) => `${p}: ${com.fns.has(p) ? 'SnippetFormatFn' : 'SnippetParam'}`)
                    .join(',');
                dtsParams.snippetsType += `Snippet<[{${params}}]>`;
                dtsParams.snippetMapping += `[param: {${params}}]`;
            } else {
                dtsParams.snippetsType += `Snippet<[]>`;
                dtsParams.snippetMapping += `[]`;
            }

            return;
        }
        const keys = Object.keys(obj);
        const should_reactive = new Set<string>();
        for (const key of keys) {
            if (typeof obj[key] === 'string') {
                should_reactive.add(key);
            }
        }
        dtsParams.snippetsType += `{`;
        svelteParams.svelteSnippetStruct += `Object.freeze(`;
        if (should_reactive.size) {
            svelteParams.svelteSnippetStruct += `Object.defineProperties({`;
            for (const key of keys) {
                if (should_reactive.has(key)) continue;
                svelteParams.svelteSnippetStruct += `${JSON.stringify(key)}:`;
                dtsParams.snippetsType += `readonly ${JSON.stringify(key)}: `;
                walk_snippets(obj[key], [...path, key]);
                svelteParams.svelteSnippetStruct += ',';
                dtsParams.snippetsType += `,`;
            }
            svelteParams.svelteSnippetStruct += `},{`;
            for (const key of should_reactive) {
                svelteParams.svelteSnippetStruct += `${JSON.stringify(key)}: `;
                dtsParams.snippetsType += `readonly ${JSON.stringify(key)}: `;
                walk_snippets(obj[key], [...path, key]);
                svelteParams.svelteSnippetStruct += ',';
                dtsParams.snippetsType += `,`;
            }
            svelteParams.svelteSnippetStruct += `})`;
        } else {
            svelteParams.svelteSnippetStruct += `{`;
            for (const key of keys) {
                svelteParams.svelteSnippetStruct += `${JSON.stringify(key)}: `;
                dtsParams.snippetsType += `readonly ${JSON.stringify(key)}: `;
                walk_snippets(obj[key], [...path, key]);
                svelteParams.svelteSnippetStruct += ',';
                dtsParams.snippetsType += `,`;
            }
            svelteParams.svelteSnippetStruct += `}`;
        }
        svelteParams.svelteSnippetStruct += `)`;
        dtsParams.snippetsType += `}`;
    }

    walk_snippets(snippets, []);

    dtsParams.snippetMapping += '}';

    if (!existsSync(dirname(opts.types_path))) {
        await mkdir(dirname(opts.types_path), { recursive: true });
    }
    if (!existsSync(dirname(opts.svelte_path))) {
        await mkdir(dirname(opts.svelte_path), { recursive: true });
    }
    await writeFile(opts.svelte_path, generateLangSvelte(svelteParams), 'utf-8');
    await writeFile(opts.types_path, generateLangDTS(dtsParams), 'utf-8');
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
        while (should_run) {
            should_run = false;
            await callback();
            await sleep(ms);
        }
        running = false;
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
            return {
                resolve: {
                    alias: {
                        [opts.alias]: c_opt.svelte_path
                    }
                }
            };
        }
    };
}
