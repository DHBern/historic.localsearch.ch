<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';
	import pdfIds from './pdfIds.json';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	$inspect(form);
	let showresults = $state(20);
	let visibleResults = $derived.by(() => {
		let sorted: Record<
			number,
			{
				year: number | null;
				page: number | null;
				file: string | null;
				aggregatedcontent: string | null;
				network: string | null;
				entityname1: string | null;
				entityname2: string | null;
				locality: string | null;
				phonenumber: string | null;
				street: string | null;
				supplement: string | null;
			}[]
		> = {};
		const displayItems = form?.results?.slice(0, showresults);
		displayItems?.forEach((entry) => {
			if (entry.year !== null) {
				if (sorted[entry.year]) {
					sorted[entry.year].push(entry);
				} else {
					sorted[entry.year] = [entry];
				}
			}
		});
		return sorted;
	});
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

{#if Object.keys(visibleResults).length > 0}
	{#each Object.keys(visibleResults) as year}
		<h2>{year}</h2>
		{#each visibleResults[Number(year)] as result}
			{#if result.entityname1}
				<p>
					<span class="font-bold">{result?.entityname1}</span>
					{#if result.entityname2}
						<br />{result?.entityname2}
					{/if}
					{#if result.street}
						<br />{result?.street}
					{/if}
					{#if result.locality}
						<br />{result?.locality}
					{/if}
					{#if result.phonenumber}
						<br />{result?.phonenumber}
					{/if}
				</p>
			{/if}

			<dl>
				{#if result.file}
					<dt>{m.plum_dark_night_fall()}</dt>
					<dd>
						<a
							href="https://mfk.rechercheonline.ch/de/research/records/pttarchiv:{(
								pdfIds as Record<string, number>
							)[result.file]}"
							target="_blank">{result.file}</a
						>
					</dd>
				{/if}
				{#if result.page}
					<dt>{m.topaz_hard_clay_mold()}</dt>
					<dd>
						<a
							href="https://iiif.ptt-archiv.ch/iiif/3/{result.file?.replaceAll(
								'\u{0065}\u{0300}',
								'\u{00e8}'
							)}_{String(result.page).padStart(4, '0')}.jp2/full/max/0/default.jpg"
							target="_blank">{result?.page}</a
						>
					</dd>
				{/if}
				{#if result.network}
					<dt>{m.sapphire_rough_metal_bend()}</dt>
					<dd>{result?.network}</dd>
				{/if}
				{#if result.supplement}
					<dt>{m.opal_rough_gravel_scatter()}</dt>
					<dd>{result?.supplement}</dd>
				{/if}
				{#if result.aggregatedcontent}
					<dt>{m.periwinkle_bitter_tea_brew()}</dt>
					<dd>{result?.aggregatedcontent}</dd>
				{/if}
			</dl>
		{/each}
	{/each}
	<button onclick={() => (showresults += 20)}>{m.cobalt_foggy_forest_whisper()}</button>
{/if}
