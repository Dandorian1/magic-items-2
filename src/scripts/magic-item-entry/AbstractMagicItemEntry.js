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
    // Foundry's permission gating handles read-only — don't add an in-place
    // `ownership.default` write to coerce it; that was fragile under v13.
    const entity = await this.entity();
    entity.sheet.render({ force: true });
  }

  // Prefer UUID lookup — handles actor-embedded items (Actor.<id>.Item.<id>)
  // that the pack === "world" branch misses by only reading the world-level
  // Items collection. Throws an Error with a real reason on miss, so callers'
  // catch handlers see something useful instead of an `undefined` rejection.
  async entity() {
    if (this.uuid) {
      const byUuid = await fromUuid(this.uuid).catch(() => null);
      if (byUuid) return byUuid;
    }

    if (this.pack === "world" || !this.pack) {
      const worldEntity = this.entityCls().collection?.instance?.get(this.id);
      if (worldEntity) return worldEntity;
      Logger.warn(game.i18n.localize("MAGICITEMS.WarnNoMagicItemSpell") + this.name, true);
      throw new Error(`MagicItem entry not found in world: ${this.id} (${this.name})`);
    }

    const pack = game.packs.find((p) => p.collection === this.pack);
    if (!pack) {
      Logger.warn(`Cannot retrieve pack for ${this.pack}`, true);
      throw new Error(`MagicItem entry pack missing: ${this.pack}`);
    }

    const packEntity = await pack.getDocument(this.id);
    if (packEntity) return packEntity;
    Logger.warn(game.i18n.localize("MAGICITEMS.WarnNoMagicItemSpell") + this.name, true);
    throw new Error(`MagicItem entry not found in pack ${this.pack}: ${this.id} (${this.name})`);
  }

  entityCls() {
    return CONFIG.Item;
  }

  async data() {
    const entity = await this.entity();
    return entity.toJSON();
  }
}
