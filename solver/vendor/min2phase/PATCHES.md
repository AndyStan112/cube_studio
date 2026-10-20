# Upstream and local changes

Source: `min2phase` 0.2.4, https://github.com/cs0x7f/min2phase_rust
(crates.io release; MIT, original LICENSE retained).

The upstream coordinate tables and two-phase algorithm are unchanged. Cube Studio:

- Adds optional `(Arc<AtomicBool>, Instant)` control to the search context.
- Checks it at phase-one, pre-move, phase-two and phase-two initialization entry,
  and the outer length loop. Existing stop return values unwind recursion.
- Adds `solve_controlled`, returning `None` after interruption, deadline or error;
  it never exports a partial solution.
- Retains upstream style and allows upstream Clippy style lints in this crate.
  Application crates run Clippy with warnings denied.

Tables initialize once before readiness and are reused across requests. Checkpoints
are unnecessary; cancellation discards a DFS stack. Main worker validates input
and replays every returned sequence through its own integer cubie representation.

Upstream public helpers remain available for independent move and test oracles.
