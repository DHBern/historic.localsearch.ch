<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
</script>

<div class="container mx-auto flex items-center justify-center">
	<div>
		<h2 data-splash={Math.round(Math.random() * (3 - 1) + 1)} class="text-2xl">
			{m.khaki_wet_mud_squish()}
		</h2>
		<form method="POST" action={'search?/search'}>
			<input name="searchstring" type="text" maxlength="60" />
		</form>
	</div>
</div>
