/**
 * Argon Enhanced Combat HUD (`enhancedcombathud-dnd5e`) integration.
 *
 * Surfaces magic-item spells in Argon's per-actor Cast Spell accordion,
 * grouped under the parent magic item's name (mirroring the layout Argon
 * already uses for dnd5e 5.x "Cast Activity" magic items, which arrive on
 * the actor as real spell items tagged with `flags.dnd5e.cachedFor`).
 *
 * This integration **does not modify Argon's source files**. It captures
 * two closure-private Argon classes via Argon's own per-component render
 * hooks, then libWrappers two of their prototype methods so the Cast Spell
 * panel pulls in our flag-stored magic-item spells too. Click routing is
 * intercepted to call `MagicItemActor.rollByName(...)` instead of letting
 * Argon try to `.use()` a transient (non-embedded) Item5e.
 *
 * References (sourcemap-derived line numbers in
 * `modules/enhancedcombathud-dnd5e/index.js.map`):
 *   - `argonInit` hook fired in core's `CoreHud` ctor.
 *   - `render<ConstructorName>ArgonComponent` parent-class render hook
 *     in `app/components/component.js:130`.
 *   - `DND5eButtonPanelButton.prototype.prePrepareSpells` (echDnd5e.js:1023)
 *   - `DND5eItemButton.prototype._onLeftClick` (echDnd5e.js:874)
 */

import CONSTANTS from "../constants/constants.js";
import Logger from "../lib/Logger.js";
import { MagicItemActor } from "../magicitemactor.js";

const SYNTHETIC_FLAG = "syntheticSpell";

let _ButtonPanelButtonCtor = null;
let _ItemButtonCtor = null;
let _wrappedPrepare = false;
let _wrappedClick = false;

/**
 *
 */
function hasLibWrapper() {
  return typeof libWrapper === "object" && typeof libWrapper.register === "function";
}

/**
 * Wrap (or directly patch as a fallback) the two Argon prototype methods
 * once both target classes have been captured. libWrapper supports passing
 * a prototype object as the target, which is necessary because the Argon
 * classes are defined inside `argonInit`'s closure and aren't globally
 * addressable by name.
 */
function applyWraps() {
  if (_ButtonPanelButtonCtor && !_wrappedPrepare) {
    const proto = _ButtonPanelButtonCtor.prototype;
    // We need to mutate the returned array (which the ctor will then assign
    // to `this._spells`). Touching `this._spells` from inside the wrap is
    // useless — the ctor does `this._spells = prePrepareSpells()` *after*
    // our wrap returns, overwriting any in-place edits.
    if (hasLibWrapper()) {
      libWrapper.register(
        CONSTANTS.MODULE_ID,
        proto,
        "prePrepareSpells",
        function (wrapped, ...args) {
          const result = wrapped.apply(this, args);
          try {
            injectMagicItemSpells(this, result);
          } catch (e) {
            Logger.warn(`Argon prePrepareSpells injection failed: ${e?.message}`, false, e);
          }
          return result;
        },
        "WRAPPER",
      );
    } else {
      const orig = proto.prePrepareSpells;
      proto.prePrepareSpells = function (...args) {
        const result = orig.apply(this, args);
        try {
          injectMagicItemSpells(this, result);
        } catch (e) {
          Logger.warn(`Argon prePrepareSpells injection failed: ${e?.message}`, false, e);
        }
        return result;
      };
    }
    _wrappedPrepare = true;
    rerunPrepareOnExistingButtons();
  }

  if (_ItemButtonCtor && !_wrappedClick) {
    const proto = _ItemButtonCtor.prototype;
    // Wrap `_onPreLeftClick`, not `_onLeftClick`. The former runs first and
    // reads `this.targets` → `this.activity.actionType` (echDnd5e.js:845).
    // Our synthetic spell has an empty `system.activities` collection, so
    // `activity` resolves to undefined and the read throws before
    // `_onLeftClick` ever fires.
    const interceptor = async function (wrappedOrEvent, maybeEvent) {
      const usingWrapper = typeof wrappedOrEvent === "function";
      const event = usingWrapper ? maybeEvent : wrappedOrEvent;
      // Only short-circuit for our synthetic spell buttons (the ones we
      // built when no native cachedFor entry existed). Buttons in a
      // native cachedFor group fall through to dnd5e/midi's flow so the
      // workflow runs end-to-end and HP changes apply.
      const syn = getSyntheticFlag(this);
      if (syn) {
        const mia = MagicItemActor.get(this.actor?.id);
        if (mia) {
          mia.rollByName(syn.magicItemName, syn.spellName);
          return;
        }
      }
      if (usingWrapper) return wrappedOrEvent.call(this, event);
      return _origClickFallback.call(this, event);
    };
    if (hasLibWrapper()) {
      libWrapper.register(CONSTANTS.MODULE_ID, proto, "_onPreLeftClick", interceptor, "MIXED");
    } else {
      _origClickFallback = proto._onPreLeftClick;
      proto._onPreLeftClick = function (event) {
        return interceptor.call(this, event);
      };
    }
    _wrappedClick = true;
  }
}

