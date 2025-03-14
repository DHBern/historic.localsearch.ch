<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import type { ModalProps } from 'svelte-modals';
	import cross from '$lib/img/icon-cross-negative.svg';

	const props = $props();
	const { type } = props as ModalProps<'about' | 'help'>;
	const { close, isOpen } = props;
</script>

{#if isOpen}
	<button class="close" aria-label="Close" onclick={() => close()}>
		<img src={cross} alt="close" />
	</button>
	<div role="dialog" class="modal">
		<div class="prose contents">
			<h2>{type === 'about' ? m.cool_game_whale_spark() : m.teal_sour_berry_pick()}</h2>

			{@html type === 'about' ? m.clean_bright_fox_file() : m.cuddly_awful_turtle_attend()}
			<div class="actions">
				<button onclick={() => close()}>OK</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.modal {
		position: fixed;
		top: 0;
		bottom: 0;
		right: 0;
		left: 0;
		display: flex;
		justify-content: center;
		overflow-y: auto;

		/* allow click-through to backdrop */
		pointer-events: none;
	}

	.contents {
		--tw-prose-headings: white;
		--tw-prose-links: white;
		--tw-prose-code: white;
		--tw-prose-lists: white;
		--tw-prose-blockquotes: white;
		--tw-prose-tables: white;
		--tw-prose-kbd: white;
		--tw-prose-mark: white;
		--tw-prose-text: white;
		--tw-prose-hr: white;
		--tw-prose-strong: white;
		--tw-prose-em: white;
		--tw-prose-del: white;
		--tw-prose-ol: white;
		--tw-prose-ul: white;
		--tw-prose-pre: white;
		--tw-prose-code-block: white;
		min-width: 240px;
		padding: 16px;
		color: white;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		pointer-events: auto;
		overflow-y: scroll;
	}

	.actions {
		margin-top: 32px;
		display: flex;
		justify-content: flex-end;
	}
	.close {
		position: fixed;
		width: 25px;
		height: 25px;
		top: 25px;
		right: 25px;
		z-index: 10;
		cursor: pointer;
	}
</style>
