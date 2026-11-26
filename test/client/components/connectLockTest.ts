// @vitest-environment jsdom
import {expect, vi} from "vitest";
import {h} from "vue";
import {mount} from "@vue/test-utils";

const fake = vi.hoisted(() => ({
	state: {serverConfiguration: null as Record<string, any> | null},
}));

vi.mock("../../../client/js/store", () => ({useStore: () => fake}));
vi.mock("../../../client/js/socket", () => ({default: {emit: () => undefined}}));
vi.mock("../../../client/components/NetworkForm.vue", () => ({
	default: {
		name: "NetworkForm",
		props: ["defaults", "handleSubmit", "disabled"],
		render: () => h("div"),
	},
}));

import Connect from "../../../client/components/Windows/Connect.vue";

function formDefaults(queryParams: Record<string, string>) {
	const wrapper = mount(Connect, {props: {queryParams}});
	return wrapper.findComponent({name: "NetworkForm"}).props("defaults") as Record<string, string>;
}

function serverConfig(lockChannels: boolean) {
	return {
		public: true,
		lockNetwork: true,
		lockChannels,
		defaults: {name: "BeeIRCd", host: "irc.example.org", join: "#lobby", nick: "guest"},
	};
}

describe("Connect window URL overrides", () => {
	it("keeps the locked room when the link asks for another (join and channels)", () => {
		fake.state.serverConfiguration = serverConfig(true);

		expect(formDefaults({join: "#other"}).join).to.equal("#lobby");
		expect(formDefaults({channels: "other"}).join).to.equal("#lobby");
	});

	it("still takes other URL fields on a locked room", () => {
		fake.state.serverConfiguration = serverConfig(true);

		expect(formDefaults({nick: "bee"}).nick).to.equal("bee");
	});

	it("takes the URL room when rooms are not locked", () => {
		fake.state.serverConfiguration = serverConfig(false);

		expect(formDefaults({join: "other"}).join).to.equal("#other");
	});
});
