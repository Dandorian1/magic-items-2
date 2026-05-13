# Contributing

Thanks for considering a contribution to Magic Items. This guide covers
how to get the module building locally, the layout of the codebase, and
what's expected for a PR to be merged.

## Setup

```bash
# Clone your fork
git clone https://github.com/<you>/magic-items-2.git
cd magic-items-2

# Install dev deps (uses npm; package-lock.json is gitignored)
npm install
```

You'll need:

- Node.js 20+ (the release pipeline uses `ubuntu-latest`'s default Node).
- A local Foundry VTT install + a test world running dnd5e 5.3+.

## Dev loop

The fastest iteration loop is `npm run build:watch`:

```bash
# One-time: link the build output into Foundry's modules folder so
# changes appear on a refresh. On Linux/macOS:
ln -s "$(pwd)/dist/magicitems" /path/to/foundry-data/Data/modules/magicitems

# On Windows (PowerShell, admin):
#   New-Item -ItemType Junction `
#     -Path 'C:\Users\<you>\AppData\Local\FoundryVTT\Data\modules\magicitems' `
#     -Target "$pwd\dist\magicitems"

# Then start the watch build
npm run build:watch
```

Vite watches `src/` and rebuilds `dist/magicitems/` on every change. To
pick up a code edit in Foundry, reload the page (Ctrl-R / Cmd-R).

If you also want to rebuild the bundled compendium packs (`magicitems`,
`magicitem-feats`, `magicitem-tables`), use `build:watchWithDb`:

```bash
npm run build:watchWithDb
```

Note: the compiled LevelDB pack outputs (`src/packs/<pack-name>/*.ldb`
etc.) are **gitignored**. The canonical source for each pack is the JSON
files under `src/packs/_source/<pack-name>/*.json`. Always edit those —
the release CI rebuilds the binaries before zipping.

## Build scripts

| Script | What it does |
|---|---|
| `npm run build` | Production build — bundles JS, copies static assets and packs into `dist/magicitems/`. |
| `npm run build:watch` | Same as `build`, but rebuilds on file changes. |
| `npm run build:watchWithDb` | Like `build:watch` but also rebuilds compendium packs from JSON sources first. |
| `npm run build:db` | Compile `src/packs/_source/<pack>/*.json` → `src/packs/<pack>/*.ldb`. |
| `npm run build:json` | Inverse: extract LevelDB packs back to JSON sources. |
| `npm run build:clean` | Re-normalize `src/packs/_source/` JSON (strip flags, fix whitespace). |
| `npm run lint` / `lint:fix` | ESLint over `src/` and `tests/`. |
| `npm run prettier-format` | Prettier-format `src/`. |
| `npm test` | Run the vitest unit + integration suite once. |
| `npm run test:watch` | Vitest in watch mode for the dev loop. |
| `npm run test:coverage` | Generate HTML coverage report under `coverage/`. |

## Running tests

The repo has a vitest harness under `tests/`. Tests run against the source
files under `src/` directly (not the built bundle) with a Foundry mock
layer in `tests/setup.js`.

```bash
npm test                 # run once, exit on first failure
npm run test:watch       # watch mode — reruns on file change
npm run test:coverage    # HTML report under coverage/index.html
```

CI runs `npm test` and blocks PR merges on failure (alongside lint +
prettier + build). The vitest suite is fast — currently ~120 tests
in under 1 second.

### Test conventions

- One concern per file. Naming: `tests/unit/<area>.test.js` for unit
  tests, `tests/integration/<flow>.test.js` for cross-helper flows.
- Use the factories in `tests/helpers/factories.js` (`makeActor`,
  `makeMagicItem`, `makeSpell`) instead of building fake docs inline.
- The Foundry mock layer in `tests/setup.js` is reset before every
  test (`beforeEach`). Per-test mock customizations live in the
  test body, not in a separate setup file.
- For private helpers tested via the `__test__` export (currently
  in `OwnedMagicItemSpell.js` and `argon.js`): import via
  `import { __test__ } from "..."; const { fn } = __test__;`. The
  export is convention-only and not for production use.
- **Convention:** every bug fix or new feature commit should include
  at least one test that pins the new behaviour. Tests are easier
  to write than smoke-test recipes are to remember.

## Project layout

```
src/
├── module.json            # Foundry module manifest (version, deps, hooks)
├── module.js              # Entry point — hooks registration, Tidy integration
├── scripts/
│   ├── API/               # Public window.MagicItems.* API surface
│   ├── constants/         # CONSTANTS namespace
│   ├── integrations/      # Per-module integrations (currently: Argon HUD)
│   ├── lib/               # Generic helpers (Logger, RetrieveHelpers, foundry-compat shims)
│   ├── magic-item/        # MagicItem / OwnedMagicItem — the in-memory model
│   ├── magic-item-entry/  # MagicItemSpell / MagicItemFeat / MagicItemTable — flag-stored config
│   ├── magic-item-owned-entry/  # OwnedMagicItem*Entry — runtime cast/use logic
│   ├── magic-item-helpers.js
│   ├── magicitemactor.js  # MagicItemActor — per-actor singleton, binds at world load
│   ├── magicitemsheet.js  # Sheet decorator — injects the magic-items section
│   ├── magicItemtab.js    # Item-sheet decorator — registers the "Magic Item" tab
│   └── magicitemupcastdialog.js
├── packs/
│   ├── _source/           # ← canonical JSON. Edit these.
│   ├── magicitems/        # ← gitignored. Built by `npm run build:db`.
│   ├── magicitem-feats/   # ← gitignored.
│   └── magicitem-tables/  # ← gitignored.
├── templates/             # Handlebars templates
├── languages/             # i18n
└── styles/                # Compiled from src/styles/ via sass
```

## Smoke-test checklist (before opening a PR)

Live verified against: **Foundry 13.351 · dnd5e 5.3.3 · midi-qol +
chris-premades + enhancedcombathud-dnd5e + lib-wrapper** (see
4.3.1 entry in `CHANGELOG.md`). When re-running, update this stamp.

At the end of EVERY scenario below, also assert:
**browser console shows no `magicitems`-namespaced deprecation
warnings since the previous scenario.** (dnd5e internal warnings like
`senses.darkvision` are fine — those come from the system, not us.)

There's no automated test suite yet (see `T1` in the tech-debt
roadmap). Until there is, manually verify the following with
**midi-qol + chris-premades + Argon HUD** all active. The integration
of those three is the highest-risk surface in the module:

1. Open a character sheet that owns a magic item with spells — the
   Magic Items section renders, no console errors, no deprecation
   warnings.
2. Cast a **healing** spell (e.g. Staff of Healing → Cure Wounds, or
   Mass Cure Wounds with self-target) — HP applies, magicitems
   per-spell charges decrement correctly (note: this is separate from
   any dnd5e "Cast Activity" charge consumption).
3. Cast a **damaging** spell (e.g. Staff of Fire → Burning Hands, or
   Wand of Magic Missiles) — damage applies, charges decrement.
4. Cast a **cantrip** with the "scale spell damage" setting off —
   verify damage does NOT scale with character level.
5. Cast an **upcast-eligible** spell (e.g. Cure Wounds at L2+) — the
   upcast dialog opens, changing level updates consumption inline,
   pressing Cast routes through the correct level.
6. Drop a new spell onto a magic-item's tab — drop accepted, no
   DragDrop deprecation warning.
7. Cancel the upcast dialog (close button) — no error in console, no
   orphan transient spell embedded on the actor.
8. Hover a magic-item spell in Argon's Cast Spell accordion — full
   tooltip with level / school / range / target / description.
9. Cast a spell via Argon — same outcome as casting from the sheet.

If you change anything in `OwnedMagicItemSpell.roll()` or
`buildSpellData()`, run steps 2–5 with **midi-qol disabled** to verify
the non-midi path still works.

## Shipping a pre-release

Pre-release tags follow the convention `<version>-test.N` (e.g.
`4.4.0-test.1`). The release workflow uploads the artifact to the
GitHub release as usual but **skips the foundryvtt.com publish** so
betas don't land in the production listing. Testers install the
prerelease by pasting the tag-versioned manifest URL into Foundry's
"Install Module → Manifest URL" field:

```
https://github.com/<owner>/magic-items-2/releases/download/<tag>/module.json
```

When the prerelease passes the smoke-test cycle, tag a final release
without the `-test.N` suffix to trigger the foundryvtt.com publish.

## Style

- Prettier + ESLint configs are checked in (`.prettierrc.json`,
  `.eslintrc.json`). Run `npm run prettier-format && npm run lint:fix`
  before committing.
- **Keep comments short.** Prefer 1-2 lines on _why_, not _what_.
  Multi-paragraph rationale belongs in CHANGELOG entries, not inline.
  If a fix needs a long explanation, link to a CHANGELOG section or
  GitHub issue from a one-liner.
- New Foundry-namespaced APIs go in `src/scripts/lib/foundry-compat.js`
  with a legacy-global fallback so the module stays loadable on older
  Foundry installs during the v13 → v14 transition.

## Commit messages

No strict convention. Useful conventions:

- Reference the GitHub issue # when fixing a reported bug.
- Reference the bug ID from the audit plan (e.g. `B5`, `D2`, `F8`) when
  paying down items from that plan.
- Keep the body explanatory — what was wrong, what's the fix, what
  alternatives were considered.

## Versioning

- Patch releases (`4.x.Y`): bug fixes, latent-bug cleanups, forward-compat
  shims. No behaviour changes for end users.
- Minor releases (`4.X.0`): new integrations, schema migrations, anything
  touching the cast / sheet code paths. Requires the full smoke-test
  cycle above.
- Major releases (`X.0.0`): breaking changes (drops legacy schema
  support, drops Foundry/dnd5e compat below a previous range, etc.).

## Reporting a bug

If you find a regression, open an issue at
<https://github.com/PwQt/magic-items-2/issues> with:

- Foundry version (`game.version`)
- dnd5e version (`game.system.version`)
- Magic Items version (`game.modules.get('magicitems').version`)
- Other relevant modules (midi-qol / chris-premades / Argon / Tidy5e /
  Babele / DFreds versions if active)
- Reproduction steps + console output (browser DevTools)
- Whether the bug happens with just dnd5e + Magic Items active
  (toggle other modules off and retest if you can)
