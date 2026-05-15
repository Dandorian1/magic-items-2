import CONSTANTS from "./constants/constants.js";
import Logger from "./lib/Logger.js";
import { RetrieveHelpers } from "./lib/retrieve-helpers.js";
import { MagicItemHelpers } from "./magic-item-helpers.js";
import { OwnedMagicItem } from "./magic-item/OwnedMagicItem.js";

// Primary: WeakMap keyed by the live Actor doc (auto-evicts on GC).
// Side index by id covers unlinked token actors whose synthetic id isn't in game.actors.
const _miasByActor = new WeakMap();
const _miasById = new Map();

/**
 * "Aspect" class that dynamically extends the original Actor in order to handle magic items.
 */
export class MagicItemActor {
  /**
   * @param actor live Actor document
   */
  static bind(actor) {
    if (!actor) return;
    const mia = new MagicItemActor(actor);
    _miasByActor.set(actor, mia);
    if (actor.id) _miasById.set(actor.id, mia);
  }

  /**
   * @param actor live Actor document
   * @returns the MIA for this actor, or undefined.
   */
  static getForActor(actor) {
    return actor ? _miasByActor.get(actor) : undefined;
  }

  /**
   * @param actorId id of the original actor
   * @returns the MIA, or undefined if the actor isn't bound.
   */
  static get(actorId) {
    const actor = globalThis.game?.actors?.get?.(actorId);
    if (actor) {
      const mia = _miasByActor.get(actor);
      if (mia) return mia;
    }
    // Unlinked / synthetic token actors aren't in game.actors.
    return _miasById.get(actorId);
  }

  /**
   * Ctor. Builds a new instance of a MagicItemActor
   *
   * @param actor
   */
  constructor(actor) {
    this.actor = actor;
    this.id = actor.id;
    this.listeners = [];
    this.destroyed = [];
    this.listening = true;
    this.buildItems();
  }

  /**
   * Add change listeners.
   *
   * @param listener
   */
  onChange(listener) {
    this.listeners.push(listener);
  }

  /**
   * Notify listeners of changes.
   */
  async fireChange() {
    await Promise.all(this.listeners.map((listener) => listener()));
  }

  /**
   * Temporarily suspends the interception of events, used for example to avoid intercepting a change
   * made by the client itself.
   */
  suspendListening() {
    this.listening = false;
  }

  /**
   * Resume a temporarily suspended interception of events.
   */
  resumeListening() {
    this.listening = true;
  }

  /**
   * Build the list of magic items based on custom flag data of the item entity.
   */
  async buildItems() {
    this.items = this.actor.items
      .filter((item) => {
        const flagsData = foundry.utils.getProperty(item, `flags.${CONSTANTS.MODULE_ID}`);
        return typeof flagsData !== "undefined" && flagsData.enabled;
      })
      .map((item) => {
        const flagsData = foundry.utils.getProperty(item, `flags.${CONSTANTS.MODULE_ID}`);
        return new OwnedMagicItem(item, this.actor, this, flagsData);
      });
    await this.fireChange();
  }

  /**
   * Aspect: called after short rest.
   * Notify the item and update item uses on the actor flags if recharged.
   *
   * @param result
   */
  async onShortRest(result) {
    if (result) {
      for (const item of this.items) {
        await item.onShortRest();
        if (result.newDay) await item.onNewDay();
      }
      await this.fireChange();
    }
  }

  /**
   * Aspect: called after long rest.
   * Notify the item and update item uses on the actor flags if recharged.
   *
   * @param result
   */
  async onLongRest(result) {
    if (result) {
      for (const item of this.items) {
        await item.onLongRest();
        if (result.newDay) await item.onNewDay();
      }
      await this.fireChange();
    }
  }

  /**
   *
   * @returns {*}
   */
  get visibleItems() {
    return this.items.filter((item) => item.visible);
  }

  /**
   *
   */
  get isUsingNew5eSheet() {
    return this.actor?.sheet && MagicItemHelpers.isUsingNew5eSheet(this.actor?.sheet);
  }

  /**
   *
   * @returns {boolean}
   */
  hasMagicItems() {
    return this.hasVisibleItems;
  }

