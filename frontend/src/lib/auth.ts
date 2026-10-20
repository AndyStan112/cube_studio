export type User = { id: string; name: string; email: string };

/** Implement with Clerk's session/getToken APIs when real auth is enabled.
 * The API client always obtains a fresh token through this boundary.
 * listUsers/signIn are mock picker actions; Clerk supplies its own sign-in UI.
 */
export interface AuthProvider {
  getAccessToken(): Promise<string | null>;
  getUser(): Promise<User | null>;
  signOut(): Promise<void>;
}

interface MockAuthProvider extends AuthProvider {
  listUsers(): Promise<User[]>;
  signIn(userId: string): Promise<User>;
}

const storageKey = "cube-mock-token";
const userKey = "cube-mock-user";
function cachedUser(): User | null {
  try { return JSON.parse(localStorage.getItem(userKey) ?? "null"); } catch { return null; }
}

async function request<T>(path: string, token?: string | null): Promise<T> {
  const response = await fetch(`/api/auth${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) throw new Error("Could not load demo user. Try again.");
  return response.json();
}

export const authProvider: MockAuthProvider = {
  async getAccessToken() {
    return localStorage.getItem(storageKey);
  },
  async getUser() {
    const token = await this.getAccessToken();
    if (!token) return null;
    try {
      const response = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(6000),
      });
      if (response.status === 401) {
        await this.signOut();
        return null;
      }
      if (!response.ok) throw new Error("Could not load demo user. Try again.");
      const user = await response.json() as User;
      localStorage.setItem(userKey, JSON.stringify(user));
      return user;
    } catch (error) {
      const previous = cachedUser();
      if (previous) return previous;
      throw error;
    }
  },
  listUsers: () => request<User[]>("/users"),
  async signIn(userId) {
    const token = `mock:${userId}`;
    const user = await request<User>("/me", token);
    localStorage.setItem(storageKey, token);
    localStorage.setItem(userKey, JSON.stringify(user));
    return user;
  },
  async signOut() {
    localStorage.removeItem(storageKey);
    localStorage.removeItem(userKey);
    localStorage.removeItem("cube-token");
  },
};
