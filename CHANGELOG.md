### 5.0.8
#### Bug fix — eliminate the Argon HUD blink on every cast
Casting a spell from a magic item caused the Argon Enhanced Combat HUD to visibly flicker, because the cast flow creates a transient embedded spell (`createEmbeddedDocuments`) and deletes it post-cast (`deleteEmbeddedDocuments`), and Argon re-renders its panel on both `createItem` and `deleteItem` Foundry hooks. Per Argon's own wiki (theripper93.com), its visibility filter is *"first activity's `activation.type` ∈ {action, bonus, reaction, special}"* — anything else is skipped entirely. Now `buildSpellData()` blanks `activation.type` to `""` on every activity of the transient before `createEmbeddedDocuments`, so Argon's filter excludes it and no re-render fires. `consume: false` was already suppressing action-economy gating on the cast, so blanking the activation type has no effect on dnd5e's workflow — the cast still produces the same chat card, damage/healing rolls, and effect application.

### 5.0.7
#### Bug fixes — upcast dialog + chat card styling + upcast scaling
Three bugs that surfaced during VPS smoke-testing of 5.0.6, all in the cast/upcast flow.

* **Upcast dialog inputs were unreadable.** `MagicItemUpcastDialog` was tagged with the v1 `dnd5e` class, so dnd5e 5.x's v2 dark-theme form styling didn't apply and the dropdown/consumption text rendered near-black on the dark dialog background. Switched the class to `dnd5e2 dialog magicitems-upcast-dialog` and added scoped CSS that overrides the default v2 *parchment* dialog background with the dark-panel look the v2 character/item sheets use. The marker class scopes the override so we don't restyle every `.dnd5e2.dialog` Foundry surfaces.
* **`OwnedMagicItem.formatMessage()` chat messages used v1 `dnd5e` styling** while everything else in dnd5e 5.x renders v2. The "Erlen takes a long rest / Recovery / Staff of Healing Uses +5" cards in chat stood out as parchment cards in a sea of v2 dark cards. Switched to `dnd5e2 chat-card item-card`. Also dropped a hardcoded `title="Palla di Fuoco"` (a stray Italian "Fireball" tooltip on every magicitems chat card's icon) — now uses the actual item name.
* **Upcasting a spell from a magic item did nothing to the damage/healing roll.** Casting Cure Wounds at 4th level still produced 1d8 + mod instead of 4d8 + mod. Root cause: dnd5e 5.x's `Activity._prepareUsageConfig` overwrites `usageConfig.scaling` to `false` for non-spell-slot casts unless either (a) the activity is consuming a spell slot or (b) `flags.dnd5e.spellLevel = { value, base }` is set on the item (the spell-scroll convention). We pass `scaling: upcastLevel - baseLevel` but it was getting clobbered. Fix: when materialising the transient, set `flags.dnd5e.spellLevel = { value: upcastLevel, base: spell.system.level }` before calling `.use()`. dnd5e's `_prepareUsageScaling` then sets `usageConfig.scaling = value - base` and the activity damage formulas apply the per-level scaling the right number of times.

Verified: `npm run lint` clean, **113/113** vitest suite green, `vite build` + bundle-parse pass.

### 5.0.6
#### Refactor — Phase 2 of post-5.0.4 cleanup
Low-risk live-code cleanups from the structural code review: async/await rewrites, fire-and-forget async-`forEach` fixes, and a hardened `update()`. No user-facing runtime behavior change, but several internal sequencing guarantees are now real.

#### Code cleanup
* **`AbstractMagicItemEntry.entity()` / `data()` — rewritten as `async`/`await` (#3).** The old `entity()` was a 38-line explicit-Promise-constructor anti-pattern with three bare `reject()` calls that passed no reason, so `catch` handlers got `undefined`. The new version is linear `async`/`await` and rejects with descriptive `Error`s (e.g. `"MagicItem entry not found in pack <id> (<name>)"`). All callers already `await` it; the contract is otherwise unchanged.
* **`OwnedMagicItem.update()` is now `async` with `try/catch/finally` (#7).** Pairs naturally with the 5.0.4 `.finally()` listener-wedge fix: callers can now `await` the flag write-back, and a rejected `item.update()` is caught + logged (`Logger.warn`) so the rejection no longer dangles as an unhandled Promise. `resumeListening()` is still guaranteed on both success and failure paths. Four callers updated to `await`: `module.js:533` (the `updateItem` hook's internal-charges branch), `OwnedMagicItem.consume → doRecharge` self-call, `OwnedMagicItemFeat.roll` post-use, `OwnedMagicItemSpell.roll` post-use.
* **Four fire-and-forget `forEach(async …)` sites fixed (#4).** Replaced with `await Promise.all(arr.map(…))` (parallel) or `for…of` (sequential), so the outer function actually awaits the inner work:
  * `MagicItemActor.fireChange()` — listeners now awaited, so `await fireChange()` truly settles before returning.
  * `API.execActorShortRest` / `execActorLongRest` — rest application across an actor's magic items now awaited (was previously returning before per-item work completed).
  * `AbstractOwnedMagicItemEntry.applyActiveEffects` — outer token loop converted to `for…of`; inner per-effect application now `await Promise.all`-mapped. Also added `await` to the existing-effect toggle update.

#### Tests
* New regression tests in `tests/unit/owned-magic-item.test.js`: pin `update()` resumes listening on both success and failure paths (locks in the 5.0.4 wedge fix + the new `try/catch/finally`).

Verified: `npm run lint` clean, **113/113** vitest suite green, `vite build` + bundle-parse pass.

### 5.0.5
#### Refactor — Phase 1 of post-5.0.4 cleanup
Zero-risk dead-code removal and an inert-option fix from a structural code review. No runtime behavior change.

* **`RetrieveHelpers` — dropped 17 unused methods.** Of the 22 static methods in `src/scripts/lib/retrieve-helpers.js`, only `retrieveUuid`, `stringIsUuid`, `getItemAsync`, `getActorAsync`, and `getCompendiumCollectionSync` (used internally by `retrieveUuid`) had callers anywhere in `src/`. The other 17 — `getCompendiumCollectionAsync`, `getUserSync`, `getActorSync`, `getJournalSync/Async`, `getMacroSync/Async`, `getSceneSync/Async`, `getItemSync`, `getPlaylistSoundPathSync/Async`, `getTokenSync`, `getRollTableSync/Async`, `getUuid`, `getDocument` — were never called (some dead transitively: `getDocument` was only invoked by `getUuid`, both now gone). `RetrieveHelpers` isn't on the public module API, so deletion is safe. ~770-line drop.
* **`AbstractMagicItemEntry.renderSheet()` and `magicitemsheet.js:257` — dropped the inert `editable` from `render()`.** `editable` isn't a key in v13's `ApplicationRenderOptions` (`{ force, isFirstRender, parts, position, tab, window }`) — it's a `DocumentSheet` *construction* option, not a render option. Passing it as `render({ force: true, editable: entity.isOwner })` was a no-op. Foundry's own permission gating gives non-owners a read-only sheet without us doing anything. Now just `render({ force: true })`.

Verified: `npm run lint` clean, full vitest suite green, `vite build` + bundle-parse check pass.

### 5.0.4
#### Cleanup & hardening — code-review findings
A focused cleanup patch from a top-down code review. No end-user runtime behavior changes apart from the two latent-bug fixes below — the rest is correctness hardening, dead-code removal, and dev-surface tidy-up.

#### Latent bug fixes
* **`OwnedMagicItem.update()` could permanently wedge the actor listener.** The flag write-back chained `resumeListening()` off `.then()`, so if `item.update()` ever rejected, listening stayed suspended for the rest of the session and the magicitems sheet stopped tracking changes. Switched to `.finally()`.
* **`module.js`'s `updateItem` internal-charges branch was missing the `listening` re-entrancy guard** its sibling branch has. `update()` suspends listening precisely so the module's own write-back doesn't re-trigger the hook — but the internal-charges branch ran regardless, so a write-back re-entered `updateInternalCharges()` + `update()`. Added the same `miActor.listening && miActor.actor.id === actor.id` guard.

#### Code cleanup
* **`foundry-compat.js` — `RollImpl` / `ChatMessageImpl` resolved too early.** They were `const`, capturing the bare core `Roll` / `ChatMessage` at module-import time — before dnd5e's `init` hook populates `CONFIG.Dice.rolls` / `CONFIG.ChatMessage.documentClass`. Changed to `export let` with a `Hooks.once("setup")` re-resolution; live bindings propagate the system classes to importers.
* **Removed the dead `runMacro` cluster from `lib.js`.** `runMacro` / `runMacroOnExplicitActor` / `getOwnedCharacters` / `getUserCharacter` had no consumers anywhere in the module (`runMacro` was even infinitely self-recursive), and still referenced the v13-removed `CONST.DOCUMENT_PERMISSION_LEVELS`. Deleted the cluster and the imports it orphaned.
* **`AbstractMagicItemEntry.renderSheet()` no longer mutates `ownership` in place.** Writing `entity.ownership.default` on a prepared document without persisting is fragile under v13's stricter data-prep cycle. Now opens the sheet read-only via the `render({ force: true, editable })` option instead.
* **`module.js` — `Macro.create`'s stale `{ displaySheet: false }` option** renamed to the current `{ renderSheet: false }`.
* **`package.json` — `prepare` script** `husky install` → `husky` (the former is deprecated in husky 9).
* **`eslint.config.js` — dropped stale `ignores` entries** for paths that no longer exist (`src/assets`, `src/lang`, `src/**/*.svelte`).
* **`tests/setup.js` — tightened the Foundry mock to the real v13 surface.** Dropped the `CONST.DOCUMENT_PERMISSION_LEVELS` mock (removed in real v13) and the `foundry.applications.handlebars.registerHelper` mock (that namespace is a v14 surface) — leaving the latter out makes the helper-registration path exercise the same global-`Handlebars` fallback v13 actually uses.

#### Build / CI
* **`package-lock.json` is now committed** (previously gitignored). `ci.yml` and `release-creation.yml` switched from `npm install` to `npm ci` for reproducible, lockfile-strict installs, and `ci.yml` re-enabled the `setup-node` npm cache.

#### Deferred
* `OwnedMagicItemSpell` / `OwnedMagicItemFeat` still write the v12-deprecated `flags.core.sourceId` on transient cast items. Swapping it for `_stats.compendiumSource` touches the hot cast path and needs a live smoke-test (confirm the per-cast deprecation warning, verify midi-qol / chris-premades source-tracing still resolves) — held for a follow-up patch rather than bundled into this cleanup.

Verified: `npm run lint` clean, full vitest suite green, `vite build` + bundle-parse check pass. Live smoke-test on the VPS world is the final gate per `CONTRIBUTING.md`.

### 5.0.3
#### Bug fix — `updateInternalCharges()` dnd5e 5.x `system.uses` schema
Completes the 5.0.2 internal-charges fix. `MagicItem.updateInternalCharges()` — called by `module.js`'s second `updateItem` hook on *every* update to an internal-charges item, then persisted to the flags via `update()` — read the pre-5.x `system.uses.per` field (gone in dnd5e 5.x), always hit its else branch, and wrote `charges: 0, uses: 0` back to the flags. That clobbered the 5.0.2 constructor snapshot on every update. Rewrote it for the dnd5e 5.x schema: `max` resolves to a number, `value` is a derived getter (`max - spent`), and `recovery` is an array of `{period, type, formula}`. `chargesTypeCompatible()` likewise rewritten to read a 5.x recovery profile. Internal-charges magic items now show their real charge count in the dnd5e inventory, the magicitems sheet section, and the Argon HUD consistently.

Smoke-tested live on Foundry 13.351 + dnd5e 5.3.2.

### 5.0.2
#### Bug fixes — dnd5e 5.x `system.uses` alignment
The 5.0.0 audit covered dnd5e 5.x's *spell* schema changes (D1–D4) but missed its **`system.uses` schema** changes. Three bugs traced to that gap:

* **Destroy-on-0-charges never fired for system-uses-backed magic items.** `OwnedMagicItem.consume()` only ran the destroy check in its flag-based-charges branch; magic items on a dnd5e item with native `system.uses` (e.g. the SRD Staff of Healing) take the *other* branch, which skipped it entirely. Extracted the check into `checkDestroyOnEmpty()` and call it from both branches. The check still self-gates on the "Destroy Item at 0 charges" flag, so items without the rule are unaffected.
* **"Use item internal charges" mode showed 0 charges in the magicitems sheet section and the Argon HUD.** `OwnedMagicItem`'s `charges`/`uses` are flag-derived, but in internal-charges mode the live store is the dnd5e item's `system.uses` and the flags stay 0. The constructor now snapshots `charges`/`uses` from `system.uses` when `internal` is set (rebuilt on every actor/item update, so it stays current), and `integrations/argon.js`'s `usesFromMagicItem` reads `system.uses` directly for internal-mode items.
* Known follow-up: `MagicItem.updateInternalCharges()`'s *recharge-config* fields (`recharge`/`rechargeUnit`/`rechargeType`) still read the pre-5.x `system.uses.per` / scalar `recovery` schema — the charge-count fixes above don't depend on it, so it's deferred.

Smoke-tested live on Foundry 13.351 + dnd5e 5.3.2.

### 5.0.1
#### Bug fix
* **Magic Item tab missing on every item sheet — regression from 5.0.0's D4 jQuery cleanup.** `MagicItemTab.init()`'s fourth parameter is named `document` (the Foundry item document), which shadowed the global `window.document`. 5.0.0 swapped `$()` element construction for `document.createElement(...)`, so those calls resolved to the item document — which has no `.createElement` — and threw `TypeError`, aborting tab injection before the tab was ever added. Renamed the shadowing identifier to `doc` in `MagicItemTab.bind()`, `init()`, and `isAcceptedItemType()` so the `createElement` calls resolve to the global. Smoke-tested live on Foundry 13.351 + dnd5e 5.3.2.

### 5.0.0
#### Tech-debt phase 5 — long-tail cleanup
No end-user runtime changes. The major-version bump reflects breaking changes on the **contributor / development surface** (dep majors, lint config format) — Foundry installs are unaffected. Smoke-tested live on Foundry 13.351 + dnd5e 5.3.3 + midi-qol + chris-premades + Argon.

#### Code cleanup
* **C5 — Roll / ChatMessage namespaced.** Bare `new Roll(...)` and `ChatMessage.create(...)` calls now route through `RollImpl` / `ChatMessageImpl` constants exported from `src/scripts/lib/foundry-compat.js`. The constants resolve to `CONFIG.Dice.rolls[0]` and `CONFIG.ChatMessage.documentClass` respectively (with bare-global fallback for pre-`ready` code paths). dnd5e's ChatMessage5e has card-render hooks midi-qol expects; routing through CONFIG keeps system overrides intact. 5 call sites updated.
* **D4 partial — jQuery surface minimized.** `MagicItem.sheetEditable` rewrites `$(form).hasClass(...)` to `form.classList.contains(...)`. `MagicItemTab.init()` builds the tab link and content panel via `document.createElement` instead of `$()` string-HTML construction. Remaining jQuery is the `normalizeHtml` bridge for v1 sheet hooks and the `.find()` chains on the bridged jQuery — those stay until Foundry v14 drops v1 sheets entirely.
* **C3 (deferred from 4.3.1) re-checked:** the `magic-items-2.` pack-id retro-compat shim was already removed; no action needed.

#### Documentation
* **A3 — pack migration recipe.** New `docs/pack-migration.md`: step-by-step recipe for re-saving the bundled compendium packs through a new dnd5e schema (open in test world → close to trigger Foundry's data prep → `npm run build:json` → `npm run build:clean` → diff-review → commit).
* **A4 — Argon API watch-list.** New "Watch list" section in `CONTRIBUTING.md` tracks upstream changes worth migrating to when they land: Argon's eventual public API, v14's deprecation of v1 sheet hooks, v15's removal of the `Handlebars` global.

#### Dep-major upgrade (D3, full scope)
Pre-upgrade `npm install` reported 16 vulnerabilities (1 low, 13 moderate, 2 high). Bumped:

| Dep | Before | After | Notes |
|---|---|---|---|
| `eslint` | 8.57 | **9.10** | **Flat config migration** — see below. |
| `@typescript-eslint/eslint-plugin` | 7.1 | — | Replaced by unified `typescript-eslint` 8.6 package. |
| `eslint-config-prettier` | 9.1 | 10.0 | Flat-config-native. |
| `eslint-plugin-jsdoc` | 46.10 | 50.2 | Flat-config-native. |
| `eslint-plugin-prettier` | 5.1 | 5.2 | |
| `vite` | 4.5 | **6.0** | |
| `vite-plugin-static-copy` | 0.17 | 2.0 | |
| `rollup` | 3.29 | 4.21 | Via vite; we don't use rollup directly. |
| `prettier` | 3.2 | 3.6 | |
| `husky` | 8.0 | 9.1 | `.husky/pre-commit` simplified — dropped the `_/husky.sh` boilerplate. |
| `lint-staged` | 13.3 | 15.2 | |

**Removed (unused after Phase 1's audit confirmed no source consumers):**
- `@babel/eslint-parser` (espree handles ES2022 natively)
- `@typhonjs-config/eslint-config`, `@typhonjs-fvtt/eslint-config-foundry.js` (not used by the flat config)
- `svelte`, `svelte-dnd-action`, `svelte-preprocess`, `@sveltejs/vite-plugin-svelte` (no `.svelte` files in src/)
- `vite-plugin-clean` (redundant with `utils/clean.mjs`)
- `vite-plugin-run` (replaced by `sass` step in npm scripts)

**Added (for flat-config support):**
- `globals` 15.x (centralized globals registry used by `eslint.config.js`)
- `typescript-eslint` 8.x (unified plugin + parser package)

#### ESLint 9 flat config migration
* `.eslintrc.json` and `.eslintignore` deleted.
* New `eslint.config.js` at the repo root:
  - Imports `@eslint/js`, `typescript-eslint`, `eslint-plugin-jsdoc`, `eslint-plugin-prettier`, `eslint-config-prettier`.
  - Uses the `globals` package for browser/node/jquery globals plus the module's Foundry globals list.
  - One `files: ["src/**/*.js", "tests/**/*.js"]` block with shared rules.
  - One `files: ["tests/**/*.js"]` block with relaxed rules for vitest test code.
  - One top-level `ignores` block replaces `.eslintignore`.
* npm scripts: `eslint --ext .js ./src ./tests` → `eslint src tests` (flat config doesn't need `--ext`).

#### Vite 6 plugin overhaul
* `vite.config.mjs`: dropped the Svelte plugin (no `.svelte` files), `vite-plugin-run` (replaced by `npm run build:sass` step), `vite-plugin-clean` (redundant with `utils/clean.mjs`).
* Trimmed `viteStaticCopy` targets to the directories that actually exist under `src/` — `vite-plugin-static-copy` 2.x errors on empty patterns, where 0.17 silently no-op'd.
* New `build:sass` npm script chained into `build` / `build:watch` / `build:watchWithDb`.

#### Husky 9
* `.husky/pre-commit` simplified from the 4-line v8 layout (with `_/husky.sh` source) to just the command (`npx lint-staged`). The husky 9 install hook handles the rest.

### 4.5.0
#### Tech-debt phase 4 — automated test harness

No runtime behaviour changes. This release ends the "manual smoke-test is the only thing standing between us and a regression" era — every shipped bug fix from 4.2.18 onward is now pinned by an automated test that CI runs on every push.

* **`vitest` + `jsdom` + Foundry mock layer.** Tests run against the source files under `src/` directly (not the built bundle) with `tests/setup.js` installing global mocks for `Hooks`, `game`, `CONFIG`, `foundry.utils`, `foundry.applications.*`, `Roll`, `ChatMessage`, `ActiveEffect`, `fromUuid`/`fromUuidSync`, `canvas`, etc. `beforeEach` resets all mocks. Factories in `tests/helpers/factories.js` (`makeActor`, `makeMagicItem`, `makeSpell`) keep test code terse.
* **113 tests across 8 unit files + 3 integration files.** All shipped regressions covered: B1–B6 (4.2.18), D1–D3 (4.3.0 activities), C6/C7 (4.4.0 dedup + activity-effect guard), A1 (4.4.0 WeakMap + synthetic-actor side index). Plus broader coverage: `MagicItemSpell.prepareDisplay` across both schemas, `MagicItemActor.buildItems` flag filter, Argon synthetic-spell flag detection, transient cleanup lifecycle hooks.
* **`__test__` named exports** at the bottom of `src/scripts/magic-item-owned-entry/OwnedMagicItemSpell.js` and `src/scripts/integrations/argon.js` expose file-private helpers (`buildSpellData`, `iterActivities`, `midiHasActiveWorkflow`, `scheduleTransientCleanup`, `safeDeleteTransient`, `filterTransientsFromSheet`; `buildButton`, `preloadMagicItemSpellSources`, `getSyntheticFlag`, `injectMagicItemSpells`, `invalidateSourceUuid`) for direct unit testing. Marked test-only; not for production use.
* **`hook-wiring.test.js`** asserts every documented `Hooks.on(...)` / `Hooks.once(...)` registration in `module.js` + `OwnedMagicItemSpell.js` + `argon.js` lands at module-load time. Catches "I deleted a hook by accident" regressions without a manual smoke test.

#### CI
* New `Run tests: npm test` step in `.github/workflows/ci.yml`, between the Prettier check and the compendium-pack compile. Failing tests block PR merges (the `build` job is already a required check on master via the branch ruleset).
* `npm run lint` now lints both `src/` and `tests/`. `.eslintrc.json` gets a `tests/**/*` overrides block declaring vitest globals (`describe`, `it`, `expect`, `vi`, `beforeEach`, etc.) and relaxing the noisier JSDoc / unused-var rules for test code.

#### Documentation
* `CONTRIBUTING.md` gains a "Running tests" section: `npm test` / `npm run test:watch` / `npm run test:coverage`, the Foundry-mock-layer convention, the `__test__` export pattern, and "every bug fix or feature commit should include a test" as the going-forward rule.

### 4.4.0
#### Tech-debt phase 3 — architecture cleanup
No new functionality. Four targeted refactors that pay down the highest-leverage architecture debt while keeping the runtime contract identical for every user-visible path.

* **A1 — `MAGICITEMS.actors` singleton → WeakMap.** Replaced the JS-object-as-map-on-an-array storage (`MAGICITEMS.actors = []`, indexed by `actor.id`) with a `WeakMap<Actor, MagicItemActor>` keyed by the live Actor document, plus a side `Map<actorId, MagicItemActor>` index for unlinked / synthetic token actors whose IDs aren't in `game.actors`. `MagicItemActor.get(actorId)` interface is preserved (16+ call sites unchanged); added `MagicItemActor.getForActor(actor)` as the fast path for callers that already hold the document reference. Eliminates the storage-hygiene root cause of the 4.2.12–4.2.15 stale-charge-dot regressions.
* **C6 — DRY destroyed() d20 roll.** Extracted `MagicItemHelpers.rollDestroyCheck({name, actor, destroyCheck, destroyDC})` to share the d20 / destroyCheck / chat-message logic between `OwnedMagicItem.destroyed()` and `AbstractOwnedMagicItemEntry.destroyed()`. Both call sites are now 12 lines instead of 35.
* **C7 — Activity-aware effect application.** `OwnedMagicItemSpell.roll()` now skips the manual `applyActiveEffects()` path when the spell has activity-level effects (`system.activities[*].effects`) — those are applied by dnd5e's own workflow during `.use()`, so the prior unconditional manual apply was double-stacking effects on dnd5e 5.x spells without midi-qol. Legacy spells with bare `item.effects` and no activity effects still take the manual path.
* **C4 — Removed `MagicItemTab.hack()` prototype-walk.** Replaced the 17-line `setPosition` monkey-patch that walked the prototype chain looking for the dnd5e `ItemSheet` ancestor with an in-place `setPosition({height: "auto"})` call from `adjustSheetSize()` when the magic-item tab is active. v2 sheets already auto-size via ApplicationV2 lifecycle and are explicitly skipped. The constructor lost its conditional hack-install branch; the unused `ItemSheetClass` import was dropped from `magicItemtab.js`.

#### Deferred
* D4 (jQuery → native DOM in `OwnedMagicItemSpell.js` + `argon.js`) deferred to Phase 5. Re-audit showed both files are already jQuery-free in their hot paths; only sheet/UI files have remaining jQuery touches.

### 4.3.2
#### Tech-debt phase 2 — CI quality gates

No runtime behaviour changes for end users. This release stands up the missing CI safety net that let the 4.2.x latent-bug stack go undetected for years.

* **Lint cleanup, zero-warning baseline.** `.eslintignore` previously excluded the entire `src/scripts/` tree, so `npm run lint` was a near-noop (only `src/module.js` was actually linted). Un-ignored the rest, surfaced 471 findings, auto-fixed ~404 via `prettier --write` + `eslint --fix`, fixed the residue by hand. Six latent bugs surfaced in the process: a `macroDataArr` typo in `runMacroOnExplicitActor`, an `no-inner-declarations` reordering in the same function, three `this.X = this.X` no-op self-assignments in `MagicItemSpell` / `MagicItemFeat`, and three empty-block stub hooks (`preCreateItem` / `preUpdateItem` / `preDeleteItem`) deleted. Added missing Foundry globals to the eslintrc (`globalThis`, `fromUuid`, `fromUuidSync`, `CONST`, `canvas`, `Roll`, `Journal`, `TokenDocument`, `dnd5e`, `ui`). Relaxed the noisy JSDoc rules (require-description, require-param-type, require-jsdoc) since plain-JS type annotations are imprecise and the user's "keep comments short" convention prefers them off. Disabled the stylistic eslint rules (`arrow-parens`, `keyword-spacing`, `operator-linebreak`, `space-before-function-paren`, etc.) that were re-enabled in the eslintrc but conflicted with prettier — prettier now owns formatting alone.
* **New `.github/workflows/ci.yml`** triggered on push/PR to master + the feature branch. Runs lint with `--max-warnings 0`, prettier `--check`, `build:db`, `build`, then parses the produced bundle with `new Function(src)` to catch vite emitting invalid ES. Single Node-22 job; the build is browser-targeted so a Node matrix would have no value at this layer.
* **Pre-release distribution flow.** The `release-creation.yml` "Publish Module to FoundryVTT Website" step is now gated on `github.event.release.prerelease == false`. Pre-releases tagged with the `<version>-test.N` convention upload the artifact to the GitHub release as normal but skip the foundryvtt.com publish, so betas don't land in the production listing. Documented in `CONTRIBUTING.md`.
* **`CONTRIBUTING.md`** smoke-test checklist gets: a version stamp (Foundry / dnd5e / integration-module versions the checklist was last verified against), a "no `magicitems` deprecation warnings in console" final assertion on every scenario, and a "Shipping a pre-release" section explaining the tagging convention and tester-install URL pattern. Style section gets a "keep comments short" guideline.

### 4.3.1
#### Tech-debt phase 1 cleanups
Quick-wins pass against the tech-debt audit. No behaviour changes for end users; the goal was to remove future foot-guns and merge-conflict noise.
* **Hotbar macro** for "drop a magic-item spell on the bar" now JSON-encodes the item / spell names into the generated command instead of unsafe string interpolation. Items with apostrophes, quotes, or backslashes (e.g. `Smith's Wand`) previously produced syntactically-broken macros that had to be hand-edited.
* `Handlebars.registerHelper` calls now prefer `foundry.applications.handlebars.registerHelper` with a fall-back to the global. v14 introduces the namespaced path; the global will be removed eventually.
* Dropped the `magic-items-2.` → `magicitems.` pack-id retro-compat shim in `AbstractOwnedMagicItemEntry`. Predated the 4.0 module-id migration; worlds that haven't migrated by now never will.
* Removed eight dead `dependencies` from `package.json` (`@fortawesome/*`, `@rollup/plugin-node-resolve` duplicate, `@typhonjs-fvtt/svelte-standard`, `moment`, `svelte-select`, `svelte-virtual-scroll-list`) and the matching `#standard/*` import alias. No source files reference any of them — vestigial from an early UI prototype. Build & runtime untouched.

#### CI / release pipeline
* **`src/packs/<pack-name>/*` LevelDB binaries are no longer tracked in git.** The canonical source for each compendium pack lives under `src/packs/_source/<pack-name>/*.json`; the binaries are now rebuilt by a new `npm run build:db` step in `.github/workflows/release-creation.yml` before zipping the release artifact. Stops meaningless merge conflicts on `LOG`/`MANIFEST-*`/`*.ldb` and stops accidentally shipping a stale DB that doesn't match the JSON sources.
* Cleaned up ~80 lines of commented-out alternate workflow variants in `release-creation.yml`.

#### Documentation
* `README.md` — added an Argon HUD / midi-qol / chris-premades compatibility row + a dedicated "Argon HUD integration" section describing what the integration does and how it's layered onto Argon (libWrapper + render hooks, no source-file edits).
* New `CONTRIBUTING.md` — dev-loop setup (`npm run build:watch`, symlinking `dist/` into Foundry's modules folder), build-script reference, project layout, and a smoke-test checklist for the midi-qol + chris-premades + Argon integration surface.

### 4.3.0
#### dnd5e 5.x activities-aware cast path (D1–D3)
Per-spell **flat DC**, **custom attack bonus**, and **cantrip no-scaling** overrides were silently being dropped on any spell that ships with the dnd5e 5.x activities system (which is essentially every SRD spell from dnd5e 5.0+). The old `buildSpellData()` only patched top-level `system.save`, `system.actionType`, and `system.scaling` — fields that no longer exist on the 5.x spell schema (verified against `dnd5e/module/data/item/spell.mjs` at `release-5.3.3`).
* **Flat DC override** now also sets `activity.save.dc = {calculation: "", formula: "<dc>"}` on each save activity. Empty calculation switches dnd5e's data prep into "use the formula value" mode; the formula is read deterministically into `dc.value` at workflow time.
* **Custom spell-attack bonus** now also appends to each attack activity's `attack.bonus` (a FormulaField). Both per-spell-config bonuses and the proficiency-bonus fallback (when no per-spell bonus is set) apply.
* **Cantrip no-scaling** now also zeroes each damage activity's `damage.parts[*].scaling.mode = ""`, which dnd5e's `_scaleDamage` interprets as "skip the upcast multiplier" and returns the base formula unchanged. Removed the obsolete post-create `await spell.update({"system.scaling": "none"})` (no-op on 5.x).
* Legacy `system.*` patches are kept as a fallback branch for any pre-5.x compendium content still in worlds — they're inert on 5.x spells but harmless.

#### Ecosystem integration hardening
* **Argon HUD source cache** now invalidates on `updateItem`/`deleteItem` for spell-type items, so a GM editing a compendium spell mid-session sees the new tooltip data on the next hover instead of stale 5.3-era cached state. (E1.)
* **Midi mid-stride cleanup** for the transient embedded spell now defers if midi-qol still has a Workflow active for one of our activity UUIDs at the 30s timeout point. Retries every 30s up to three times before forcing deletion; the `ready`-time orphan sweep remains the backstop. Prevents an item from being deleted out from under a slow workflow (large effect stacks, network jitter, GM reviewing damage cards). (E4.)
* **Tidy5e API constant reads** are now wrapped in a `tidyConst(api, "PATH")` helper that warns once to console if Tidy renames a constant. The old code would interpolate `undefined` into selector strings and silently inject nothing. (E3.)

#### Forward-compat
* **Transient-spell filter** now also subscribes to `renderCharacterActorSheet` / `renderNPCActorSheet` (the dnd5e 5.x ApplicationV2 sheet hook names) in addition to the legacy `renderActorSheet5eCharacter`/`NPC` v1 names. (F3.)
* **`MagicItemUpcastDialog`** migrated from v1 `Dialog` subclass to `foundry.applications.api.DialogV2.wait(...)`. Dynamic level→consumption re-computation now wires off the `render` hook DialogV2 fires after attaching content. Returns `null` (instead of rejecting) on user dismiss; cast path now bails cleanly in that case. (F1, follow-up to the 4.2.18 Dialog cleanup.)
* **`itemTmp.ownership.default = LIMITED`** in-place mutation removed from `MagicItemSheet.onItemShow`. v13 stricter data-prep cycles ignore unpersisted ownership mutations; replaced with `sheet.render({ force: true, editable: itemTmp.isOwner })`, which gives non-owners a read-only render via the canonical API. (F8.)

#### Style
* Hoisted `renderTemplate` / `ItemSheetClass` / `DragDropClass` / `TextEditorImpl` / `CompendiumCollectionClass` shims into a single `src/scripts/lib/foundry-compat.js` so the four files that needed them can share one declaration. No behaviour change.

### 4.2.18
#### Bugfixes (latent)
Top-down audit pass for Foundry v13.351 + dnd5e 5.3.3. Fixed six latent bugs sitting in production code on cold paths, plus replaced the last v1 `Dialog`/`DragDrop` globals that v14 RC builds will deprecation-warn (and v15 will remove).
* **`game.user_id` typo / `game.user._id`** in `ChatMessage.create` payloads — three sites (`AbstractOwnedMagicItemEntry` x2, `OwnedMagicItem` x1). `_id` worked by accident; `user_id` (underscore) was always `undefined`, with Foundry substituting the active user — message attribution looked correct but couldn't be filtered/queried by id.
* **`RetrieveHelpers.retrieveUuid`** referenced an undefined local `pack` (`if (documentCollectionType || pack === "world")`) instead of the parameter `documentPack`. The world-collection branch never fired; every lookup fell through to the compendium-index branch.
* **`RetrieveHelpers.getUuid`** called a bare `getDocument(target)` which isn't in scope — would `ReferenceError` if ever reached with a non-UUID input. Replaced with `RetrieveHelpers.getDocument(target)`.
* **`OwnedMagicItem.consume`** read `this.item.system.uses.autoDestroy` without checking `system.uses` existed. `hasSystemUses()` returning false only guarantees `system.uses.max` is empty, not that the `uses` object is present (it's absent on most feats) — would `TypeError` on consume. Optional-chained to `uses?.autoDestroy`.
* **`MagicItemHelpers.createSummoningOptions`** called `.reduce` on `summons.creatureSizes` / `creatureTypes`, which are `Set` instances in dnd5e 5.x (the `.size` check on the next line is the giveaway). Set has no `.reduce`, so multi-size / multi-type summoning spells threw. Wrapped in `Array.from(...)` before `.reduce`.
* Deleted dead `AbstractOwnedMagicItemEntry.computeSaveDC` — never called, and the body mutated the actor's prepared `system.attributes.spelldc` in place without an `update()` call. The live DC-lookup path lives in `MagicItemSpell.prepareDisplay` and is correct.

#### Foundry v13/v14/v15 forward-compat
* Replaced every remaining `new Dialog(...)` with `foundry.applications.api.DialogV2.wait(...)` — five sites: `showNoChargesMessage` and `activeEffectMessage` in `AbstractOwnedMagicItemEntry`, plus three macro-API entry points in `api.js` (`magicItemAttack`, `magicItemMultipleSpellsTrinket`, `magicItemMultipleSpellsWeapon`). v1 `Dialog` is deprecated since v12 and removed at v15.
* Replaced the v1 `DragDrop` global in `MagicItemTab` with `foundry.applications.ux.DragDrop.implementation`, with a legacy-global fallback for older Foundry. Same v15 removal target.

### 4.2.17
#### Bugfixes
* Argon HUD hover-tooltips now show full info for **all** magic-item spells, not just ones that happen to have been cast (and therefore document-cached) earlier in the session. `fromUuidSync` returns only the compendium *index* entry for uncached items (no `school`/`description`/`activities`, no `toObject`), which is what caused 4.2.16 to show full tooltips for one spell on a staff while leaving the others as the "Nth Level undefined" stub. The integration now async-pre-fetches every magic-item spell's source document the first time it injects buttons for an actor, then re-runs the injection to rebuild buttons with rich data once the cache is warm.

### 4.2.16
#### Bugfixes
* Argon HUD hover-tooltips for magic-item spells now show full info (level, school, target, range, components, description, properties) instead of the previous "Nth Level undefined" stub. The synthetic spell document Argon's button is built from now copies the full `system` block from the source spell via `fromUuidSync(entry.uuid).toObject()`, falling back to a barebones doc only if the source can't be resolved.

### 4.2.15
#### Bugfixes
* Argon stale-charge-dots: take 4 — capture only the actor *id* and magicitem id (both stable primitives) and resolve the live Item5e through `globalThis.game.actors.get(actorId).items.get(magicItemId)` on every invocation. Reading `flags.magicitems.charges/uses` straight off Foundry's singleton-by-id store is immune to MIA re-binds, stale captures, and the bundle-scope `MagicItemActor.get` quirk that made the previous attempts fall back to the build-time `ownedMI`.

### 4.2.14
#### Bugfixes
* Argon stale-charge-dots: take 3. The 4.2.13 fix captured `ownedMI.magicItemActor` directly, but when `MagicItemActor.bind()` runs more than once for the same actor (e.g. on token creation after the initial `ready` pass), the singleton entry gets replaced with a fresh `MagicItemActor`; any closure holding the older one keeps reading its frozen `.items` array. Rewrote the closure to capture **only** the Foundry Actor reference and the magicitem document id, then read `flags.magicitems.charges/uses` straight from the live `Item5e` on every invocation. Immune to MIA re-binds and to module-scope import shenanigans.

### 4.2.13
#### Bugfixes
* Actually fix the Argon stale-charge-dots issue. The 4.2.12 attempt used `MagicItemActor.get(actorId)` inside the closure — in the built bundle that lookup returned `undefined` (the module-scope `MagicItemActor` reference doesn't see the populated `MAGICITEMS.actors` singleton from this scope, so `.get()` misses), and the closure silently fell back to the captured `ownedMI`, freezing the dots at the build-time value. Switched to capturing the `MagicItemActor` *instance* directly (`ownedMI.magicItemActor`) and reading `.items` off it each call — that reference is stable across rebuilds and resolves the live `OwnedMagicItem` correctly. Verified live: setFlag → flag changes → Argon's X/▢ dots reflect the new value within the next render tick.

### 4.2.12
#### Bugfixes
* Completion of the 4.2.11 refresh fix on the Argon HUD side. The accordion-header `uses()` getter was capturing the `OwnedMagicItem` instance by closure, so when `MagicItemActor.buildItems()` rebuilt the actor's items into fresh instances post-cast, the closure still pointed at the dead one — Argon's X/▢ dots stayed at the pre-cast number even after `ui.ARGON.refresh()`. Reworked the closure to resolve the current `OwnedMagicItem` by id from `MagicItemActor.get(actorId).items` on every call, so each render reads the live `uses`. No-op when magicitems isn't bound.

### 4.2.11
#### Bugfixes
* The Magic Items section's "X / Y charges" display on the character sheet, the per-spell charge counter in the inventory row, and Argon Combat HUD's spell-accordion X/▢ charge dots now refresh as soon as charges change. Added a single `updateItem` hook that rebuilds the in-memory `MagicItemActor`, re-renders any open actor sheet apps for that actor, and calls `ui.ARGON.refresh()` when the change targets the active HUD actor. Previously the in-memory cache and Argon's accordion header both held the pre-cast number until the sheet was closed and reopened, leading to confusion when (correctly) the destroy check fired on a cast that drained the last charges.

### 4.2.10
#### Bugfixes
* **Spell casts via `OwnedMagicItemSpell.roll` (and therefore Argon HUD synthetic spells) now apply damage / healing through midi-qol + chris-premades.** The previous implementation built a transient (non-actor-embedded) `Item5e` clone and called `spell.use()` on it; chris-premades' `postNoAction` hook does `actor.items.get(spellId)` on the cast, finds nothing, aborts the workflow, and midi never reaches `applyDamage` / `applyHealing` — dice rolled into chat but HP never updated. Refactored `roll()` to `createEmbeddedDocuments("Item", ...)` a real, actor-embedded spell tagged with `flags.magicitems.transient`, call `.use()` on that, deduct magicitems charges, then delete the embedded item on whichever post-cast hook fires first (`midi-qol.RollComplete` or `dnd5e.postUseActivity`), with a 30-second timeout safety net. Owner check guards against player-side casts that can't write to a GM actor. A `ready`-time orphan sweep removes any transients whose 30 s TTL expired across a disconnect or crash.
* Added a `renderActorSheet5e*` hook that hides items carrying `flags.magicitems.transient` while they exist, so a briefly-embedded spell can't appear in the actor's spellbook for the cast window.

### 4.2.9 (superseded by 4.2.10)
#### Bugfixes
* Added `tryUnblockMidiWorkflow` post-cast helper to set `itemCardUuid` / `itemUseComplete` on midi's stalled Workflow on the transient spell clone. Verified live that the premise breaks in a chris-premades-decorated world: premades aborts the workflow *before* `spell.use()` returns, so the helper never gets a chance to run. The real fix lives in 4.2.10 (materialise the spell as a real actor-embedded item).

### 4.2.8
#### Features
* **Argon Combat HUD integration.** When `enhancedcombathud-dnd5e` is active, magic-item spells now appear in the Cast Spell accordion grouped under the parent magic item's name (same shape Argon's own dnd5e 5.x "Cast Activity" path uses). Charges show in the section header; clicks route through `MagicItemActor.rollByName(...)` so charge consumption, upcast dialog, summons, and active-effect prompts all work. The integration uses libWrapper on `DND5eButtonPanelButton.prePrepareSpells` and `DND5eItemButton._onLeftClick`, captured lazily via Argon's `render<class>ArgonComponent` hooks — no edits to Argon's source files, no actor data writes, and a direct-patch fallback if libWrapper isn't installed.

### 4.2.7
#### Features
* The magic-items section of the spellbook tab now mirrors the native dnd5e row layout — added **Roll** (save DC or attack bonus) and **Formula** (damage parts) columns. Save labels read from the linked spell's `system.activities` entries (dnd5e 5.x) with a legacy `system.save` fallback. A flat DC override on the magic-item spell config still takes precedence.

### 4.2.6
#### Bugfixes
* Resolved "Your controlled Actor does not have a spell/feat named *X*" warning when casting a magic-item spell whose underlying entity is an **actor-embedded** item (created via drag-drop from the actor sheet). `AbstractMagicItemEntry.entity()` now tries `fromUuid(this.uuid)` first, which handles `Actor.<id>.Item.<id>` UUIDs that the previous `pack === "world"` branch missed by only consulting `CONFIG.Item.collection.instance`.

### 4.2.5
#### Bugfixes
* Removed `CONST.CHAT_MESSAGE_TYPES.OTHER` from the recharge `ChatMessage.create` payload — the constant was removed in Foundry v13 and reading it could short-circuit the post-recharge `update()` call.
* [#194] Update to deprecated CONST property, which made the sheet possibly not-visible
* [#170] Not applying proficiency bonus on spell attack
* [#178] Various Babele-related fixes

#### Forward-compat (Foundry v14/v15/v16)
* Replaced the global `ItemSheet` reference in the item-tab feature detector with `foundry.appv1.sheets.ItemSheet` (removed at v15).
* Replaced every direct `renderTemplate` call with `foundry.applications.handlebars.renderTemplate` (removed at v15) — affects `MagicItemTab`, `MagicItemSheet`, `MagicItemUpcastDialog`, and `AbstractOwnedMagicItemEntry`.
* Replaced the global `CompendiumCollection` reference in `RetrieveHelpers` with `foundry.documents.collections.CompendiumCollection` (removed at v15).
* Replaced every `{{#select X}}…{{/select}}` Handlebars block in `magic-item-tab.hbs` with `{{selectOptions choices selected=X}}` (the legacy helper is removed at v14).

#### Features
* [#170] Added a custom attack bonus option per spell
  
### 4.2.4
#### Bugfixes
* [#184] update to-be-deprecated methods by @PwQt

#### Features
* [#185] Summoning on Magic Items spells by @PwQt

### 4.2.3
* [#169] fix to incorrect spell scaling removal

### 4.2.2.*
* Remove deprecated elements from module.json

### 4.2.1
* Update default packs to have proper attunement options as in their descriptions [#162]

### 4.2.0
* Added compatibility with D&D 3.3+ especially with the new NPC sheet,
  * This version _MIGHT_ break compatibility with default D&D sheets for D&D versions 3.2- due to adding one more `<div>` tag
* Added proper Item quantity subtraction whenever an actor posseses more than one instance of items.
* Upgraded deprecated methods from `globalThis` to `foundry.utils`

### 4.1.5.1
* Missing .json in the russian language pack in module.json file.

### 4.1.5
#### Bugfixes
* #138 allow localized cast to item name by @PwQt in https://github.com/PwQt/magic-items-2/pull/141
* #134 fix to recharging on formula by @PwQt in https://github.com/PwQt/magic-items-2/pull/142

#### New features
* Display chat message showing how many charges the item has on use ( #5 ) by @PwQt in https://github.com/PwQt/magic-items-2/pull/117
* Add some api method for anyone find it useful by @p4535992 in https://github.com/PwQt/magic-items-2/pull/125

#### Localization
* Update pt-BR.json by @Kharmans in https://github.com/PwQt/magic-items-2/pull/118
* Update German by @davidbmaier 
* Add Russian language


### 4.1.4
* Bugfix to bug introduced in 4.1.3

### 4.1.3
#### Features
* Make Spell Components and Feature Action Type visible in Features list/Spellbook [#88]
* Add a possibility of not scaling spell damage (like acid splash/firebolt) [#73]

#### Bugfixes
* Fix babele being accessed when it's packs object wasn't yet initialized [#99]

### 4.1.2.1
- Github workflow fixes

### 4.1.2
* little bug fixing on the vite config and the pack utils
* Adjust midi-qol effect apply method

### 4.1.1
- Enable compatibility with D&D5e 3.1+

### 4.1.0
#### Bugfixes
* Tidy 5e styling fixes to make drag-drop field extend until the end of the tab. - thx @kgar 
* Removal of redundant code about activeEffect launch from Spells
* Migration of internal pack link to `magicitems` instead of `magic-items-2`
* Pack update to feature the v10 foundry dataset `system` instead of `data`
* Allow Spells/Feats added to feats to circumvent the "Only Identified" setting

#### Features
* Auto publish to FoundryVTT Github action
* New API method to allow compendium migrations from Magic Items 2 to Magic Items - details below


### Magic Items 4.0
- Migration to "magicitems" module-id

---
### 1.7.3 - ℹ️ - Last "Magic Items 2" version pre-migration to other module-id
- Message about migrations

### 1.7.2 
- Update pt-BR.json by @Kharmans in https://github.com/PwQt/magic-items-2/pull/87
- Null exception for 1.7.1 bugfix
  
### 1.7.1
- Do not show the _custom_ Apply Effect box whenever DFreds Convenient Effects automatization is enabled in Midi-Qol settings - #84 
- Polish and Spanish translation updates

### 1.7.0
- [BREAKING CHANGES] Many bug fixing and some not retrocompatibility changes by @p4535992 in #82
- Fix to packs
- Drop support for pre-3.0 version of D&D module

### 1.6.3.1
- Translations update (Spanish)

### 1.6.3
- [#71] Tidy Wire-up Console Errors Fix by @kgar

### 1.6.2

- Brazilian Portuguese Translation by @Kharmans in https://github.com/PwQt/magic-items-2/pull/68
- 63 bug effect not applying on a token from magic item spell by @PwQt in https://github.com/PwQt/magic-items-2/pull/69

### 1.6.1.1
- Actor API hotfix
- localization fixes

### 1.6.1
- Incorrect Tidy5e actor loading fix by @voodoofrog
- Started work on Polish localization of the module

### 1.6.0
- D&D 3.0 compatibility

### 1.5.2
- Mark the module as not compatible with DND5e 3.0

### 1.5.1
- Permission fix for spells on Character/Magic Item sheet by @PwQt in https://github.com/PwQt/magic-items-2/pull/49

### 1.5.0
- Tidy Compatibility, Refactors, Bugfixes by @kgar in https://github.com/PwQt/magic-items-2/pull/46

### 1.4.7
- add some helpers by @p4535992 in https://github.com/PwQt/magic-items-2/pull/42
- #44 fix to sortByLevel helper by @PwQt in https://github.com/PwQt/magic-items-2/pull/45

### 1.4.6
- Bug fix: https://github.com/PwQt/magic-items-2/issues/40, Updates `hack` function to support varying numbers of parent Item Sheet classes by @kgar in https://github.com/PwQt/magic-items-2/pull/41

### 1.4.5

- Bug fix: https://github.com/PwQt/magic-items-2/issues/22, by using the patch suggested from @david-simoes-93 on https://github.com/PwQt/magic-items-2/issues/38


### 1.4.2-3-4

- Bug fix https://github.com/PwQt/magic-items-2/issues/33

### 1.4.0-1

### 1.3.4

- Add uuid property to the magic items flags
- Update configurations files for a better management of the code
- Some minor bug fixes
- Separated the various custom magic item implementations classes into separate javascript files to make it more readable to other developers following the standard patterns used by other developers in large projects...

### 1.3.3
- Allow all to dragdrop into the magic-item-tab #24 by @PwQt in #26

### 1.3.2
- Arbons summoning compatibility by @PwQt in #15
- Add check if chatData exists on item rolls by @PwQt in #16 (thanks tposney for creating the issue)
- revert back the mandatory use of only Foundry v11

### 1.3.1
- github worker permission fixes

### 1.3.0
- Code base modifications

### 1.2.2
- Items showing twice in chat fix
- Spells disappear from list fix

### 1.2.1
- module.json updates

### 1.2.0
- modification to soon-to-be-deprecated Item5e#roll method

### 1.1.0
- in-foundry module configuration fixes, so that they are defined for "Magic Items 2" tab instead of "undefined"
- verified compability with v11

### 1.0.0 Forking the code of original Magic Items with additional fixes:
- update module.json to not use deprecated 'entity',
- merge request 33 - minor fix to add item to hotbar
- 5eTidy sheet integration based on merge request 25
- merge request 34 - icons in compendium fix

