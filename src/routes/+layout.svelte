<script lang="ts">
	import '../app.css';
	let { children } = $props();
	import Header from './Header.svelte';
	import { Modals } from 'svelte-modals';
	import ptt from '$lib/img/logo_pttarchiv_negative.svg';
	import unibe from '$lib/img/logo_unibern_negative.svg';
	import localsearch from '$lib/img/logo_localsearch_negative.svg';
</script>

<div class="flex h-screen flex-col overflow-y-auto">
	<Header />
	<div class="flex-grow p-6">
		{@render children()}
	</div>
	<footer class="flex w-screen justify-around pb-3 pt-7">
		<a href="https://www.mfk.ch/forschen/ptt-archiv" target="_blank">
			<img class="h-[45px] w-auto md:h-[80px]" src={ptt} alt="PTT Archiv" />
		</a>
		<a href="https://www.dh.unibe.ch" target="_blank">
			<img class="h-[50px] w-auto md:h-[80px]" src={unibe} alt="Universität Bern" />
		</a>
		<a href="https://www.localsearch.ch" target="_blank">
			<img class="h-[25px] w-auto md:h-[50px]" src={localsearch} alt="localsearch" />
		</a>
	</footer>
</div>
<Modals>
	<!-- shown when any modal is opened -->
	{#snippet backdrop({ close })}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<div role="banner" class="backdrop" onclick={() => close()}></div>
	{/snippet}
</Modals>

<style>
	:global(body:has([data-bg-color='white'])) footer {
		background-color: black;
	}
	.backdrop {
		position: fixed;
		top: 0;
		bottom: 0;
		right: 0;
		left: 0;
		background: rgba(0, 0, 0, 0.9);
	}
</style>
