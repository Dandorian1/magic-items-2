import CONSTANTS from "../constants/constants.js";
import Logger from "../lib/Logger.js";
import { isEmptyObject } from "../lib/lib.js";
import { RetrieveHelpers } from "../lib/retrieve-helpers.js";
import { MagicItemHelpers } from "../magic-item-helpers.js";
import { MagicItemTab } from "../magicItemtab.js";
import { MagicItemActor } from "../magicitemactor.js";
import { MagicItemSheet } from "../magicitemsheet.js";

/**
 * Create a new API class and export it as default
 */
const API = {
  /**
   * Method for create and register a new MagicItemActor.
   * @param {string/Actor/UUID} actor The actor to use for retrieve the Actor
   * @returns {Actor}
   */
  actor: async function (actor) {
    const actorTmp = await RetrieveHelpers.getActorAsync(actor);
    return MagicItemActor.get(actorTmp.id);
  },

  /**
   * Method for roll and show a chat message on the chat console
   * @param {string} magicItemName The name of the magic item to use
   * @param {string} innerChildMagicItemName The name of the inner child "magic item" to use
   * @returns {void} Return no response
   */
  roll: function (magicItemName, innerChildMagicItemName) {
    const ChatMessage5e = CONFIG.ChatMessage.documentClass;
    const speaker = ChatMessage5e.getSpeaker();
    let actor;
    if (speaker.token) {
      actor = game.actors.tokens[speaker.token];
    }
    if (!actor) {
      actor = game.actors.get(speaker.actor);
    }
    const magicItemActor = actor ? MagicItemActor.get(actor.id) : null;
    if (!magicItemActor) {
      Logger.warn(game.i18n.localize("MAGICITEMS.WarnNoActor"), true);
      return;
    }
    magicItemActor.rollByName(magicItemName, innerChildMagicItemName);
  },

  /**
   * Setup Magic item like you normally would by creating a spell called with all the damage details in the spell as detailed on the weapon.
   * Also checkes for Item Attunement and gives you a choice if you want to spend a charge or not.
   * @param {Item/string/UUID} item
   * @returns {void}
   */
  async magicItemAttack(item) {
    let itemD = await RetrieveHelpers.getItemAsync(item);
    if (!itemD) {
      Logger.warn(`magicItemAttack | No item found with this reference '${item}'`, true, item);
      return false;
    }
    if (game.user.targets.size !== 1) {
      Logger.warn("magicItemAttack | Please target only one token.", true);
      return false;
    }

    let spells = foundry.utils.getProperty(itemD, `flags.${CONSTANTS.MODULE_ID}.${CONSTANTS.FLAGS.SPELLS}`) || [];
    if (spells.length === 0) {
      Logger.warn("magicItemAttack | Please put at least one spells on the item.", true);
      return false;
    }
    let attunement = itemD.system.attunement;
    let target = game.user.targets.first(); // Await canvas.tokens.get(args[0].hitTargets[0]._id);
    if (target && attunement === 2) {
      // DialogV2 — v1 `Dialog` is deprecated since v12 and removed at v15.
      const action = await foundry.applications.api.DialogV2.wait({
        window: { title: `${itemD.name}` },
        content: "<p>Spend a charge?</p>",
        buttons: [
          {
            action: "confirmed",
            icon: "fas fa-bolt",
            label: "Yes",
            callback: () => "confirmed",
          },
        ],
        default: "confirmed",
        rejectClose: false,
      });
      if (action === "confirmed") {
        await this.roll(itemD.name, spells[0].name);
      }
    }
  },

  /**
   * Setup Magic item like you normally would by creating a spell called with all the damage details in the spell as detailed on the weapon.
   * @param {Item/string/UUID} item
   * @returns {Promise<void>} No Response
   */
  async magicItemAttackFast(item) {
    let itemD = await RetrieveHelpers.getItemAsync(item);
    if (!itemD) {
      Logger.warn(`magicItemAttackFast | No item found with this reference '${item}'`, true, item);
      return false;
    }
    let spells = foundry.utils.getProperty(itemD, `flags.${CONSTANTS.MODULE_ID}.${CONSTANTS.FLAGS.SPELLS}`) || [];
    if (spells.length === 0) {
      Logger.warn("magicItemAttackFast | Please put at least one spells on the item.", true);
      return false;
    }
    await this.roll(itemD.name, spells[0].name);
  },

  /**
   * Setup Magic item like you normally would by creating a spell called with all the damage details in the spell as detailed on the weapon.
   * @param {Item|string|UUID} item
   * @returns {Promise<void>} No Response
   */
  async magicItemMultipleSpellsTrinket(item) {
    let itemD = await RetrieveHelpers.getItemAsync(item);
    if (!itemD) {
      Logger.warn(`multipleSpellsTrinket | No item found with this reference '${item}'`, true, item);
      return false;
    }
    if (game.user.targets.size !== 1) {
      Logger.warn("multipleSpellsTrinket | Please target only one token.", true);
      return false;
    }
    let spellList = "";
    let spells = foundry.utils.getProperty(itemD, `flags.${CONSTANTS.MODULE_ID}.${CONSTANTS.FLAGS.SPELLS}`) || [];
    if (spells.length === 0) {
      Logger.warn("multipleSpellsTrinket | Please put at least one spells on the item.", true);
      return false;
    }
    let spell_items = Object.values(spells).sort((a, b) => (a.name < b.name ? -1 : 1));
    for (let i = 0; i < spell_items.length; i++) {
      let item = spell_items[i];
      spellList += `<option value="${item.name}">${item.name}</option>`;
    }

    const htmlContent = `<form>
            <p>Pick a spell to cast</p>
            <div class="form-group">
                <label for="weapons">Listed Spells</label>
                <select id="spells" name="spells">${spellList}</select>
            </div>
        </form>`;

    // DialogV2 — v1 `Dialog` is deprecated since v12 and removed at v15.
    const chosen = await foundry.applications.api.DialogV2.wait({
      window: { title: `${itemD.name}` },
      content: htmlContent,
      buttons: [
        {
          action: "cast",
          label: "Cast",
          icon: "fas fa-wand-magic-sparkles",
          callback: (event, button, dialog) => button.form.elements.spells?.value,
        },
      ],
      default: "cast",
      rejectClose: false,
    });
    if (chosen) {
      await this.roll(itemD.name, chosen);
    }
  },

  /**
   * If there are multiple spells on said item, you can use this macro. Just enter the name of the item.
   * @param {Item|string|UUID} item
   * @param {boolean} runAsItemMacro Run as an item macro with the command `dnd5e.documents.macro.rollItem(itemName)`
   * @returns {Promise<void>} No Response
   */
  async magicItemMultipleSpellsWeapon(item, runAsItemMacro) {
    let itemD = await RetrieveHelpers.getItemAsync(item);
    if (!itemD) {
      Logger.warn(`multipleSpellsWeapon | No item found with this reference '${item}'`, true, item);
      return false;
    }
    if (game.user.targets.size !== 1) {
      Logger.warn("multipleSpellsWeapon | Please target only one token.", true);
      return false;
    }
    let spellList = "";
    let spells = foundry.utils.getProperty(itemD, `flags.${CONSTANTS.MODULE_ID}.${CONSTANTS.FLAGS.SPELLS}`) || [];
    let spell_items = Object.values(spells).sort((a, b) => (a.name < b.name ? -1 : 1));
    for (let i = 0; i < spell_items.length; i++) {
      let item = spell_items[i];
      spellList += `<option value="${item.name}">${item.name}</option>`;
    }
    if (!runAsItemMacro) {
      const htmlContent = `<form>
            <p>Pick a spell to cast</p>
            <div class="form-group">
                <label for="weapons">Listed Spells</label>
                <select id="spells" name="spells">${spellList}</select>
            </div>
        </form>`;

      // DialogV2 — v1 `Dialog` is deprecated since v12 and removed at v15.
      const chosen = await foundry.applications.api.DialogV2.wait({
        window: { title: `${itemD.name}` },
        content: htmlContent,
        buttons: [
          {
            action: "cast",
            label: "Cast",
            icon: "fas fa-wand-magic-sparkles",
            callback: (event, button, dialog) => button.form.elements.spells?.value,
          },
        ],
        default: "cast",
        rejectClose: false,
      });
      if (chosen) {
        await this.roll(itemD.name, chosen);
      }
    } else {
      await dnd5e.documents.macro.rollItem(itemD.name);
    }
  },

  /**
   * Method handling a short-rest action for magic items for an actor.
   * @param {string/Actor/UUID} actor The actor to use for retrieve the Actor
   * @param {boolean} isNewDay Check whether it's a new day
   * @returns {Promise<void>} No response
   */
  async execActorShortRest(actor, isNewDay) {
    const actorTmp = await API.actor(actor);
    await Promise.all(
      actorTmp.items.map(async (item) => {
        await item.onShortRest();
        if (isNewDay) await item.onNewDay();
      }),
    );
  },

  /**
   * Method handling a long-rest action for magic items for an actor.
   * @param {string/Actor/UUID} actor The actor to use for retrieve the Actor
   * @param {boolean} isNewDay Check whether it's a new day
   * @returns {Promise<void>} No response
   */
  async execActorLongRest(actor, isNewDay) {
    const actorTmp = await API.actor(actor);
    await Promise.all(
      actorTmp.items.map(async (item) => {
        await item.onLongRest();
        if (isNewDay) await item.onNewDay();
      }),
    );
  },
};

export default API;
