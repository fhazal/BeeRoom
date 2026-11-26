// BeeRoom reply and react (Bee themes only): shared state for the message
// action bar, plus small helpers used by Message.vue and its Bee parts.
import {reactive} from "vue";
import {cleanIrcMessage} from "../../../shared/irc";
import {ChanType} from "../../../shared/types/chan";
import type {ClientChan, ClientMessage, ClientNetwork} from "../types";

// Only one message has its bar pinned open at a time (touch tap or an open
// popover). menu is "" (bar only), "react" or "more".
export const beeOpen = reactive({
	id: null as number | null,
	menu: "" as "" | "react" | "more",
});

export const closeBeeBar = () => {
	beeOpen.id = null;
	beeOpen.menu = "";
};

// Reply and React need the message-tags cap and a msgid on the message.
export const canBeeTag = (
	network: ClientNetwork,
	channel: ClientChan | undefined,
	message: ClientMessage
) =>
	!!network.status.messageTags &&
	!!network.status.connected &&
	!!message.msgid &&
	!!channel &&
	(channel.type === ChanType.CHANNEL || channel.type === ChanType.QUERY);

const QUOTE_LENGTH = 60;

// "first ~60 characters…" of a message, colours and styles removed
export const beeShortText = (text: string) => {
	const clean = cleanIrcMessage(text || "").trim();
	const chars = Array.from(clean);
	return chars.length > QUOTE_LENGTH ? chars.slice(0, QUOTE_LENGTH).join("") + "…" : clean;
};

// Scrolls to a message and highlights it for a moment
export const beeFlashMessage = (id: number) => {
	const el = document.getElementById("msg-" + id);

	if (!el) {
		return;
	}

	el.scrollIntoView({block: "center", behavior: "smooth"});
	el.classList.remove("bee-flash");
	// restart the animation when the same message is picked twice
	void el.offsetWidth;
	el.classList.add("bee-flash");
	window.setTimeout(() => el.classList.remove("bee-flash"), 1600);
};
