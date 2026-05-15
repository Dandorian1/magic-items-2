import Logger from "../lib/Logger.js";
import { MagicItemUpcastDialog } from "../magicitemupcastdialog.js";
import { AbstractOwnedMagicItemEntry } from "./AbstractOwnedMagicItemEntry.js";
import { pauseArgon } from "../integrations/argon.js";
import { MagicItemHelpers } from "../magic-item-helpers.js";
import { RetrieveHelpers } from "../lib/retrieve-helpers.js";
import CONSTANTS from "../constants/constants.js";

const TRANSIENT_FLAG = "transient";

/**
 * Delete an embedded transient spell from its parent actor, swallowing
 * errors (the document may already be gone if a parallel cleanup ran).
 * @param actor
 * @param itemId
 */
async function safeDeleteTransient(actor, itemId) {
  if (!actor || !itemId) return;
  if (!actor.items.has(itemId)) return;
  try {
    await actor.deleteEmbeddedDocuments("Item", [itemId]);
  } catch (e) {
    Logger.debug(`magicitems: cleanup of transient ${itemId} failed: ${e?.message}`);
  }
}

/**
 * Iterate `data.system.activities` regardless of whether toObject()
 * serialised it as a Map-shaped object (`{<id>: {...}}`), a plain
 * array, or already a Collection. Yields each activity-data sub-object
 * so the caller can mutate it in place.
 * @param systemData
 */
function* iterActivities(systemData) {
  const acts = systemData?.activities;
  if (!acts) return;
  if (Array.isArray(acts)) {
    for (const a of acts) if (a) yield a;
  } else if (typeof acts.values === "function") {
    for (const a of acts.values()) if (a) yield a;
  } else if (typeof acts === "object") {
    for (const k of Object.keys(acts)) {
      const a = acts[k];
      if (a && typeof a === "object") yield a;
    }
  }
}

/**
 * Build the data payload for a real embedded spell document. Same
 * shape the old transient code path produced, plus a magicitems-only
 * flag so the on-load orphan sweep and the render-time spellbook
 * filter can find it.
 *
 * Patches per-spell overrides at both legacy (`system.save`,
 * `system.actionType`, `system.scaling`) and activities-level
 * (dnd5e 5.x: `system.activities[*]`) locations. dnd5e 5.x removed
 * the legacy spell-level `scaling`/`save`/`actionType` fields entirely
 * — fully-migrated compendium spells silently dropped the user's
 * flat-DC, custom attack bonus, and cantrip-no-scaling overrides
 * before this rewrite.
 *
 * Legacy patches are kept as a fallback for any pre-5.x content
 * still floating around in worlds; they'll just be inert when both
 * schemas would have been present.
 * @param sourceItem
 * @param entry
 * @param magicItem
 */
