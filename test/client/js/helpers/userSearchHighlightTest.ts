import {expect} from "vitest";
import {
	escapeHtml,
	fuzzyFilterNicks,
	toSafeHighlight,
} from "../../../../client/js/helpers/userSearchHighlight";

describe("user search highlight", function () {
	it("escapes html characters", function () {
		expect(escapeHtml(`<a href="x">&'`)).to.equal("&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
	});

	it("bolds matched letters and prepends the mode", function () {
		const [result] = fuzzyFilterNicks("ali", [{nick: "Alice"}]);
		expect(toSafeHighlight(result.string, "@")).to.equal("@<b>A</b><b>l</b><b>i</b>ce");
	});

	it("never lets a nick inject markup", function () {
		const nick = "<img src=x onerror=alert(1)>";
		const [result] = fuzzyFilterNicks("img", [{nick}]);
		const html = toSafeHighlight(result.string, "&");

		expect(html).to.not.contain("<img");
		expect(html).to.contain("&lt;");
		expect(html).to.contain("<b>");
		expect(html.startsWith("&amp;")).to.equal(true);
		expect(html.replace(/<\/?b>/g, "")).to.equal("&amp;" + escapeHtml(nick));
	});

	it("does not let control characters in a nick fake a bold mark", function () {
		const [result] = fuzzyFilterNicks("x", [{nick: "x\u0001y\u0002"}]);
		expect(toSafeHighlight(result.string)).to.equal("<b>x</b>y");
	});
});
