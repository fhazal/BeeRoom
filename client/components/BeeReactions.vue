<template>
	<!-- Hive Talk (Bee themes): reaction chips under a message -->
	<span v-if="message.reactions && message.reactions.length" class="bee-reactions">
		<button
			v-for="reaction in message.reactions"
			:key="reaction.emoji"
			type="button"
			:class="['bee-chip', {me: isMine(reaction)}]"
			:title="reaction.nicks.join(', ')"
			:aria-label="
				reaction.emoji + ' ' + reaction.nicks.length + ': ' + reaction.nicks.join(', ')
			"
			:aria-disabled="!canAdd(reaction)"
			@click.stop="add(reaction)"
		>
			{{ reaction.emoji }} {{ reaction.nicks.length }}
		</button>
	</span>
</template>

<script lang="ts">
import {defineComponent, PropType} from "vue";
import socket from "../js/socket";
import {hasReacted, isAllowedReaction} from "../../shared/beeTags";
import {canBeeTag} from "../js/helpers/beeMessage";
import type {SharedReaction} from "../../shared/types/msg";
import type {ClientChan, ClientMessage, ClientNetwork} from "../js/types";

export default defineComponent({
	name: "BeeReactions",
	props: {
		message: {type: Object as PropType<ClientMessage>, required: true},
		channel: {type: Object as PropType<ClientChan>, required: false},
		network: {type: Object as PropType<ClientNetwork>, required: true},
	},
	setup(props) {
		const isMine = (reaction: SharedReaction) =>
			hasReacted([reaction], reaction.emoji, props.network.nick);

		// Your own reaction cannot be removed; others can be joined when the
		// emoji is one of the fixed set we may send.
		const canAdd = (reaction: SharedReaction) =>
			!isMine(reaction) &&
			isAllowedReaction(reaction.emoji) &&
			canBeeTag(props.network, props.channel, props.message);

		const add = (reaction: SharedReaction) => {
			if (!props.channel || !props.message.msgid || !canAdd(reaction)) {
				return;
			}

			socket.emit("msg:react", {
				target: props.channel.id,
				msgid: props.message.msgid,
				emoji: reaction.emoji,
			});
		};

		return {isMine, canAdd, add};
	},
});
</script>
