import { describe, expect, it } from "vitest";
import { solverInputReducer, type SolverInput } from "./solverInput";
import { SOLVED_FACELETS } from "./facelets";
describe("shared solver input", () => {
  it("retains painted stickers through representation switches", () => {
    let state: SolverInput = { value: SOLVED_FACELETS, representation: "2d" };
    state = solverInputReducer(state, { type: "value", value: s => "R" + s.slice(1) });
    state = solverInputReducer(state, { type: "representation", representation: "text" });
    expect(state.value).toBe("R" + SOLVED_FACELETS.slice(1));
    state = solverInputReducer(state, { type: "representation", representation: "2d" });
    state = solverInputReducer(state, { type: "representation", representation: "3d" });
    state = solverInputReducer(state, { type: "representation", representation: "camera" });
    expect(state.value[0]).toBe("R");
  });
  it("shares an extracted camera state with the manual editors", () => {
    const state = solverInputReducer({ value: "", representation: "camera" }, { type: "value", value: SOLVED_FACELETS });
    expect(solverInputReducer(state, { type: "representation", representation: "3d" }).value).toBe(SOLVED_FACELETS);
  });
  it("preserves incomplete text while switching views", () => {
    let state: SolverInput = { value: SOLVED_FACELETS, representation: "text" };
    state = solverInputReducer(state, { type: "value", value: "UUR" });
    state = solverInputReducer(state, { type: "representation", representation: "2d" });
    state = solverInputReducer(state, { type: "representation", representation: "text" });
    expect(state.value).toBe("UUR");
  });
});
