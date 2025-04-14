<script module>
    import { untrack } from 'svelte';
    import Self from './runtime.svelte';
    import BROWSER from 'esm-env/browser';
    import DEV from 'esm-env/development';

    const noop = () => {};

    const tokens_symbol = Symbol('tokens');
    export const localize_symbol = Symbol('path');

    const valueSymbol = Symbol('value');
    const snippetSymbol = Symbol('snippet');
    const componentSymbol = Symbol('component');
    const getterSymbol = Symbol('is getter');

    export class TranslationMissingError extends Error {
        constructor(tries, key) {
            super(`No translation (${tries.join(', ')}) found for ${key}`);
            this.name = 'TranslationMissingError';
            this.tries = tries;
            this.key = key;
        }
    }

    function weak_map_get(target, sym, key, init) {
        if (!target[sym]) {
            target[sym] = new WeakMap();
        }
        let map = target[sym];
        if (!map.has(key)) {
            map.set(key, init());
        }
        return map.get(key);
    }

    function create_snippet(candidates, tries) {
        const tokens = () => pick(tries(), candidates, candidates[localize_symbol]);
        if (BROWSER) {
            return ($$anchor, params = noop) => {
                if (DEV && typeof params !== 'function') {
                    console.trace(
                        'The snippet is not being rendered with {@render ...}, do you accidentally using it as a component?'
                    );
                }
                return renderer($$anchor, tokens, params);
            };
        } else {
            return ($$anchor, params = {}) => {
                const tokens = pick(tries(), candidates, candidates[localize_symbol]);
                return renderer($$anchor, tokens, params);
            };
        }
    }

    function create_component(candidates, tries) {
        return Object.assign(
            function ($$anchor, props) {
                if (DEV && typeof props === 'function') {
                    console.trace(
                        'The props is a function, do you accidentally using a component as a snippet?'
                    );
                }
                Object.defineProperty(props, tokens_symbol, {
                    get() {
                        return pick(tries(), candidates, candidates[localize_symbol]);
                    },
                    enumerable: true
                });
                return Self($$anchor, props);
            },
            { ...Self }
        );
    }

    function token_helper(token, params) {
        if (typeof token === 'string') {
            return token;
        }
        const val = token(params);
        if (typeof val === 'function') {
            return `${val(val.param?.(params))}`;
        }
        return `${val}`;
    }

    function create_value(candidates, tries) {
        return Object.assign(
            () => {
                const tokens = pick(tries(), candidates, candidates[localize_symbol]);
                if (tokens[tokens_symbol]) {
                    return tokens[tokens_symbol];
                }
                if (tokens.length === 0) {
                    return (tokens[tokens_symbol] = '');
                }
                if (tokens.length === 1) {
                    return (tokens[tokens_symbol] = tokens[0]);
                }
                return (tokens[tokens_symbol] = (params) =>
                    tokens.map((t) => token_helper(t, params)).join(''));
            },
            {
                [getterSymbol]: true
            }
        );
    }

    function pick(tries, candidates, key = '<#pick>') {
        for (const lang of tries) {
            if (candidates[lang]) {
                return candidates[lang];
            }
        }
        throw new TranslationMissingError(tries, key);
    }

    function proxy(target, langs, sym, map_val) {
        return new Proxy(target, {
            get(target, prop) {
                const value = Reflect.get(target, prop);
                if (!value || typeof value !== 'object') return value;
                if (localize_symbol in value) {
                    const val = weak_map_get(value, sym, langs, map_val.bind(null, value, langs));
                    return val[getterSymbol] ? val() : val;
                }
                return weak_map_get(
                    value,
                    sym,
                    langs,
                    proxy.bind(null, value, langs, sym, map_val)
                );
            },
            set() {
                throw new Error('Cannot set value on a translations');
            },
            deleteProperty() {
                throw new Error('Cannot delete property on a translations');
            }
        });
    }

    export function create_localize(config, translations) {
        let current = $derived(config.resolve ? config.resolve(config.value) : config.value);
        let tries = $derived(config.tries ? config.tries(current) : [current]);

        const get_tries = () => tries;

        const values = proxy(translations, get_tries, valueSymbol, create_value);
        const snippets = proxy(translations, get_tries, snippetSymbol, create_snippet);
        const components = proxy(translations, get_tries, componentSymbol, create_component);

        const as = (value) => {
            const getter = typeof value === 'function' ? value : () => value;
            return create_localize(
                {
                    get value() {
                        return getter();
                    },
                    get tries() {
                        return config.tries;
                    },
                    get resolve() {
                        return config.resolve;
                    }
                },
                translations
            );
        };

        const _pick = (candidates) => {
            return pick(
                untrack(() => tries),
                candidates
            );
        };

        return {
            get as() {
                return as;
            },
            get value() {
                return config.value;
            },
            set value(value) {
                config.value = value;
            },
            get current() {
                return current;
            },
            get pick() {
                return tries, _pick;
            },
            get T() {
                return values;
            },
            get S() {
                return snippets;
            },
            get C() {
                return components;
            }
        };
    }
</script>

<script>
    let { ...params } = $props();
</script>

{#snippet var_helper(value, param)}
    {#if typeof value === 'function'}
        {@render value(param, var_helper)}
    {:else}
        {value}
    {/if}
{/snippet}

{#snippet renderer(tokens, params)}
    {#each tokens as token}
        {#if typeof token === 'function'}
            {@render var_helper(token(params), token.param?.(params))}
        {:else}
            {token}
        {/if}
    {/each}
{/snippet}

{@render renderer(params[tokens_symbol], params)}
