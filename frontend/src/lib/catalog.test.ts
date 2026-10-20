import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { AlgorithmCatalog } from "./api";
import { belongsTo, algorithmFocus } from "./catalog";
import { isRelevantSticker, type StickerFocus } from "./stickerFocus";
import { applyMove, solved } from "./cube";
const catalog = JSON.parse(
  readFileSync(
    new URL("../../../backend/app/algorithm_catalog.json", import.meta.url),
    "utf8",
  ),
) as AlgorithmCatalog;

describe("set sections", () => {
  it("shares J/T perm with CMLL permutation and keeps Sune in orientation", () => {
    const members = (section: string) =>
      catalog.algorithms
        .filter((item) => belongsTo(item, "2-look-cmll", section))
        .map((item) => item.id);
    expect(members("corner-permutation")).toEqual(["j-perm", "t-perm"]);
    expect(members("corner-orientation")).toEqual(["sune", "reverse-sune"]);
    expect(members("all")).toHaveLength(4);
    expect(members("missing-section")).toEqual([]);
  });
  it("chooses the mask from the algorithm's active membership, including All sections", () => {
    const j = catalog.algorithms.find((item) => item.id === "j-perm")!;
    const sune = catalog.algorithms.find((item) => item.id === "sune")!;
    expect(algorithmFocus(j, catalog.sets, "pll", "all")).toBe("last-layer");
    expect(algorithmFocus(j, catalog.sets, "2-look-cmll", "all")).toBe(
      "corner-permutation",
    );
    expect(
      algorithmFocus(sune, catalog.sets, "2-look-cmll", "corner-orientation"),
    ).toBe("corner-orientation");
    expect(algorithmFocus(undefined, catalog.sets, "all", "all")).toBe("all");
  });
});

describe("relevant stickers", () => {
  it("isolates four yellow corner stickers for orientation and eight side stickers for permutation", () => {
    const counts: Record<StickerFocus, number> = {
      all: 0,
      "last-layer": 0,
      "last-layer-corners": 0,
      "corner-orientation": 0,
      "corner-permutation": 0,
    };
    for (const piece of solved()) {
      const [x, y, z] = piece.home;
      const exterior = [
        x === 1,
        x === -1,
        y === 1,
        y === -1,
        z === 1,
        z === -1,
      ];
      for (let face = 0; face < 6; face++) {
        if (!exterior[face]) continue;
        for (const focus of Object.keys(counts) as StickerFocus[]) {
          if (isRelevantSticker(piece.home, face, focus)) counts[focus]++;
        }
      }
    }
    expect(counts).toEqual({
      all: 54,
      "last-layer": 21,
      "last-layer-corners": 12,
      "corner-orientation": 4,
      "corner-permutation": 8,
    });
  });
  it("keeps relevant stickers colored when their corner temporarily leaves the upper layer", () => {
    const piece = applyMove(solved(), "R").find(
      (item) => item.home.join() === "1,1,-1",
    )!;
    expect(piece.position.y).toBe(-1);
    expect(isRelevantSticker(piece.home, 2, "corner-orientation")).toBe(true);
    expect(isRelevantSticker(piece.home, 0, "corner-orientation")).toBe(false);
    expect(isRelevantSticker(piece.home, 0, "corner-permutation")).toBe(true);
    expect(isRelevantSticker(piece.home, 2, "corner-permutation")).toBe(false);
  });
});
