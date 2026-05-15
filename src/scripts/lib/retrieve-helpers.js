import Logger from "./Logger.js";

const CompendiumCollectionClass =
  foundry.documents?.collections?.CompendiumCollection ?? globalThis.CompendiumCollection;

export class RetrieveHelpers {
  /**
   * @param {object} opts
   * @param {string} [opts.documentName]
   * @param {string} [opts.documentId]
   * @param {string} [opts.documentCollectionType]
   * @param {string} [opts.documentPack]
   * @param {boolean} [opts.ignoreError=false]
   */
  static retrieveUuid({ documentName, documentId, documentCollectionType, documentPack, ignoreError = false }) {
    let uuid = null;
    if (documentCollectionType || documentPack === "world") {
      const collection = game.collections.get(documentCollectionType);
      if (!collection) {
        // DO NOTHING
        Logger.warn(`Cannot retrieve collection for ${collection}`);
      } else {
        // Get the original document, if the name still matches - take no action
        const original = documentId ? collection.get(documentId) : null;
        if (original) {
          if (documentName) {
            if (original.name !== documentName) {
              // DO NOTHING
            } else {
              return original.uuid;
            }
          } else {
            return original.uuid;
          }
        }
        // Otherwise, find the document by ID or name (ID preferred)
        const doc = collection.find((e) => e.id === documentId || e.name === documentName) || null;
        if (doc) {
          return doc.uuid;
        }
      }
    }
    if (documentPack) {
      const pack = RetrieveHelpers.getCompendiumCollectionSync(documentPack, ignoreError);
      if (!pack) {
        // DO NOTHING
        Logger.warn(`Cannot retrieve pack for ${documentPack}`);
      } else {
        // Get the original entry, if the name still matches - take no action
        const original = documentId ? pack.index.get(documentId) : null;
        if (original) {
          if (documentName) {
            if (original.name !== documentName) {
              // DO NOTHING
            } else {
              return original.uuid;
            }
          } else {
            return original.uuid;
          }
        }

        // Otherwise, find the document by ID or name (ID preferred)
        const doc = pack.index.find((i) => i._id === documentId || i.name === documentName) || null;
        if (doc) {
          return doc.uuid;
        }
      }
    }
    return uuid;
  }

  static stringIsUuid(inId) {
    const valid = typeof inId === "string" && (inId.match(/\./g) || []).length && !inId.endsWith(".");
    if (valid) {
      return !!fromUuidSync(inId);
    } else {
      return false;
    }
  }

  static getCompendiumCollectionSync(target, ignoreError = false, ignoreName = true) {
    let targetTmp = target;
    if (!targetTmp) {
      throw Logger.error("CompendiumCollection is undefined", true, targetTmp);
    }
    if (targetTmp instanceof CompendiumCollectionClass) {
      return targetTmp;
    }
    // This is just a patch for compatibility with others modules
    if (targetTmp.document) {
      targetTmp = targetTmp.document;
    }
    if (targetTmp.uuid) {
      targetTmp = targetTmp.uuid;
    }

    if (targetTmp instanceof CompendiumCollectionClass) {
      return targetTmp;
    }
    if (RetrieveHelpers.stringIsUuid(targetTmp)) {
      targetTmp = fromUuidSync(targetTmp);
    } else {
      if (game.packs.get(targetTmp)) {
        targetTmp = game.packs.get(targetTmp);
      } else if (!ignoreName && game.packs.getName(targetTmp)) {
        targetTmp = game.packs.getName(targetTmp);
      }
    }
    if (!targetTmp) {
      if (ignoreError) {
        Logger.warn("CompendiumCollection is not found", false, targetTmp);
        return;
      } else {
        throw Logger.error("CompendiumCollection is not found", true, targetTmp);
      }
    }
    // Type checking
    if (!(targetTmp instanceof CompendiumCollectionClass)) {
      if (ignoreError) {
        Logger.warn("Invalid CompendiumCollection", false, targetTmp);
        return;
      } else {
        throw Logger.error("Invalid CompendiumCollection", true, targetTmp);
      }
    }
    return targetTmp;
  }

  static async getActorAsync(target, ignoreError = false, ignoreName = true) {
    let targetTmp = target;
    if (!targetTmp) {
      throw Logger.error("Actor is undefined", true, targetTmp);
    }
    if (targetTmp instanceof Actor) {
      return targetTmp;
    }
    // This is just a patch for compatibility with others modules
    if (targetTmp.document) {
      targetTmp = targetTmp.document;
    }
    if (targetTmp.uuid) {
      targetTmp = targetTmp.uuid;
    }

    if (targetTmp instanceof Actor) {
      return targetTmp;
    }
    if (RetrieveHelpers.stringIsUuid(targetTmp)) {
      targetTmp = await fromUuid(targetTmp);
    } else {
      if (game.actors.get(targetTmp)) {
        targetTmp = game.actors.get(targetTmp);
      } else if (!ignoreName && game.actors.getName(targetTmp)) {
        targetTmp = game.actors.getName(targetTmp);
      }
    }
    if (!targetTmp) {
      if (ignoreError) {
        Logger.warn("Actor is not found", false, targetTmp);
        return;
      } else {
        throw Logger.error("Actor is not found", true, targetTmp);
      }
    }
    // Type checking
    if (!(targetTmp instanceof Actor)) {
      if (ignoreError) {
        Logger.warn("Invalid Actor", false, targetTmp);
        return;
      } else {
        throw Logger.error("Invalid Actor", true, targetTmp);
      }
    }
    return targetTmp;
  }

  static async getItemAsync(target, ignoreError = false, ignoreName = true) {
    let targetTmp = target;
    if (!targetTmp) {
      throw Logger.error("Item is undefined", true, targetTmp);
    }
    if (targetTmp instanceof Item) {
      return targetTmp;
    }
    // This is just a patch for compatibility with others modules
    if (targetTmp.document) {
      targetTmp = targetTmp.document;
    }
    if (targetTmp.uuid) {
      targetTmp = targetTmp.uuid;
    }

    if (targetTmp instanceof Item) {
      return targetTmp;
    }
    if (RetrieveHelpers.stringIsUuid(targetTmp)) {
      targetTmp = await fromUuid(targetTmp);
    } else {
      if (game.items.get(targetTmp)) {
        targetTmp = game.items.get(targetTmp);
      } else if (!ignoreName && game.items.getName(targetTmp)) {
        targetTmp = game.items.getName(targetTmp);
      }
    }
    if (!targetTmp) {
      if (ignoreError) {
        Logger.warn("Item is not found", false, targetTmp);
        return;
      } else {
        throw Logger.error("Item is not found", true, targetTmp);
      }
    }
    // Type checking
    if (!(targetTmp instanceof Item)) {
      if (ignoreError) {
        Logger.warn("Invalid Item", false, targetTmp);
        return;
      } else {
        throw Logger.error("Invalid Item", true, targetTmp);
      }
    }
    return targetTmp;
  }
}
