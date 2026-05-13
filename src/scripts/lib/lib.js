import CONSTANTS from "../constants/constants.js";
import Logger from "./Logger.js";
import { RetrieveHelpers } from "./retrieve-helpers.js";

// =========================================================================================

/**
 *
 * @param obj
 */
export function isEmptyObject(obj) {
  // Because Object.keys(new Date()).length === 0;
  // we have to do some additional check
  if (obj === null || obj === undefined) {
    return true;
  }
  if (isRealNumber(obj)) {
    return false;
  }
  const result =
    obj && // Null and undefined check
    Object.keys(obj).length === 0; // || Object.getPrototypeOf(obj) === Object.prototype);
  return result;
}

/**
 *
 * @param string
 * @param char1
 * @param char2
 */
export function getSubstring(string, char1, char2) {
  return string.slice(string.indexOf(char1) + 1, string.lastIndexOf(char2));
}

// =========================================================================================

/**
 *
 * @param macroReference
 * @param {...any} macroData
 */
export async function runMacro(macroReference, ...macroData) {
  return runMacro(null, macroReference, macroData);
}

/**
 *
 * @param explicitActor
 * @param macroReference
 * @param {...any} macroData
 */
export async function runMacroOnExplicitActor(explicitActor, macroReference, ...macroData) {
  let macroFounded = await RetrieveHelpers.getMacroAsync(macroReference, false, true);
  if (!macroFounded) {
    throw Logger.error(`Could not find macro with reference "${macroReference}"`, true);
  }
  // Credit to Otigon, Zhell, Gazkhan and MrVauxs for the code in this section
  /*
    let macroId = macro.id;
    if (macroId.startsWith("Compendium")) {
      let packArray = macroId.split(".");
      let compendium = game.packs.get(`${packArray[1]}.${packArray[2]}`);
      if (!compendium) {
        throw Logger.error(`Compendium ${packArray[1]}.${packArray[2]} was not found`, true);
      }
      let findMacro = (await compendium.getDocuments()).find(m => m.name === packArray[3] || m.id === packArray[3])
      if (!findMacro) {
        throw Logger.error(`The "${packArray[3]}" macro was not found in Compendium ${packArray[1]}.${packArray[2]}`, true);
      }
      macro = new Macro(findMacro?.toObject());
      macro.ownership.default = CONST.DOCUMENT_PERMISSION_LEVELS.OWNER;
    } else {
      macro = game.macros.getName(macroId);
      if (!macro) {
        throw Logger.error(`Could not find macro with name "${macroId}"`, true);
      }
    }
    */
  let result = false;
  try {
    let args = {};
    if (typeof macroData !== "object") {
      // For (let i = 0; i < macroData.length; i++) {
      //   args[String(macroData[i]).trim()] = macroData[i].trim();
      // }
      args = parseAsArray(macroData);
    } else {
      args = macroData;
    }

    // Little trick to bypass permissions and avoid a socket to run as GM
    let macroTmp = new Macro(macroFounded.toObject());
    macroTmp.ownership.default = CONST.DOCUMENT_PERMISSION_LEVELS.OWNER;
    if (macroTmp.type === "chat") {
      result = await macroTmp.execute(args);
    } else if (macroTmp.type === "script") {
      const getEvent = () => {
        let a = args[0];
        if (a instanceof Event) {
          return args[0].shift();
        }
        if (a?.originalEvent instanceof Event) {
          return args.shift().originalEvent;
        }
        return undefined;
      };
      const macro = macroTmp;
      const actor = explicitActor || getUserCharacter();
      const speaker = ChatMessage.getSpeaker({ actor: actor });
      const token = canvas.tokens.get(actor.token);
      const character = game.user.character;
      const event = getEvent();

      Logger.debug("runMacro | ", { macro, speaker, actor, token, character, event, args });

      let body = "";
      if (macro.command.trim().startsWith("(async ()")) {
        body = macro.command;
      } else {
        body = `(async ()=>{
            ${macro.command}
          })();`;
      }
      // eslint-disable-next-line no-new-func -- macro execution requires dynamic code
      const fn = Function("speaker", "actor", "token", "character", "event", "args", body);

      Logger.debug("runMacro | ", { body, fn });

      try {
        fn.call(macro, speaker, actor, token, character, event, args);
      } catch (err) {
        Logger.error("error macro Execution", true, err);
      }
    } else {
      Logger.warn("Something is wrong a macro can be only a 'char' or a 'script'", true);
    }
  } catch (err) {
    throw Logger.error(`Error when executing macro ${macroReference}!`, true, macroData, err);
  }

  return result;
}

/**
 *
 * @param user
 */
export function getOwnedCharacters(user = false) {
  user = user || game.user;
  return game.actors
    .filter((actor) => {
      return actor.ownership?.[user.id] === CONST.DOCUMENT_PERMISSION_LEVELS.OWNER && actor.prototypeToken.actorLink;
    })
    .sort((a, b) => {
      return b._stats.modifiedTime - a._stats.modifiedTime;
    });
}

/**
 *
 * @param user
 */
export function getUserCharacter(user = false) {
  user = user || game.user;
  return user.character || (user.isGM ? false : (getOwnedCharacters(user)?.[0] ?? false));
}

/**
 *
 * @param pathToImage
 */
export function isValidImage(pathToImage) {
  const pathToImageS = String(pathToImage);
  if (pathToImageS.match(CONSTANTS.imageReg) || pathToImageS.match(CONSTANTS.imageRegBase64)) {
    return true;
  }
  return false;
}

/**
 *
 * @param inNumber
 */
export function isRealNumber(inNumber) {
  return !isNaN(inNumber) && typeof inNumber === "number" && isFinite(inNumber);
}

/**
 *
 * @param inBoolean
 */
export function isRealBoolean(inBoolean) {
  return String(inBoolean) === "true" || String(inBoolean) === "false";
}

/**
 *
 * @param obj
 */
export function parseAsArray(obj) {
  if (!obj) {
    return [];
  }
  let arr = [];
  if (typeof obj === "string" || obj instanceof String) {
    arr = obj.split(",");
  } else if (obj.constructor === Array) {
    arr = obj;
  } else {
    arr = [obj];
  }
  return arr;
}
