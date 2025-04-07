<script module>
    import { untrack } from 'svelte';
    import Self from './runtime.svelte';

    export const localizeSymbol = Symbol('localization');

    const valueSymbol = Symbol('value');
    const snippetSymbol = Symbol('snippet');
    const componentSymbol = Symbol('component');
    
    function create_snippet(tokens) {
        return ($$anchor, params) => renderer($$anchor, ()=>tokens, params);
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

    function create_value(tokens) {
        if (tokens.length === 1) {
            const value = tokens[0];
            return new Proxy(value, {
                apply(target) {
                    return target;
                }
            });
        }
        return (params) =>
            tokens.map((t) => (typeof t === 'function' ? t(params) : t.toString())).join('');
    }

    function pick(tries, candidates, key = '<#pick>') {
        for(const lang of tries) {
            if (candidates[lang]) {
                return candidates[lang];
            }
        }
        throw new Error(`No translation (${tries.join(', ')}) found for ${key}`);
    }

    function value_proxy(target, langs){
        return new Proxy(target, {
            get(target, prop) {
                const value = Reflect.get(target, prop);
                if(!value || typeof value !== 'object') return value;
                if (localizeSymbol in value) {
                    const tokens = pick(langs(), value);
                    return tokens[valueSymbol] ??= create_value(tokens);
                }
                return value_proxy(value, langs);
            },
            set() {
                throw new Error('Cannot set value on a proxy');
            },
            deleteProperty() {
                throw new Error('Cannot delete property on a proxy');
            },
        });
    }

    function snippet_proxy(target, langs){
        return new Proxy(target, {
            get(target, prop) {
                const value = Reflect.get(target, prop);
                if(!value || typeof value !== 'object') return value;
                if (localizeSymbol in value) {
                    const tokens = pick(langs(), value);
                    return tokens[snippetSymbol] ??= create_snippet(tokens);
                }
                return snippet_proxy(value, langs);
            },
            set() {
                throw new Error('Cannot set value on a proxy');
            },
            deleteProperty() {
                throw new Error('Cannot delete property on a proxy');
            },
        });
    }

    function component_proxy(target, langs){
        return new Proxy(target, {
            get(target, prop) {
                const value = Reflect.get(target, prop);
                if(!value || typeof value !== 'object') return value;
                if (localizeSymbol in value) {
                    const tokens = pick(langs(), value);
                    return tokens[componentSymbol] ??= create_component(tokens);
                }
                return component_proxy(value, langs);
            },
            set() {
                throw new Error('Cannot set value on a proxy');
            },
            deleteProperty() {
                throw new Error('Cannot delete property on a proxy');
            },
        });
    }

    export function create_localize(config, translations){
        let current = $derived(config.resolve ? config.resolve(config.value) : config.value);
        let tries = $derived(config.tries ? config.tries(current) : [current]);

        const values = value_proxy(translations, () => tries);
        const snippets = snippet_proxy(translations, () => tries);
        const components = component_proxy(translations, () => tries);

        const as = (value) => create_localize({
            get value() {
                return value;
            },
            get tries() {
                return config.tries;
            },
            get resolve() {
                return config.resolve;
            },
        }, translations);

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
                current = value;
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
    {#if value instanceof Function }
        {@render value(param, var_helper) }
    {:else}
        {value}
    {/if}
{/snippet}

{#snippet renderer(tokens, params)}
    {#each tokens as token}
        {#if typeof token === 'function'}
            {@render var_helper(token(params), token.param)}
        {:else}
            {token}
        {/if}
    {/each}
{/snippet}

{@render renderer(tokens, params)}