let _origClickFallback;

/**
 * Argon may have already constructed its spell-type `DND5eButtonPanelButton`
 * instances by the time our wrap installs (the `renderXxxArgonComponent`
 * hook necessarily fires *after* the ctor that produced the rendered
 * element). For those instances, re-run `prePrepareSpells` so our wrapper
 * gets a chance to inject the magic-item groups; then trigger a HUD
 * refresh so the accordion picks up the updated `_spells`.
 */
function rerunPrepareOnExistingButtons() {
  const ARGON = ui?.ARGON;
  if (!ARGON?.components?.main?.length) return;
  let touched = false;
  for (const panel of ARGON.components.main) {
    for (const button of panel?._buttons ?? []) {
      if (!(button instanceof _ButtonPanelButtonCtor)) continue;
      if (button.type !== "spell") continue;
      button.itemsWithSpells = [];
      const result = button.prePrepareSpells();
      if (Array.isArray(result)) {
        button._spells = result;
        touched = true;
      }
    }
  }
  if (touched && typeof ARGON.refresh === "function") {
    Promise.resolve()
      .then(() => ARGON.refresh())
      .catch(() => {});
  }
}

/**
 * Read our synthetic-spell flag off whichever shape the button instance
 * exposes the underlying item as. Different Argon code paths assign it
 * to `_item`, `item`, or `_item.item`; check all three.
 * @param buttonInstance
 */
function getSyntheticFlag(buttonInstance) {
  const candidates = [buttonInstance?.item, buttonInstance?._item, buttonInstance?._item?.item];
  for (const c of candidates) {
    const flag = c?.flags?.[CONSTANTS.MODULE_ID]?.[SYNTHETIC_FLAG] ?? c?.getFlag?.(CONSTANTS.MODULE_ID, SYNTHETIC_FLAG);
    if (flag) return flag;
  }
  return null;
}

/**
 * Append one `itemsWithSpells` group per active magic item to a freshly
 * constructed `DND5eButtonPanelButton` of type "spell". The shape
 * (`{label, buttons[], uses(){max,value}}`) mirrors what Argon's own
 * cached-spell path produces at echDnd5e.js:1038-1043, so the accordion
 * grouping, header-uses display, and downstream filtering all work
 * unchanged.
 *
 * Buttons are built from transient (non-embedded) Item5e instances tagged
 * with `flags.magicitems.syntheticSpell` so the click interceptor can
 * route them to `MagicItemActor.rollByName(...)` instead of `.use()`-ing
 * a non-embedded item.
 */
// UUIDs whose full document we've already asynchronously fetched (and
// therefore know `fromUuidSync` will return the full doc, not the
// compendium-index stub) — once warmed, the cache stays for the
// lifetime of the page load.
const _preloadedSourceUuids = new Set();
// UUIDs currently being fetched. Tracked so we kick off one async fetch
// per uuid even when `injectMagicItemSpells` runs multiple times before
// the first fetch resolves.
const _inflightSourceFetches = new Set();

