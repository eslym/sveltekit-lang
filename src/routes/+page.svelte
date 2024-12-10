<script lang="ts" module>
	const L = new Lang();

	L.changed(() => {
		document.documentElement.lang = L.t.attr();
	});
</script>

<script lang="ts">
	import { Lang, availableLangs } from '$lib/index.ts';
</script>

<h1>{L._('hello', { name: L._('world') })}</h1>

<select bind:value={L.lang}>
	{#each availableLangs as lang}
		<option value={lang}>{lang}</option>
	{/each}
</select>
