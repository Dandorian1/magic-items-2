import Logger from "../lib/Logger.js";
import { MagicItemUpcastDialog } from "../magicitemupcastdialog.js";
import { AbstractOwnedMagicItemEntry } from "./AbstractOwnedMagicItemEntry.js";
import { MagicItemHelpers } from "../magic-item-helpers.js";
import { RetrieveHelpers } from "../lib/retrieve-helpers.js";
import CONSTANTS from "../constants/constants.js";

const TRANSIENT_FLAG = "transient";

/**
 * Delete an embedded transient spell from its parent actor, swallowing
 * errors (the document may already be gone if a parallel cleanup ran).
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
 * Build the data payload for a real embedded spell document. Same shape
 * the old transient code path produced, plus a magicitems-only flag so
 * the on-load orphan sweep and the render-time spellbook filter can
 * find it.
 */
function buildSpellData(sourceItem, entry, magicItem) {
  let data = sourceItem.toObject ? sourceItem.toObject() : sourceItem.toJSON();
  delete data._id;

  if (data.system?.save && typeof data.system.save.scaling === "undefined") {
    data = foundry.utils.mergeObject(data, { "system.save.scaling": "spell" });
  }

  if (entry.flatDc && data.system?.save) {
    data = foundry.utils.mergeObject(data, {
      "system.save.scaling": "flat",
      "system.save.dc": entry.dc,
    });
  }

  if (data.system?.actionType === "rsak" || data.system?.actionType === "msak") {
    let attackBonusValue = String(entry.atkBonus ?? "");
    if (!entry.checkAtkBonus) {
      attackBonusValue = String(magicItem.actor?.system?.attributes?.prof ?? "");
    }
    data.system.attack ??= {};
    if (data.system.attack.bonus) {
      data.system.attack.bonus += `+ ${attackBonusValue}`;
    } else {
      data.system.attack.bonus = attackBonusValue;
    }
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
 * Schedule cleanup of a freshly-created transient embedded spell once
 * its cast workflow finishes. Listens for whichever post-cast hook
 * fires first (midi's `RollComplete` if midi is installed, dnd5e's
 * `postUseActivity` otherwise), and falls back to a 30-second timeout
 * so a cancelled or stalled workflow can't leak orphan items.
 */
function scheduleTransientCleanup(actor, transient) {
  const actorId = actor?.id;
  const itemId = transient?.id;
  if (!actorId || !itemId) return;

  const activityUuids = new Set();
  try {
    const acts = transient.system?.activities;
    const list = acts ? Array.from(acts.values?.() ?? Object.values(acts)) : [];
    for (const a of list) if (a?.uuid) activityUuids.add(a.uuid);
  } catch (e) {
    /* fall through */
  }

  let timeoutHandle;
  let dnd5eHookId;
  let midiHookId;

  const finalise = async () => {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    if (dnd5eHookId) Hooks.off("dnd5e.postUseActivity", dnd5eHookId);
    if (midiHookId) Hooks.off("midi-qol.RollComplete", midiHookId);
    await safeDeleteTransient(game.actors.get(actorId), itemId);
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

  timeoutHandle = setTimeout(finalise, 30000);
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
        return;
      }
      if (!transient) {
        Logger.warn(`magicitems: materialise returned no item for ${this.item.name}`, true);
        return;
      }
      transient.prepareFinalAttributes?.();

      // Begin cleanup-on-completion before .use() so we never miss the
      // post-cast hook if it fires synchronously inside `.use()`.
      scheduleTransientCleanup(actor, transient);

      let spell = transient;

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
          Logger.info(`The summoning dialog has been dismissed, not using the item.`);
          await safeDeleteTransient(actor, transient.id);
          return;
        }
      }

      if (spell.system.level === 0 && !MagicItemHelpers.isLevelScalingSettingOn()) {
        await spell.update({ "system.scaling": "none" });
      }

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
          this.magicItem.update();
        }
      }

      if (spell.effects?.size > 0 && !MagicItemHelpers.isMidiItemEffectWorkflowOn()) {
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
Hooks.on("renderActorSheet5eCharacter2", filterTransientsFromSheet);
Hooks.on("renderActorSheet5eNPC2", filterTransientsFromSheet);
Hooks.on("renderActorSheet5eCharacter", filterTransientsFromSheet);
Hooks.on("renderActorSheet5eNPC", filterTransientsFromSheet);

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
      return age > 60_000; // older than a minute → certainly orphaned
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
