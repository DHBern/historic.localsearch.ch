<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';
	import pdfIds from './pdfIds.json';

	let { form }: { data: PageData; form: ActionData } = $props();
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
	const resetFullText = (event: Event) => {
		if (textfields?.searchstring) {
			textfields.searchstring.value = '';
		}
		if (from < 1911) {
			fromToFields[0] = '1911';
		} else if (from > 1937) {
			fromToFields[0] = '1937';
		}
		if (to < 1911) {
			fromToFields[1] = '1911';
		} else if (to > 1937) {
			fromToFields[1] = '1937';
		}
	};
	const resetTopical = (event: Event) => {
		Object.values(textfields).forEach((field) => {
			if (field && field.name !== 'searchstring') {
				field.value = '';
			}
		});
	};
	const textfields = $state<Record<string, HTMLInputElement | undefined>>({});
	const fromToFields = $state<string[]>([]);
	const from = $derived(Number(fromToFields[0]));
	const to = $derived(Number(fromToFields[1]));
</script>

<form
	method="POST"
	class="container mx-auto flex flex-col justify-center"
	action="?/search"
	data-bg-color="white"
	use:enhance
>
	<div class="box mx-auto flex w-full flex-col items-center px-4 pb-10 sm:w-fit md:px-16">
		<div class="w-[300px] md:w-[370px]">
			<h2>{m.emerald_soft_wood_carve()}</h2>
			<label>
				<span>{m.jasper_brown_rock_smooth()}</span>
				<input
					type="number"
					min="1880"
					max="1950"
					defaultValue="1880"
					bind:value={fromToFields[0]}
					onchange={() => {
						if (from > to) fromToFields[1] = from.toString();
					}}
					name="from"
				/>
				—
				<input
					type="number"
					min="1880"
					max="1950"
					defaultValue="1950"
					bind:value={fromToFields[1]}
					name="to"
					onchange={() => {
						if (to < from) fromToFields[0] = to.toString();
					}}
				/>
			</label>
			<!-- fuzzy search is non functional atm -->
			<!-- <label>
			<span>{m.ochre_salty_ocean_spray()}</span>
			<select>
				<option value="0">{m.bronze_cool_rain_drop()}</option>
				<option value="1">{m.purple_fast_dog_run()}</option>
			</select>
		</label> -->
		</div>
		<label>
			<h2>{m.lime_sweet_fruit_taste()}</h2>
			<input
				type="text"
				maxlength="60"
				onfocus={resetTopical}
				bind:this={textfields.searchstring}
				name="searchstring"
			/>
		</label>
	</div>
	<button
		class="mx-auto h-10 w-fit -translate-y-5 rounded-full border border-current bg-white px-12 font-bold"
		type="submit">{m.ochre_salty_ocean_spray()}</button
	>
	<!-- {#if to <= 1937 && from >= 1911} -->
	<div class="box mx-auto flex w-full flex-col items-center px-4 pb-10 sm:w-fit md:px-16">
		<div class="w-[300px] md:w-[370px]">
			<h2>{m.garnet_red_gem_glow()}</h2>
			<p>{m.moonstone_white_gem_gleam()}</p>
		</div>
		<input
			class="mt-4"
			type="text"
			onfocus={resetFullText}
			bind:this={textfields.entityname1}
			maxlength="60"
			name="entityname1"
			placeholder={m.ruby_smooth_glass_cut()}
		/>
		<input
			class="mt-4"
			type="text"
			onfocus={resetFullText}
			bind:this={textfields.entityname2}
			maxlength="60"
			name="entityname2"
			placeholder={m.mint_bitter_leaf_chew()}
		/>
		<input
			class="mt-4"
			type="text"
			onfocus={resetFullText}
			bind:this={textfields.supplement}
			maxlength="60"
			name="supplement"
			placeholder={m.indigo_hot_flame_flicker()}
		/>
		<input
			class="mt-4"
			type="text"
			onfocus={resetFullText}
			bind:this={textfields.street}
			maxlength="60"
			name="street"
			placeholder={m.agate_soft_silk_weave()}
		/>
		<input
			class="mt-4"
			type="text"
			onfocus={resetFullText}
			bind:this={textfields.locality}
			maxlength="60"
			name="locality"
			placeholder={m.jade_dull_stone_grind()}
		/>
		<input
			class="mt-4"
			type="text"
			onfocus={resetFullText}
			bind:this={textfields.phonenumber}
			maxlength="60"
			name="phonenumber"
			placeholder={m.lavender_dim_shadow_hide()}
		/>
	</div>
	<button
		class="mx-auto h-10 w-fit -translate-y-5 rounded-full border border-current bg-white px-12 font-bold"
		type="submit">{m.ochre_salty_ocean_spray()}</button
	>
	<!-- {/if} -->
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

<style lang="postcss">
	.box {
		box-shadow: 10px 10px 5px #aaa;
		background-color: #fdfd03;
		border: 1px solid #848484;
		border-radius: 1em;
	}
	input[type='text'] {
		width: 300px;
	}
	label span {
		@apply pr-4;
	}
	h2 {
		font-size: 1.5em;
		line-height: 1.5em;
		font-weight: 700;
		margin: 5px 0 5px 0;
		font-family: 'Favorit Regular', Helvetica, Arial, Geneva, Verdana, Tahoma, sans-serif;
		@apply mt-6;
	}
	input {
		padding: 1px 2px 1px 10px;
		border-width: 0 0 1px 0;
		border-style: solid;
		line-height: 1.5em;
	}
	@media screen and (min-width: 780px) {
		input[type='text'] {
			width: 370px;
		}
	}
</style>
