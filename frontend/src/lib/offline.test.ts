import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("./api", async (importOriginal) => ({ ...await importOriginal<typeof import("./api")>(), api: vi.fn() }));
import { api } from "./api";
import { cachedCatalog, refreshCatalog, localScramble, localSolve, readStored, queueSolveEdit, flushSolveEdits } from "./offline";
const request = vi.mocked(api);
const catalog = { sets: [], algorithms: [] };
beforeEach(() => {
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
  request.mockReset();
});
describe("offline catalog", () => {
  it("keeps the last successful catalog through failed requests and replaces it after recovery", async () => {
    request.mockResolvedValueOnce(catalog);
    expect(await refreshCatalog()).toEqual(catalog);
    request.mockRejectedValueOnce(Error("Request failed (500)"));
    expect(await refreshCatalog()).toEqual(catalog);
    expect(cachedCatalog()).toEqual(catalog);
    const updated = { sets: [{ id: "new", name: "New set", sections: [] }], algorithms: [] };
    request.mockResolvedValueOnce(updated);
    expect(await refreshCatalog()).toEqual(updated);
    expect(cachedCatalog()).toEqual(updated);
  });
  it("does not replace cached data with malformed successful responses", async () => {
    request.mockResolvedValueOnce(catalog);
    await refreshCatalog();
    request.mockResolvedValueOnce({ algorithms: null });
    expect(await refreshCatalog()).toEqual(catalog);
  });
  it("handles corrupt storage and unavailable storage", async () => {
    localStorage.setItem("cube-studio-catalog-v1", "broken");
    expect(cachedCatalog()).toBeNull();
    request.mockRejectedValueOnce(Error("offline"));
    await expect(refreshCatalog()).rejects.toThrow("offline");
    vi.stubGlobal("localStorage", { getItem: () => { throw Error("blocked"); }, setItem: () => { throw Error("full"); } });
    request.mockResolvedValueOnce(catalog);
    expect(await refreshCatalog()).toEqual(catalog);
  });
});
it("generates local scrambles and saves complete solve records without the API", () => {
  const scramble = localScramble();
  const moves = scramble.moves.split(" ");
  expect(moves).toHaveLength(25);
  moves.forEach((move, i) => {
    expect(move).toMatch(/^[URFDLB](2|')?$/);
    if (i) expect(move[0]).not.toBe(moves[i - 1][0]);
  });
  expect(localSolve(scramble, 1234, "+2")).toMatchObject({ scramble: scramble.moves, time_ms: 1234, penalty: "+2" });
  expect(request).not.toHaveBeenCalled();
});
it("keeps failed offline edits queued, then applies them when connectivity returns", async () => {
  queueSolveEdit("user", { id: "solve", penalty: "+2" });
  request.mockRejectedValueOnce(Error("offline"));
  await expect(flushSolveEdits("user")).rejects.toThrow("offline");
  expect(readStored<unknown[]>("cube-studio-pending-edits-v1:user", [])).toHaveLength(1);
  queueSolveEdit("user", { id: "solve", remove: true });
  request.mockResolvedValueOnce(undefined);
  await flushSolveEdits("user");
  expect(request).toHaveBeenLastCalledWith("/solves/solve", expect.objectContaining({ method: "DELETE" }));
  expect(readStored("cube-studio-pending-edits-v1:user", [])).toEqual([]);
});

it("retains the cube event on offline scrambles and solves", () => {
  for (const event of ["444", "555"] as const) {
    const scramble = localScramble(event);
    expect(scramble.event).toBe(event);
    expect(scramble.moves.split(" ")).toHaveLength(event === "444" ? 40 : 60);
    expect(localSolve(scramble, 65000, "none").event).toBe(event);
  }
});