function buildSpellData(sourceItem, entry, magicItem) {
  let data = sourceItem.toObject ? sourceItem.toObject() : sourceItem.toJSON();
  delete data._id;
  data.system ??= {};

  // ---- Flat DC override (D2) ---------------------------------------------
  // Activities-level: each save activity's `save.dc` is `{calculation, formula}`.
  //   - `calculation = ""` switches dnd5e's data prep into "use the formula value"
  //   - `formula = String(<dc>)` is read deterministically into `dc.value`
  // Legacy `system.save.*` is patched as a fallback for pre-5.x content.
  if (entry.flatDc) {
    for (const a of iterActivities(data.system)) {
      if (a?.type !== "save" && !a?.save) continue;
      a.save ??= {};
      a.save.dc ??= {};
      a.save.dc.calculation = "";
      a.save.dc.formula = String(entry.dc ?? "");
    }
    if (data.system?.save) {
      data = foundry.utils.mergeObject(data, {
        "system.save.scaling": "flat",
        "system.save.dc": entry.dc,
      });
    }
  } else if (data.system?.save && typeof data.system.save.scaling === "undefined") {
    // Pre-5.x default: missing scaling → "spell" (spellcasting DC).
    data = foundry.utils.mergeObject(data, { "system.save.scaling": "spell" });
  }

  // ---- Custom spell-attack bonus (D3) ------------------------------------
  // Activities-level: each attack activity's `attack.bonus` is a FormulaField.
  // Append our bonus rather than replace, matching the legacy behaviour.
  const wantsAttackPatch = entry.atkBonus || entry.checkAtkBonus;
  if (wantsAttackPatch) {
    const attackBonus = entry.checkAtkBonus
      ? String(entry.atkBonus ?? "")
      : String(magicItem.actor?.system?.attributes?.prof ?? "");
    if (attackBonus) {
      for (const a of iterActivities(data.system)) {
        if (a?.type !== "attack" && !a?.attack) continue;
        a.attack ??= {};
        a.attack.bonus = a.attack.bonus ? `${a.attack.bonus} + ${attackBonus}` : attackBonus;
      }
      // Legacy fallback for pre-5.x spells with top-level actionType.
      if (data.system?.actionType === "rsak" || data.system?.actionType === "msak") {
        data.system.attack ??= {};
        data.system.attack.bonus = data.system.attack.bonus
          ? `${data.system.attack.bonus} + ${attackBonus}`
          : attackBonus;
      }
    }
  }

  // ---- Cantrip no-scaling override (D1) ----------------------------------
  // Activities-level: each damage part's `scaling.mode` controls upcast
  // scaling. Setting it to "" makes the increase compute to 0, returning
  // the base formula unchanged — the dnd5e equivalent of legacy
  // `system.scaling = "none"`. Only applies when both the spell is a
  // cantrip and the user hasn't opted into the "scale cantrips" world
  // setting.
  const isCantrip = Number(data.system?.level ?? 0) === 0;
  if (isCantrip && !MagicItemHelpers.isLevelScalingSettingOn()) {
    for (const a of iterActivities(data.system)) {
      const parts = a?.damage?.parts;
      if (!Array.isArray(parts)) continue;
      for (const p of parts) {
        if (!p) continue;
        p.scaling ??= {};
        p.scaling.mode = "";
      }
    }
    // Legacy fallback.
    if (data.system && typeof data.system.scaling !== "undefined") {
      data.system.scaling = "none";
    }
  }

  // Blank `activation.type` on every activity so Argon (the Enhanced Combat
  // HUD) doesn't flicker on every cast. Per Argon's wiki, its visibility
  // filter is "first activity's `activation.type` ∈ {action, bonus, reaction,
  // special}" — anything else makes Argon skip the item entirely. Without
  // this, `createEmbeddedDocuments` triggers an Argon re-render for the new
  // transient, and `deleteEmbeddedDocuments` triggers another at cleanup,
  // bracketing every cast with a visible blink. `consume: false` already
  // suppresses action-economy gating, so blanking activation.type has no
  // effect on dnd5e's cast workflow.
  for (const a of iterActivities(data.system)) {
    if (a?.activation) a.activation.type = "";
  }

  data = foundry.utils.mergeObject(data, {
    "system.preparation": { mode: "magicitems" },
    "flags.core": { sourceId: entry.uuid },
    [`flags.${CONSTANTS.MODULE_ID}.${TRANSIENT_FLAG}`]: {
      magicItemId: magicItem.id,
      spellName: entry.name,
      createdAt: Date.now(),
    },
  });

  return data;
}

/**
 * Detect whether midi-qol still has an active Workflow for any of the
 * given activity uuids. Used by the 30-second timeout safety net to
 * defer cleanup when midi is mid-stride — otherwise a slow workflow
 * (network jitter, large effect stacks, GM reviewing damage) could see
 * its underlying item document deleted out from under it.
 * @param activityUuids
 */
function midiHasActiveWorkflow(activityUuids) {
  try {
    const Wf = globalThis.MidiQOL?.Workflow ?? globalThis.MidiQOL?.workflowClass;
    const workflows = Wf?.workflows;
    if (!workflows) return false;
    const iter = workflows instanceof Map ? workflows.values() : Object.values(workflows);
    for (const wf of iter) {
      const u = wf?.activity?.uuid ?? wf?._activity?.uuid;
      if (u && activityUuids.has(u)) return true;
    }
  } catch (e) {
    /* Fall through — when in doubt, allow cleanup */
  }
  return false;
}

