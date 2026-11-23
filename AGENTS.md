# Cube Studio design instructions

## Product direction

Treat Cube Studio as a mobile training app implemented as a React PWA. Design
around timing solves, practising algorithms, learning, and reviewing progress.
Start with the phone interaction and adapt deliberately for larger screens.

## Use the installed design skills

For UI work, read the relevant `SKILL.md` files before implementation. Skills are
installed in `~/.codex/skills/<name>/`, with discovery links in
`~/.agents/skills/<name>/`. Use only the skills relevant to the change:

- `platform-conventions`: mobile navigation, controls, sheets, and OS behaviour.
- `navigation-patterns`: app shell, destinations, back behaviour, and local tabs.
- `gesture-patterns`: touch interactions, gesture conflicts, and alternatives.
- `design-token`: shared colour, spacing, type, radius, and motion values.
- `typography-scale`: compact, readable, consistent screen typography.
- `critique-visual-hierarchy`: primary task, emphasis, and competing controls.
- `critique-composition`: grouping, spacing rhythm, balance, and alignment.
- `critique-information-density`: prioritisation and progressive disclosure.

These are selected from https://github.com/owl-listener/designer-skills at commit
`9a6930cf84a822eb458624bd11c61aac5bbdf224` (MIT). Read upstream advice critically:
numeric examples and pattern tables are starting points, not universal rules.
Check current Apple/Android documentation for platform-specific decisions. Apply
browser and PWA capabilities honestly; a styled web control is not a native API.
If a skill is unavailable, report that and follow the concrete rules below.

## Mobile interaction rules

- Define the screen's primary task and put its main action within easy reach.
- Use stable, labelled bottom navigation for frequent top-level destinations
  when appropriate. Keep settings and occasional actions secondary. Separate
  global navigation from local tabs and filters.
- Preserve expected browser back behaviour, OS edge gestures, scroll position,
  and ongoing task state. Never intercept an OS gesture to add decorative motion.
- Respect safe-area insets, the on-screen keyboard, and changing viewport height.
  Keep focused fields, sheet actions, and navigation visible and reachable.
- Aim for at least 44 CSS px touch targets, with separation between neighbouring
  controls. Support keyboard focus and visible alternatives to gesture actions.
- Include loading, empty, error, disabled, and success states where applicable.
  Provide undo or appropriate confirmation for destructive actions.
- Protect the timer's ready/running/stopped flow from accidental navigation,
  competing gestures, overlays, and unnecessary rendering work.

## Visual rules

- Use task-focused screens, concise app bars, and purposeful grouping. Avoid
  marketing hero sections, oversized headings, and explanatory filler in tools.
- Use lists, rows, separators, and whitespace where they express structure.
  Give cards a grouping purpose; avoid wrapping every element in another card.
- Reuse shared semantic tokens and existing components. Consolidate conflicting
  style rules instead of appending another layer of overrides.
- Keep typography, spacing, icon weights, corner radii, and control heights
  consistent. Use tabular numerals for timers and aligned statistics.
- Use colour and emphasis to communicate actions and state. Avoid defaulting to
  purple gradients, ambient glows, glass effects, pill badges, and heavy shadows.
  Introduce decorative treatments only when they support an intentional direction.
- Preserve cube face colours as domain information. Keep decorative accents from
  competing with cube recognition, timer legibility, or error states.
- Support text scaling, readable contrast, focus visibility, and reduced motion.

## Established mobile preferences

- Use the skill map's clean, open composition as the visual reference. Do not
  put the timer, scramble, or every small group inside bordered cards.
- Prefer familiar icon actions for sessions, cube previews, bookmarks, saved
  lists, and playback. Give every icon an accessible name and at least a 44px
  touch target; show selected/saved states clearly.
- Avoid disclosure triangles, chevrons, clickable text rows, and expandable
  instructions on core mobile screens. Open focused sheets from icons instead.
- Keep saved-item lists in a dedicated sheet, not inline in the task. Use a
  bookmark/star to save the current item and a distinct library icon to browse.
- Use compact visual metadata: a number and a turn icon rather than "25 moves".
  Teach cube orientation in first-use guidance rather than repeating it as text.
- Make the info action a replayable visual tutorial: one action per step,
  short captions, meaningful icons or cube diagrams, and a tryout where useful.
  Do not substitute a long information dump. First-use guidance must be
  dismissible, remembered on the device, and available again from the info icon.

## UI copy: every sentence must earn its place

- Do not add unsolicited static text: asides, "by the way" notes, motivational
  slogans, marketing taglines, redundant subtitles, explanatory footers, or
  persistent instructions for obvious controls. Empty space is not a request
  for copy. Do not narrate what the interface already shows.
- Add text only when it helps the user make a current decision, perform an
  unfamiliar action, understand a meaningful state, or avoid/recover from an
  error. Prefer a clear control label, short state message, or contextual help.
- Show instructions at the point of need. Put optional detail behind help or
  progressive disclosure; use dismissible first-use guidance when appropriate.
  Do not repeat the same explanation across cards, screens, or saved items.
- Keep actual lesson content, necessary accessibility labels, empty/error
  states, data-loss warnings, and material storage/privacy limitations. Place
  them where they matter and write them concisely.
- During visual review, audit every visible sentence. Remove copy that adds no
  actionable information. Report useful facts through the interface itself
  before adding another paragraph, badge, or note.

## Implementation and visual review

Before a substantial UI change, inspect the existing screen and briefly identify
the task, hierarchy problems, and intended direction. Then implement the work.
Before declaring completion, inspect rendered screens at phone widths (roughly
360–430 CSS px) and a larger viewport. Check overflow, reachability, keyboard and
safe-area behaviour, real content, and relevant interaction states. Use the three
critique skills above to identify and fix remaining visible issues. If browser or
device inspection is unavailable, state that limitation; do not claim visual QA.

For frontend code changes, run `npm run build` from `frontend` and relevant
existing tests for changed behaviour. A successful build alone does not establish
visual quality. Instruction-only changes do not need an application build.