/**
 * Invalidate a single uuid in the preload cache. The GM editing a
 * compendium spell mid-session needs the next `injectMagicItemSpells`
 * call to re-fetch it instead of trusting our previous Set membership.
 * Foundry's own `fromUuid` cache is separate; calling `fromUuid` again
 * after a compendium edit returns the new document, so re-warming
 * picks up the change.
 * @param uuid
 */
function invalidateSourceUuid(uuid) {
  if (!uuid) return;
  _preloadedSourceUuids.delete(uuid);
  _inflightSourceFetches.delete(uuid);
}

// Spell-source compendium updates: invalidate the cache entry so the
// next Argon render rebuilds the synthetic tooltip data from the fresh
// document.
Hooks.on("updateItem", (item) => {
  if (item?.type !== "spell") return;
  if (item.uuid) invalidateSourceUuid(item.uuid);
});
Hooks.on("deleteItem", (item) => {
  if (item?.type !== "spell") return;
  if (item.uuid) invalidateSourceUuid(item.uuid);
});

/**
 * Async-warm the compendium document cache for every source spell
 * referenced by an actor's magic items. Foundry's `fromUuidSync`
 * returns the lite index entry for an unloaded compendium item (no
 * `system.school`, `system.description`, `system.activities`, no
 * `.toObject()`), but caches the full document on first `fromUuid`
 * call and returns it from then on. Pre-warm the cache so the next
 * `injectMagicItemSpells` pass builds buttons with full tooltip data.
 *
 * Triggers an `ui.ARGON.refresh()` after the first batch resolves so
 * the user sees rich tooltips without a manual reload.
 * @param mia
 */
function preloadMagicItemSpellSources(mia) {
  const toFetch = [];
  for (const ownedMI of mia?.items ?? []) {
    for (const sp of ownedMI?.spells ?? []) {
      const uuid = sp?.uuid;
      if (!uuid) continue;
      if (_preloadedSourceUuids.has(uuid)) continue;
      if (_inflightSourceFetches.has(uuid)) continue;
      _inflightSourceFetches.add(uuid);
      toFetch.push(uuid);
    }
  }
  if (!toFetch.length) return;
  Promise.allSettled(
    toFetch.map((uuid) =>
      fromUuid(uuid)
        .then(() => {
          _preloadedSourceUuids.add(uuid);
        })
        .catch(() => {})
        .finally(() => {
          _inflightSourceFetches.delete(uuid);
        }),
    ),
  ).then(() => {
    // `ui.ARGON.refresh()` re-renders the HUD but doesn't re-construct
    // the button-panel buttons whose ctor fires our `prePrepareSpells`
    // wrap; call `rerunPrepareOnExistingButtons` to re-execute the
    // injection (which now produces rich-tooltip buttons via the warm
    // cache).
    try {
      rerunPrepareOnExistingButtons();
    } catch (e) {
      /* Ignore */
    }
  });
}

/**
 *
 * @param buttonPanelButton
 * @param preparedSpells
 */
