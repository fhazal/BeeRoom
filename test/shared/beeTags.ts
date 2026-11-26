import {expect} from "vitest";
import {EventEmitter} from "events";
import {
	BEE_REACTIONS,
	addReaction,
	getReaction,
	getReplyTo,
	hasReacted,
	isAllowedReaction,
	isValidIncomingReaction,
	isValidMsgid,
} from "../../shared/beeTags";
import {SharedReaction} from "../../shared/types/msg";
import {ChanType} from "../../shared/types/chan";
import Chan from "../../server/models/chan";
import Msg from "../../server/models/msg";
import messageEvents from "../../server/plugins/irc-events/message";

describe("beeTags", function () {
	describe("isValidMsgid", function () {
		it("accepts normal msgids", function () {
			expect(isValidMsgid("abc123")).to.equal(true);
			expect(isValidMsgid("0f3a-9c:x_Y.z")).to.equal(true);
			expect(isValidMsgid("a".repeat(64))).to.equal(true);
		});

		it("rejects anything that could break a tag or IRC line", function () {
			for (const bad of [
				"",
				"a b",
				"a;b",
				"a\rb",
				"a\nb",
				"a\\b",
				"a\x00b",
				"é",
				"a".repeat(65),
			]) {
				expect(isValidMsgid(bad), JSON.stringify(bad)).to.equal(false);
			}
		});

		it("rejects non-strings", function () {
			for (const bad of [undefined, null, 5, {}, ["abc"]]) {
				expect(isValidMsgid(bad)).to.equal(false);
			}
		});
	});

	describe("getReplyTo", function () {
		it("reads +draft/reply and the final +reply", function () {
			expect(getReplyTo({"+draft/reply": "m1"})).to.equal("m1");
			expect(getReplyTo({"+reply": "m2"})).to.equal("m2");
			expect(getReplyTo({"+draft/reply": "m1", "+reply": "m2"})).to.equal("m1");
		});

		it("ignores missing or invalid values", function () {
			expect(getReplyTo(undefined)).to.equal(undefined);
			expect(getReplyTo({})).to.equal(undefined);
			expect(getReplyTo({"+draft/reply": ""})).to.equal(undefined);
			expect(getReplyTo({"+draft/reply": "bad id"})).to.equal(undefined);
			expect(getReplyTo({"+draft/reply": "x;PRIVMSG"})).to.equal(undefined);
			expect(getReplyTo({"+draft/reply": "x\r\nQUIT"})).to.equal(undefined);
			expect(getReplyTo({"+draft/reply": "a".repeat(65)})).to.equal(undefined);
		});
	});

	describe("reactions", function () {
		it("only allows the fixed set for sending", function () {
			for (const emoji of BEE_REACTIONS) {
				expect(isAllowedReaction(emoji)).to.equal(true);
			}

			expect(isAllowedReaction("🍕")).to.equal(false);
			expect(isAllowedReaction("🐝 ")).to.equal(false);
			expect(isAllowedReaction(1)).to.equal(false);
		});

		it("accepts short incoming reactions without spaces or control characters", function () {
			expect(isValidIncomingReaction("🍕")).to.equal(true);
			expect(isValidIncomingReaction("lol")).to.equal(true);
			expect(isValidIncomingReaction("")).to.equal(false);
			expect(isValidIncomingReaction("a b")).to.equal(false);
			expect(isValidIncomingReaction("a\nb")).to.equal(false);
			expect(isValidIncomingReaction("\x03red")).to.equal(false);
			expect(isValidIncomingReaction("x".repeat(33))).to.equal(false);
		});

		it("rejects bidi controls and invisible format marks but keeps emoji sequences", function () {
			for (const bad of ["‎", "‏", "‮", "⁦", "⁩", "؜", "​", "⁠", "﻿", "🐝‮", "‏🐝"]) {
				expect(isValidIncomingReaction(bad), JSON.stringify(bad)).to.equal(false);
			}

			expect(isValidIncomingReaction("👨‍👩‍👧")).to.equal(true);
			expect(isValidIncomingReaction("❤️")).to.equal(true);
			expect(isValidIncomingReaction("🏴\u{E0067}\u{E0062}\u{E007F}")).to.equal(true);
			expect(getReaction({"+draft/react": "🐝‮", "+draft/reply": "m1"})).to.equal(undefined);
		});

		it("reads a reaction from TAGMSG tags", function () {
			expect(getReaction({"+draft/react": "🐝", "+draft/reply": "m1"})).to.deep.equal({
				emoji: "🐝",
				msgid: "m1",
			});
			expect(getReaction({"+react": "👍", "+reply": "m2"})).to.deep.equal({
				emoji: "👍",
				msgid: "m2",
			});
			expect(getReaction({"+draft/react": "🐝"})).to.equal(undefined);
			expect(getReaction({"+draft/reply": "m1"})).to.equal(undefined);
			expect(getReaction({"+draft/react": "a b", "+draft/reply": "m1"})).to.equal(undefined);
			expect(getReaction({"+draft/react": "🐝", "+draft/reply": "m 1"})).to.equal(undefined);
		});

		it("counts the same nick and emoji once, case-insensitively", function () {
			const reactions: SharedReaction[] = [];

			expect(addReaction(reactions, "🐝", "Alice")).to.equal(true);
			expect(addReaction(reactions, "🐝", "alice")).to.equal(false);
			expect(addReaction(reactions, "🐝", "ALICE")).to.equal(false);
			expect(addReaction(reactions, "🐝", "bob")).to.equal(true);
			expect(addReaction(reactions, "👍", "alice")).to.equal(true);
			expect(addReaction(reactions, "👍", "")).to.equal(false);

			expect(reactions).to.deep.equal([
				{emoji: "🐝", nicks: ["Alice", "bob"]},
				{emoji: "👍", nicks: ["alice"]},
			]);
			expect(hasReacted(reactions, "🐝", "ALICE")).to.equal(true);
			expect(hasReacted(reactions, "👍", "bob")).to.equal(false);
			expect(hasReacted(undefined, "👍", "bob")).to.equal(false);
		});

		it("caps distinct reactions and nicks", function () {
			const reactions: SharedReaction[] = [];

			for (let i = 0; i < 25; i++) {
				addReaction(reactions, "e" + i, "alice");
			}

			expect(reactions.length).to.equal(20);

			for (let i = 0; i < 150; i++) {
				addReaction(reactions, "e0", "nick" + i);
			}

			expect(reactions[0].nicks.length).to.equal(100);
		});

		it("cannot touch Object prototypes", function () {
			const reactions: SharedReaction[] = [];
			addReaction(reactions, "__proto__", "alice");
			expect(({} as any).nicks).to.equal(undefined);
			expect(reactions[0]).to.deep.equal({emoji: "__proto__", nicks: ["alice"]});
		});
	});

	describe("tagmsg handler", function () {
		function setup() {
			const chan = new Chan({name: "#bees", type: ChanType.CHANNEL});
			chan.id = 7;
			chan.messages.push(new Msg({id: 41, msgid: "m1", text: "hello"}));
			chan.messages.push(new Msg({id: 42, msgid: "m2", text: "world"}));

			const query = new Chan({name: "bob", type: ChanType.QUERY});
			query.id = 8;
			query.messages.push(new Msg({id: 50, msgid: "q1", text: "hi"}));

			const irc: any = new EventEmitter();
			irc.user = {nick: "me"};
			irc.network = {extractTargetGroup: () => null};

			const network: any = {
				getChannel: (name: string) =>
					[chan, query].find((c) => c.name.toLowerCase() === name.toLowerCase()),
				isIgnoredUser: (data: {nick: string}) => data.nick === "troll",
			};

			const emitted: any[] = [];
			const client: any = {emit: (event: string, data: any) => emitted.push({event, data})};

			(messageEvents as any).call(client, irc, network);

			return {chan, query, irc, emitted};
		}

		const react = (nick: string, target: string, emoji: string, msgid: string) => ({
			nick,
			ident: "u",
			hostname: "h",
			target,
			tags: {"+draft/react": emoji, "+draft/reply": msgid},
		});

		it("adds a reaction once and emits msg:react", function () {
			const {chan, irc, emitted} = setup();

			irc.emit("tagmsg", react("alice", "#bees", "🐝", "m1"));
			irc.emit("tagmsg", react("Alice", "#bees", "🐝", "m1"));

			expect(chan.messages[0].reactions).to.deep.equal([{emoji: "🐝", nicks: ["alice"]}]);
			expect(emitted).to.have.length(1);
			expect(emitted[0].event).to.equal("msg:react");
			expect(emitted[0].data.chan).to.equal(7);
			expect(emitted[0].data.id).to.equal(41);
		});

		it("puts a reaction sent to us into the query with the sender", function () {
			const {query, irc, emitted} = setup();

			irc.emit("tagmsg", react("bob", "me", "👍", "q1"));

			expect(query.messages[0].reactions).to.deep.equal([{emoji: "👍", nicks: ["bob"]}]);
			expect(emitted[0].data.chan).to.equal(8);
		});

		it("ignores unknown msgids, bad tags, servers and ignored users", function () {
			const {chan, irc, emitted} = setup();

			irc.emit("tagmsg", react("alice", "#bees", "🐝", "nope"));
			irc.emit("tagmsg", react("alice", "#bees", "a b", "m1"));
			irc.emit("tagmsg", react("alice", "#nowhere", "🐝", "m1"));
			irc.emit("tagmsg", react("troll", "#bees", "🐝", "m1"));
			irc.emit("tagmsg", {...react("", "#bees", "🐝", "m1"), from_server: true});
			irc.emit("tagmsg", {nick: "alice", target: "#bees", tags: {"+typing": "active"}});

			expect(emitted).to.have.length(0);
			expect(chan.messages[0].reactions).to.equal(undefined);
		});
	});
});
