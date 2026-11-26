<template>
	<!-- Hive Talk (Bee themes): slim "Replying to" bar above the compose box -->
	<div v-if="channel.beeReply" class="bee-reply-bar">
		<span class="bee-reply-label">
			Replying to <strong>{{ channel.beeReply.nick }}</strong
			>:
		</span>
		<span class="bee-reply-text">{{ channel.beeReply.text }}</span>
		<button
			type="button"
			class="bee-reply-cancel"
			aria-label="Cancel reply"
			title="Cancel reply"
			@click="cancel"
		>
			<span class="bee-ico" aria-hidden="true"></span>
		</button>
	</div>
</template>

<script lang="ts">
import {defineComponent, PropType} from "vue";
import type {ClientChan} from "../js/types";

export default defineComponent({
	name: "BeeReplyBar",
	props: {
		channel: {type: Object as PropType<ClientChan>, required: true},
	},
	setup(props) {
		const cancel = () => {
			props.channel.beeReply = null;
			document.getElementById("input")?.focus();
		};

		return {cancel};
	},
});
</script>
