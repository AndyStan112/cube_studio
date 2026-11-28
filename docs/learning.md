# Learning progression

The learning page has focused Beginner, CFOP, Roux and One-handed paths. The
visible connectors come from each path's actual prerequisites; case families
branch after the introductory method stages. Shared skills retain their IDs and
progress. The path selector keeps the expanded curriculum manageable on phones.
Loading spot and two lines remain alternative routes into the first Roux block;
the second block also requires slice turns. Optional speed skills do not gate
the main routes.

Skill IDs identify knowledge rather than a route membership. Existing completed
skills and first-pass rewards carry over. Prerequisite checks include the entire
method route, so a shared Sune pass never bypasses Roux block building. Tapping a
locked node shows its requirements. Each node shows saved lesson, practice and
test completion, and resumes at the next unfinished phase. Browser Back returns
to the map without discarding earned progress.

Every skill has a visual lesson, trusted physical drills, and a checked test.
Notation tests classify moves. Cube tests apply submitted moves to the actual
challenge state and check a goal and preserved pieces, accepting alternate
solutions. Tests are practice cases, not proof of mastery over arbitrary states.
Drills remain available after passing; they never require move entry.

## XP economy

XP needed for the next level at level L:

`round(100 × 1.07^(L−1) + 15 × (L−1))`

This gentle exponential plus linear curve starts at 100 XP, then 122, 144, 168,
191. It rewards early progress while stretching later levels. These are original
initial tuning values, not empirically proven optimal numbers. The structure is
informed by [Davide Aversa's RPG progression analysis](https://www.davideaversa.it/blog/gamedesign-math-rpg-level-based-progression/)
and [RuneScape's mixed exponential XP curve](https://oldschool.runescape.wiki/w/Experience).
Aversa explains geometric progression and the relationship between reward rate,
time and level pacing; RuneScape's much steeper late game is not copied.

- Lesson: 25 XP once per shared skill.
- Test: 150 XP on the first pass; repeat passes give no XP.
- Drill: `max(5, round(20 / sqrt(previousCompletions + 1)))` XP.
- Newly saved non-DNF timer solve, including manual entry: 10 XP once per ID.
- Solver: no XP. No retroactive rewards for loaded solve history.

The XP event ledger records ID, timestamp, source, amount, skill or solve ID,
method/category/session/cube context when available, and repeat status. Its sum
matches the displayed total. Deleting a solve does not remove earned XP.
Learning data is saved per local profile under `cube-studio-learning-v1:*` and
cleared by the existing all-data reset. It does not yet synchronize online.

## Cubing references

The curriculum uses original short captions and independently replayed cube
examples. Roux block structure and LSE arrow actions were checked against
[Bradley Harris's Roux first-block guide](https://bradleykh.github.io/CubeTools/roux2.html)
and [his LSE edge-orientation tutorial](https://bradleykh.github.io/CubeTools/tutorials/roux/lse-edge-orientation/).
The loading-spot demo deliberately puts the blue-red edge at DF while preserving
the blue-white base at DL. The upper corners may be offset by a U turn during
edge orientation; the goal checks the corner group rather than requiring an
unnecessary top-layer alignment. UL/UR placement also checks preserved edge
orientation.


## Algorithm catalog and advanced lessons

`backend/app/algorithm_catalog.json` is the canonical library. Case-family lessons
in `frontend/src/lib/advancedCurriculum.ts` use the synchronized `frontend/src/lib/algorithmCatalog.json` snapshot, so the
viewer, inverse setup, drill and checked test stay consistent. The catalog has
41 standard F2L, 57 OLL, 21 PLL, 42 CMLL, 57 OH OLL and 21 OH PLL cases, alongside
two-look subsets, six LSE tools and the existing big-cube parity examples.
Memberships share existing Sune/J/T IDs rather than duplicating historical
progress references. The historical J-perm entry still includes a labelled Ja
mirror; the PLL set also has its dedicated Ja case.

Move sequences and case classifications were checked on 2026-11-28 against
[SpeedCubeDB](https://speedcubedb.com/a/3x3) for CFOP/CMLL,
[J Perm OH OLL](https://jperm.net/algs/oh/oll) and
[J Perm OH PLL](https://jperm.net/algs/oh/pll), with LSE tools checked against the
[Roux community tutorial](https://tutorial.rouxers.com/beginners/lse.html).
Each sourced catalog entry has its reference URL; the algorithm guide exposes
it. Lesson captions are original. Lowercase wide notation is stored as `Rw` and
similar explicit wide turns. Middle slices use `2L`/`2D`/`2F` for compatibility.
Whole-cube frame adjustments restore the viewer's fixed center frame.

Catalog tests check full-set counts, legal moves, center alignment and the
pieces each method promises to preserve. OLL tests check top edges as well as
corners. Physical exercises cover inspection, lookahead, grip and recognition;
a move-entry test cannot verify hand usage, comfort, arbitrary-state mastery or
speed. OH sequences favor left-hand execution; the grip lesson discusses hand
choice and mirrored triggers.

The frontend image builds from `frontend/` alone. After changing the canonical
backend catalog, copy it to `frontend/src/lib/algorithmCatalog.json`; backend
unit tests require the two copies to match. Vite includes the bundled catalog
in the app version hash so installed PWAs detect content-only updates.
