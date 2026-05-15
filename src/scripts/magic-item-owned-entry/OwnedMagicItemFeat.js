import { AbstractOwnedMagicItemEntry } from "./AbstractOwnedMagicItemEntry.js";
import { MagicItemHelpers } from "../magic-item-helpers.js";

export class OwnedMagicItemFeat extends AbstractOwnedMagicItemEntry {
  async roll() {
    let consumption = this.item.consumption;

    if (!this.ownedItem) {
      const sourceItem = await this.item.entity();
      let data = sourceItem.toObject ? sourceItem.toObject() : sourceItem.toJSON();

      data = foundry.utils.mergeObject(data, {
        "system.uses": null,
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

    let onUsage =
      this.item.effect === "e1"
        ? async () => {
            await this.consume(consumption);
          }
        : async () => {
            ChatMessage.create({
              user: game.user._id,
              speaker: ChatMessage.getSpeaker({ actor: this.magicItem.actor }),
              content: this.magicItem.formatMessage(
                `<b>${this.name}</b>: ${game.i18n.localize("MAGICITEMS.SheetConsumptionDestroyMessage")}`,
              ),
            });

            await this.magicItem.destroyItem();
          };

    let proceed = async () => {
      let feat = this.ownedItem;
      if (feat.effects?.size > 0 && !MagicItemHelpers.isMidiItemEffectWorkflowOn()) {
        feat = feat.clone({ effects: {} }, { keepId: true });
        feat.prepareFinalAttributes();
      }
      let chatData = await feat.use(
        {
          consume: false,
        },
        {
          configure: false,
        },
        {
          create: true,
          data: {
            flags: {
              dnd5e: {
                itemData: this.ownedItem.toObject ? this.ownedItem.toObject() : this.ownedItem.toJSON(),
              },
            },
          },
        },
      );
      if (chatData) {
        await onUsage();
        if (!this.magicItem.isDestroyed) {
          await this.magicItem.update();
        }
      }
      if (this.ownedItem.effects?.size > 0 && !MagicItemHelpers.isMidiItemEffectWorkflowOn()) {
        this.activeEffectMessage(async () => {
          await this.applyActiveEffects(this.ownedItem);
        });
      }
    };

    if (this.item.effect === "e2" || this.hasCharges(consumption)) {
      await proceed();
    } else {
      this.showNoChargesMessage(() => {
        proceed();
      });
    }
  }
}
