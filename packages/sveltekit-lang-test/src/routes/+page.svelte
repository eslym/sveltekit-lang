<script lang="ts" module>
    import { availableLangs, Localize } from '$lang';

    const Localization = new Localize();
    const T = Localization.translations;
</script>
<script lang="ts">
    let name = $state('World');
</script>

<p>
    <select bind:value={Localization.lang}>
        {#each availableLangs as lang}
            <option value={lang}>{lang}</option>
        {/each}
    </select>
</p>

<p>
    <input type="text" bind:value={name}/>
</p>

<p>
    {T.test.simple}
</p>

<p>
    {T.test.param({ name })}
</p>

<p>
    {T.test.function({ name: ()=>name })}
</p>

<p>
    {#snippet bold_name(val: any) }
        <strong>{name}</strong>
    {/snippet}
    {@render Localization.snippets.test.function({ name: bold_name })}
</p>
