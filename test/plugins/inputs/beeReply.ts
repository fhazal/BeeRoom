import {expect} from "vitest";
import msgInput from "../../../server/plugins/inputs/msg";
import {ChanType} from "../../../shared/types/chan";
import Chan from "../../../server/models/chan";
import Client from "../../../server/client";

describe("msg input with BeeRoom reply", function () {
	function setup(caps: string[]) {
		const chan = new Chan({name: "#bees", type: ChanType.CHANNEL});
		const said: any[] = [];
		const echoed: any[] = [];

		const network: any = {
			getChannel: (name: string) => (name === "#bees" ? chan : undefined),
			irc: {
				user: {nick: "me", username: "u", host: "h"},
				network: {
					cap: {isEnabled: (cap: string) => caps.includes(cap)},
					extractTargetGroup: () => null,
				},
				say: (target: string, text: string, tags: any) => said.push({target, text, tags}),
				emit: (event: string, data: any) => echoed.push({event, data}),
			},
		};

		return {chan, network, said, echoed};
	}

	it("tags a plain message with +draft/reply when message-tags is on", function () {
		const {chan, network, said} = setup(["message-tags", "echo-message"]);

		msgInput.input.call({} as any, network, chan, "say", ["hi", "there"], {replyTo: "m1"});

		expect(said).to.deep.equal([
			{target: "#bees", text: "hi there", tags: {"+draft/reply": "m1"}},
		]);
	});

	it("sends no tag without the message-tags cap", function () {
		const {chan, network, said} = setup(["echo-message"]);

		msgInput.input.call({} as any, network, chan, "say", ["hi"], {replyTo: "m1"});

		expect(said[0].tags).to.deep.equal({});
	});

	it("never sends an invalid msgid", function () {
		const {chan, network, said} = setup(["message-tags", "echo-message"]);

		msgInput.input.call({} as any, network, chan, "say", ["hi"], {replyTo: "m1\r\nQUIT"});
		msgInput.input.call({} as any, network, chan, "say", ["hi"], {replyTo: "a;b"});

		expect(said[0].tags).to.deep.equal({});
		expect(said[1].tags).to.deep.equal({});
	});

	it("does not tag /msg", function () {
		const {chan, network, said} = setup(["message-tags", "echo-message"]);

		msgInput.input.call({} as any, network, chan, "msg", ["#bees", "hi"], {replyTo: "m1"});

		expect(said[0].tags).to.deep.equal({});
	});

	it("keeps the reply tag on the local echo without echo-message", function () {
		const {chan, network, echoed} = setup(["message-tags"]);

		msgInput.input.call({} as any, network, chan, "say", ["hi"], {replyTo: "m1"});

		expect(echoed).to.have.length(1);
		expect(echoed[0].event).to.equal("privmsg");
		expect(echoed[0].data.tags).to.deep.equal({"+draft/reply": "m1"});
	});
});

describe("Client.input reply placement", function () {
	function run(text: string, replyTo = "m1"): Array<{text: string; replyTo?: string}> {
		const lines: Array<{text: string; replyTo?: string}> = [];
		const fake: any = {inputLine: (d: {text: string; replyTo?: string}) => lines.push(d)};
		Client.prototype.input.call(fake, {target: 1, text, replyTo});
		return lines;
	}

	it("gives the reply to the first line when it has text", function () {
		const lines = run("a\nb");
		expect(lines.map((l) => l.replyTo)).to.deep.equal(["m1", undefined]);
	});

	it("keeps the reply when the first line is empty", function () {
		const sent = run("\nhello\nworld").filter((l) => l.text.length > 0);
		expect(sent.map((l) => [l.text, l.replyTo])).to.deep.equal([
			["hello", "m1"],
			["world", undefined],
		]);
	});

	it("drops the reply when the first non-empty line is a command", function () {
		const sent = run("\n/me waves\nhello").filter((l) => l.text.length > 0);
		expect(sent.map((l) => l.replyTo)).to.deep.equal(["m1", undefined]);
		expect(sent[0].text).to.equal("/me waves");
	});
});