function injectMagicItemSpells(buttonPanelButton, preparedSpells) {
  if (buttonPanelButton.type !== "spell") return;
  if (!_ItemButtonCtor) return;
  const actor = buttonPanelButton.actor;
  if (!actor) return;
  const mia = MagicItemActor.get(actor.id);
  if (!mia?.items?.length) return;

  preloadMagicItemSpellSources(mia);

  // Argon's accordion-category header renders the X/▢ charge dots from
  // these numbers; non-numeric (string or NaN) max/value causes the
  // header to render blank. Default-pack magicitems data ships `charges`
  // as a string (e.g. "10"), so coerce explicitly.
  //
  // The closure captures only the actor id + magicitem document id —
  // both stable string primitives — then resolves the live Item5e on
  // every invocation through Foundry's own singleton-by-id stores
  // (`game.actors.get(actorId).items.get(magicItemId)`). Reading
  // `flags.magicitems.charges/uses` straight off that document is
  // immune to any of the failure modes 4.2.12 / 4.2.13 / 4.2.14 hit:
  //
  //   - `MagicItemActor.get(actorId)` returning undefined from the
  //     integration's bundle scope.
  //   - Stale `MagicItemActor` instance captures left over from a
  //     re-bind (`MagicItemActor.bind` runs on `ready` and again on
  //     token creation, each call replaces the singleton).
  //   - Stale Actor references captured before the document was
  //     rehydrated.
  //
  // Fallback to `ownedMI.charges/uses` only if Foundry can't resolve
  // the actor or item — covers the deleted-during-cast edge case.
  const usesFromMagicItem = (ownedMI) => {
    const actorId = ownedMI.actor?.id ?? ownedMI.magicItemActor?.actor?.id;
    const magicItemId = ownedMI.id ?? ownedMI.item?.id;
    return () => {
      const actor = globalThis.game?.actors?.get?.(actorId);
      const item = actor?.items?.get?.(magicItemId);
      const flags = item?.flags?.[CONSTANTS.MODULE_ID] ?? {};
      let max;
      let value;
      // Internal-charges mode: the live store is the dnd5e item's
      // `system.uses`, not the magicitems flags (which stay 0 in this mode).
      const sysUses = flags.internal ? item?.system?.uses : null;
      if (sysUses) {
        max = Number(sysUses.max);
        value = Number(sysUses.value ?? Math.max((Number(sysUses.max) || 0) - (Number(sysUses.spent) || 0), 0));
      } else {
        max = Number(flags.charges ?? ownedMI.charges);
        value = Number(flags.uses ?? ownedMI.uses);
      }
      return {
        max: Number.isFinite(max) ? max : 0,
        value: Number.isFinite(value) ? value : 0,
      };
    };
  };

  // If Argon's own `cachedFor` path already added a group with the same
  // label (the actor has dnd5e 5.x Cast Activities configured on the
  // staff and the cached spells live as real actor items), the native
  // group's `uses` getter reads from the parent item's
  // `system.uses.max/value` — empty on a magicitems-managed weapon — so
  // the X/▢ charge dots don't render. Swap in our magicitems-aware
  // `uses` getter on the existing group rather than adding a duplicate.
  const namesToMagicItem = new Map();
  for (const ownedMI of mia.items) {
    if (ownedMI.active && ownedMI.visible) namesToMagicItem.set(ownedMI.name, ownedMI);
  }
  const upgradeNativeGroup = (group) => {
    const ownedMI = namesToMagicItem.get(group?.label);
    if (!ownedMI) return false;
    // Fix only the charge counter on a native cachedFor group. We deliberately
    // do NOT reroute clicks on the group's buttons through rollByName: those
    // buttons hold real actor-embedded spell items that midi-qol's workflow
    // can roll & apply (damage/heal) correctly. Rerouting through
    // `OwnedMagicItemSpell.roll` builds a *transient* (non-embedded) clone
    // and calls `spell.use()` on it — midi creates a workflow but never
    // completes it (`#itemUseComplete: false`), so dice may roll but HP
    // changes never apply. Leaving the click alone keeps the proven dnd5e
    // / midi flow intact for these groups.
    //
    // Trade-off: dnd5e's Cast-Activity consumption (often "1 use of this
    // item") still applies to the staff's `system.uses`, which doesn't
    // match the magicitems per-spell `consumption` config. To make the
    // numbers line up the user can either delete the cachedFor / Cast
    // Activity setup so magicitems handles casting end-to-end, or edit
    // each Cast Activity's consumption to deduct the right amount.
    group.uses = usesFromMagicItem(ownedMI);
    return true;
  };
  for (const g of buttonPanelButton.itemsWithSpells ?? []) upgradeNativeGroup(g);
  if (Array.isArray(preparedSpells)) for (const g of preparedSpells) upgradeNativeGroup(g);

  const existingItemsWithSpellsLabels = new Set((buttonPanelButton.itemsWithSpells ?? []).map((g) => g.label));
  const existingPreparedLabels = new Set((Array.isArray(preparedSpells) ? preparedSpells : []).map((g) => g.label));

  const newGroups = [];
  for (const ownedMI of mia.items) {
    if (!ownedMI.active || !ownedMI.visible) continue;
    if (existingItemsWithSpellsLabels.has(ownedMI.name) && existingPreparedLabels.has(ownedMI.name)) continue;
    const ownedSpells = (ownedMI.ownedEntries ?? []).filter((e) => e.constructor?.name === "OwnedMagicItemSpell");
    if (!ownedSpells.length) continue;

    const buttons = [];
    for (const ownedSpell of ownedSpells) {
      const btn = buildButton(actor, ownedMI, ownedSpell);
      if (btn) buttons.push(btn);
    }
    if (!buttons.length) continue;

    const group = {
      label: ownedMI.name,
      buttons,
      uses: usesFromMagicItem(ownedMI),
    };
    newGroups.push(group);
    if (!existingItemsWithSpellsLabels.has(group.label)) buttonPanelButton.itemsWithSpells.push(group);
  }

  // Splice our groups at the head of the returned spells array so they
  // render before Cantrip / level buckets — matching where Argon's own
  // `cachedFor` magic-items path puts the `itemsWithSpells` entries
  // (`[...this.itemsWithSpells, atwill, innate, ...levels]`). Filter out
  // any duplicates already present.
  if (Array.isArray(preparedSpells) && newGroups.length) {
    const toAdd = newGroups.filter((g) => !existingPreparedLabels.has(g.label));
    if (toAdd.length) preparedSpells.unshift(...toAdd);
  }
}

