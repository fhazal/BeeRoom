// BeeRoom "Hive Talk" helpers. The Bee themes (bee, bee-day, bee-night) get
// grouped messages, hex avatars, rank tags and a welcome card; every other
// theme keeps The Lounge's classic layout (nothing extra is rendered).
import {computed} from "vue";
import {useStore} from "../store";
import colorClass from "./colorClass";

export const isBeeThemeName = (name?: string) => !!name && /^bee(-|$)/.test(name);

export const useBeeTheme = () => {
	const store = useStore();
	return computed(() => isBeeThemeName(store.state.settings.theme));
};

// Background for a hex avatar: one of the 8 Bee hex colours, picked the same
// way the nick colour is (color-1..32 folds onto 1..8), or honey when nick
// colours are turned off.
export const beeHexBackground = (nick: string, colored: boolean) => {
	if (!colored) {
		return "var(--bee-yellow)";
	}

	const n = parseInt(colorClass(nick).slice(6), 10);
	return `var(--bee-hex${((n - 1) % 8) + 1})`;
};

export const beeInitial = (nick: string) => {
	const first = Array.from(nick.replace(/^[^\p{L}\p{N}]+/u, "") || nick)[0] || "?";
	return first.toUpperCase();
};

const ranks: Record<string, string> = {
	"~": "OWNER",
	"&": "ADMIN",
	"!": "ADMIN",
	"@": "OP",
	"%": "HALFOP",
	"+": "VOICE",
};

export const beeRank = (mode?: string) => (mode && ranks[mode]) || "";

// Grouping window: lines from the same person within this time stack together.
export const BEE_GROUP_MS = 5 * 60 * 1000;
