import CONSTANTS from "../constants/constants.js";
import Logger from "../lib/Logger.js";
import { RetrieveHelpers } from "../lib/retrieve-helpers.js";
import { renderTemplate as renderTemplateV2, ChatMessageImpl } from "../lib/foundry-compat.js";
import { MagicItemHelpers } from "../magic-item-helpers.js";

export class AbstractOwnedMagicItemEntry {
  constructor(magicItem, item) {
    this.magicItem = magicItem;
    this.item = item;
    this.uses = parseInt("uses" in this.item ? this.item.uses : this.magicItem.charges);

    // Generate Uuid runtime
    if (!this.item.uuid) {
      try {
        this.item.uuid = RetrieveHelpers.retrieveUuid({
          documentName: this.item.name,
          documentId: this.item.id,
          documentCollectionType: this.item.collectionType,
          documentPack: this.item.pack,
          ignoreError: true,
        });
      } catch (e) {
        Logger.error("Cannot retrieve uuid", false, e);
        this.item.uuid = "";
      }
    }
    this.item.removed = !RetrieveHelpers.stringIsUuid(this.item.uuid);
  }

  get uuid() {
    return this.item.uuid;
  }

  get id() {
    return this.item.id;
  }

  get name() {
    return this.item.name;
  }

  get img() {
    return this.item.img;
  }

  get uses() {
    return this.item.uses;
  }

  get destroyDC() {
    return this.item.destroyDC;
  }

  set uses(uses) {
    this.item.uses = uses;
  }

  isFull() {
    return this.uses === this.magicItem.charges;
  }

  hasCharges(consumption) {
    let uses = this.magicItem.chargesOnWholeItem ? this.magicItem.uses : this.uses;
    return uses - consumption >= 0;
  }

  async consume(consumption) {
    if (this.magicItem.chargesOnWholeItem) {
      await this.magicItem.consume(consumption);
    } else {
      this.uses = Math.max(this.uses - consumption, 0);
      if (await this.destroyed()) {
        this.magicItem.destroyItemEntry(this.item);
      } else {
        this.showLeftChargesMessage();
      }
    }
  }

  async destroyed() {
    if (this.uses !== 0 || !this.magicItem.destroy) return false;
    const destroyed = await MagicItemHelpers.rollDestroyCheck({
      name: this.name,
      actor: this.magicItem.actor,
      destroyCheck: this.magicItem.destroyCheck,
      destroyDC: this.destroyDC,
    });
    if (destroyed) {
      ChatMessageImpl.create({
        user: game.user.id,
        speaker: ChatMessageImpl.getSpeaker({ actor: this.magicItem.actor }),
        content: this.magicItem.formatMessage(`<b>${this.name}</b> ${this.magicItem.destroyFlavorText}`),
      });
    }
    return destroyed;
  }

  showNoChargesMessage(callback) {
    const message = game.i18n.localize("MAGICITEMS.SheetNoChargesMessage");
    const title = game.i18n.localize("MAGICITEMS.SheetDialogTitle");
    // DialogV2 — v1 `Dialog` is deprecated since v12 and removed at v15.
    foundry.applications.api.DialogV2.wait({
      window: { title },
      content: `<b>'${this.magicItem.name}'</b> - ${message} <b>'${this.item.name}'</b><br><br>`,
      buttons: [
        {
          action: "use",
          icon: "fas fa-check",
          label: game.i18n.localize("MAGICITEMS.SheetDialogUseAnyway"),
          callback: () => "use",
        },
        {
          action: "close",
          icon: "fas fa-times",
          label: game.i18n.localize("MAGICITEMS.SheetDialogClose"),
          callback: () => "close",
        },
      ],
      default: "close",
      rejectClose: false,
    }).then((action) => {
      if (action === "use") callback();
    });
  }

  activeEffectMessage(callback) {
    const message = game.i18n.localize("MAGICITEMS.ToggleActiveEffectDialogMessage");
    const title = game.i18n.localize("MAGICITEMS.ToggleActiveEffectDialogTitle");
    foundry.applications.api.DialogV2.wait({
      window: { title },
      content: `${message}<br><br>`,
      buttons: [
        {
          action: "use",
          icon: "fas fa-check",
          label: game.i18n.localize("MAGICITEMS.ToggleActiveEffectDialogYes"),
          callback: () => "use",
        },
        {
          action: "close",
          icon: "fas fa-times",
          label: game.i18n.localize("MAGICITEMS.ToggleActiveEffectDialogNo"),
          callback: () => "close",
        },
      ],
      default: "use",
      rejectClose: false,
    }).then((action) => {
      if (action === "use") callback();
    });
  }

  async askSummonningMessage(summonOptions) {
    let html = await renderTemplateV2(
      `modules/${CONSTANTS.MODULE_ID}/templates/magic-item-summon-dialog.hbs`,
      summonOptions,
    );
    let dialog = await foundry.applications.api.DialogV2.prompt({
      window: {
        title: game.i18n.localize("MAGICITEMS.SummoningDialogTitle"),
      },
      content: html,
      modal: true,
      rejectClose: false,
      ok: {
        label: game.i18n.localize("MAGICITEMS.SummoningDialogButton"),
        icon: "fas fa-wand-magic-sparkles",
        callback: (event, button, dialog) => button.form.elements,
      },
    });
    return dialog;
  }

  async applyActiveEffects(item) {
    canvas.tokens.controlled?.forEach((token) => {
      if (!token) {
        Logger.warn("No token selected", true);
        return;
      }
      let actor = token.actor;

      item?.effects.toObject()?.forEach(async (effect) => {
        if (!game.user.isGM && !actor?.isOwner) {
          return;
        }
        const existingEffect = actor?.effects?.find((e) => e.origin === item.uuid);
        if (existingEffect) {
          existingEffect.update({ disabled: !existingEffect.disabled });
          return;
        }
        effect = foundry.utils.mergeObject(effect, {
          disabled: false,
          transfer: false,
          origin: item.uuid,
        });
        const ae = await ActiveEffect.implementation.create(effect, { parent: actor });
        if (!ae) {
          Logger.warn(game.i18n.localize("MAGICITEMS.ToggleActiveEffectError"), true);
        }
      });
    });
  }

  showLeftChargesMessage() {
    if (game.settings.get(CONSTANTS.MODULE_ID, "showLeftChargesChatMessage")) {
      const charges = this.magicItem.chargesOnWholeItem ? this.magicItem.uses : this.uses;
      const maxCharges = parseInt("uses" in this.item ? this.item.uses : this.magicItem.charges);
      Logger.debug(`Charges: ${charges}, MaxCharges: ${maxCharges}`);
      if (charges !== 0) {
        ChatMessageImpl.create({
          user: game.user.id,
          speaker: ChatMessageImpl.getSpeaker({ actor: this.magicItem.actor, token: this.magicItem.actor.token }),
          content: game.i18n.format(game.i18n.localize("MAGICITEMS.ShowChargesMessage"), {
            name: this.magicItem.name,
            chargesLeft: charges,
            chargesMax: maxCharges,
          }),
        });
      }
    }
  }
}
