// BeeRoom reply and react: IRCv3 client tags +draft/reply and +draft/react.
// Everything that reads or writes these tags goes through here, so user input
// can never reach the IRC line unchecked.
import {SharedReaction} from "./types/msg";

// The fixed set the React popover offers (no emoji library).
export const BEE_REACTIONS = ["🐝", "👍", "❤️", "😂", "🎉", "😮"] as const;

// Most distinct reactions we keep on one message, and nicks per reaction.
const MAX_REACTIONS = 20;
const MAX_NICKS = 100;

// A msgid we accept: 1..64 printable ASCII characters, no space, ';' or '\'
// (so no CR/LF or anything that could break out of a tag value).
const msgidRegExp = /^[\x21-\x3A\x3C-\x5B\x5D-\x7E]{1,64}$/;

export function isValidMsgid(value: unknown): value is string {
	return typeof value === "string" && msgidRegExp.test(value);
}

// Outgoing: only the fixed set may be sent.
export function isAllowedReaction(value: unknown): value is string {
	return typeof value === "string" && (BEE_REACTIONS as readonly string[]).includes(value);
}

// Incoming: other clients may react with any short emoji or word. Keep it to a
// short value with no whitespace or control characters.
export function isValidIncomingReaction(value: unknown): value is string {
	if (typeof value !== "string" || value.length === 0 || value.length > 32) {
		return false;
	}

	if (/[\s\p{Cc}]/u.test(value)) {
		return false;
	}

	// Reject bidi controls and other invisible format marks (Cf). ZWJ and the tag
	// characters used in flag sequences are allowed; variation selectors are not Cf.
	return !/\p{Cf}/u.test(value.replace(/[‍\u{E0020}-\u{E007F}]/gu, ""));
}

type Tags = Record<string, string | undefined> | undefined;

// msgid this message replies to, from +draft/reply (or the final +reply).
export function getReplyTo(tags: Tags): string | undefined {
	if (!tags) {
		return undefined;
	}

	const value = tags["+draft/reply"] ?? tags["+reply"];
	return isValidMsgid(value) ? value : undefined;
}

// The reaction on a TAGMSG, or undefined when it is not a valid reaction.
export function getReaction(tags: Tags): {emoji: string; msgid: string} | undefined {
	if (!tags) {
		return undefined;
	}

	const emoji = tags["+draft/react"] ?? tags["+react"];
	const msgid = getReplyTo(tags);

	if (!msgid || !isValidIncomingReaction(emoji)) {
		return undefined;
	}

	return {emoji, msgid};
}

// Adds nick's reaction to the list. The same nick with the same emoji counts
// once (nicks compare case-insensitively). Returns true when the list changed.
export function addReaction(reactions: SharedReaction[], emoji: string, nick: string): boolean {
	if (!nick) {
		return false;
	}

	let reaction = reactions.find((r) => r.emoji === emoji);

	if (!reaction) {
		if (reactions.length >= MAX_REACTIONS) {
			return false;
		}

		reaction = {emoji, nicks: []};
		reactions.push(reaction);
	}

	const lower = nick.toLowerCase();

	if (reaction.nicks.some((n) => n.toLowerCase() === lower)) {
		return false;
	}

	if (reaction.nicks.length >= MAX_NICKS) {
		return false;
	}

	reaction.nicks.push(nick);
	return true;
}

export function hasReacted(
	reactions: SharedReaction[] | undefined,
	emoji: string,
	nick: string
): boolean {
	const lower = nick.toLowerCase();
	const reaction = reactions?.find((r) => r.emoji === emoji);
	return !!reaction && reaction.nicks.some((n) => n.toLowerCase() === lower);
}
