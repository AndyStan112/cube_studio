import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { AlgorithmCatalog } from "./api";
import { belongsTo, algorithmFocus } from "./catalog";
import { isRelevantSticker, type StickerFocus } from "./stickerFocus";
import { caseState, atHome, goalMet } from './learningGoals';
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

describe('complete method libraries', () => {
  const inSet = (id: string) => catalog.algorithms.filter(a=>belongsTo(a,id));
  it('contains all standard CFOP, CMLL and OH cases with stable IDs and references', () => {
    for (const [set,count] of [['f2l',41],['oll',57],['pll',21],['cmll',42],['oh-oll',57],['oh-pll',21],['2-look-oll',10],['2-look-pll',6]] as const) {
      expect(inSet(set)).toHaveLength(count);
      for(const a of inSet(set)) expect(a.source).toMatch(/^https:\/\/(speedcubedb.com|jperm.net)\//);
    }
    expect(new Set(catalog.algorithms.map(a=>a.id)).size).toBe(catalog.algorithms.length);
  });
  it('has legal moves and preserves each set’s required foundation in the shown setup', () => {
    for(const a of catalog.algorithms.filter(a=>a.puzzle_size===3)) for(const v of a.variations) {
      const state=caseState(v.moves.split(' '));
      const sets=a.memberships.map(m=>m.set_id);
      expect(state.filter(c=>c.home.filter(n=>n!==0).length===1).every(atHome),`${a.id}: centers`).toBe(true);
      if(sets.some(s=>['oll','pll','oh-oll','oh-pll'].includes(s))) expect(goalMet(state,'f2l'),`${a.id}: F2L`).toBe(true);
      if(sets.some(s=>['pll','oh-pll'].includes(s))) expect(goalMet(state,'top-oriented'),`${a.id}: OLL`).toBe(true);
      if(sets.includes('cmll')) expect(goalMet(state,'two-blocks'),`${a.id}: blocks`).toBe(true);
      if(sets.includes('f2l')) {
        expect(goalMet(state,'cross'),`${a.id}: cross`).toBe(true);
        expect(state.filter(c=>c.home[1]<=0 && !(c.home[0]===1 && c.home[2]===1)).every(atHome),`${a.id}: other slots`).toBe(true);
      }
    }
  });
});
