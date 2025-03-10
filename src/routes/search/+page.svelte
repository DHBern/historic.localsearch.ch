<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	$inspect(form);
</script>

<form method="POST" action="?/search" use:enhance>
	<h2>Options</h2>
	<label>
		<span>{m.jasper_brown_rock_smooth()}</span>
		<input type="number" min="0" max="100" />
	</label>
	<label>
		<span>{m.ochre_salty_ocean_spray()}</span>
		<select>
			<option value="0">{m.bronze_cool_rain_drop()}</option>
			<option value="1">{m.purple_fast_dog_run()}</option>
		</select>
	</label>
	<label>
		<h2>{m.lime_sweet_fruit_taste()}</h2>
		<input type="text" maxlength="60" name="searchstring" />
	</label>
	<button type="submit">{m.ochre_salty_ocean_spray()}</button>
</form>
