<script lang="ts">
	import { i18n } from '$lib/i18n';
	import { ParaglideJS } from '@inlang/paraglide-sveltekit';
	import '../app.css';
	let { children } = $props();
	import Header from './Header.svelte';
</script>

<ParaglideJS {i18n}>
	<Header />
	{@render children()}
</ParaglideJS>
