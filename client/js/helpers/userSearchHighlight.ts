// The user list search bolds matched letters and renders the result with v-html.
// Nicks and mode symbols come from the IRC server, so they are HTML-escaped here
// and only our own <b> tags are added.
import {filter as fuzzyFilter} from "fuzzy";

const MATCH_START = "\u0001";
const MATCH_END = "\u0002";

export function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

// Turns fuzzy's output (matches wrapped in MATCH_START/MATCH_END) into safe HTML.
export function toSafeHighlight(marked: string, mode = ""): string {
	return (
		escapeHtml(mode) +
		escapeHtml(marked).replaceAll(MATCH_START, "<b>").replaceAll(MATCH_END, "</b>")
	);
}

export function fuzzyFilterNicks<T extends {nick: string}>(pattern: string, users: T[]) {
	return fuzzyFilter(pattern, users, {
		pre: MATCH_START,
		post: MATCH_END,
		// A nick can't legally hold these, but never let one fake a bold mark
		extract: (u) => u.nick.replace(/[\u0001\u0002]/g, ""),
	});
}
