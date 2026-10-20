import type { StickerFocus } from "./stickerFocus";
import { authProvider } from "./auth";
export type { User } from "./auth";
export type Solve = {
  id: string;
  scramble: string;
  time_ms: number;
  penalty: "none" | "+2" | "DNF";
  created_at: string;
};
export type AlgorithmSection = {
  id: string;
  name: string;
  description: string;
  focus: StickerFocus;
};
export type AlgorithmSet = {
  id: string;
  name: string;
  description: string;
  focus: StickerFocus;
  sections: AlgorithmSection[];
};
export type AlgorithmVariation = {
  id: string;
  name: string;
  moves: string;
  case?: string;
};
export type Algorithm = {
  id: string;
  name: string;
  memberships: { set_id: string; section_ids: string[] }[];
  variations: AlgorithmVariation[];
  description: string;
};
export type AlgorithmCatalog = {
  sets: AlgorithmSet[];
  algorithms: Algorithm[];
};
export type Scramble = { id: string; moves: string; event: string };
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = await authProvider.getAccessToken();
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new Error(
      "Cannot reach the API. Check that Docker Compose is running.",
    );
  }
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new ApiError(
      typeof error.detail === "string"
        ? error.detail
        : `Request failed (${response.status}). Check your input and try again.`,
      response.status,
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
export const formatTime = (ms: number) => {
  const seconds = ms / 1000;
  return seconds >= 60
    ? `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(2).padStart(5, "0")}`
    : seconds.toFixed(2);
};
export const effective = (s: Solve) =>
  s.penalty === "DNF" ? Infinity : s.time_ms + (s.penalty === "+2" ? 2000 : 0);
export function averageOf(solves: Solve[], count: number) {
  if (solves.length < count) return null;
  const times = solves
    .slice(0, count)
    .map(effective)
    .sort((a, b) => a - b)
    .slice(1, -1);
  return times.reduce((a, b) => a + b, 0) / times.length;
}
export function parseTime(value: string): number | null {
  if (!/^(?:\d{1,5}|\d{1,4}:\d{1,2})(?:\.\d{1,3})?$/.test(value)) return null;
  const parts = value.split(":").map(Number);
  if (parts.length === 2 && parts[1] >= 60) return null;
  const ms = Math.round(
    (parts.length === 2 ? parts[0] * 60 + parts[1] : parts[0]) * 1000,
  );
  return ms > 0 && ms <= 86400000 ? ms : null;
}
