<script lang="ts">
	import * as m from '#lib/paraglide/messages.js';
	import { localizeHref } from '#lib/paraglide/runtime.js';
	import ResultMap, { type MapPlace } from '#lib/ResultMap.svelte';
	import { formatNumber } from '#lib/search.ts';
	import { onMount } from 'svelte';
	import type { PageData } from './$types';

	// The network without a search (#6): entries per municipality of today for one year, a slider over the
	// years, and the entries per year with the incomplete years marked.

	let { data }: { data: PageData } = $props();

	const years = $derived(data.years ?? []);
	const first = $derived(years[0]?.year ?? 1880);
	const last = $derived(years[years.length - 1]?.year ?? 1950);
	const totals = $derived(new Map(years.map((row) => [row.year, row])));
	const gaps = $derived(new Map(data.incomplete.map((row) => [row.year, row])));

	let year = $state(1910);
	let places = $state<MapPlace[]>([]);
	let shown = $state<number>(); // the year the circles on the map are of
	let failed = $state(false);
	let ready = $state(false);
	// (a plain map: nothing on the page depends on what is in it)
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const cache = new Map<number, MapPlace[]>();

	async function show(wanted: number) {
		try {
			if (!cache.has(wanted)) {
				const response = await fetch(`${localizeHref('/map/data')}?year=${wanted}`);
				if (!response.ok) throw new Error(String(response.status));
				cache.set(wanted, (await response.json()).places as MapPlace[]);
			}
			// only if the reader has not moved on in the meantime
			if (wanted !== year) return;
			places = cache.get(wanted)!;
			shown = wanted;
			failed = false;
		} catch {
			if (wanted === year) failed = true;
		}
	}

	// a slider that is dragged passes many years: ask for the one it rests on
	let timer: ReturnType<typeof setTimeout> | undefined;
	function go(to: number, now = false) {
		year = Math.min(last, Math.max(first, to));
		clearTimeout(timer);
		if (now || cache.has(year)) void show(year);
		else timer = setTimeout(() => void show(year), 150);
	}

	let playing = $state(false);
	let player: ReturnType<typeof setInterval> | undefined;
	function stop() {
		playing = false;
		clearInterval(player);
	}
	function play() {
		if (playing) return stop();
		playing = true;
		if (year >= last) go(first, true);
		player = setInterval(() => {
			if (year >= last) return stop();
			go(year + 1, true);
		}, 900);
	}

	// one municipality: its entries per year instead of those of the country
	let picked = $state<{ bfs: number; name: string }>();
	let series = $state<Map<number, number>>();
	async function pick(place: { bfs: number | null; name: string | null } | undefined) {
		picked = place?.bfs ? { bfs: place.bfs, name: place.name ?? '' } : undefined;
		series = undefined;
		if (!picked) return;
		const bfs = picked.bfs;
		try {
			const response = await fetch(`${localizeHref('/map/data')}?place=${bfs}`);
			if (!response.ok) throw new Error(String(response.status));
			const rows = (await response.json()).series as { year: number; n: number }[];
			if (picked?.bfs === bfs) series = new Map(rows.map((row) => [row.year, row.n]));
		} catch {
			// no series: the chart stays that of the country
			if (picked?.bfs === bfs) picked = undefined;
		}
	}

	onMount(() => {
		const asked = Number(new URLSearchParams(location.search).get('year'));
		go(Number.isInteger(asked) && asked >= first && asked <= last ? asked : year, true);
		ready = true;
		return () => {
			clearTimeout(timer);
			clearInterval(player);
		};
	});

	// The height of a bar. Not a style attribute in the page as the server sends it: the Content-Security-Policy
	// (#30) allows no inline styles, and the browser would drop it.
	function tall(node: HTMLElement, percent: number) {
		const set = (value: number) => (node.style.height = `${value}%`);
		set(percent);
		return { update: set };
	}

	const total = $derived(totals.get(year));
	const gap = $derived(gaps.get(year));
	const pickedNow = $derived(
		picked ? (places.find((place) => place.bfs === picked!.bfs)?.n ?? 0) : 0
	);

	// the bars: every year from the first to the last, also those without any volume
	const bars = $derived.by(() => {
		const all = [];
		for (let y = first; y <= last; y++) {
			const row = totals.get(y);
			const value = series ? (series.get(y) ?? 0) : (row?.entries ?? 0);
			const dark = series ? value : (row?.placed ?? 0);
			all.push({ year: y, value, dark, incomplete: gaps.has(y) });
		}
		const most = Math.max(1, ...all.map((bar) => bar.value));
		return all.map((bar) => ({
			...bar,
			height: (100 * bar.value) / most,
			darkHeight: bar.value > 0 ? (100 * bar.dark) / bar.value : 0
		}));
	});
