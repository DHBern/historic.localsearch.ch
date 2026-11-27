<script lang="ts">
	import * as m from '#lib/paraglide/messages.js';
	import { deserialize, enhance } from '$app/forms';
	import { getLocale, localizeHref } from '#lib/paraglide/runtime.js';
	import ResultMap, { type MapPlace, type MapStreet } from '#lib/ResultMap.svelte';
	import typewriter from '#lib/typewriter.ts';
	import type { PageData, ActionData } from './$types';
	import pdfIds from './pdfIds.json';
	import { EXPORT_MAX, exportFileName, formatNumber, scanId } from '#lib/search.ts';
	import { onMount, tick } from 'svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let showresults = $state(20);
	type Entry = NonNullable<NonNullable<ActionData>['results']>[number];
	// the list on screen: under a heading per year when it is ordered by year, else one run of entries (#23)
	const listSort = $derived(form?.sort ?? 'year');
	let visibleResults = $derived.by(() => {
		const groups: { year: number | null; entries: Entry[] }[] = [];
		const displayItems = form?.results?.slice(0, showresults) ?? [];
		if (listSort !== 'year')
			return displayItems.length ? [{ year: null, entries: displayItems }] : [];
		displayItems.forEach((entry) => {
			if (entry.year === null) return;
			const last = groups.at(-1);
			if (last && last.year === entry.year) last.entries.push(entry);
			else groups.push({ year: entry.year, entries: [entry] });
		});
		return groups;
	});
	const resetFullText = () => {
		if (textfields?.searchstring) {
			textfields.searchstring.value = '';
		}
	};
	const resetTopical = () => {
		occupationText = '';
		occupationUnknown = false;
		Object.values(textfields).forEach((field) => {
			if (field && field.name !== 'searchstring') {
				field.value = '';
			}
		});
	};
	const textfields = $state<Record<string, HTMLInputElement | undefined>>({});
	// the years from 1938 on that can be searched by field, as a sentence part: "1938, 1939, 1940 (partly), …"
	const fieldYears = $derived.by(() => {
		const years = data.fieldYears;
		if (!years) return '';
		return [...years.full, ...years.partial]
			.sort((a, b) => a - b)
			.map((year) =>
				years.partial.includes(year) ? `${year} (${m.search_fields_partly()})` : String(year)
			)
			.join(', ');
	});
	const fromToFields = $state<string[]>(['1880', '1950']);
	const from = $derived(Number(fromToFields[0]));
	const to = $derived(Number(fromToFields[1]));
	let loading = $state(false);

	const STEP = 20;
	const loaded = $derived(form?.results?.length ?? 0);
	// the server returns at most 2,500 entries; `total` is the number of all hits (null: unknown)
	const total = $derived(form?.total === undefined ? loaded : form.total);
	const truncated = $derived(total === null || total > loaded);
	const lastYear = $derived(form?.results?.at(-1)?.year);
	const errorText = $derived.by(() => {
		switch (form?.error) {
			case undefined:
				return undefined;
			case 'too_short':
				return m.search_too_short();
			case 'no_criteria':
				return m.scarlet_warm_breeze_blow();
			case 'invalid_years':
				return m.magenta_foggy_mist_cover();
			case 'approx_too_short':
				return m.approx_too_short();
			case 'approx_too_broad':
				return m.approx_too_broad();
			default:
				return m.search_failed();
		}
	});
	let status = $state<HTMLElement>();
	// set once the page reacts to input: before that a submit reloads the page (it still works, but tests wait for it)
	let ready = $state(false);
	onMount(() => {
		ready = true;
	});
	// the occupation register (#58): names in the language of the page (German where there is no other)
	const occupationName = (o: { de: string; fr: string; it: string }) => {
		const locale = getLocale();
		return locale === 'fr' ? o.fr : locale === 'it' ? o.it : o.de;
	};
	const occupationById = $derived(new Map((data.occupations ?? []).map((o) => [o.id, o])));
	const occupationByName = $derived(
		new Map((data.occupations ?? []).map((o) => [occupationName(o).toLowerCase(), o.id]))
	);
	let occupationText = $state('');
	let occupationUnknown = $state(false);
	const occupationId = $derived(occupationByName.get(occupationText.trim().toLowerCase()) ?? '');
	// the books a search can be limited to (#50): one per network until 1910, the regional volumes from 1911
	const bookLabel = (b: {
		book: string;
		kind: string;
		years: string;
		firstYear: number;
		lastYear: number;
	}) => {
		if (b.kind !== 'volume') {
			return `${b.book} (${b.firstYear === b.lastYear ? b.firstYear : `${b.firstYear}–${b.lastYear}`})`;
		}
		const region = { '1': m.book_region_1(), '2': m.book_region_2(), '3': m.book_region_3() }[
			b.book
		];
		return `${m.book_volume({ n: b.book })}${region ? `: ${region}` : ''} (${b.years})`;
	};
	const bookByLabel = $derived(
		new Map((data.books ?? []).map((b) => [bookLabel(b).toLowerCase(), b.book]))
	);
	let bookText = $state('');
	let bookUnknown = $state(false);
	let bookInfoOpen = $state(false);
	const bookId = $derived(bookByLabel.get(bookText.trim().toLowerCase()) ?? '');
	const occupationLabels = (ids: string[]) =>
		ids
			.map((id) => (occupationById.get(id) ? occupationName(occupationById.get(id)!) : id))
			.join(', ');
	const kindLabel = (kind: string) =>
		({
			person: m.kind_person(),
			firma: m.kind_firma(),
			amt: m.kind_amt(),
			zusatz: m.kind_zusatz()
		})[kind] ?? kind;

	// the map of the hits (#45): asked for only when it is opened
	type MapData = {
		places: MapPlace[];
		total: number;
		shown: number;
		noLocality: number;
		unresolved: number;
	};
	let formElement = $state<HTMLFormElement>();
	let lastQuery: FormData | undefined; // the search the list on screen answers
	let mapOpen = $state(false);
	let mapLoading = $state(false);
	let mapFailed = $state(false);
	let mapData = $state<MapData>();
	let mapYear = $state(1937);
	// a click on a circle narrows the list to that municipality; the map keeps the whole result
	let picked = $state<{ bfs: number; name: string }>();
	let keepMap = false;
	// the hits of the chosen municipality per street, for the towns that have street points (#46)
	type StreetData = {
		available: boolean;
		bfs?: number;
		streets?: MapStreet[];
		total?: number;
		shown?: number;
	};
	let streetData = $state<StreetData>();

	async function loadStreets(bfs: number) {
		streetData = undefined;
		if (!lastQuery) return;
		try {
			const body = new FormData();
			for (const [key, value] of lastQuery) if (key !== 'place') body.append(key, value);
			body.append('place', String(bfs));
			const response = await fetch('?/streets', {
				method: 'POST',
				body,
				headers: { 'x-sveltekit-action': 'true' }
			});
			const result = deserialize(await response.text());
			// only if the reader has not chosen another place in the meantime
			if (result.type === 'success' && result.data?.streets && picked?.bfs === bfs) {
				streetData = result.data.streets as StreetData;
			}
		} catch {
			// no street points: the map stays at the municipality
		}
	}

	async function openMap() {
		mapOpen = true;
		if (mapData || !lastQuery) return;
		mapLoading = true;
		mapFailed = false;
		try {
			const body = new FormData();
			for (const [key, value] of lastQuery) if (key !== 'place') body.append(key, value);
			const response = await fetch('?/map', {
				method: 'POST',
				body,
				headers: { 'x-sveltekit-action': 'true' }
			});
			const result = deserialize(await response.text());
			if (result.type === 'success' && result.data?.map) {
				mapData = result.data.map as MapData;
				// the map as it was at the end of the years searched (swisstopo has one state per year)
				mapYear = Math.min(1950, Math.max(1880, Number(lastQuery.get('to')) || 1950));
			} else {
				mapFailed = true;
			}
		} catch {
			mapFailed = true;
		}
		mapLoading = false;
	}

	// all hits of the search on screen as a CSV file (#28)
	let exporting = $state(false);
	let exportFailed = $state(false);
	let exportTruncated = $state(false);
	async function exportCsv() {
		if (!lastQuery || exporting) return;
		exporting = true;
		exportFailed = false;
		exportTruncated = false;
		try {
			const response = await fetch(localizeHref('/search/export'), {
				method: 'POST',
				body: lastQuery
			});
			if (!response.ok) throw new Error(String(response.status));
			exportTruncated = response.headers.get('x-export-truncated') === '1';
			const link = document.createElement('a');
			link.href = URL.createObjectURL(await response.blob());
			// the server names the file after the search and the time of the query
			const named = /filename="([^"]+)"/.exec(response.headers.get('content-disposition') ?? '');
			link.download = named ? named[1] : exportFileName(lastQuery, new Date());
			document.body.append(link);
			link.click();
			link.remove();
			URL.revokeObjectURL(link.href);
		} catch {
			exportFailed = true;
		}
		exporting = false;
	}

	async function pick(place: { bfs: number | null; name: string | null } | undefined) {
		picked = place?.bfs ? { bfs: place.bfs, name: place.name ?? '' } : undefined;
		streetData = undefined;
		if (picked) void loadStreets(picked.bfs);
		keepMap = true;
		await tick(); // the hidden field takes the value
		formElement?.requestSubmit();
	}
