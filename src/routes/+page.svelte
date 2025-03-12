<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';

	let searchval = $state('');
</script>

<h2>{m.khaki_wet_mud_squish()}</h2>
<form method="POST" action={'search?/search'}>
	<input bind:value={searchval} name="searchstring" type="text" maxlength="60" />
</form>
