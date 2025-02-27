<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { modals } from 'svelte-modals';
	import ModalDialog from '$lib/ModalDialog.svelte';
	function handleClick(type: string) {
		modals.open(ModalDialog, { type });
	}
</script>

<header>
	<h1>historic.localsearch</h1>
	<nav>
		<button onclick={() => handleClick('about')}>{m.blue_short_bird_fly()}</button>
		<button onclick={() => handleClick('help')}>{m.teal_sour_berry_pick()}</button>
	</nav>
</header>
