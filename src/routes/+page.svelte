<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import mag from '$lib/img/icon-search.svg';
	import arrowRight from '$lib/img/icon-arrow-right.svg';
</script>

<div
	data-bg-color="black"
	class="fixed left-2/4 top-2/4 -translate-x-2/4 -translate-y-2/4 transform"
>
	<h2 data-splash={Math.round(Math.random() * (3 - 1) + 1)} class="text-2xl">
		{m.khaki_wet_mud_squish()}
	</h2>
	<form method="POST" action={'search?/search'} class="form mx-auto mt-4 px-4">
		<img src={mag} alt="search" class="mr-4 h-4 w-4" />
		<input name="searchstring" type="text" maxlength="60" class="p-[2px]" />
		<button type="submit" aria-label="search">
			<img src={arrowRight} alt="search" class="ml-4 h-6 w-6" />
		</button>
	</form>
</div>

<style>
	.form {
		input {
			line-height: 1.2rem;
		}
		height: 3rem;
		width: fit-content;
		background: #fdfd03;
		box-shadow: 0px 0px 15px #fff;
		color: #000;
		white-space: nowrap;
		display: flex;
		position: relative;
		align-items: center;
		border: 1px solid #000;
		border-radius: 99rem;
	}
	@media screen and (min-width: 530px) {
		.form {
			input {
				width: 410px;
			}
		}
	}
	h2 {
		text-shadow: 0px 0px 5px #000;
	}
</style>
