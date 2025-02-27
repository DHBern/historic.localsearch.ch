<script lang="ts">
	import { i18n } from '$lib/i18n';
	import { ParaglideJS } from '@inlang/paraglide-sveltekit';
	import * as m from '$lib/paraglide/messages.js';
	import '../app.css';
	let { children } = $props();
</script>

<ParaglideJS {i18n}>
	<header>
		<h1>historic.localsearch</h1>
		<nav>
			<a href="/">{}</a>
		</nav>
	</header>
	{@render children()}
</ParaglideJS>