</script>

<svelte:head>
	<title>{m.netmap_title()} – historic.localsearch</title>
</svelte:head>

<div class="container mx-auto px-4 pb-8" data-bg-color="white" data-ready={ready}>
	<h2 class="text-4xl">
		{m.netmap_title()} <span class="experimental">{m.map_experimental()}</span>
	</h2>
	{#if !data.years}
		<p class="mt-4" data-testid="unavailable">{m.netmap_unavailable()}</p>
	{:else}
		<p class="mt-4 max-w-prose">{m.netmap_intro()}</p>

		<div class="mt-4 flex flex-wrap items-center gap-3">
			<label class="font-bold" for="netmap-year">{m.netmap_year()}</label>
			<button
				class="round"
				aria-label={m.netmap_prev()}
				title={m.netmap_prev()}
				data-testid="year-prev"
				disabled={year <= first}
				onclick={() => go(year - 1, true)}
			>
				‹
			</button>
			<input
				id="netmap-year"
				class="min-w-40 flex-1"
				type="range"
				min={first}
				max={last}
				step="1"
				value={year}
				data-testid="year-slider"
				oninput={(event) => go(Number(event.currentTarget.value))}
			/>
			<button
				class="round"
				aria-label={m.netmap_next()}
				title={m.netmap_next()}
				data-testid="year-next"
				disabled={year >= last}
				onclick={() => go(year + 1, true)}
			>
				›
			</button>
			<output class="w-16 text-2xl font-bold" for="netmap-year" data-testid="year-shown">
				{year}
			</output>
			<button
				class="h-10 rounded-full border border-current px-4"
				data-testid="year-play"
				aria-pressed={playing}
				onclick={play}
			>
				{playing ? m.netmap_stop() : m.netmap_play()}
			</button>
		</div>

		<p class="py-2" data-testid="summary" aria-live="polite">
			{m.netmap_summary({
				year: String(year),
				entries: formatNumber(total?.entries ?? 0),
				placed: formatNumber(total?.placed ?? 0),
				places: formatNumber(total?.places ?? 0)
			})}
		</p>
		{#if gap}
			<p class="incomplete" data-testid="incomplete">
				<strong>{m.netmap_incomplete()}</strong>
				{#if gap.missing.length > 0}{m.netmap_missing({ volumes: gap.missing.join(', ') })}{/if}
				{#if gap.gaps.length > 0}{m.netmap_gaps({ volumes: gap.gaps.join(', ') })}{/if}
				{#if gap.noFields.length > 0}{m.netmap_nofields({
						volumes: gap.noFields.join(', ')
					})}{/if}
				{m.netmap_details()}
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- localizeHref builds the path -->
				<a href={localizeHref('/coverage')}>{m.coverage_nav()}</a>.
			</p>
		{/if}
		{#if failed}
			<p class="py-2" role="alert" data-testid="map-error">{m.netmap_unavailable()}</p>
		{/if}

		<div data-testid="netmap" data-shown={shown}>
			<ResultMap
				{places}
				{year}
				largest={data.largest}
				keepView
				unit="entries"
				selected={picked?.bfs}
				onpick={pick}
			/>
		</div>

		<div class="mt-4 flex flex-wrap items-baseline gap-3">
			<p class="font-bold" data-testid="chart-title">
				{picked && series ? m.netmap_chart_place({ name: picked.name }) : m.netmap_chart_all()}
			</p>
			{#if picked}
				<button
					class="rounded-full border border-current px-3"
					data-testid="place-reset"
					onclick={() => pick(undefined)}
				>
					{m.netmap_place_reset()} ×
				</button>
			{/if}
		</div>
		{#if picked && series}
			<p data-testid="place-year">
				{m.netmap_place_year({
					name: picked.name,
					count: formatNumber(pickedNow),
					year: String(year)
				})}
			</p>
		{/if}
		<!-- the slider above does the same by keyboard; the bars are for the pointer -->
		<div class="chart" data-testid="chart">
			{#each bars as bar (bar.year)}
				<button
					class="bar"
					class:incomplete-year={bar.incomplete}
					class:current={bar.year === year}
					tabindex="-1"
					title={m.netmap_chart_bar({ year: String(bar.year), count: formatNumber(bar.value) })}
					aria-label={m.netmap_chart_bar({
						year: String(bar.year),
						count: formatNumber(bar.value)
					})}
					data-year={bar.year}
					data-value={bar.value}
					onclick={() => go(bar.year, true)}
				>
					<span class="column" use:tall={bar.height}>
						<span class="dark" use:tall={bar.darkHeight}></span>
					</span>
				</button>
			{/each}
		</div>
		<div class="axis" aria-hidden="true">
			{#each bars as bar (bar.year)}
				<span>{bar.year % 10 === 0 ? bar.year : ''}</span>
			{/each}
		</div>

		{#if places.length > 0}
			<!-- the same as text, for those who do not use the map -->
			<p class="pt-4 font-bold">{m.netmap_largest()} ({shown})</p>
			<ul class="flex flex-wrap gap-2 py-2" data-testid="map-list">
				{#each places.slice(0, 12) as place (place.bfs)}
					<li>
						<button class="rounded-full border border-current px-3" onclick={() => pick(place)}>
							{place.name}
							{formatNumber(place.n)}
						</button>
					</li>
				{/each}
			</ul>
		{/if}
		<p class="py-2">
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- localizeHref builds the path -->
			<a href={localizeHref('/search')}>{m.netmap_to_search()}</a>
		</p>
	{/if}
</div>

<style>
	a {
		border-bottom: 1px solid #000;
	}
	.experimental {
		margin-left: 0.3em;
		padding: 0 0.4em;
		font-size: 0.4em;
		font-variant-caps: all-small-caps;
		letter-spacing: 0.1em;
		vertical-align: middle;
		background-color: #fdfd03;
	}
	.round {
		width: 2.5rem;
		height: 2.5rem;
		border: 1px solid currentColor;
		border-radius: 9999px;
		font-size: 1.25rem;
		line-height: 1;
	}
	.round:disabled {
		opacity: 0.35;
	}
	.incomplete {
		margin-bottom: 0.5rem;
		padding: 0.25rem 0.5rem;
		background-color: #fdfd03;
	}
	.chart,
	.axis {
		display: flex;
		width: 100%;
	}
	.chart {
		height: 7rem;
		margin-top: 0.5rem;
		border-bottom: 1px solid #000;
	}
	.bar {
		position: relative;
		flex: 1 1 0;
		min-width: 0;
		height: 100%;
	}
	/* a gap worth knowing about: the colour of the coverage page */
	.bar.incomplete-year {
		background-color: #fdfd03;
	}
	.bar.current {
		outline: 2px solid #e4003a;
		outline-offset: -1px;
	}
	.column {
		position: absolute;
		right: 1px;
		bottom: 0;
		left: 1px;
		min-height: 1px;
		background-color: #9a9a9a;
	}
	.dark {
		position: absolute;
		right: 0;
		bottom: 0;
		left: 0;
		background-color: #000;
	}
	.axis span {
		flex: 1 1 0;
		min-width: 0;
		overflow: visible;
		font-size: 0.75rem;
		white-space: nowrap;
	}
</style>