/**
 * Schedule cleanup of a freshly-created transient embedded spell once
 * its cast workflow finishes. Listens for whichever post-cast hook
 * fires first (midi's `RollComplete` if midi is installed, dnd5e's
 * `postUseActivity` otherwise), and falls back to a 30-second timeout
 * so a cancelled or stalled workflow can't leak orphan items. If the
 * timeout fires while midi still has an active Workflow for one of
 * our activity UUIDs, defer another 30s — repeat up to 3 times before
 * giving up and forcing cleanup (the `ready`-time orphan sweep will
 * pick up anything we miss).
 * @param actor
 * @param transient
 */
function scheduleTransientCleanup(actor, transient, onCleanup) {
  const actorId = actor?.id;
  const itemId = transient?.id;
  if (!actorId || !itemId) {
    if (typeof onCleanup === "function") onCleanup();
    return;
  }

  const activityUuids = new Set();
  try {
    const acts = transient.system?.activities;
    const list = acts ? Array.from(acts.values?.() ?? Object.values(acts)) : [];
    for (const a of list) if (a?.uuid) activityUuids.add(a.uuid);
  } catch (e) {
    /* Fall through */
  }

  let timeoutHandle;
  let dnd5eHookId;
  let midiHookId;
  let timeoutAttempts = 0;

  const finalise = async () => {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    if (dnd5eHookId) Hooks.off("dnd5e.postUseActivity", dnd5eHookId);
    if (midiHookId) Hooks.off("midi-qol.RollComplete", midiHookId);
    await safeDeleteTransient(game.actors.get(actorId), itemId);
    if (typeof onCleanup === "function") onCleanup();
  };

  const onTimeout = () => {
    // If midi still has an active Workflow for one of our activities,
    // defer cleanup another 30s rather than yanking the item from
    // under a running workflow. Cap retries so a stuck workflow can't
    // hold the transient forever — `ready`-sweep is the backstop.
    timeoutAttempts += 1;
    if (timeoutAttempts < 3 && midiHasActiveWorkflow(activityUuids)) {
      timeoutHandle = setTimeout(onTimeout, 30000);
      return;
    }
    finalise();
  };

  dnd5eHookId = Hooks.on("dnd5e.postUseActivity", (activity) => {
    if (!activity?.uuid || !activityUuids.has(activity.uuid)) return;
    finalise();
  });

  midiHookId = Hooks.on("midi-qol.RollComplete", (workflow) => {
    const wfActivityUuid = workflow?.activity?.uuid ?? workflow?._activity?.uuid;
    if (!wfActivityUuid || !activityUuids.has(wfActivityUuid)) return;
    finalise();
  });

  timeoutHandle = setTimeout(onTimeout, 30000);
}

