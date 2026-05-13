import { MAGICITEMS } from "../config.js";
import Logger from "../lib/Logger.js";
import { MagicItemHelpers } from "../magic-item-helpers.js";
import { AbstractMagicItemEntry } from "./AbstractMagicItemEntry.js";

export class MagicItemTable extends AbstractMagicItemEntry {
  entityCls() {
    return CONFIG.RollTable;
  }

  get usages() {
    return MagicItemHelpers.localized(MAGICITEMS.tableUsages);
  }

  async roll(actor) {
    let entity = await this.entity();
    let result = await entity.draw();
    if (result && result.results && result.results.length === 1 && result.results[0].collection) {
      const collectionId = result.results[0].documentCollection;
      const id = result.results[0].documentId;
      const pack = game.collections.get(collectionId) || game.packs.get(collectionId);
      if (!pack) {
        Logger.warn(`Cannot retrieve pack for if ${collectionId}`, true);
      } else {
        const entity = pack.getDocument ? await pack.getDocument(id) : pack.get(id);
        if (entity) {
          const itemData = entity.toObject ? entity.toObject() : entity;
          let item = (await actor.createEmbeddedDocuments("Item", [itemData]))[0];
          await item.use(
            {},
            { configure: false },
            {
              create: !game.modules.get("ready-set-roll-5e")?.active,
              data: {
                flags: {
                  dnd5e: {
                    itemData: item.toObject ? item.toObject() : item.toJSON(),
                  },
                },
              },
            },
          );
        }
      }
    }
  }

  serializeData() {
    return {
      consumption: this.consumption,
      id: this.id,
      uuid: this.uuid,
      img: this.img,
      name: this.name,
      pack: this.pack,
    };
  }
}
