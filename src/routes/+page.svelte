<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';

	let searchval = $state('');
</script>

<h2>{m.khaki_wet_mud_squish()}</h2>
<form
	onsubmit={(e) => {
		e.preventDefault();
		goto(`${base}/search?q=${encodeURIComponent(searchval)}`);
	}}
>
	<input bind:value={searchval} type="text" maxlength="60" />
</form>
