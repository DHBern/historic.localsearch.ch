<script lang="ts">
	import 'leaflet/dist/leaflet.css';
	import * as m from '#lib/paraglide/messages.js';
	import { formatNumber } from '#lib/search.ts';
	import { onMount } from 'svelte';
	import type { Map as LeafletMap, LayerGroup } from 'leaflet';

	export type MapPlace = {
		bfs: number | null;
		name: string | null;
		canton: string | null;
		lat: number;
		lon: number;
		n: number;
		uncertain: number;
	};

	let {
		places,
		year,
		onpick
	}: { places: MapPlace[]; year: number; onpick: (place: MapPlace) => void } = $props();

	let element: HTMLDivElement;
	let map: LeafletMap | undefined;
	let circles: LayerGroup | undefined;
	let leaflet: typeof import('leaflet') | undefined;

	const label = (place: MapPlace) => {
		const text = m.map_tooltip({
			name: place.name ?? '',
			canton: place.canton ?? '',
			count: formatNumber(place.n)
		});
		return place.uncertain > 0
			? `${text} – ${m.map_tooltip_uncertain({ count: formatNumber(place.uncertain) })}`
			: text;
	};

	function draw() {
		if (!leaflet || !map || !circles) return;
		const L = leaflet;
		circles.clearLayers();
		const largest = Math.max(1, ...places.map((place) => place.n));
		// smaller circles on a small map
		const scale = Math.min(1, Math.max(0.5, element.clientWidth / 900));
		// the area of a circle stands for the hits; the large ones first, so the small stay on top
		for (const place of places) {
			const circle = L.circleMarker([place.lat, place.lon], {
				radius: (3 + 19 * Math.sqrt(place.n / largest)) * scale,
				color: '#000',
				weight: 1,
				fillColor: '#fdfd03',
				fillOpacity: 0.65
			});
			// text only: Leaflet would read a string as HTML
			const tip = document.createElement('span');
			tip.textContent = label(place);
			circle.bindTooltip(tip);
			circle.on('click', () => onpick(place));
			circle.addTo(circles);
		}
		if (places.length > 0) {
			map.fitBounds(L.latLngBounds(places.map((place) => [place.lat, place.lon])).pad(0.05), {
				maxZoom: 11
			});
		}
	}

	onMount(() => {
		let gone = false;
		// the library is loaded only when a map is opened
		import('leaflet').then((module) => {
			if (gone) return;
			const L = (leaflet = module.default ?? module);
			map = L.map(element, {
				minZoom: 6.5,
				maxZoom: 15,
				// quarter steps, so the country fills the frame
				zoomSnap: 0.25,
				maxBounds: [
					[45.3, 5.2],
					[48.3, 11.2]
				]
			}).setView([46.8, 8.23], 8);
			map.attributionControl.setPrefix(false);
			// swisstopo's "journey through time": the national map as it was in the given year
			L.tileLayer(
				`https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.zeitreihen/default/${year}1231/3857/{z}/{x}/{y}.png`,
				{ attribution: m.map_attribution({ year: String(year) }), maxZoom: 15 }
			).addTo(map);
			circles = L.layerGroup().addTo(map);
			draw();
		});
		return () => {
			gone = true;
			map?.remove();
		};
	});

	$effect(() => {
		void places;
		draw();
	});
</script>

<div
	bind:this={element}
	class="map"
	role="application"
	aria-label={m.map_label()}
	data-testid="map"
></div>

<style>
	.map {
		/* the shape of the country */
		aspect-ratio: 3 / 2;
		max-height: 75vh;
		width: 100%;
		border: 1px solid #848484;
		background: #e5e5e5;
		/* below the page header */
		z-index: 0;
	}
</style>
