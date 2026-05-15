import CONSTANTS from "../constants/constants.js";
import Logger from "../lib/Logger.js";
import { RetrieveHelpers } from "../lib/retrieve-helpers.js";
import { MagicItemHelpers } from "../magic-item-helpers.js";

export class AbstractMagicItemEntry {
  constructor(data) {
    foundry.utils.mergeObject(this, data);
    // Patch retrocompatbility
    if (this.pack?.startsWith("magic-items")) {
      this.pack = this.pack.replace("magic-items-2.", `${CONSTANTS.MODULE_ID}.`);
    }
    // Generate Uuid runtime
    if (!this.uuid) {
      try {
        this.uuid = RetrieveHelpers.retrieveUuid({
          documentName: this.name,
          documentId: this.id,
          documentCollectionType: this.collectionType,
          documentPack: this.pack,
          ignoreError: true,
        });
      } catch (e) {
        Logger.error("Cannot retrieve uuid", false, e);
        this.uuid = "";
      }
    }
    this.removed = !RetrieveHelpers.stringIsUuid(this.uuid);
  }

  get displayName() {
    return MagicItemHelpers.getEntityNameCompendiumWithBabele(this.pack, this.name);
  }

  async renderSheet() {
    // Open read-only via the render option, not by mutating `ownership` in
    // place — unpersisted ownership writes are fragile under v13 (CHANGELOG F8).
    const entity = await this.entity();
    entity.sheet.render({ force: true, editable: entity.isOwner });
  }

  entity() {
    return new Promise((resolve, reject) => {
      // Prefer UUID lookup — handles actor-embedded items (Actor.<id>.Item.<id>)
      // that the pack === "world" branch misses by only reading the world-level
      // Items collection.
      const tryUuid = this.uuid ? fromUuid(this.uuid).catch(() => null) : Promise.resolve(null);
      tryUuid.then((entity) => {
        if (entity) {
          resolve(entity);
          return;
        }
        if (this.pack === "world" || !this.pack) {
          const worldEntity = this.entityCls().collection?.instance?.get(this.id);
          if (worldEntity) {
            resolve(worldEntity);
          } else {
            Logger.warn(game.i18n.localize("MAGICITEMS.WarnNoMagicItemSpell") + this.name, true);
            reject();
          }
          return;
        }
        const pack = game.packs.find((p) => p.collection === this.pack);
        if (!pack) {
          Logger.warn(`Cannot retrieve pack for ${this.pack}`, true);
          reject();
          return;
        }
        pack.getDocument(this.id)?.then((packEntity) => {
          if (packEntity) {
            resolve(packEntity);
          } else {
            Logger.warn(game.i18n.localize("MAGICITEMS.WarnNoMagicItemSpell") + this.name, true);
            reject();
          }
        });
      });
    });
  }

  entityCls() {
    return CONFIG.Item;
  }

  data() {
    return new Promise((resolve) => {
      this.entity().then((entity) => {
        resolve(entity.toJSON());
      });
    });
  }
}
