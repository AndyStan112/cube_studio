import type { Algorithm, AlgorithmSet } from "./api";
import type { StickerFocus } from "./stickerFocus";

export function belongsTo(
  algorithm: Algorithm,
  setId: string,
  sectionId = "all",
) {
  return (
    setId === "all" ||
    algorithm.memberships.some(
      (membership) =>
        membership.set_id === setId &&
        (sectionId === "all" || membership.section_ids.includes(sectionId)),
    )
  );
}

export function algorithmFocus(
  algorithm: Algorithm | undefined,
  sets: AlgorithmSet[],
  setId: string,
  sectionId: string,
): StickerFocus {
  const membership =
    setId === "all"
      ? algorithm?.memberships[0]
      : algorithm?.memberships.find((item) => item.set_id === setId);
  const set = sets.find((item) => item.id === membership?.set_id);
  const section = set?.sections.find(
    (item) =>
      item.id ===
      (sectionId === "all" ? membership?.section_ids[0] : sectionId),
  );
  return section?.focus ?? set?.focus ?? "all";
}
