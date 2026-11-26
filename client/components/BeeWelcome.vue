<template>
	<!-- Hive Talk (Bee themes): one calm card for new visitors of a channel.
	     It hides for good once the user has sent a message in that channel. -->
	<div v-if="show" class="bee-welcome">
		<b class="bee-welcome-title">Welcome to {{ channel.name }}</b>
		<span class="bee-welcome-text"
			>This is a live IRC chat. Say hi, ask anything, be kind.</span
		>
		<span class="bee-welcome-hint">Type in the box below and press Enter to send.</span>
	</div>
</template>

<script lang="ts">
import {computed, defineComponent, PropType, ref, watch} from "vue";
import {ChanType} from "../../shared/types/chan";
import {MessageType} from "../../shared/types/msg";
import type {ClientChan, ClientNetwork} from "../js/types";

const storageKey = "beeroom.welcomeSeen";

const load = (): string[] => {
	try {
		const parsed: unknown = JSON.parse(window.localStorage.getItem(storageKey) || "[]");
		return Array.isArray(parsed)
			? (parsed as unknown[]).filter((k): k is string => typeof k === "string")
			: [];
	} catch (e) {
		return [];
	}
};

// Shared by every channel view, so one write hides the card everywhere at once.
const seen = ref<string[]>(load());

const remember = (key: string) => {
	if (seen.value.includes(key)) {
		return;
	}

	seen.value = [...seen.value, key];

	try {
		window.localStorage.setItem(storageKey, JSON.stringify(seen.value));
	} catch (e) {
		// Storage blocked or full: the card still hides for this visit.
	}
};

export default defineComponent({
	name: "BeeWelcome",
	props: {
		network: {type: Object as PropType<ClientNetwork>, required: true},
		channel: {type: Object as PropType<ClientChan>, required: true},
	},
	setup(props) {
		const key = computed(() => `${props.network.uuid}/${props.channel.name.toLowerCase()}`);
		const isSeen = computed(() => seen.value.includes(key.value));

		const show = computed(() => props.channel.type === ChanType.CHANNEL && !isSeen.value);

		// Has the user sent a message (or action) here? Only checked while the card shows.
		watch(
			() =>
				show.value &&
				props.channel.messages.some(
					(m) =>
						m.self && (m.type === MessageType.MESSAGE || m.type === MessageType.ACTION)
				),
			(spoke) => {
				if (spoke) {
					remember(key.value);
				}
			},
			{immediate: true}
		);

		return {
			show,
		};
	},
});
</script>
