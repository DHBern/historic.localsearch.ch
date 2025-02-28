<script lang="ts">
	import '../app.css';
	let { children } = $props();
	import Header from './Header.svelte';
	import { Modals } from 'svelte-modals';
</script>

<Header />
{@render children()}
<Modals>
	<!-- shown when any modal is opened -->
	{#snippet backdrop({ close })}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<div role="banner" class="backdrop" onclick={() => close()}></div>
	{/snippet}
</Modals>

<style>
	.backdrop {
		position: fixed;
		top: 0;
		bottom: 0;
		right: 0;
		left: 0;
		background: rgba(0, 0, 0, 0.5);
	}
</style>
