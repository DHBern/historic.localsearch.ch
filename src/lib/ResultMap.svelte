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

	export type MapStreet = { name: string; lat: number; lon: number; n: number };

	let {
		places,
		year,
		selected,
		streets,
		onpick
	}: {
		places: MapPlace[];
		year: number;
		/** number of the municipality the list is limited to: the map zooms to it */
		selected?: number;
		/** the hits of the chosen municipality per street, where street points exist */
		streets?: MapStreet[];
		onpick: (place: MapPlace) => void;
	} = $props();

	let element: HTMLDivElement;
	let map: LeafletMap | undefined;
	let circles: LayerGroup | undefined;
	let dots: LayerGroup | undefined;
	let leaflet: typeof import('leaflet') | undefined;
	let drawn: MapPlace[] | undefined; // the places the circles on the map stand for
	let zoom = $state<number>(); // for tests

	// a municipality and its surroundings
	const PLACE_ZOOM = 11;

	/** The whole result, or the chosen municipality with its surroundings. */
	function frame() {
		if (!leaflet || !map || places.length === 0) return;
		const chosen = selected === undefined ? undefined : places.find((p) => p.bfs === selected);
		if (chosen) {
			map.flyTo([chosen.lat, chosen.lon], Math.max(map.getZoom(), PLACE_ZOOM), { duration: 0.6 });
		} else {
			map.fitBounds(leaflet.latLngBounds(places.map((p) => [p.lat, p.lon])).pad(0.05), {
				maxZoom: PLACE_ZOOM
			});
		}
	}

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
		// a new result is framed anew; the same result keeps the view the user has
		if (drawn !== places) {
			drawn = places;
			frame();
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
			dots = L.layerGroup().addTo(map);
			map.on('zoomend', () => (zoom = map?.getZoom()));
			draw();
			drawStreets();
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

	// streets of the chosen town: small black dots, and the view goes to where they are
	function drawStreets() {
		if (!leaflet || !map || !dots) return;
		const L = leaflet;
		dots.clearLayers();
		if (!streets || streets.length === 0) return;
		const largest = Math.max(1, ...streets.map((street) => street.n));
		for (const street of streets) {
			const dot = L.circleMarker([street.lat, street.lon], {
				radius: 3 + 9 * Math.sqrt(street.n / largest),
				color: '#fff',
				weight: 1,
				fillColor: '#000',
				fillOpacity: 0.85
			});
			const tip = document.createElement('span');
			tip.textContent = m.map_street_tooltip({ name: street.name, count: formatNumber(street.n) });
			dot.bindTooltip(tip);
			dot.addTo(dots);
		}
		map.flyToBounds(L.latLngBounds(streets.map((street) => [street.lat, street.lon])).pad(0.1), {
			maxZoom: 15,
			duration: 0.6
		});
	}

	$effect(() => {
		void streets;
		drawStreets();
	});

	// choosing a municipality zooms to it; removing the limit shows the whole result again
	let framed: number | undefined;
	$effect(() => {
		const now = selected;
		if (now === framed) return;
		framed = now;
		frame();
	});
</script>

<div
	bind:this={element}
	class="map"
	role="application"
	aria-label={m.map_label()}
	data-testid="map"
	data-zoom={zoom}
	data-streets={streets?.length ?? 0}
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