/**
 * Build a transient Item5e + DND5eItemButton pair for one magic-item
 * spell entry. The spell document is constructed un-embedded
 * (`{parent: actor}`) so it carries the actor's data prep context for
 * label rendering but never touches the actor's items Collection.
 *
 * Prefer copying the source spell's full `system` block via
 * `fromUuidSync(entry.uuid).toObject()` so Argon's hover tooltip has
 * school, range, target, components, description, and activities to
 * render. Foundry's `fromUuidSync` returns fully-populated documents
 * for both actor-embedded and compendium items (compendium contents
 * are indexed at world load), so the lookup is cheap and reliable.
 * Falls back to a barebones doc if the uuid can't be resolved
 * (deleted source, broken reference) so the button still renders.
 * @param actor
 * @param ownedMI
 * @param ownedSpell
 */
function buildButton(actor, ownedMI, ownedSpell) {
  const entry = ownedSpell?.item ?? ownedSpell;
  if (!entry) return null;
  let spellDoc = null;
  try {
    let source = null;
    if (entry.uuid) {
      try {
        source = fromUuidSync(entry.uuid);
      } catch (e) {
        source = null;
      }
    }
    let spellData;
    if (source?.toObject) {
      spellData = source.toObject();
      spellData._id = entry.id;
      spellData.name = entry.name ?? spellData.name;
      spellData.img = entry.img ?? spellData.img;
      spellData.system = spellData.system ?? {};
      spellData.system.level = Number(entry.level ?? entry.baseLevel ?? spellData.system.level ?? 0);
    } else {
      spellData = {
        _id: entry.id,
        name: entry.name,
        type: "spell",
        img: entry.img,
        system: {
          level: Number(entry.level ?? entry.baseLevel ?? 0),
        },
      };
    }
    spellData.flags = spellData.flags ?? {};
    spellData.flags[CONSTANTS.MODULE_ID] = {
      ...(spellData.flags[CONSTANTS.MODULE_ID] ?? {}),
      [SYNTHETIC_FLAG]: { magicItemName: ownedMI.name, spellName: entry.name },
    };
    spellDoc = new CONFIG.Item.documentClass(spellData, { parent: actor });
    spellDoc.prepareFinalAttributes?.();
  } catch (e) {
    Logger.warn(`Argon: failed to build transient spell for ${entry?.name}: ${e?.message}`, false, e);
    return null;
  }
  try {
    return new _ItemButtonCtor({ item: spellDoc });
  } catch (e) {
    Logger.warn(`Argon: failed to build DND5eItemButton for ${entry?.name}: ${e?.message}`, false, e);
    return null;
  }
}

