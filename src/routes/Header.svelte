<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { getLocale, locales, setLocale, localizeHref } from '$lib/paraglide/runtime.js';
	import { modals } from 'svelte-modals';
	import ModalDialog from '$lib/ModalDialog.svelte';
	function handleClick(type: 'about' | 'help') {
		modals.open(ModalDialog, { type });
	}
</script>

<header class="flex justify-between p-7">
	<h1 class="header-content">
		<a href={localizeHref('/')}>historic.localsearch</a>
	</h1>
	<nav class="flex gap-8">
		<button
			class="h-10 rounded-full border border-current px-4"
			onclick={() => handleClick('about')}>{m.blue_short_bird_fly()}</button
		>
		<button class="h-10 rounded-full border border-current px-4" onclick={() => handleClick('help')}
			>{m.teal_sour_berry_pick()}</button
		>
		{#each locales as locale}
			{@const currentLocale = getLocale()}
			{#if currentLocale !== locale}
				<button
					class="h-10 rounded-full border border-current px-4"
					onclick={() => setLocale(locale)}
				>
					{locale}
				</button>
			{/if}
		{/each}
	</nav>
</header>

<style>
	.header-content {
		margin: 0;
		padding: 0;
		font-family: 'Favorit Bold', Helvetica, Arial, Geneva, Verdana, Tahoma, sans-serif;
		font-size: 1.5rem;
		line-height: 1.75rem;
		/* text-shadow: 0px 0px 5px #000; */
	}
	@media screen and (min-width: 710px) {
		.header-content {
			font-size: 2rem;
		}
	}
	/* button {
		text-shadow: 0px 0px 5px #000;
	} */
</style>
