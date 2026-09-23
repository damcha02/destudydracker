# Graffiti achievement wall (archived)

A drag-and-drop achievement wall from the Wabi-Sabi Rest room: earned achievements are dragged from a tray onto a
white brick wall, where they are "sprayed" on as stencil graffiti and stay put. It was replaced in Wabi-Sabi because
the look did not fit the style. Everything here is a copy; nothing in this folder is compiled.

## Files
- `AchievementBoard.tsx` - the board: tray, pointer-driven drag, overlap rule (`isFree`), whole-brick wall (`BrickWall`),
  hidden reset brick, spray-in animation, hover tooltip, daily achievements (several small copies).
- `graffiti.ts` - draws an icon as a spray-painted stencil on a canvas (posterised colours, dark outline, overspray, drips)
  and returns a PNG data URL. Show it with `mix-blend-mode: multiply` so the brick shows through.
- `AchievementBoard.test.ts` - tests for the overlap rule.
- `graffiti-wall.css` - the `.wabi-ach*` rules and `@keyframes ach-*` from `desktop/src/App.css`.


## How it was wired in (desktop/src)
- `types.ts` - `AppState.achievementBoard: { id, uid?, x, y, size?, color?, rot?, icon?, name?, how? }[]` (x/y = centre as a fraction of the board).
- `lib/storage.ts` - default `achievementBoard: []` and normalisation in `loadAppState`.
- `App.tsx` - `wabiRestRoom` includes `"achievements"`; the sidebar Rest menu has an Achievements item;
  `renderWabiBreakRoom` builds `earnedAchievements` (from `profileBadgeGroups`, rarity by list position, `wallIcons` picture map
  for the text-symbol badges, `rock-current` left out) and renders `<AchievementBoard ... onPlace onReset />`.
- Sizes come from rarity (harder = bigger, 40-134px); daily badges are small (32-46px) and can hang once per time earned.