export class OwnedMagicItemSpell extends AbstractOwnedMagicItemEntry {
  async roll() {
    let upcastLevel = this.item.level;
    let consumption = this.item.consumption;

    const actor = this.magicItem.actor;
    if (!actor) {
      Logger.warn(`magicitems: cannot cast ${this.item.name} — no actor`, true);
      return;
    }
    if (!actor.isOwner) {
      Logger.warn(`magicitems: you don't own ${actor.name} — can't materialise the spell to cast`, true);
      return;
    }

    if (this.item.canUpcast()) {
      const spellFormData = await MagicItemUpcastDialog.create(this.magicItem, this.item);
      if (!spellFormData) return; // User dismissed the upcast dialog
      upcastLevel = parseInt(spellFormData.get("level"));
      consumption = parseInt(spellFormData.get("consumption"));
    }

    const proceed = async () => {
      const sourceItem = await this.item.entity();
      if (!sourceItem) {
        Logger.warn(`magicitems: source spell for ${this.item.name} not found`, true);
        return;
      }
      const data = buildSpellData(sourceItem, this.item, this.magicItem);

      // Pause Argon's item-hook-driven refreshes for the duration of the
      // cast — see `pauseArgon` in integrations/argon.js. Resumed (with a
      // single catch-up `argon.refresh()`) once `scheduleTransientCleanup`
      // deletes the transient. Idempotent, so the manual error/cancel paths
      // below can also release it without double-toggling.
      const unpauseArgon = pauseArgon();

      // Materialise the spell as a real actor-embedded Item5e so that
      // midi-qol / chris-premades / dnd5e all see it in `actor.items`.
      // The transient (non-embedded) clone the previous implementation
      // used is rejected by midi's premades hooks (which look the spell
      // up by id) and stalls midi's Workflow at AwaitItemCard, so
      // damage/heal would roll but HP never updated.
      let transient;
      try {
        const created = await actor.createEmbeddedDocuments("Item", [data]);
        transient = Array.isArray(created) ? created[0] : created;
      } catch (e) {
        Logger.error(`magicitems: failed to materialise ${this.item.name}: ${e?.message}`, true, e);
        unpauseArgon();
        return;
      }
      if (!transient) {
        Logger.warn(`magicitems: materialise returned no item for ${this.item.name}`, true);
        unpauseArgon();
        return;
      }
      transient.prepareFinalAttributes?.();

      // Begin cleanup-on-completion before .use() so we never miss the
      // post-cast hook if it fires synchronously inside `.use()`.
      scheduleTransientCleanup(actor, transient, unpauseArgon);

      let spell = transient;

      // Tell dnd5e to treat this as a fixed-level cast (spell-scroll style).
      // dnd5e 5.x's `Activity._prepareUsageConfig` reads `flags.dnd5e.spellLevel`
      // and routes the leveling-flag branch — `_prepareUsageScaling` then
      // computes `usageConfig.scaling = value - base`, so damage activities
      // apply the per-level scaling formula the right number of times.
      // Without this flag the `usage.scaling` we pass below gets overwritten
      // to `false` for non-spell-slot casts, and nothing scales.
      if (upcastLevel !== spell.system.level) {
        await spell.update({
          "flags.dnd5e.spellLevel": { value: upcastLevel, base: spell.system.level },
        });
      }

      const itemUseConfiguration = { consume: false };

      if (
        MagicItemHelpers.canSummon() &&
        (spell.system.summons?.creatureTypes?.length > 1 || spell.system.summons?.profiles?.length > 1)
      ) {
        const sOptions = MagicItemHelpers.createSummoningOptions(spell);
        const summoningDialogResult = await this.askSummonningMessage(sOptions);
        if (summoningDialogResult) {
          foundry.utils.mergeObject(itemUseConfiguration, {
            createSummons: summoningDialogResult.createSummons?.value === "on",
            summonsProfile: summoningDialogResult.summonsProfile?.value,
            summonsOptions: {
              creatureType: summoningDialogResult.creatureType?.value,
              creatureSize: summoningDialogResult.creatureSize?.value,
            },
          });
        } else {
          Logger.info("The summoning dialog has been dismissed, not using the item.");
          await safeDeleteTransient(actor, transient.id);
          // `scheduleTransientCleanup`'s deferred hook will eventually fire
          // (or time out at 30s) and run unpauseArgon — release it now so
          // the user isn't waiting on a stale paused HUD.
          unpauseArgon();
          return;
        }
      }

      // Cantrip "no scaling" is now applied at build time via
      // `buildSpellData()` (zeroes each damage activity's
      // `damage.parts[*].scaling.mode`). The legacy post-create
      // `update({"system.scaling": "none"})` was a no-op on dnd5e 5.x
      // spells (top-level `system.scaling` was removed).
      if (upcastLevel !== spell.system.level) {
        foundry.utils.mergeObject(itemUseConfiguration, {
          scaling: Math.max(upcastLevel - spell.system.level, 0),
        });
      }

      if (spell.effects?.size > 0 && !MagicItemHelpers.isMidiItemEffectWorkflowOn()) {
        await spell.update({ effects: [] });
      }

      let chatData;
      try {
        chatData = await spell.use(itemUseConfiguration, {
          configure: false,
        });
      } catch (e) {
        Logger.warn(`magicitems: spell.use failed for ${spell.name}: ${e?.message}`, false, e);
      }

      if (chatData) {
        await this.consume(consumption);
        if (!this.magicItem.isDestroyed) {
          await this.magicItem.update();
        }
      }

      // Skip manual apply if the spell has activity-level effects — dnd5e's
      // workflow already applies those during .use(), so a second pass would
      // double-apply. Only legacy spells with bare `item.effects` and no
      // activity effects need the manual path.
      const hasActivityEffects = Array.from(iterActivities(spell.system)).some(
        (a) => Array.isArray(a?.effects) && a.effects.length > 0,
      );
      if (spell.effects?.size > 0 && !hasActivityEffects && !MagicItemHelpers.isMidiItemEffectWorkflowOn()) {
        this.activeEffectMessage(async () => {
          await this.applyActiveEffects(spell);
        });
      }
    };

    if (this.hasCharges(consumption)) {
      await proceed();
    } else {
      this.showNoChargesMessage(async () => {
        await proceed();
      });
    }
  }
}