  /**
   *
   */
  get hasVisibleItems() {
    return this.items.reduce((visible, item) => visible || item.visible, false);
  }

  /**
   * Returns the number of visible magic items owned by the actor.
   */
  get magicItemsCount() {
    return this.visibleItems.length;
  }

  /**
   * Returns the number of visible actives magic items owned by the actor.
   */
  get magicItemsActiveCount() {
    return this.visibleItems.reduce((actives, item) => actives + item.active, 0);
  }

  /**
   *
   * @returns {boolean}
   */
  hasItemsSpells() {
    return this.visibleItems.reduce((hasSpells, item) => hasSpells || item.hasSpells, false);
  }

  /**
   *
   * @returns {boolean}
   */
  hasItemsFeats() {
    return this.visibleItems.reduce((hasFeats, item) => hasFeats || item.hasFeats, false);
  }

  /**
   *
   * @param itemId
   * @returns {number}
   */
  magicItem(itemId) {
    let found = this.items.filter((item) => item.id === itemId);
    if (found.length) {
      return found[0];
    }
  }

  /**
   *
   * @param magicItemName
   * @param itemName
   */
  rollByName(magicItemName, itemName) {
    let found = this.items.filter((item) => item.name === magicItemName);
    if (!found.length) {
      Logger.warn(game.i18n.localize("MAGICITEMS.WarnNoMagicItem") + itemName, true);
      return;
    }
    let item = found[0];
    item.rollByName(itemName);
  }

  /**
   *
   * @param magicItemId
   * @param itemId
   */
  async roll(magicItemId, itemId) {
    let found = this.items.filter((item) => item.id === magicItemId);
    if (found.length) {
      let item = found[0];
      await item.roll(itemId);
    }
  }

  /**
   *
   * @param itemId
   * @param ownedItemId
   */
  async renderSheet(itemId, ownedItemId) {
    let item = this.items.find((item) => {
      return item.id === itemId || item.uuid === itemId;
    });
    if (item) {
      item.renderSheet(ownedItemId);
    }
  }

  /**
   * Delete the magic item from the owned items of the actor,
   * keeping a temporary reference in case of open chat sheets.
   *
   * @param item
   */
  async destroyItem(item) {
    const magicItemParent = item.item;
    const currentQuantity = foundry.utils.getProperty(magicItemParent, CONSTANTS.QUANTITY_PROPERTY_PATH) || 1;
    if (currentQuantity > 1) {
      const defaultReference = foundry.utils.getProperty(
        magicItemParent,
        `flags.${CONSTANTS.MODULE_ID}.${CONSTANTS.FLAGS.DEFAULT}`,
      );
      let updateItem = {};
      if (defaultReference) {
        const defaultItem = await RetrieveHelpers.getItemAsync(defaultReference);
        const defaultDataFlags = foundry.utils.getProperty(defaultItem, `flags.${CONSTANTS.MODULE_ID}`);
        defaultDataFlags.default = defaultItem.uuid;
        updateItem = {
          _id: magicItemParent.id,
          [CONSTANTS.QUANTITY_PROPERTY_PATH]: currentQuantity - 1,
          flags: {
            [CONSTANTS.MODULE_ID]: defaultDataFlags || {},
          },
        };
      } else {
        const tmpItem = await RetrieveHelpers.getItemAsync(magicItemParent);
        const tmpItemFlags = foundry.utils.getProperty(tmpItem, `flags.${CONSTANTS.MODULE_ID}`);
        updateItem = {
          _id: tmpItem.id,
          [CONSTANTS.QUANTITY_PROPERTY_PATH]: currentQuantity - 1,
          flags: {
            [CONSTANTS.MODULE_ID]: tmpItemFlags || {},
          },
        };
      }
      await this.actor.updateEmbeddedDocuments("Item", [updateItem]);
    } else {
      let idx = 0;
      this.items.forEach((owned, i) => {
        if (owned.id === item.id) {
          idx = i;
        }
      });
      this.items.splice(idx, 1);
      this.destroyed.push(item);

      await this.actor.deleteEmbeddedDocuments("Item", [magicItemParent.id]);
    }
  }
}
