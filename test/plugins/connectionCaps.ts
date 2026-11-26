import {expect} from "vitest";
import {EventEmitter} from "events";
import connectionEvents from "../../server/plugins/irc-events/connection";

describe("connection events: capability changes", function () {
	function setup() {
		const irc: any = new EventEmitter();
		irc.network = {cap: {enabled: [] as string[], isEnabled: () => false}};

		const status = {connected: true, secure: true, messageTags: false};
		const network: any = {
			uuid: "net1",
			host: "h",
			port: 6667,
			getLobby: () => ({pushMessage: () => undefined}),
			getNetworkStatus: () => ({...status}),
		};

		const emitted: any[] = [];
		const client: any = {emit: (event: string, data: any) => emitted.push({event, data})};

		(connectionEvents as any).call(client, irc, network);

		return {irc, status, emitted};
	}

	it("re-sends network status when a cap is acknowledged or removed", function () {
		const {irc, status, emitted} = setup();

		status.messageTags = true;
		irc.emit("cap ack", {command: "ACK", capabilities: {"message-tags": ""}});
		status.messageTags = false;
		irc.emit("cap del", {command: "DEL", capabilities: {"message-tags": ""}});

		const sent = emitted.filter((e) => e.event === "network:status");
		expect(sent.map((e) => e.data.messageTags as boolean)).to.deep.equal([true, false]);
		expect(sent[0].data.network).to.equal("net1");
	});
});
