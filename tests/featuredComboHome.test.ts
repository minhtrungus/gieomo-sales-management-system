import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

describe("F1 featured combo homepage render", () => {
  const homeSource = read("src/app/page.tsx");
  const sectionSource = read("src/components/home/FeaturedCombosSection.tsx");

  test("homepage imports and renders FeaturedCombosSection", () => {
    assert.ok(
      homeSource.includes(`import { FeaturedCombosSection } from "@/components/home/FeaturedCombosSection"`),
      "homepage must import FeaturedCombosSection"
    );
    assert.ok(homeSource.includes("<FeaturedCombosSection />"), "homepage must render FeaturedCombosSection");
  });

  test("section only shows active (published) combos", () => {
    assert.ok(
      sectionSource.includes(`filter((c) => c.status === "active")`),
      "section must filter out inactive/draft/archived combos"
    );
    assert.ok(
      sectionSource.includes("filter((c) => c.featured)"),
      "section must only show combos marked featured"
    );
  });

  test("section syncs combos from server and listens for updates", () => {
    assert.ok(sectionSource.includes("syncCombosFromServer(true)"), "section must pull combos from server");
    assert.ok(
      sectionSource.includes(`window.addEventListener("gieomo_combos_updated"`),
      "section must re-render when combos change"
    );
  });

  test("section renders nothing when no featured combo exists (no fallback to non-featured)", () => {
    assert.ok(
      sectionSource.includes("if (combos.length === 0) return null;"),
      "empty featured list must hide the section instead of showing non-featured combos"
    );
  });
});
