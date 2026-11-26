import {expect} from "vitest";
import fs from "fs";
import path from "path";

const themesDir = path.join(__dirname, "../../client/public/themes");

// Every theme file a theme pulls in through @import, followed all the way down
function importedFiles(file: string, seen = new Set<string>()): Set<string> {
	const css = fs.readFileSync(path.join(themesDir, file), "utf8");

	for (const match of css.matchAll(/@import\s+"([^"]+)"/g)) {
		if (!seen.has(match[1])) {
			seen.add(match[1]);
			importedFiles(match[1], seen);
		}
	}

	return seen;
}

describe("theme imports", () => {
	it("Catppuccin Mocha never pulls in the Bee Day light colours", () => {
		// bee-light.css sets :root:root tokens, which beat Mocha's own :root
		// colours and leave Mocha's light text on a paper-white page.
		expect(importedFiles("mocha.css")).not.toContain("bee-light.css");
	});

	it("Catppuccin Mocha still builds on the Bee layout", () => {
		expect(importedFiles("mocha.css")).toContain("bee-night.css");
	});
});