</script>

<svelte:head>
	<title>{m.page_title_search()} – historic.localsearch</title>
</svelte:head>

<form
	method="POST"
	class="container mx-auto flex flex-col justify-center"
	action="?/search"
	data-bg-color="white"
	data-ready={ready}
	bind:this={formElement}
	use:enhance={({ formData, cancel }) => {
		// a text in the occupation field that is not in the list: say so instead of searching without it
		occupationUnknown = occupationText.trim() !== '' && occupationId === '';
		if (occupationUnknown && String(formData.get('searchstring') ?? '').trim() === '') {
			cancel();
			return;
		}
		// the same for a book that is not in the list
		bookUnknown = bookText.trim() !== '' && bookId === '';
		if (bookUnknown) {
			cancel();
			return;
		}
		// `formElement` is this `<form>` element
		// `formData` is its `FormData` object that's about to be submitted
		// `action` is the URL to which the form is posted
		// calling `cancel()` will prevent the submission
		// `submitter` is the `HTMLElement` that caused the form to be submitted
		loading = true;
		lastQuery = formData;
		const fromMap = keepMap;
		if (keepMap) {
			keepMap = false;
		} else {
			// a new search: the map and the limit to a municipality belong to the old one
			formData.delete('place');
			picked = undefined;
			streetData = undefined;
			mapData = undefined;
			mapOpen = false;
			mapFailed = false;
		}

		return async ({ update }) => {
			// `result` is an `ActionResult` object
			// `update` is a function which triggers the default logic that would be triggered if this callback wasn't set
			await update({ reset: false });
			showresults = STEP;
			loading = false;
			// the forms fill the screen: bring the answer into view
			await tick();
			// not after a choice on the map: the reader is looking at the map
			if (!fromMap) status?.scrollIntoView({ behavior: 'smooth', block: 'start' });
		};
	}}
