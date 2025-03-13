<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import type { ModalProps } from 'svelte-modals';

	const props = $props();
	const { type } = props as ModalProps<'about' | 'help'>;
	const { close, isOpen } = props;
</script>

{#if isOpen}
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
		min-width: 240px;
		padding: 16px;
		background: white;
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
</style>
