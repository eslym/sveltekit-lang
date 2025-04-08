<script module>
    import { untrack } from 'svelte';
    import Self from './runtime.svelte';

    const noop = () => {};

    export const localize_symbol = Symbol('path');

    const valueSymbol = Symbol('value');
    const snippetSymbol = Symbol('snippet');
    const componentSymbol = Symbol('component');

    function weak_map_get(target, sym, key, init){
        if (!target[sym]) {
            target[sym] = new WeakMap();
        }
        let map = target[sym];
        if (!map.has(key)) {
            map.set(key, init());
        }
        return map.get(key);
    }
    
    function create_snippet(tokens) {
        return ($$anchor, params = noop) => renderer($$anchor, ()=>tokens, params);
    }

    function create_component(tokens) {
        return function ($$anchor, props) {
            Self($$anchor, {
                get tokens() {
                    return tokens;
                },
                get params() {
                    return props;
                },
            });
        }
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

    function create_value(tokens) {
        if (tokens.length === 0) {
            return '';
        }
        if (tokens.length === 1) {
            return tokens[0];
        }
        return (params) =>
            tokens.map((t) => token_helper(t, params)).join('');
    }

    function pick(tries, candidates, key = '<#pick>') {
        for(const lang of tries) {
            if (candidates[lang]) {
                return candidates[lang];
            }
        }
        throw new Error(`No translation (${tries.join(', ')}) found for ${key}`);
    }

    function proxy(target, langs, sym, map_val) {
        return new Proxy(target, {
            get(target, prop) {
                const value = Reflect.get(target, prop);
                if(!value || typeof value !== 'object') return value;
                if (localize_symbol in value) {
                    const tokens = pick(langs(), value, value[localize_symbol]);
                    return tokens[sym] ??= map_val(tokens);
                }
                return weak_map_get(value, sym, langs, proxy.bind(null, value, langs, sym, map_val));
            },
            set() {
                throw new Error('Cannot set value on a translations');
            },
            deleteProperty() {
                throw new Error('Cannot delete property on a translations');
            },
        });
    }

    export function create_localize(config, translations){
        let current = $derived(config.resolve ? config.resolve(config.value) : config.value);
        let tries = $derived(config.tries ? config.tries(current) : [current]);

        const get_tries = () => tries;

        const values = proxy(translations, get_tries, valueSymbol, create_value);
        const snippets = proxy(translations, get_tries, snippetSymbol, create_snippet);
        const components = proxy(translations, get_tries, componentSymbol, create_component);

        const as = (value) => {
            const getter = typeof value === 'function' ? value : () => value;
            return create_localize({
                get value() {
                    return getter();
                },
                get tries() {
                    return config.tries;
                },
                get resolve() {
                    return config.resolve;
                },
            }, translations)
        };

        const _pick = (candidates) => {
            return pick(untrack(() => tries), candidates);
        }

        return {
            get as(){
                return as;
            },
            get value(){
                return config.value;
            },
            set value(value) {
                config.value = value;
            },
            get current() {
                return current;
            },
            get pick(){
                return tries,_pick;
            },
            get T(){
                return values;
            },
            get S(){
                return snippets;
            },
            get C(){
                return components;
            },
        };
    }
</script>

<script>
    let { tokens, params } = $props();
</script>

{#snippet var_helper(value, param) }
    {#if typeof value === 'function' }
        {@render value(param, var_helper) }
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

{@render renderer(tokens, params)}
