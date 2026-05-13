import Logger from "../lib/Logger.js";
import { MagicItemUpcastDialog } from "../magicitemupcastdialog.js";
import { AbstractOwnedMagicItemEntry } from "./AbstractOwnedMagicItemEntry.js";
import { MagicItemHelpers } from "../magic-item-helpers.js";
import { RetrieveHelpers } from "../lib/retrieve-helpers.js";

/**
 * Magicitems casts spells by building a transient (non-actor-embedded)
 * Item5e clone and calling `spell.use(...)` on it. dnd5e 5.x's
 * MidiActivity.use() is the only place where midi-qol's Workflow gets
 * its `itemCardUuid` and `itemUseComplete` set — and it's only reached
 * for real actor-embedded items. So midi creates a Workflow for our
 * cast but it suspends at `WorkflowState_AwaitItemCard`: dice can roll
 * into chat, but applyDamage / applyHealing never fire and HP never
 * updates.
 *
 * After `spell.use()` returns, locate that suspended Workflow and set
 * the two stalled fields, then kick the state machine forward. Every
 * access is guarded so a midi-qol internal rename can't break casting.
 */
async function tryUnblockMidiWorkflow(spell, chatData) {
  try {
    const MQ = typeof globalThis.MidiQOL !== "undefined" ? globalThis.MidiQOL : null;
    if (!MQ?.Workflow?.workflows) return;

    const acts = spell?.system?.activities;
    if (!acts) return;
    let activityUuid;
    try {
      const first = Array.from(acts.values?.() ?? Object.values(acts))[0];
      activityUuid = first?.uuid;
    } catch (e) {
      return;
    }
    if (!activityUuid) return;

    let wf = MQ.Workflow.getWorkflow(activityUuid) ?? MQ.Workflow.getWorkflowByActivityUuid?.(activityUuid);
    // `getWorkflowByActivityUuid` may hand back a `WeakRef` when midi's
    // `useWeakReferences` setting is on. `getWorkflow` unwraps it
    // internally, but be defensive in case we end up with the raw entry.
    if (wf && typeof wf.deref === "function") wf = wf.deref();
    if (!wf) return;

    if (chatData && typeof chatData === "object" && chatData.uuid && !wf.itemCardUuid) {
      wf.itemCardUuid = chatData.uuid;
    }
    if (!wf.itemUseComplete) wf.itemUseComplete = true;

    if (typeof wf.performState === "function" && wf.WorkflowState_Start) {
      try {
        await wf.performState(wf.WorkflowState_Start, {});
      } catch (e) {
        // midi may already be advancing the workflow on its own once
        // the two fields are set; a second nudge can race and throw.
        Logger.debug(`midi workflow already advancing: ${e?.message}`);
      }
    }
  } catch (e) {
    Logger.warn(`magicitems: midi workflow patch failed: ${e?.message}`, false, e);
  }
}

export class OwnedMagicItemSpell extends AbstractOwnedMagicItemEntry {
  async roll() {
    let upcastLevel = this.item.level;
    let consumption = this.item.consumption;

    if (!this.ownedItem) {
      const sourceItem = await this.item.entity();
      let data = sourceItem.toObject ? sourceItem.toObject() : sourceItem.toJSON();

      if (data.system.save && typeof data.system.save.scaling === "undefined") {
        data = foundry.utils.mergeObject(data, {
          "system.save.scaling": "spell",
        });
      }

      if (this.item.flatDc && data.system.save) {
        data = foundry.utils.mergeObject(data, {
          "system.save.scaling": "flat",
          "system.save.dc": this.item.dc,
        });
      }

      if (data.system.actionType === "rsak" || data.system.actionType === "msak") {
        let attackBonusValue = this.item.atkBonus.toString();
        if (!this.item.checkAtkBonus) {
          attackBonusValue = this.magicItem.actor?.system?.attributes?.prof?.toString();
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
      });

      data = foundry.utils.mergeObject(data, {
        "flags.core": {
          sourceId: this.item.uuid,
        },
      });

      const cls = CONFIG.Item.documentClass;
      this.ownedItem = new cls(data, { parent: this.magicItem.actor });
      this.ownedItem.prepareFinalAttributes();
    }

    if (this.item.canUpcast()) {
      const spellFormData = await MagicItemUpcastDialog.create(this.magicItem, this.item);
      upcastLevel = parseInt(spellFormData.get("level"));
      consumption = parseInt(spellFormData.get("consumption"));
    }

    let proceed = async () => {
      let spell = this.ownedItem;
      let clonedOwnedItem = this.ownedItem;
      let itemUseConfiguration = {
        consume: false,
      };

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
          return;
        }
      }

      if (spell.system.level === 0 && !MagicItemHelpers.isLevelScalingSettingOn()) {
        spell = spell.clone({ "system.scaling": "none" }, { keepId: true });
        clonedOwnedItem = clonedOwnedItem.clone({ "system.scaling": "none" }, { keepId: true });
        spell.prepareFinalAttributes();
      }

      if (upcastLevel !== spell.system.level) {
        foundry.utils.mergeObject(itemUseConfiguration, {
          scaling: Math.max(upcastLevel - spell.system.level, 0),
        });
      }

      if (spell.effects?.size > 0 && !MagicItemHelpers.isMidiItemEffectWorkflowOn()) {
        spell = spell.clone({ effects: {} }, { keepId: true });
        spell.prepareFinalAttributes();
      }

      let chatData = await spell.use(
        itemUseConfiguration,
        {
          configure: false,
        },
        {
          create: true,
          data: {
            flags: {
              dnd5e: {
                itemData: clonedOwnedItem.toObject ? clonedOwnedItem.toObject() : clonedOwnedItem.toJSON(),
              },
            },
          },
        },
      );
      await tryUnblockMidiWorkflow(spell, chatData);
      if (chatData) {
        await this.consume(consumption);
        if (!this.magicItem.isDestroyed) {
          this.magicItem.update();
        }
      }
      if (this.ownedItem.effects?.size > 0 && !MagicItemHelpers.isMidiItemEffectWorkflowOn()) {
        this.activeEffectMessage(async () => {
          await this.applyActiveEffects(this.ownedItem);
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
