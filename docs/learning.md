# Learning progression

The learning page is a 3×3 curriculum with two method trees. Skill IDs identify
knowledge, not a tree membership: notation, connecting an edge, Sune and J perm
share progress and first-pass rewards across Beginner and Roux. Prerequisite
checks include the entire method route, so a shared Sune pass never bypasses
Roux block building. Loading-spot and two-lines are alternative routes to the
first block; speed branches never gate the main route.

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