/**
 * Filter transient spells out of the dnd5e character spellbook so the
 * brief on-cast embed window doesn't double-render the spell. Argon's
 * own Cast Spell accordion is fed by `actor.items.filter(...)` too;
 * adding the same flag check there lives in `integrations/argon.js`.
 * Implemented as a top-level hook (module-side concern, lives here for
 * proximity to the materialise code that creates them).
 */
// dnd5e 5.x ships two sheet generations: the legacy v1 sheets
// (`ActorSheet5eCharacter`/`NPC` + their 4.x-era `*2` variants) and the
// v2 ApplicationV2 sheets (`CharacterActorSheet`/`NPCActorSheet`). Subscribe
// to all four hook names so the transient-spell filter runs whichever
// sheet the user has active. Harmless extras when only one matches.
Hooks.on("renderActorSheet5eCharacter2", filterTransientsFromSheet);
Hooks.on("renderActorSheet5eNPC2", filterTransientsFromSheet);
Hooks.on("renderActorSheet5eCharacter", filterTransientsFromSheet);
Hooks.on("renderActorSheet5eNPC", filterTransientsFromSheet);
Hooks.on("renderCharacterActorSheet", filterTransientsFromSheet);
Hooks.on("renderNPCActorSheet", filterTransientsFromSheet);

/**
 *
 * @param app
 * @param htmlOrElement
 */
function filterTransientsFromSheet(app, htmlOrElement) {
  const actor = app?.actor;
  if (!actor) return;
  const transients = actor.items.filter((i) => i?.flags?.[CONSTANTS.MODULE_ID]?.[TRANSIENT_FLAG]);
  if (!transients.length) return;
  const root = htmlOrElement?.jquery ? htmlOrElement[0] : htmlOrElement;
  if (!root) return;
  for (const item of transients) {
    root.querySelectorAll(`[data-item-id="${item.id}"]`).forEach((el) => {
      el.style.display = "none";
    });
  }
}

/**
 * On world-ready, sweep every owned actor for transient spells whose
 * 30-second TTL has expired. The per-cast cleanup is robust under
 * normal conditions; this is the safety net for crashes / disconnects
 * mid-workflow.
 */
Hooks.once("ready", async () => {
  const now = Date.now();
  for (const actor of game.actors?.contents ?? []) {
    if (!actor.isOwner) continue;
    const stale = actor.items.filter((i) => {
      const meta = i.flags?.[CONSTANTS.MODULE_ID]?.[TRANSIENT_FLAG];
      if (!meta) return false;
      const age = now - (meta.createdAt ?? 0);
      return age > 60_000; // Older than a minute → certainly orphaned
    });
    if (!stale.length) continue;
    try {
      await actor.deleteEmbeddedDocuments(
        "Item",
        stale.map((i) => i.id),
      );
    } catch (e) {
      Logger.debug(`magicitems: ready-sweep cleanup on ${actor.name} failed: ${e?.message}`);
    }
  }
});

// Test-only handle on file-private helpers. Not for production use.
export const __test__ = {
  buildSpellData,
  iterActivities,
  midiHasActiveWorkflow,
  scheduleTransientCleanup,
  safeDeleteTransient,
  filterTransientsFromSheet,
};
