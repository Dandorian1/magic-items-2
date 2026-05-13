import CONSTANTS from "./constants/constants.js";
import Logger from "./lib/Logger.js";
import { isRealNumber, isEmptyObject } from "./lib/lib.js";

export class MagicItemHelpers {
  static isUsingNew5eSheet(sheet) {
    const sheetClass = sheet?.constructor?.name;
    const knownNewSheets = ["ActorSheet5eCharacter2", "ActorSheet5eNPC2", "CharacterActorSheet", "NPCActorSheet"];
    const actorSheetV2 = foundry?.applications?.sheets?.ActorSheetV2;
    return knownNewSheets.includes(sheetClass) || (actorSheetV2 && sheet instanceof actorSheetV2);
  }

  static normalizeHtml(html) {
    return html?.jquery ? html : $(html);
  }

  static isMidiItemEffectWorkflowOn() {
    return (
      game.modules.get("midi-qol")?.active && game.settings.get("midi-qol", "ConfigSettings")?.autoItemEffects !== "off"
    );
  }

  static isLevelScalingSettingOn() {
    return game.settings.get(CONSTANTS.MODULE_ID, "scaleSpellDamage");
  }

  static canSummon() {
    return game.user.can("TOKEN_CREATE") && (game.user.isGM || game.settings.get("dnd5e", "allowSummoning"));
  }

  static numeric = function (value, fallback) {
    // If ($.isNumeric(value)) {
    //   return parseInt(value);
    // } else {
    //   return fallback;
    // }
    // if is a number
    if (isRealNumber(value)) {
      return value;
    }
    // If is a string but with a numeric value
    else if (!isNaN(parseFloat(value)) && isFinite(value)) {
      return parseInt(value);
    }
    // If is something else
    else {
      return fallback;
    }
  };

  static localized = function (cfg) {
    return Object.keys(cfg).reduce((i18nCfg, key) => {
      i18nCfg[key] = game.i18n.localize(cfg[key]);
      return i18nCfg;
    }, {});
  };

  static getEntityNameWithBabele(entity) {
    if (game.modules.get("babele")?.active) {
      return game.babele && entity.getFlag("babele", "hasTranslation")
        ? entity.getFlag("babele", "originalName")
        : entity.name;
    } else {
      return entity.name;
    }
  }

  static getEntityNameCompendiumWithBabele(packToCheck, nameToCheck) {
    if (game.modules.get("babele")?.active && game.babele?.packs !== undefined) {
      if (packToCheck !== "world" && game.babele?.isTranslated(packToCheck)) {
        return game.babele.translateField("name", packToCheck, { name: nameToCheck });
      } else {
        return nameToCheck;
      }
    } else {
      return nameToCheck;
    }
  }

  static sortByName(a, b) {
    if (a.displayName < b.displayName) {
      return -1;
    }
    if (a.displayName > b.displayName) {
      return 1;
    }
    return 0;
  }

  static sortByLevel(a, b) {
    return a.level === b.level ? MagicItemHelpers.sortByName(a, b) : a.level - b.level;
  }

  static async fetchEntity(entity) {
    if (entity.pack === "world") {
      const result = await CONFIG.Item.collection?.instance?.get(entity.id);
      return result;
    } else {
      const pack = game.packs.find((p) => p.collection === entity.pack);
      if (!pack) {
        Logger.warn(`Cannot retrieve pack ${entity.pack}`, true);
      } else {
        const result = await pack.getDocument(entity.id);
        return result;
      }
    }
  }

  static async updateMagicItemFlagOnItem(item) {
    Logger.info(`Updating item ${item.name}`);
    const itemFlag = foundry.utils.getProperty(item, `flags.${CONSTANTS.MODULE_ID}`);
    Logger.debug("", itemFlag);
    let updateItem = false;
    if (!isEmptyObject(itemFlag)) {
      if (!isEmptyObject(itemFlag.spells)) {
        for (const [key, spell] of Object.entries(itemFlag.spells)) {
          Logger.info(`Updating spell ${spell.name}`);
          Logger.debug("", spell);
          const entity = await MagicItemHelpers.fetchEntity(spell);
          if (entity) {
            if (!spell.componentsVSM) {
              Logger.debug(`Entered componentsVSM part ${JSON.stringify(entity?.labels?.components?.vsm)}`);
              spell.componentsVSM = await entity?.labels?.components?.vsm;
              Logger.info(`Added componentVSM value to spell ${spell.name}`);
              updateItem = true;
            }
            if (!spell.componentsALL) {
              Logger.debug(`Entered componentsALL part ${JSON.stringify(entity?.labels?.components?.all)}`);
              spell.componentsALL = await entity?.labels?.components?.all;
              Logger.info(`Added componentsALL value to spell ${spell.name}`);
              updateItem = true;
            }
          }
        }
      }

      if (!isEmptyObject(itemFlag.feats)) {
        for (const [key, feat] of Object.entries(itemFlag.feats)) {
          Logger.info(`Updating feat ${feat.name}`);
          Logger.debug("", feat);
          const entity = await MagicItemHelpers.fetchEntity(feat);
          if (entity) {
            if (!feat.featAction) {
              Logger.debug(`Entered featAction part ${JSON.stringify(entity?.labels?.activation)}`);
              feat.featAction = await entity?.labels?.activation;
              Logger.info(`Added activation method '${feat.featAction}' for feat: ${feat.name}`);
              updateItem = true;
            }
          }
        }
      }

      if (updateItem) {
        await item.update({
          flags: {
            [CONSTANTS.MODULE_ID]: itemFlag,
          },
        });
        Logger.info(`Updated item ${item.name}`);
      } else {
        Logger.info(`Update of item ${item.name} skipped - no flags updated`);
      }
    }
  }

  /**
   * Create details on the summoning profiles and other related options.
   * Method fetched from D&D5e ability-use-dialog.mjs
   * @param {Item5e} item  The item.
   * @returns {{ profiles: object, creatureTypes: object }|null}
   */
  static createSummoningOptions(item) {
    const summons = item.system.summons;
    if (!summons?.profiles.length) return null;
    const options = { mode: summons.mode, createSummons: true };
    const rollData = item.getRollData();
    const level = summons.relevantLevel;
    options.profiles = Object.fromEntries(
      summons.profiles
        .map((profile) => {
          if (!summons.mode && !fromUuidSync(profile.uuid)) return null;
          const withinRange = (profile.level.min ?? -Infinity) <= level && level <= (profile.level.max ?? Infinity);
          if (!withinRange) return null;
          return [profile._id, summons.getProfileLabel(profile, rollData)];
        })
        .filter((f) => f),
    );
    if (Object.values(options.profiles).every((p) => p.startsWith("1 × "))) {
      Object.entries(options.profiles).forEach(([k, v]) => (options.profiles[k] = v.replace("1 × ", "")));
    }
    if (Object.values(options.profiles).length <= 1) {
      options.profile = Object.keys(options.profiles)[0];
      options.profiles = null;
    }
    // Sets have no .reduce in dnd5e 5.x; wrap in Array.from().
    if (summons.creatureSizes.size > 1) {
      options.creatureSizes = Array.from(summons.creatureSizes).reduce((obj, k) => {
        obj[k] = CONFIG.DND5E.actorSizes[k]?.label;
        return obj;
      }, {});
    }
    if (summons.creatureTypes.size > 1) {
      options.creatureTypes = Array.from(summons.creatureTypes).reduce((obj, k) => {
        obj[k] = CONFIG.DND5E.creatureTypes[k]?.label;
        return obj;
      }, {});
    }
    return options;
  }
}
