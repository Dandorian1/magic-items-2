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

