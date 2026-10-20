import { beforeEach, expect, it, vi } from "vitest";
import { authProvider } from "./auth";
const user = { id: "demo", name: "Demo", email: "demo@example.com" };
beforeEach(() => {
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
});
it("restores the last signed-in demo user when the API is offline", async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => user });
  vi.stubGlobal("fetch", fetchMock);
  await authProvider.signIn(user.id);
  fetchMock.mockRejectedValueOnce(Error("offline"));
  expect(await authProvider.getUser()).toEqual(user);
  await authProvider.signOut();
  expect(await authProvider.getUser()).toBeNull();
});
it("clears a cached identity if the server rejects its session", async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => user });
  vi.stubGlobal("fetch", fetchMock);
  await authProvider.signIn(user.id);
  fetchMock.mockResolvedValueOnce({ status: 401 });
  expect(await authProvider.getUser()).toBeNull();
  expect(localStorage.getItem("cube-mock-user")).toBeNull();
});