>
	<input type="hidden" name="place" value={picked?.bfs ?? ''} />
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
			<!-- as typed, or also words that resemble the term (#26) -->
			<label class="mt-2 block">
				<span>{m.search_mode()}</span>
				<select name="mode" data-testid="mode">
					<option value="exact">{m.bronze_cool_rain_drop()}</option>
					<option value="approx">{m.purple_fast_dog_run()}</option>
				</select>
			</label>
			<p class="pt-2 text-sm">{m.search_mode_note()}</p>
			<!-- limit to a book (#50): valid for both searches -->
			<div class="mt-2">
				<label for="book-input"><span>{m.field_book()}</span></label>
				<button
					type="button"
					class="info"
					aria-describedby="book-info"
					aria-expanded={bookInfoOpen}
					aria-label={m.book_info_label()}
					onclick={() => (bookInfoOpen = !bookInfoOpen)}
					data-testid="book-info-button"
				>
					i
				</button>
				<input
					id="book-input"
					class="mt-1 block"
					type="search"
					list="book-list"
					bind:value={bookText}
					maxlength="120"
					autocomplete="off"
					placeholder={m.field_book_all()}
					data-testid="book"
				/>
				<span
					id="book-info"
					role="tooltip"
					class="info-text"
					class:open={bookInfoOpen}
					data-testid="book-info"
				>
					{m.book_info()}
				</span>
				<input type="hidden" name="book" value={bookId} />
				<datalist id="book-list">
					{#each data.books ?? [] as b (b.book)}
						<option value={bookLabel(b)}></option>
					{/each}
				</datalist>
				{#if bookUnknown}
					<p class="pt-1 text-sm" role="alert" data-testid="book-unknown">{m.book_unknown()}</p>
				{/if}
			</div>
			<!-- the order of the list (#23) -->
			<label class="mt-2 block">
				<span>{m.sort_label()}</span>
				<select name="sort" data-testid="sort">
					<option value="year">{m.sort_year()}</option>
					<option value="name">{m.sort_name()}</option>
					<option value="locality">{m.sort_locality()}</option>
				</select>
			</label>
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
		type="submit"
	>
		{#if loading}
			<span in:typewriter={{ speed: 80 }}>
				<!-- eslint-disable-next-line svelte/no-at-html-tags -- our own message text -->
				{@html m.chartreuse_cool_wind_whisper()}
			</span>
		{:else}
			{m.ochre_salty_ocean_spray()}
		{/if}
	</button>
	<div class="box mx-auto flex w-full flex-col items-center px-4 pb-10 sm:w-fit md:px-16">
		<div class="w-[300px] md:w-[370px]">
			<h2>{m.garnet_red_gem_glow()}</h2>
			<p>{m.moonstone_white_gem_gleam()}</p>
			{#if fieldYears}
				<p class="pt-2 text-sm" data-testid="field-years">
					{m.search_fields_from_1938({ years: fieldYears })}
				</p>
			{/if}
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
		<!-- a normalised occupation or trade from the register (#58) -->
		<input
			class="mt-4"
			type="text"
			list="occupation-list"
			onfocus={resetFullText}
			bind:value={occupationText}
			maxlength="80"
			autocomplete="off"
			placeholder={m.field_occupation()}
			data-testid="occupation"
		/>
		<input type="hidden" name="occupation" value={occupationId} />
		<datalist id="occupation-list">
			{#each data.occupations ?? [] as o (o.id)}
				<option value={occupationName(o)}></option>
			{/each}
		</datalist>
		{#if occupationUnknown}
			<p class="w-[300px] pt-1 text-sm md:w-[370px]" role="alert" data-testid="occupation-unknown">
				{m.field_occupation_unknown()}
			</p>
		{/if}
		<p class="w-[300px] pt-2 text-sm md:w-[370px]">{m.field_occupation_note()}</p>
		<!-- what the re-reading of 1938–1950 knows about an entry (#58) -->
		<input
			class="mt-4"
			type="text"
			onfocus={resetFullText}
			bind:this={textfields.alliance}
			maxlength="60"
			name="alliance"
			placeholder={m.field_alliance()}
		/>
		<div class="mt-4 w-[300px] md:w-[370px]">
			<label>
				<span>{m.field_kind()}</span>
				<select name="kind" data-testid="kind">
					<option value="">{m.kind_all()}</option>
					<option value="person">{m.kind_person()}</option>
					<option value="firma">{m.kind_firma()}</option>
					<option value="amt">{m.kind_amt()}</option>
				</select>
			</label>
			<label class="mt-2 block">
				<input type="checkbox" name="nosub" />
				{m.field_nosub()}
			</label>
			<p class="pt-2 text-sm">{m.field_new_note()}</p>
		</div>
	</div>
	<button
		class="mx-auto h-10 w-fit -translate-y-5 rounded-full border border-current bg-white px-12 font-bold"
		type="submit"
	>
		{#if loading}
			<span in:typewriter={{ speed: 80 }}>
				<!-- eslint-disable-next-line svelte/no-at-html-tags -- our own message text -->
				{@html m.chartreuse_cool_wind_whisper()}
			</span>
		{:else}
			{m.ochre_salty_ocean_spray()}
		{/if}
	</button>
</form>

<div class="container mx-auto scroll-mt-4" bind:this={status} aria-live="polite">
	{#if errorText}
		<p class="status" role="alert" data-testid="error">{errorText}</p>
	{:else if form?.results}
		{#if picked}
			<p class="status">
				<button
					class="rounded-full border border-current px-4"
					data-testid="picked"
					aria-label={m.map_only_remove({ name: picked.name })}
					onclick={() => pick(undefined)}
				>
					{m.map_only({ name: picked.name })} ×
				</button>
			</p>
		{/if}
		{#if loaded === 0}
			<p class="status" data-testid="no-hits">{m.amethyst_shiny_crystal_sparkle()}</p>
		{:else}
			<p class="status font-bold" data-testid="hit-count">
				{total === null
					? m.search_hits_more({ count: formatNumber(loaded) })
					: m.search_hits({ count: formatNumber(total) })}
			</p>
			{#if truncated}
				<p class="status" data-testid="truncated">
					{m.search_truncated({ shown: formatNumber(loaded), year: String(lastYear) })}
				</p>
			{/if}
		{/if}
		{#if loaded > 0 || picked}
			<p class="status">
				<button
					class="h-10 rounded-full border border-current px-4"
					data-testid="map-toggle"
					aria-expanded={mapOpen}
					onclick={() => (mapOpen ? (mapOpen = false) : openMap())}
				>
					{mapOpen ? m.map_hide() : m.map_show()}
				</button>
				<span class="experimental">{m.map_experimental()}</span>
			</p>
		{/if}
	{/if}
</div>

{#if mapOpen && form?.results}
	<div class="container mx-auto px-4 pb-6" data-testid="map-panel">
		{#if mapLoading}
			<p class="py-2">{m.map_loading()}</p>
		{:else if mapFailed || !mapData}
			<p class="py-2" role="alert" data-testid="map-error">{m.map_unavailable()}</p>
		{:else}
			<p class="py-2" data-testid="map-shown">
				{m.map_shown({
					shown: formatNumber(mapData.shown),
					total: formatNumber(mapData.total),
					places: formatNumber(mapData.places.length)
				})}
				{#if mapData.noLocality > 0}
					<span data-testid="map-no-locality">
						{m.map_no_locality({ count: formatNumber(mapData.noLocality) })}
					</span>
				{/if}
				{#if mapData.unresolved > 0}
					<span data-testid="map-unresolved">
						{m.map_unresolved({ count: formatNumber(mapData.unresolved) })}
					</span>
				{/if}
			</p>
			{#if mapData.places.length > 0}
				<ResultMap
					places={mapData.places}
					year={mapYear}
					selected={picked?.bfs}
					streets={streetData?.available ? streetData.streets : undefined}
					onpick={pick}
				/>
				{#if picked && streetData?.available && streetData.streets}
					<p class="pt-2" data-testid="map-streets">
						{m.map_streets({
							name: picked.name,
							shown: formatNumber(streetData.shown ?? 0),
							total: formatNumber(streetData.total ?? 0)
						})}
						<span class="text-sm">{m.map_street_source()}.</span>
					</p>
				{/if}
				<!-- the same as text, for those who do not use the map -->
				<p class="pt-3 font-bold">{m.map_largest()}</p>
				<ul class="flex flex-wrap gap-2 py-2" data-testid="map-list">
					{#each mapData.places.slice(0, 12) as place (place.bfs)}
						<li>
							<button class="rounded-full border border-current px-3" onclick={() => pick(place)}>
								{place.name}
								{formatNumber(place.n)}
							</button>
						</li>
					{/each}
				</ul>
			{/if}
			<p class="py-2 text-sm">
				{m.map_note()}
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- localizeHref builds the path -->
				<a href={localizeHref('/coverage')}>{m.coverage_nav()}</a>.
			</p>
		{/if}
	</div>
{/if}

{#if visibleResults.length > 0}
	<div class="container mx-auto" data-testid="list" data-sort={listSort}>
		{#each visibleResults as group (group.year)}
			{#if group.year !== null}
				<h2 class="text-4xl" data-testid="year">{group.year}</h2>
			{/if}
			{#each group.entries as result, i (i)}
				{@const scan = scanId(result.file, result.page)}
				{@const pageLink = `https://iiif.ptt-archiv.ch/iiif/3/${scan}/full/max/0/default.jpg`}
				<div class="flex min-h-24 gap-4 border-t-2 pb-4" data-testid="entry">
					{#if scan}
						<a
							class="thumbnail flex-shrink-0"
							href={pageLink}
							target="_blank"
							aria-label={m.topaz_hard_clay_mold()}
						>
							<img
								src="https://iiif.ptt-archiv.ch/iiif/3/{scan}/full/64,/0/default.jpg"
								srcset="https://iiif.ptt-archiv.ch/iiif/3/{scan}/full/128,/0/default.jpg 2x"
								width="64"
								height="96"
								loading="lazy"
								decoding="async"
								alt={m.topaz_hard_clay_mold()}
								data-testid="thumbnail"
							/>
						</a>
					{:else}
						<div class="thumbnail flex-shrink-0" aria-hidden="true"></div>
					{/if}
					<div>
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
									<br />Tel. {result?.phonenumber}
								{/if}
							</p>
						{/if}
						<dl class="flex flex-wrap gap-2">
							{#if group.year === null && result.year !== null}
								<!-- no heading per year in a list ordered by name or place (#23) -->
								<div data-testid="entry-year">
									<dt>{m.result_year()}</dt>
									<dd>{result.year}</dd>
								</div>
							{/if}
							{#if result.similarity !== undefined && result.similarity < 1}
								<!-- approximate search (#26): not what was typed, but this much like it -->
								<div data-testid="similarity">
									<dt>{m.result_similarity()}</dt>
									<dd>{Math.round(result.similarity * 100)} %</dd>
								</div>
							{/if}
							{#if result.occupations?.length}
								<div data-testid="occupations">
									<dt>{m.result_occupation()}</dt>
									<dd>{occupationLabels(result.occupations)}</dd>
								</div>
							{/if}
							{#if result.kind}
								<div data-testid="kind-of-entry">
									<dt>{m.result_kind()}</dt>
									<dd>{kindLabel(result.kind)}</dd>
								</div>
							{/if}
							{#if result.title}
								<div>
									<dt>{m.result_title()}</dt>
									<dd>{result.title}</dd>
								</div>
							{/if}
							{#if result.alliance}
								<div data-testid="alliance">
									<dt>{m.result_alliance()}</dt>
									<dd>{result.alliance}</dd>
								</div>
							{/if}
							{#if result.network}
								<div>
									<dt>{m.sapphire_rough_metal_bend()}</dt>
									<dd>{result?.network}</dd>
								</div>
							{/if}
							{#if result.file}
								<div>
									<dt>{m.plum_dark_night_fall()}</dt>
									<dd>
										<a
											href="https://mfk.rechercheonline.ch/de/research/records/pttarchiv:{(
												pdfIds as Record<string, number>
											)[result.file]}"
											target="_blank"
										>
											{result.file}
										</a>
									</dd>
								</div>
							{/if}
							{#if result.page && scan}
								<div>
									<dt>{m.topaz_hard_clay_mold()}</dt>
									<dd>
										<a href={pageLink} target="_blank">{result?.page}</a>
									</dd>
								</div>
							{/if}
							{#if result.supplement}
								<div>
									<dt>{m.opal_rough_gravel_scatter()}</dt>
									<dd>{result?.supplement}</dd>
								</div>
							{/if}
							{#if result.aggregatedcontent}
								<div>
									<dt>{m.periwinkle_bitter_tea_brew()}</dt>
									<dd>
										<!-- eslint-disable-next-line svelte/no-at-html-tags -- escaped on the server (excerpt) -->
										{@html result?.aggregatedcontent}
									</dd>
								</div>
							{/if}
						</dl>
					</div>
				</div>
			{/each}
		{/each}
		{#if showresults < loaded}
			<div class="flex justify-center">
				<button
					class="h-10 rounded-full border border-current px-4"
					data-testid="more"
					onclick={() => (showresults += STEP)}
				>
					{m.cobalt_foggy_forest_whisper()} ({formatNumber(showresults)}/{formatNumber(loaded)})
				</button>
			</div>
		{/if}
		<!-- all hits of this search as a file (#28), under the list -->
		<div class="pt-6">
			<p class="status">
				<button
					class="h-10 rounded-full border border-current px-4"
					data-testid="export-csv"
					disabled={exporting}
					onclick={exportCsv}
				>
					{exporting ? m.export_loading() : m.export_csv()}
				</button>
				<span class="pl-2 text-sm">{m.export_note({ max: formatNumber(EXPORT_MAX) })}</span>
			</p>
			{#if exportFailed}
				<p class="status" role="alert" data-testid="export-error">{m.export_failed()}</p>
			{:else if exportTruncated}
				<p class="status" data-testid="export-truncated">
					{m.export_truncated({ max: formatNumber(EXPORT_MAX) })}
				</p>
			{/if}
		</div>
	</div>
{/if}

<style lang="postcss">
	.status {
		@apply px-4 py-2;
	}
	.experimental {
		margin-left: 0.5em;
		padding: 0 0.4em;
		font-size: 0.75em;
		font-variant-caps: all-small-caps;
		letter-spacing: 0.1em;
		background-color: #fdfd03;
	}
	.box {
		box-shadow: 10px 10px 5px #aaa;
		background-color: #fdfd03;
		border: 1px solid #848484;
		border-radius: 1em;
		h2 {
			font-size: 1.5em;
			line-height: 1.5em;
			font-weight: 700;
			margin: 5px 0 5px 0;
			font-family: 'Favorit Regular', Helvetica, Arial, Geneva, Verdana, Tahoma, sans-serif;
			@apply mt-6;
		}
	}
	input[type='text'],
	input[type='search'] {
		width: 300px;
	}
	/* the [i] beside a field: its text shows on hover, on focus and after a tap (#50) */
	.info {
		width: 1.5em;
		height: 1.5em;
		border: 1px solid currentColor;
		border-radius: 50%;
		background: #fff;
		font-weight: 700;
		line-height: 1;
		cursor: help;
	}
	.info-text {
		display: none;
		@apply pt-1 text-sm;
	}
	.info:hover ~ .info-text,
	.info:focus-visible ~ .info-text,
	.info-text.open {
		display: block;
	}
	label span {
		@apply pr-4;
	}
	input {
		padding: 1px 2px 1px 10px;
		border-width: 0 0 1px 0;
		border-style: solid;
		line-height: 1.5em;
	}
	@media screen and (min-width: 780px) {
		input[type='text'],
		input[type='search'] {
			width: 370px;
		}
	}

	dt {
		display: inline;
		margin: 0 0.3em 0 0em;
		padding: 0 0.3em 0 0.3em;
		font-family: 'Favorit Bold', Helvetica, Arial, Geneva, Verdana, Tahoma, sans-serif;
		font-size: 0.75em;
		font-variant-caps: all-small-caps;
		letter-spacing: 0.1em;
		color: #000;
		background-color: rgb(200 223 190);
	}

	dd {
		display: inline;
	}

	a {
		border-bottom: 1px solid #000;
	}
	a:has(img) {
		border-bottom: none;
	}
	/* the scan of the page; the grey box holds its place while it loads, or when an entry has no page */
	.thumbnail {
		width: 64px;
		height: 96px;
		background: #e5e5e5;
	}
	.thumbnail img {
		width: 64px;
		height: 96px;
		object-fit: cover;
		object-position: top;
	}
</style>
