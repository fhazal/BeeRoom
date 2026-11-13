import {expect} from "vitest";
import os from "os";
import Helper from "../../server/helper";

describe("Helper", function () {
	describe("#forwardedClientIp", function () {
		it("takes the address the trusted proxy added, not one the visitor sent", function () {
			// Apache and nginx append the real peer to whatever the visitor sent.
			expect(Helper.forwardedClientIp("127.0.0.1", "1.2.3.4, 203.0.113.9")).to.equal(
				"203.0.113.9"
			);
			expect(Helper.forwardedClientIp("127.0.0.1", "203.0.113.9")).to.equal("203.0.113.9");
		});

		it("keeps the socket address when the header is missing or not an IP", function () {
			expect(Helper.forwardedClientIp("::ffff:127.0.0.1", undefined)).to.equal("127.0.0.1");
			expect(Helper.forwardedClientIp("127.0.0.1", "1.2.3.4, not-an-ip")).to.equal(
				"127.0.0.1"
			);
		});
	});

	describe("#expandHome", function () {
		it("should correctly expand a Unix path", function () {
			expect([`${os.homedir()}/tmp`, `${os.homedir()}\\tmp`]).to.include(
				Helper.expandHome("~/tmp")
			);
		});

		it("should correctly expand a Windows path", function () {
			expect(Helper.expandHome("~\\tmp")).to.equal(`${os.homedir()}\\tmp`);
		});

		it("should correctly expand when not given a specific path", function () {
			expect(Helper.expandHome("~")).to.equal(os.homedir());
		});

		it("should not expand paths not starting with tilde", function () {
			expect(Helper.expandHome("/tmp")).to.match(/^\/tmp|[a-zA-Z]:\\{1,2}tmp$/);
		});

		it("should not expand a tilde in the middle of a string", function () {
			expect(Helper.expandHome("/tmp/~foo")).to.match(
				/^\/tmp\/~foo|[a-zA-Z]:\\{1,2}?tmp\\{1,2}~foo$/
			);
		});

		it("should return an empty string when given an empty string", function () {
			expect(Helper.expandHome("")).to.equal("");
		});

		it("should return an empty string when given undefined", function () {
			expect(Helper.expandHome(undefined as any)).to.equal("");
		});
	});

	describe("#getVersion()", function () {
		const version = Helper.getVersion();

		it("should mention it is served from source code", function () {
			expect(version).to.include("source");
		});

		it("should include a short Git SHA", function () {
			expect(version).to.match(/\([0-9a-f]{7,11} /);
		});

		it("should include a valid semver version", function () {
			expect(version).to.match(/v[0-9]+\.[0-9]+\.[0-9]+/);
		});
	});
});
