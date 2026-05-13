import { MAGICITEMS } from "../config.js";
import Logger from "../lib/Logger.js";
import { RetrieveHelpers } from "../lib/retrieve-helpers.js";
import { MagicItemHelpers } from "../magic-item-helpers.js";
import { AbstractMagicItemEntry } from "./AbstractMagicItemEntry.js";

export class MagicItemFeat extends AbstractMagicItemEntry {
  constructor(data) {
    super(data);
    this.effect = this.effect ? this.effect : "e1";
    this.featAction = this.featAction;
  }

  consumptionLabel() {
    return this.effect === "e1"
      ? `${game.i18n.localize("MAGICITEMS.SheetConsumptionConsume")}: ${this.consumption}`
      : game.i18n.localize(`MAGICITEMS.SheetConsumptionDestroy`);
  }

  serializeData() {
    return {
      consumption: this.consumption,
      uuid: this.uuid,
      id: this.id,
      img: this.img,
      name: this.name,
      pack: this.pack,
      uses: this.uses,
      effect: this.effect,
      featAction: this.featAction,
    };
  }

  get effects() {
    return MagicItemHelpers.localized(MAGICITEMS.effects);
  }
}
