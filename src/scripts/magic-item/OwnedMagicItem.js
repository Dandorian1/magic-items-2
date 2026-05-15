import { MAGICITEMS } from "../config.js";
import CONSTANTS from "../constants/constants.js";
import Logger from "../lib/Logger.js";
import { RetrieveHelpers } from "../lib/retrieve-helpers.js";
import { MagicItemHelpers } from "../magic-item-helpers.js";
import { OwnedMagicItemFeat } from "../magic-item-owned-entry/OwnedMagicItemFeat.js";
import { OwnedMagicItemSpell } from "../magic-item-owned-entry/OwnedMagicItemSpell.js";
import { OwnedMagicItemTable } from "../magic-item-owned-entry/OwnedMagicItemTable.js";
import { MagicItem } from "./MagicItem.js";
import { RollImpl, ChatMessageImpl } from "../lib/foundry-compat.js";

export class OwnedMagicItem extends MagicItem {
  constructor(item, actor, magicItemActor, flagsData) {
    super(flagsData);
    this.uuid = item.uuid;
    this.id = item.id;
    this.item = item;
    this.actor = actor;
    this.name = item.name;
    this.img = item.img;
    this.pack = item.pack;
    this.isDestroyed = false;
    this.uses = parseInt("uses" in flagsData ? flagsData.uses : this.charges);

    // Internal-charges mode: the live charge store is the dnd5e item's
    // `system.uses`, not the magicitems flags (which stay 0 in this mode).
    // Snapshot from there so the sheet section, Argon, and consume math all
    // read real values. Rebuilt on every actor/item update, so it stays current.
    if (this.internal && this.hasSystemUses()) {
      this.charges = this.getSystemUsesMax();
      this.uses = this.getSystemUsesValue();
    }

    this.rechargeableLabel = this.rechargeable
      ? `(${game.i18n.localize("MAGICITEMS.SheetRecharge")}: ${this.rechargeText} ${
          MagicItemHelpers.localized(MAGICITEMS.rechargeUnits)[this.rechargeUnit]
        } )`
      : game.i18n.localize("MAGICITEMS.SheetNoRecharge");

    this.magicItemActor = magicItemActor;

    this.ownedEntries = this.spells.map((item) => new OwnedMagicItemSpell(this, item));
    this.ownedEntries = this.ownedEntries.concat(this.feats.map((item) => new OwnedMagicItemFeat(this, item)));
    this.ownedEntries = this.ownedEntries.concat(this.tables.map((table) => new OwnedMagicItemTable(this, table)));
  }

  /**
   * Tests if the owned magic items can visualize his powers.
   */
  get visible() {
    let identifiedOnly = game.settings.get(CONSTANTS.MODULE_ID, "identifiedOnly");
    return this.item?.type === "feat" || !identifiedOnly || this.item.system.identified;
  }

  /**
   * Tests if the owned magic items is active.
   */
  get active() {
    let active = true;
    if (this.equipped) {
      active = active && this.item.system.equipped;
    }
    if (this.attuned) {
      let isAttuned =
        this.item.system.attunement === 2 ||
        this.item.system.attuned === true; /* This.item.system.attuned is a legacy property; can be undefined */
      active = active && isAttuned;
    }
    return active;
  }

  isFull() {
    return this.uses === this.charges;
  }

  setUses(uses) {
    this.uses = uses;
  }

  async roll(itemId) {
    let ownedItem = this.ownedEntries.filter((entry) => entry.id === itemId)[0];
    await ownedItem.roll();
  }

  rollByName(itemName) {
    let found = this.ownedEntries.filter((entry) => entry.name === itemName);
    if (!found.length) {
      Logger.warn(game.i18n.localize("MAGICITEMS.WarnNoMagicItemSpell") + itemName, true);
      return;
    }
    found[0].roll();
  }

  async destroyItem() {
    await this.magicItemActor.destroyItem(this);
  }

  async consume(consumption) {
    if (this.hasSystemUses()) {
      const usage = Math.max(this.getSystemUsesValue() - consumption, 0);
      await this.updateSystemUsesValue(usage);
      this.uses = usage;
      await this.checkDestroyOnEmpty();
    } else if (this.uses) {
      this.uses = Math.max(this.uses - consumption, 0);
      await this.checkDestroyOnEmpty();
    }
  }

  /**
   * Run the destroy-on-0-charges check. Shared by both consume() branches so
   * system-uses-backed items (e.g. the SRD Staff of Healing) get the check too.
   * @returns {Promise<void>}
   */
  async checkDestroyOnEmpty() {
    // `system.uses` is absent on items without per-item charges (e.g. some
    // feats); optional-chain so the destroy path still runs in that case.
    if (this.item.system.uses?.autoDestroy) return;
    if (await this.destroyed()) {
      if (this.destroyType === MAGICITEMS.DESTROY_JUST_DESTROY) {
        this.isDestroyed = true;
        await this.destroyItem();
      } else {
        this.toggleEnabled(false);
      }
    }
  }

  hasSystemUses() {
    const uses = this.item.system?.uses;
    return uses && uses.max !== null && uses.max !== undefined && uses.max !== "";
  }

  getSystemUsesMax() {
    return Number(this.item.system?.uses?.max) || 0;
  }