// Pause Argon's hook-driven refreshes across a magicitems cast cycle.
//
// Argon's core registers `createItem`/`updateItem`/`deleteItem` handlers whose
// guard is `e.parent === this._actor`. The dnd5e binding registers an inline
// `updateItem` handler whose guard is `r.parent === ui.ARGON._actor && ...`.
// Both short-circuit on the `_actor` comparison FIRST, so nulling `_actor`
// alone makes every one of them a no-op — no need to also clobber `rendered`
// (and we can't anyway: it's a getter on Foundry v13's ApplicationV2 base).
//
// `_actor` itself is assigned as a regular property by Argon, but we set it
// defensively via Object.defineProperty in case a future Argon version
// promotes it to a getter.
//
// Single-pause-at-a-time is fine here — overlapping magicitems casts on the
// same world are rare; a second concurrent caller gets a no-op resume.
// Returned `resume` is idempotent.
let _argonPaused = null;

/**
 *
 * @param obj
 * @param key
 * @param value
 */
function setOrDefine(obj, key, value) {
  try {
    obj[key] = value;
  } catch (e) {
    // Property is a getter — override via defineProperty.
    Object.defineProperty(obj, key, { value, configurable: true, writable: true });
  }
}

/**
 *
 */
export function pauseArgon() {
  const argon = ui?.ARGON;
  if (!argon) return () => {};
  if (_argonPaused) return () => {}; // already paused; later caller's resume is a no-op
  // Collect every Argon sub-component that has a render() — accordion
  // categories AND item buttons — and stub each one out for the duration
  // of the cast. This catches the ApplicationV2 per-document app
  // subscription path (auto-render when subscribed document mutates),
  // which `_actor = null` alone doesn't suppress. Without this, an update
  // to the staff (or any actor item) during cast triggers the accordion
  // sub-components to re-render directly, bypassing Argon's main hooks.
  const stubbed = [];
  const stubRender = (obj) => {
    if (!obj || typeof obj.render !== "function") return;
    const orig = obj.render;
    obj.render = () => undefined;
    stubbed.push({ obj, orig });
  };
  for (const cat of argon.accordionPanelCategories ?? []) stubRender(cat);
  for (const btn of argon.itemButtons ?? []) stubRender(btn);
  for (const cmp of argon.components?.main ?? []) stubRender(cmp);
  if (argon.components?.portrait) stubRender(argon.components.portrait);

  _argonPaused = { actor: argon._actor, stubbed };
  setOrDefine(argon, "_actor", null);

  let released = false;
  return function resume() {
    if (released || !_argonPaused) return;
    released = true;
    const saved = _argonPaused;
    _argonPaused = null;
    setOrDefine(argon, "_actor", saved.actor);
    // Restore render methods. Items may have been mutated underneath,
    // but the next natural updateItem / updateActor will fire Argon's
    // hooks and bring pip counts current. Brief staleness > flash.
    for (const { obj, orig } of saved.stubbed) {
      obj.render = orig;
    }
  };
}

Hooks.on("argonInit", () => {
  if (game.system?.id !== "dnd5e") return;
  if (!game.modules.get("enhancedcombathud-dnd5e")?.active) return;

  Hooks.on("renderButtonPanelButtonArgonComponent", (cmp) => {
    if (_ButtonPanelButtonCtor) return;
    if (cmp?.constructor?.name === "DND5eButtonPanelButton") {
      _ButtonPanelButtonCtor = cmp.constructor;
      applyWraps();
    }
  });
  Hooks.on("renderItemButtonArgonComponent", (cmp) => {
    if (_ItemButtonCtor) return;
    if (cmp?.constructor?.name === "DND5eItemButton") {
      _ItemButtonCtor = cmp.constructor;
      applyWraps();
    }
  });
});

// Test-only handle on file-private helpers. Not for production use.
export const __test__ = {
  buildButton,
  preloadMagicItemSpellSources,
  getSyntheticFlag,
  injectMagicItemSpells,
  invalidateSourceUuid,
};
