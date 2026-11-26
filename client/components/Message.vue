<template>
	<div
		:id="'msg-' + message.id"
		:class="[
			'msg',
			{
				self: message.self,
				highlight: message.highlight || focused,
				'previous-source': isPreviousSource,
				'bee-talk': !!beeGroup,
				'bee-first': beeGroup === 'first',
				'bee-cont': beeGroup === 'cont',
			},
		]"
		:data-type="message.type"
		:data-command="message.command"
		:data-from="message.from && message.from.nick"
	>
		<span
			aria-hidden="true"
			:aria-label="messageTimeLocale"
			class="time tooltipped tooltipped-e"
			>{{ `${messageTime}&#32;` }}
		</span>
		<template v-if="message.type === 'unhandled'">
			<span class="from">[{{ message.command }}]</span>
			<span class="content">
				<span v-for="(param, id) in message.params" :key="id">{{
					`&#32;${param}&#32;`
				}}</span>
			</span>
		</template>
		<template v-else-if="beeGroup && message.from">
			<!-- Hive Talk (Bee themes): hex avatar, nick and rank once per group -->
			<template v-if="beeGroup === 'first'">
				<span class="bee-hex" aria-hidden="true" :style="{background: beeHex}">{{
					beeLetter
				}}</span>
				<span class="from">
					<span class="only-copy" aria-hidden="true">{{
						message.type === "action" ? "*\u00a0" : "\u003c"
					}}</span>
					<Username :user="message.from" :network="network" :channel="channel">{{
						message.from.nick
					}}</Username>
					<span v-if="message.type !== 'action'" class="only-copy" aria-hidden="true"
						>&gt;&nbsp;</span
					>
					<span v-if="beeRankTag" class="bee-rank">{{ beeRankTag }}</span>
				</span>
			</template>
			<span v-else class="from">
				<span class="only-copy" aria-hidden="true">{{
					message.type === "action"
						? "*\u00a0" + message.from.nick + "\u00a0"
						: "\u003c" + message.from.nick + "\u003e\u00a0"
				}}</span>
			</span>
			<span class="content" dir="auto">
				<!-- actions: the nick is already in the group header, so only the text -->
				<StatusmsgMarker :group="message.statusmsgGroup" />
				<ParsedMessage :network="network" :message="message" />
				<LinkPreview
					v-for="preview in message.previews"
					:key="preview.link"
					:keep-scroll-position="keepScrollPosition"
					:link="preview"
					:channel="channel"
				/>
			</span>
		</template>
		<template v-else-if="isAction()">
			<span class="from"><span class="only-copy" aria-hidden="true">***&nbsp;</span></span>
			<component :is="messageComponent" :network="network" :message="message" />
		</template>
		<template v-else-if="message.type === 'action'">
			<span class="from"><span class="only-copy">*&nbsp;</span></span>
			<span class="content" dir="auto">
				<StatusmsgMarker :group="message.statusmsgGroup" />
				<Username
					:user="message.from"
					:network="network"
					:channel="channel"
					dir="auto"
				/>&#32;<ParsedMessage :message="message" />
				<LinkPreview
					v-for="preview in message.previews"
					:key="preview.link"
					:keep-scroll-position="keepScrollPosition"
					:link="preview"
					:channel="channel"
				/>
			</span>
		</template>
		<template v-else>
			<span v-if="message.type === 'message'" class="from">
				<template v-if="message.from && message.from.nick">
					<span class="only-copy" aria-hidden="true">&lt;</span>
					<Username :user="message.from" :network="network" :channel="channel" />
					<span class="only-copy" aria-hidden="true">&gt;&nbsp;</span>
				</template>
			</span>
			<span v-else-if="message.type === 'plugin'" class="from">
				<template v-if="message.from && message.from.nick">
					<span class="only-copy" aria-hidden="true">[</span>
					{{ message.from.nick }}
					<span class="only-copy" aria-hidden="true">]&nbsp;</span>
				</template>
			</span>
			<span v-else class="from">
				<template v-if="message.from && message.from.nick">
					<span class="only-copy" aria-hidden="true">-</span>
					<Username :user="message.from" :network="network" :channel="channel" />
					<span class="only-copy" aria-hidden="true">-&nbsp;</span>
				</template>
			</span>
			<span class="content" dir="auto">
				<span
					v-if="message.showInActive"
					aria-label="This message was shown in your active channel"
					class="msg-shown-in-active tooltipped tooltipped-e"
					><span></span
				></span>
				<StatusmsgMarker :group="message.statusmsgGroup" />
				<ParsedMessage :network="network" :message="message" />
				<LinkPreview
					v-for="preview in message.previews"
					:key="preview.link"
					:keep-scroll-position="keepScrollPosition"
					:link="preview"
					:channel="channel"
				/>
			</span>
		</template>
	</div>
</template>

<script lang="ts">
import {computed, defineComponent, PropType} from "vue";
import dayjs from "dayjs";

import constants from "../js/constants";
import localetime from "../js/helpers/localetime";
import Username from "./Username.vue";
import LinkPreview from "./LinkPreview.vue";
import ParsedMessage from "./ParsedMessage.vue";
import MessageTypes from "./MessageTypes";
import StatusmsgMarker from "./StatusmsgMarker.vue";

import type {ClientChan, ClientMessage, ClientNetwork} from "../js/types";
import {useStore} from "../js/store";
import {beeHexBackground, beeInitial, beeRank} from "../js/helpers/beeTheme";

MessageTypes.ParsedMessage = ParsedMessage;
MessageTypes.LinkPreview = LinkPreview;
MessageTypes.Username = Username;

export default defineComponent({
	name: "Message",
	components: {
		...MessageTypes,
		StatusmsgMarker,
	},
	props: {
		message: {type: Object as PropType<ClientMessage>, required: true},
		channel: {type: Object as PropType<ClientChan>, required: false},
		network: {type: Object as PropType<ClientNetwork>, required: true},
		keepScrollPosition: Function as PropType<() => void>,
		isPreviousSource: Boolean,
		beeGroup: {type: String, default: ""},
		focused: Boolean,
	},
	setup(props) {
		const store = useStore();

		const timeFormat = computed(() => {
			let format: keyof typeof constants.timeFormats;

			if (store.state.settings.use12hClock) {
				format = store.state.settings.showSeconds ? "msg12hWithSeconds" : "msg12h";
			} else {
				format = store.state.settings.showSeconds ? "msgWithSeconds" : "msgDefault";
			}

			return constants.timeFormats[format];
		});

		const messageTime = computed(() => {
			return dayjs(props.message.time).format(timeFormat.value);
		});

		const messageTimeLocale = computed(() => {
			return localetime(props.message.time);
		});

		const messageComponent = computed(() => {
			return "message-" + (props.message.type || "invalid"); // TODO: force existence of type in sharedmsg
		});

		const isAction = () => {
			if (!props.message.type) {
				return false;
			}

			return typeof MessageTypes["message-" + props.message.type] !== "undefined";
		};

		const beeHex = computed(() =>
			beeHexBackground(props.message.from?.nick || "", store.state.settings.coloredNicks)
		);
		const beeLetter = computed(() => beeInitial(props.message.from?.nick || "?"));
		const beeRankTag = computed(() => beeRank(props.message.from?.mode));

		return {
			beeHex,
			beeLetter,
			beeRankTag,
			timeFormat,
			messageTime,
			messageTimeLocale,
			messageComponent,
			isAction,
		};
	},
});
</script>
