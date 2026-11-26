import {expect} from "vitest";
import {beeWelcomeKey} from "../../../../client/js/helpers/beeMessage";

describe("beeWelcomeKey", () => {
	it("stays the same for a public guest across visits (new network uuid each time)", () => {
		const visit1 = beeWelcomeKey({uuid: "uuid-visit-1", name: "BeeIRCd"}, "#Lobby", true);
		const visit2 = beeWelcomeKey({uuid: "uuid-visit-2", name: "beeircd"}, "#lobby", true);

		expect(visit1).to.equal(visit2);
	});

	it("keeps the saved network uuid key on private servers", () => {
		expect(beeWelcomeKey({uuid: "abc", name: "Libera"}, "#Help", false)).to.equal("abc/#help");
	});

	it("keeps two private networks with the same name apart", () => {
		const a = beeWelcomeKey({uuid: "a", name: "Libera"}, "#help", false);
		const b = beeWelcomeKey({uuid: "b", name: "Libera"}, "#help", false);

		expect(a).to.not.equal(b);
	});
});
