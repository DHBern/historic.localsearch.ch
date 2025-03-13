<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { getLocale, locales, setLocale, localizeHref } from '$lib/paraglide/runtime.js';
	import { modals } from 'svelte-modals';
	import ModalDialog from '$lib/ModalDialog.svelte';
	function handleClick(type: 'about' | 'help') {
		modals.open(ModalDialog, { type });
	}
</script>

<header>
	<h1><a href={localizeHref('/')}>historic.localsearch</a></h1>
	<nav>
		<button onclick={() => handleClick('about')}>{m.blue_short_bird_fly()}</button>
		<button onclick={() => handleClick('help')}>{m.teal_sour_berry_pick()}</button>
		{#each locales as locale}
			{@const currentLocale = getLocale()}
			{#if currentLocale !== locale}
				<button onclick={() => setLocale(locale)}>
					{locale}
				</button>
			{/if}
		{/each}
	</nav>
</header>