  getSystemUsesValue() {
    const uses = this.item.system?.uses;
    if (Number.isFinite(Number(uses?.value))) {
      return Number(uses.value);
    }
    const max = this.getSystemUsesMax();
    const spent = Number(uses?.spent) || 0;
    return Math.max(max - spent, 0);
  }

  async updateSystemUsesValue(value) {
    const embeddedDocument = await RetrieveHelpers.getItemAsync(this.item);
    const max = Number(embeddedDocument.system?.uses?.max) || this.getSystemUsesMax();
    const spent = Math.max(max - value, 0);
    await embeddedDocument.update({
      [CONSTANTS.CURRENT_CHARGES_PATH]: spent,
    });
  }

  async destroyed() {
    if (this.uses !== 0 || !this.destroy) return false;
    const destroyed = await MagicItemHelpers.rollDestroyCheck({
      name: this.name,
      actor: this.actor,
      destroyCheck: this.destroyCheck,
      destroyDC: this.destroyDC,
    });
    if (destroyed) {
      ChatMessageImpl.create({
        user: game.user.id,
        speaker: ChatMessageImpl.getSpeaker({ actor: this.actor }),
        content: this.formatMessage(`<b>${this.name}</b> ${this.destroyFlavorText}`),
      });
    }
    return destroyed;
  }

  async onShortRest() {
    if ((this.rechargeable && this.rechargeUnit === MAGICITEMS.SHORT_REST) || this.internal) {
      return await this.doRecharge();
    }
  }

  async onLongRest() {
    if (
      (this.rechargeable && [MAGICITEMS.LONG_REST, MAGICITEMS.SHORT_REST].includes(this.rechargeUnit)) ||
      this.internal
    ) {
      return await this.doRecharge();
    }
  }

  async onNewDay() {
    if (
      (this.rechargeable && [MAGICITEMS.DAILY, MAGICITEMS.DAWN, MAGICITEMS.SUNSET].includes(this.rechargeUnit)) ||
      this.internal
    ) {
      return await this.doRecharge();
    }
  }

  async doRecharge() {
    let amount = 0;
    let updated = 0;
    let msg = `<b>Magic Item:</b> ${this.rechargeableLabel}<br>`;

    let prefix = game.i18n.localize("MAGICITEMS.SheetRechargedBy");
    let postfix = game.i18n.localize("MAGICITEMS.SheetChargesLabel");
    if (!this.internal) {
      if (this.rechargeType === MAGICITEMS.NUMERIC_RECHARGE) {
        amount = parseInt(this.recharge);
        msg += `<b>${prefix}</b>: ${this.recharge} ${postfix}`;
      }
      if (this.rechargeType === MAGICITEMS.FORMULA_RECHARGE) {
        let r = new RollImpl(this.recharge);
        await r.evaluate();
        amount = r.total;
        msg += `<b>${prefix}</b>: ${r.result} = ${r.total} ${postfix}`;
      }
      if (this.rechargeType === MAGICITEMS.FORMULA_FULL) {
        msg += `<b>${game.i18n.localize("MAGICITEMS.RechargeTypeFullText")}</b>`;
      }

      if (this.chargesOnWholeItem) {
        if (this.isFull()) {
          return;
        }

        if (this.rechargeType === MAGICITEMS.FORMULA_FULL) {
          updated = this.charges;
        } else {
          updated = Math.min(this.uses + amount, parseInt(this.charges));
        }

        this.setUses(updated);
      } else {
        if (this.ownedEntries.filter((entry) => !entry.isFull()).length === 0) {
          return;
        }

        this.ownedEntries.forEach((entry) => {
          if (this.rechargeType === MAGICITEMS.FORMULA_FULL) {
            entry.uses = this.charges;
          } else {
            entry.uses = Math.min(entry.uses + amount, parseInt(this.charges));
          }
        });
      }
      ChatMessageImpl.create({
        speaker: { actor: this.actor },
        content: this.formatMessage(msg),
      });
    } else {
      this.setUses(this.getSystemUsesValue());
    }

    await this.update();
  }

  entryBy(itemId) {
    return this.ownedEntries.filter((entry) => entry.id === itemId)[0];
  }

  ownedItemBy(itemId) {
    return this.entryBy(itemId).ownedItem;
  }

  async triggerTables() {
    for (const table of this.triggeredTables) {
      await table.roll(this.actor);
    }
  }

  destroyItemEntry(entry) {
    if (this.hasSpell(entry.id)) {
      this.removeSpell(this.spells.findIndex((spell) => spell.id === entry.id));
    }
  }

  async update() {
    this.magicItemActor.suspendListening();
    try {
      await this.item.update({
        flags: {
          [CONSTANTS.MODULE_ID]: this.serializeData(),
        },
      });
    } catch (e) {
      Logger.warn("MagicItem flag write-back failed", false, e);
    } finally {
      this.magicItemActor.resumeListening();
    }
  }

  getRechargeableLabel() {
    return `(${game.i18n.localize("MAGICITEMS.SheetRecharge")}: ${this.rechargeText} ${
      MagicItemHelpers.localized(MAGICITEMS.rechargeUnits)[this.rechargeUnit]
    } )`;
  }

  formatMessage(msg) {
    return `
            <div class="dnd5e chat-card item-card">
                <header class="card-header flexrow">
                    <img src="${this.img}" title="Palla di Fuoco" width="36" height="36" />
                    <h3 class="item-name">${this.name}</h3>
                </header>

                <div class="card-content">${msg}</div>
            </div>`;
  }
}
