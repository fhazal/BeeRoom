<template>
	<!-- Hive Talk (Bee themes): Reply, React, More on hover (tap on touch screens) -->
	<div ref="root" :class="['bee-acts', {open: isOpen}]" @click.stop>
		<button
			v-if="canTag"
			type="button"
			class="bee-act bee-act-reply"
			aria-label="Reply"
			title="Reply"
			@click="reply"
		>
			<span class="bee-ico" aria-hidden="true"></span>
		</button>
		<button
			v-if="canTag"
			type="button"
			:class="['bee-act', 'bee-act-react', {active: menu === 'react'}]"
			aria-label="React"
			title="React"
			:aria-expanded="menu === 'react'"
			@click="toggleMenu('react')"
		>
			<span class="bee-ico" aria-hidden="true"></span>
		</button>
		<button
			type="button"
			:class="['bee-act', 'bee-act-more', {active: menu === 'more'}]"
			aria-label="More"
			title="More"
			:aria-expanded="menu === 'more'"
			@click="toggleMenu('more')"
		>
			<span class="bee-ico" aria-hidden="true"></span>
		</button>
		<div v-if="menu === 'react' && canTag" class="bee-pop bee-react-pop" role="menu">
			<button
				v-for="emoji in reactions"
				:key="emoji"
				type="button"
				role="menuitem"
				:class="['bee-react-pick', {me: isMine(emoji)}]"
				:aria-label="'React with ' + emoji"
				@click="react(emoji)"
			>
				{{ emoji }}
			</button>
		</div>
		<div v-if="menu === 'more'" class="bee-pop bee-more-menu" role="menu">
			<button type="button" role="menuitem" class="bee-more-item" @click="copyText">
				Copy text
			</button>
			<button
				v-if="canQuery"
				type="button"
				role="menuitem"
				class="bee-more-item"
				@click="openQuery"
			>
				Message {{ message.from.nick }} privately
			</button>
		</div>
	</div>
</template>

<script lang="ts">
import {computed, defineComponent, onBeforeUnmount, PropType, ref, watch} from "vue";
import socket from "../js/socket";
import eventbus from "../js/eventbus";
import {useStore} from "../js/store";
import {switchToChannel} from "../js/router";
import {cleanIrcMessage} from "../../shared/irc";
import {BEE_REACTIONS, hasReacted} from "../../shared/beeTags";
import {beeOpen, beeShortText, canBeeTag, closeBeeBar} from "../js/helpers/beeMessage";
import type {ClientChan, ClientMessage, ClientNetwork} from "../js/types";

export default defineComponent({
	name: "BeeMessageActions",
	props: {
		message: {type: Object as PropType<ClientMessage>, required: true},
		channel: {type: Object as PropType<ClientChan>, required: false},
		network: {type: Object as PropType<ClientNetwork>, required: true},
	},
	setup(props) {
		const store = useStore();
		const root = ref<HTMLElement | null>(null);

		const isOpen = computed(() => beeOpen.id === props.message.id);
		const menu = computed(() => (isOpen.value ? beeOpen.menu : ""));
		const canTag = computed(() => canBeeTag(props.network, props.channel, props.message));
		const canQuery = computed(
			() => !!props.channel && !props.message.self && !!props.message.from?.nick
		);

		const isMine = (emoji: string) =>
			hasReacted(props.message.reactions, emoji, props.network.nick);

		const toggleMenu = (which: "react" | "more") => {
			if (isOpen.value && beeOpen.menu === which) {
				closeBeeBar();
				return;
			}

			beeOpen.id = props.message.id;
			beeOpen.menu = which;
		};

		const reply = () => {
			if (!props.channel || !props.message.msgid) {
				return;
			}

			props.channel.beeReply = {
				msgid: props.message.msgid,
				nick: props.message.from?.nick || "",
				text: beeShortText(props.message.text),
			};
			closeBeeBar();
			document.getElementById("input")?.focus();
		};

		const react = (emoji: string) => {
			closeBeeBar();

			if (!props.channel || !props.message.msgid || isMine(emoji)) {
				return;
			}

			socket.emit("msg:react", {
				target: props.channel.id,
				msgid: props.message.msgid,
				emoji,
			});
		};

		const copyText = () => {
			closeBeeBar();
			const text = cleanIrcMessage(props.message.text || "");
			navigator.clipboard?.writeText(text).catch(() => {
				// clipboard blocked (insecure context): nothing else to do
			});
		};

		// Same as the people list "Direct messages" item
		const openQuery = () => {
			closeBeeBar();
			const nick = props.message.from?.nick;

			if (!props.channel || !nick) {
				return;
			}

			const chan = store.getters.findChannelOnCurrentNetwork(nick);

			if (chan) {
				switchToChannel(chan);
			}

			socket.emit("input", {
				target: props.channel.id,
				text: "/query " + nick,
			});
		};

		// While this bar is open: a click elsewhere or Esc closes it
		const onDocumentDown = (e: MouseEvent | TouchEvent) => {
			const target = e.target as Node | null;
			const msgEl = root.value?.parentElement;

			if (target && msgEl?.contains(target)) {
				return;
			}

			closeBeeBar();
		};

		const onEscape = () => {
			if (isOpen.value) {
				closeBeeBar();
			}
		};

		const listen = (on: boolean) => {
			if (on) {
				document.addEventListener("mousedown", onDocumentDown, true);
				document.addEventListener("touchstart", onDocumentDown, true);
				eventbus.on("escapekey", onEscape);
			} else {
				document.removeEventListener("mousedown", onDocumentDown, true);
				document.removeEventListener("touchstart", onDocumentDown, true);
				eventbus.off("escapekey", onEscape);
			}
		};

		watch(isOpen, (open) => listen(open));

		onBeforeUnmount(() => {
			listen(false);

			if (isOpen.value) {
				closeBeeBar();
			}
		});

		return {
			root,
			isOpen,
			menu,
			canTag,
			canQuery,
			reactions: BEE_REACTIONS,
			isMine,
			toggleMenu,
			reply,
			react,
			copyText,
			openQuery,
		};
	},
});
</script>
