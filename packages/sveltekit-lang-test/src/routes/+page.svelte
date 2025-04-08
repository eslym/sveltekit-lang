<script lang="ts" module>
    import { availableLocales, localize } from '$lang';

    const L = localize();
</script>

<script lang="ts">
    let world = $state('World');

    if(!import.meta.env.SSR) {
        $effect.pre(() => {
            document.documentElement.lang = L.T.attr;
        });
    }
</script>

<p>
    <select bind:value={L.value}>
        {#each availableLocales as lang}
            <option value={lang}>{lang}</option>
        {/each}
    </select>
</p>
<p>
    <input type="text" bind:value={world}/>
</p>
<p>
    {L.T.test.simple}
</p>
<p>
    {L.T.test.param({ name: world })}
</p>
<p>
    {L.T.test.function({ name: () => world })}
</p>
<p>
    {#snippet bold_name() }
        <strong>{world}</strong>
    {/snippet}
    {@render L.S.test.function({ name: bold_name })}
</p>
<p>
    <L.C.test.function>
        {#snippet name()}
            <strong>{world}</strong>
        {/snippet}
    </L.C.test.function>
</p>
