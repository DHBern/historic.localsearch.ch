<script lang="ts">
	import * as m from '#lib/paraglide/messages.js';
	import { getLocale, localizeHref } from '#lib/paraglide/runtime.js';
	import { formatNumber } from '#lib/search.ts';
	import { pageShare, volumeLabel } from '#lib/coverage.ts';
	import pdfIds from '../search/pdfIds.json';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const catalogue = pdfIds as Record<string, number>;

	let volumes = $derived(data.volumes ?? []);
	let entries = $derived(volumes.reduce((sum, volume) => sum + volume.entries, 0));
	let updated = $derived(
		volumes.length > 0
			? new Date(Math.max(...volumes.map((volume) => volume.updated.getTime())))
			: null
	);
</script>

<svelte:head>
	<title>{m.coverage_title()} – historic.localsearch</title>
</svelte:head>

<div class="container mx-auto" data-bg-color="white">
	<h2 class="text-4xl">{m.coverage_title()}</h2>
	{#if !data.volumes}
		<p class="mt-4" data-testid="unavailable">{m.coverage_unavailable()}</p>
	{:else}
		<p class="mt-4 max-w-prose" data-testid="summary">
			{m.coverage_intro({
				volumes: formatNumber(volumes.length),
				from: String(volumes[0].year),
				to: String(volumes[volumes.length - 1].year),
				entries: formatNumber(entries)
			})}
		</p>
		<p class="mt-2 max-w-prose">{m.coverage_pages_note()}</p>
		<p class="mt-2">
			{#if updated}
				{m.coverage_updated({
					date: updated.toLocaleDateString(`${getLocale()}-CH`, { timeZone: 'Europe/Zurich' })
				})} ·
			{/if}
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- localizeHref builds the path -->
			<a href={localizeHref('/search')}>{m.coverage_to_search()}</a>
		</p>

		{#if data.missing.length > 0}
			<h3 class="mt-6 text-2xl">{m.coverage_missing_title()}</h3>
			<p>{m.coverage_missing_text()}</p>
			<ul class="list-inside list-disc" data-testid="missing">
				{#each data.missing as file (file)}
					<li>
						<a
							href="https://mfk.rechercheonline.ch/de/research/records/pttarchiv:{catalogue[file]}"
							target="_blank"
						>
							{file}
						</a>
					</li>
				{/each}
			</ul>
		{/if}

		<div class="mt-6 overflow-x-auto">
			<table class="w-full text-left">
				<thead>
					<tr>
						<th scope="col">{m.coverage_col_year()}</th>
						<th scope="col">{m.coverage_col_volume()}</th>
						<th scope="col">{m.coverage_col_places()}</th>
						<th scope="col" class="text-right">{m.coverage_col_entries()}</th>
						<th scope="col" class="text-right">{m.coverage_col_pages()}</th>
						<th scope="col">{m.coverage_col_fields()}</th>
					</tr>
				</thead>
				<tbody>
					{#each volumes as volume (volume.file)}
						{@const share = pageShare(volume.pages, volume.firstPage, volume.lastPage)}
						{@const span =
							volume.firstPage !== null && volume.lastPage !== null
								? volume.lastPage - volume.firstPage + 1
								: volume.pages}
						<tr data-testid="volume">
							<td>{volume.year}</td>
							<td>
								{#if catalogue[volume.file]}
									<a
										href="https://mfk.rechercheonline.ch/de/research/records/pttarchiv:{catalogue[
											volume.file
										]}"
										target="_blank"
										title={volume.file}
									>
										{volumeLabel(volume.file)}
									</a>
								{:else}
									<span title={volume.file}>{volumeLabel(volume.file)}</span>
								{/if}
							</td>
							<td>{volume.places}</td>
							<td class="text-right">{formatNumber(volume.entries)}</td>
							<td class="whitespace-nowrap text-right" class:low={share !== null && share < 80}>
								{m.coverage_pages({ pages: formatNumber(volume.pages), span: formatNumber(span) })}
								{#if share !== null}({share} %){/if}
							</td>
							<td class:low={volume.withFields === 0}>
								{volume.withFields > 0 ? m.coverage_yes() : m.coverage_no()}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>

<style>
	a {
		border-bottom: 1px solid #000;
	}
	th {
		font-family: 'Favorit Bold', Helvetica, Arial, Geneva, Verdana, Tahoma, sans-serif;
		border-bottom: 2px solid #000;
		position: sticky;
		top: 0;
		background: #fff;
	}
	th,
	td {
		padding: 0.25rem 0.75rem 0.25rem 0;
		vertical-align: top;
	}
	tbody tr {
		border-top: 1px solid #ddd;
	}
	/* a gap worth knowing about */
	.low {
		background-color: #fdfd03;
	}
</style>
