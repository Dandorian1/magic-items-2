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
    if (hasLibWrapper()) {
      libWrapper.register(
        CONSTANTS.MODULE_ID,
        proto,
        "prePrepareSpells",
        function (wrapped, ...args) {
          const result = wrapped.apply(this, args);
          try {
            injectMagicItemSpells(this);
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
          injectMagicItemSpells(this);
        } catch (e) {
          Logger.warn(`Argon prePrepareSpells injection failed: ${e?.message}`, false, e);
        }
        return result;
      };
    }
    _wrappedPrepare = true;
  }

  if (_ItemButtonCtor && !_wrappedClick) {
    const proto = _ItemButtonCtor.prototype;
    const interceptor = async function (wrappedOrEvent, maybeEvent) {
      const usingWrapper = typeof wrappedOrEvent === "function";
      const event = usingWrapper ? maybeEvent : wrappedOrEvent;
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
      libWrapper.register(CONSTANTS.MODULE_ID, proto, "_onLeftClick", interceptor, "MIXED");
    } else {
      _origClickFallback = proto._onLeftClick;
      proto._onLeftClick = function (event) {
        return interceptor.call(this, event);
      };
    }
    _wrappedClick = true;
  }
}

let _origClickFallback;

/**
 * Read our synthetic-spell flag off whichever shape the button instance
 * exposes the underlying item as. Different Argon code paths assign it
 * to `_item`, `item`, or `_item.item`; check all three.
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
function injectMagicItemSpells(buttonPanelButton) {
  if (buttonPanelButton.type !== "spell") return;
  if (!_ItemButtonCtor) return;
  const actor = buttonPanelButton.actor;
  if (!actor) return;
  const mia = MagicItemActor.get(actor.id);
  if (!mia?.items?.length) return;

  const existingLabels = new Set((buttonPanelButton.itemsWithSpells ?? []).map((g) => g.label));

  for (const ownedMI of mia.items) {
    if (!ownedMI.active || !ownedMI.visible) continue;
    if (existingLabels.has(ownedMI.name)) continue;
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
      uses: () => ({ max: ownedMI.charges, value: ownedMI.uses }),
    };
    buttonPanelButton.itemsWithSpells.push(group);
    if (Array.isArray(buttonPanelButton._spells) && !buttonPanelButton._spells.some((g) => g.label === group.label)) {
      buttonPanelButton._spells.push(group);
    }
  }
}

/**
 * Build a transient Item5e + DND5eItemButton pair for one magic-item
 * spell entry. The spell document is constructed un-embedded
 * (`{parent: actor}`) so it carries the actor's data prep context for
 * label rendering but never touches the actor's items Collection.
 */
function buildButton(actor, ownedMI, ownedSpell) {
  const entry = ownedSpell?.item ?? ownedSpell;
  if (!entry) return null;
  let spellDoc = null;
  try {
    const spellData = {
      _id: entry.id,
      name: entry.name,
      type: "spell",
      img: entry.img,
      system: {
        level: Number(entry.level ?? entry.baseLevel ?? 0),
      },
      flags: {
        [CONSTANTS.MODULE_ID]: {
          [SYNTHETIC_FLAG]: { magicItemName: ownedMI.name, spellName: entry.name },
        },
      },
    };
    spellDoc = new CONFIG.Item.documentClass(spellData, { parent: actor });
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
