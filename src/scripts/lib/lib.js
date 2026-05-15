import CONSTANTS from "../constants/constants.js";

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
