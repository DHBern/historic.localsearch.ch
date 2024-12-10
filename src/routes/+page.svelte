<script>
	const { data } = $props();
</script>

{data.names.length}

<h1>promises</h1>
<ul>
	{#each data.promises as promise}
		<li>
			{#await promise}
				loading
			{:then data}
				{JSON.stringify(data[0])} Total: {data?.length}
			{/await}
		</li>
	{/each}
</ul>
