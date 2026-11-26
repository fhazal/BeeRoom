import {expect} from "vitest";
import ClientManager from "../../server/clientManager";
import Client from "../../server/client";
import Config from "../../server/config";

describe("lockChannels", function () {
	let saved: {public: boolean; lockNetwork: boolean; lockChannels: boolean; join: string};

	beforeEach(function () {
		saved = {
			public: Config.values.public,
			lockNetwork: Config.values.lockNetwork,
			lockChannels: Config.values.lockChannels,
			join: Config.values.defaults.join,
		};
		Config.values.defaults.join = "#beeircd";
	});

	afterEach(function () {
		Config.values.public = saved.public;
		Config.values.lockNetwork = saved.lockNetwork;
		Config.values.lockChannels = saved.lockChannels;
		Config.values.defaults.join = saved.join;
	});

	function makeClient() {
		return new Client(new ClientManager(), "test", {
			log: false,
			password: "foo",
			sessions: {},
			clientSettings: {},
			networks: [],
		});
	}

	function chanNames(client: Client, args: Record<string, any>) {
		return client
			.networkFromConfig(client.applyChannelLock(args))
			.channels.slice(1)
			.map((c) => c.name);
	}

	it("forces the default room when lockChannels is on (join and channels)", function () {
		Config.values.public = true;
		Config.values.lockNetwork = true;
		Config.values.lockChannels = true;
		const client = makeClient();

		expect(chanNames(client, {join: "#evil #other"})).to.deep.equal(["#beeircd"]);
		expect(chanNames(client, {channels: [{name: "#evil"}], join: "#x"})).to.deep.equal([
			"#beeircd",
		]);
		expect(chanNames(client, {})).to.deep.equal(["#beeircd"]);
	});

	it("keeps the client's join without lockChannels", function () {
		Config.values.public = true;
		Config.values.lockNetwork = true;
		Config.values.lockChannels = false;
		const client = makeClient();

		expect(chanNames(client, {join: "#one #two"})).to.deep.equal(["#one", "#two"]);
	});

	it("does not lock a private server", function () {
		Config.values.public = false;
		Config.values.lockNetwork = true;
		Config.values.lockChannels = true;
		const client = makeClient();

		expect(chanNames(client, {join: "#one"})).to.deep.equal(["#one"]);
	});
});
