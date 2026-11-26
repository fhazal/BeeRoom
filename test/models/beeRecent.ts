import {expect} from "vitest";

import Config from "../../server/config";
import Chan from "../../server/models/chan";
import Msg from "../../server/models/msg";
import Client from "../../server/client";

// Reactions look up their message by msgid. In public mode the server keeps
// no channel messages, so Chan keeps a short list of recent ones by msgid.
describe("Chan.findByMsgid", function () {
	const fakeClient = () => ({idMsg: 1, attachedClients: {}, emit() {}} as unknown as Client);

	let wasPublic: boolean;

	beforeEach(function () {
		wasPublic = Config.values.public;
		Config.values.public = true;
	});

	afterEach(function () {
		Config.values.public = wasPublic;
	});

	it("finds a message in public mode, where messages are not stored", function () {
		const chan = new Chan({name: "#hive"});
		const msg = new Msg({text: "hi", msgid: "abc1"});
		chan.pushMessage(fakeClient(), msg);

		expect(chan.messages).to.have.length(0);
		expect(chan.findByMsgid("abc1")).to.equal(msg);
		expect(chan.findByMsgid("nope")).to.equal(undefined);
	});

	it("keeps only the newest 200", function () {
		const chan = new Chan({name: "#hive"});
		const client = fakeClient();

		for (let i = 0; i < 205; i++) {
			chan.pushMessage(client, new Msg({text: "x", msgid: "m" + i}));
		}

		expect(chan.beeRecent.size).to.equal(200);
		expect(chan.findByMsgid("m4")).to.equal(undefined);
		expect(chan.findByMsgid("m5")).to.not.equal(undefined);
		expect(chan.findByMsgid("m204")).to.not.equal(undefined);
	});

	it("falls back to stored messages", function () {
		const chan = new Chan({name: "#hive"});
		const msg = new Msg({text: "old", msgid: "old1"});
		chan.messages.push(msg);

		expect(chan.findByMsgid("old1")).to.equal(msg);
	});
});
