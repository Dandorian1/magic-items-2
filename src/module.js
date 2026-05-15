import API from "./scripts/API/api.js";
import MIGRATION from "./scripts/API/migration.js";
import CONSTANTS from "./scripts/constants/constants.js";
import { MagicItemActor } from "./scripts/magicitemactor.js";
import { MagicItemSheet } from "./scripts/magicitemsheet.js";
import { MagicItemTab } from "./scripts/magicItemtab.js";
import { MagicItem } from "./scripts/magic-item/MagicItem.js";
import { startCastSuppression, scheduleCastSuppressionEnd } from "./scripts/integrations/argon.js";

// CONFIG.debug.hooks = true;

/**
 *
 * @param actor
 * @param permission
 */
function canUseActor(actor, permission = "LIMITED") {
  return actor?.testUserPermission?.(game.user, permission) ?? actor?.isOwner ?? false;
}

/**
 *
 * @param html
 */
function normalizeHtml(html) {
  return html?.jquery ? html : $(html);
}

/**
 *
 */
async function showWelcomeDialog() {
  const message =
    "Hello everyone!<br><br>This is the first version of Magic Items module that has been transferred from Magic Items 2, therefore it requires a migration of items.<br><br>For manual information about migrations, please consult the latest release changelog.<br><br>Thank you for your continuing support, and I hope you will enjoy this module!<br><br>If you want, please go ahead and check out the discord community created for this module on Foundry Module listing or Github project.";

  await foundry.applications.api.DialogV2.wait({
    window: { title: "Magic Items" },
    content: `${message}<br><br>`,
    buttons: [
      {
        action: "use",
        icon: "fas fa-check",
        label: "Do the automatic migration.",
        callback: async () => {
          await MIGRATION.migrateScopeMagicItem();
          await game.settings.set(CONSTANTS.MODULE_ID, "welcomeMessage", true);
        },
      },
      {
        action: "closeAndChangeSetting",
        icon: "fas fa-times",
        label: "I will do the migration on my own - do not show this window again.",
        callback: async () => {
          await game.settings.set(CONSTANTS.MODULE_ID, "welcomeMessage", true);
        },
      },
      {
        action: "close",
        icon: "fas fa-times",
        label: game.i18n.localize("MAGICITEMS.SheetDialogClose"),
      },
    ],
    default: "use",
    modal: true,
    rejectClose: false,
  });
}

/**
 *
 * @param app
 * @param html
 * @param data
 */
function bindActorSheet(app, html, data) {
  const actor = app.actor ?? app.document ?? data?.actor;
  if (!actor || tidyApi?.isTidy5eCharacterSheet?.(app) || tidyApi?.isTidy5eNpcSheet?.(app)) {
    return;
  }
  MagicItemSheet.bind(app, normalizeHtml(html), data);
}

/**
 *
 * @param app
 * @param html
 * @param data
 */
function bindItemSheet(app, html, data) {
  if (tidyApi?.isTidy5eItemSheet?.(app) || !MagicItemTab.isAllowedToShow()) {
    return;
  }
  MagicItemTab.bind(app, normalizeHtml(html), data);
}

// Foundry v14 introduces `foundry.applications.handlebars.registerHelper`
// as the preferred path; the global `Handlebars` works under v13 but is
// expected to be removed eventually. Pick whichever is available so the
// helpers register in both worlds.
const _hbRegister =
  foundry.applications?.handlebars?.registerHelper?.bind(foundry.applications.handlebars) ??
  Handlebars.registerHelper.bind(Handlebars);

_hbRegister("enabled", function (value, options) {
  return value ? "" : "disabled";
});

_hbRegister("formatString", function (toFormat, variables = {}) {
  return game.i18n.format(toFormat, variables);
});

_hbRegister("object", function ({ hash }) {
  return hash;
});

Hooks.once("init", () => {
  game.settings.register(CONSTANTS.MODULE_ID, "identifiedOnly", {
    name: "MAGICITEMS.SettingIdentifiedOnly",
    hint: "MAGICITEMS.SettingIdentifiedOnlyHint",
    scope: "world",
    type: Boolean,
    default: true,
    config: true,
  });

  game.settings.register(CONSTANTS.MODULE_ID, "hideFromPlayers", {
    name: "MAGICITEMS.SettingHideFromPlayers",
    hint: "MAGICITEMS.SettingHideFromPlayersHint",
    scope: "world",
    type: Boolean,
    default: false,
    config: true,
  });

  game.settings.register(CONSTANTS.MODULE_ID, "debug", {
    name: "MAGICITEMS.SettingDebug",
    hint: "MAGICITEMS.SettingDebugHint",
    scope: "client",
    type: Boolean,
    default: false,
    config: true,
  });

  game.settings.register(CONSTANTS.MODULE_ID, "welcomeMessage", {
    name: "welcomeMessage",
    scope: "world",
    type: Boolean,
    default: true,
    config: false,
  });

  game.settings.register(CONSTANTS.MODULE_ID, "scaleSpellDamage", {
    name: "MAGICITEMS.SettingScaleSpellDamage",
    hint: "MAGICITEMS.SettingScaleSpellDamageHint",
    scope: "world",
    type: Boolean,
    default: false,
    config: true,
  });

  game.settings.register(CONSTANTS.MODULE_ID, "showLeftChargesChatMessage", {
    name: "MAGICITEMS.SettingShowLeftChargesInChat",
    hint: "MAGICITEMS.SettingShowLeftChargesInChatHint",
    scope: "world",
    type: Boolean,
    default: true,
    config: true,
  });

  game.settings.register(CONSTANTS.MODULE_ID, "optionDisplayMainSheetItems", {
    name: "MAGICITEMS.SettingDisplayMainSheetItem",
    hint: "MAGICITEMS.SettingDisplayMainSheetItemHint",
    scope: "client",
    type: Number,
    default: CONSTANTS.DISPLAY_OPTIONS.BOTTOM,
    requiresReload: true,
    choices: {
      0: "MAGICITEMS.SettingDisplayMainSheetItemBottom",
      1: "MAGICITEMS.SettingDisplayMainSheetItemTop",
    },
    config: true,
  });

  if (typeof Babele !== "undefined") {
    game.babele.register({
      module: CONSTANTS.MODULE_ID,
      lang: "en",
      dir: "languages/packs/en",
    });
    game.babele.register({
      module: CONSTANTS.MODULE_ID,
      lang: "it",
      dir: "languages/packs/it",
    });
    game.babele.register({
      module: CONSTANTS.MODULE_ID,
      lang: "pl",
      dir: "languages/packs/pl",
    });
  }
});

Hooks.once("setup", async () => {
  // Set API
  game.modules.get(CONSTANTS.MODULE_ID).api = API;
  window.MagicItems = game.modules.get(CONSTANTS.MODULE_ID).api;
  game.modules.get(CONSTANTS.MODULE_ID).migration = MIGRATION;
});

Hooks.once("ready", async () => {
  Array.from(game.actors)
    .filter((actor) => canUseActor(actor, "LIMITED"))
    .forEach((actor) => {
      MagicItemActor.bind(actor);
    });

  if (game.user.isGM && !game.settings.get(CONSTANTS.MODULE_ID, "welcomeMessage")) {
    await showWelcomeDialog();
  }
});

Hooks.on("createActor", (actor) => {
  if (canUseActor(actor, "OWNER")) {
    MagicItemActor.bind(actor);
  }
});

Hooks.on("createToken", (token) => {
  const actor = token.actor;
  if (canUseActor(actor, "OWNER")) {
    MagicItemActor.bind(actor);
  }
});

// Activate Argon refresh suppression at the earliest dnd5e rest hook so the
// system's own batch of updateItem / updateActor events during the rest's
// commit phase don't trigger debounced portrait re-renders or full-HUD
// refreshes. `dnd5e.preRestCompleted` fires "after rest result is calculated,
// but before any updates are performed" — exactly the window we want.
//
// Actor-scoped: only suppress when the resting actor is the one currently
// bound to this client's Argon HUD. Critical for party / "rest all" macros
// where the GM iterates multiple actors sequentially — without this guard,
// every actor's rest would suppress refreshes on the GM's own HUD for 1.5s
// past the LAST actor's restCompleted, swallowing any portrait updates the
// GM would normally see from interacting with their bound actor during that
// window.
Hooks.on("dnd5e.preRestCompleted", (actor) => {
  if (ui?.ARGON?._actor !== actor) return;
  try {
    startCastSuppression();
  } catch (e) {
    /* Argon not installed / not yet initialised — no-op */
  }
});

Hooks.on("dnd5e.restCompleted", async (actor, result, config) => {
  const isOurArgonActor = ui?.ARGON?._actor === actor;
  try {
    const magicItemActor = MagicItemActor.get(actor.id);
    if (!magicItemActor) return;
    await magicItemActor.buildItems();
    if (result.longRest || config.type === "long") {
      await magicItemActor.onLongRest(result);
    } else {
      await magicItemActor.onShortRest(result);
    }
  } finally {
    // Only schedule end if we actually activated suppression for this
    // actor in the matching pre-hook. Otherwise a third-party rest in a
    // shared client would reset the tail and steal the rest of the
    // current cast/rest's suppression window from us.
    if (isOurArgonActor) {
      try {
        scheduleCastSuppressionEnd();
      } catch (e) {
        /* No-op */
      }
    }
  }
});

Hooks.on("dnd5e.postUseActivity", async (activity) => {
  const item = activity?.item;
  const magicItem = item?.actor ? MagicItemActor.get(item.actor.id)?.magicItem(item.id) : null;
  if (magicItem) {
    await magicItem.triggerTables();
  }
});

Hooks.on("dnd5e.dropItemSheetData", (item, sheet, data) => {
  if (
    !MagicItemTab.isAllowedToShow() ||
    !MagicItemTab.isAcceptedItemType(item) ||
    !MagicItemTab.isMagicItemTabActive(sheet) ||
    !["Item", "RollTable"].includes(data?.type)
  ) {
    return;
  }

  const flagsData = foundry.utils.getProperty(item, `flags.${CONSTANTS.MODULE_ID}`);
  const magicItem = new MagicItem(flagsData);
  MagicItemTab.onDropData({ data, item, magicItem });
  return false;
});

/**
 * Keep downstream UIs in sync when a magic-item's flag block changes
 * (typically because a spell cast just decremented `uses`).
 *
 *   - Rebuild the `MagicItemActor` so the in-memory `OwnedMagicItem.uses`
 *     reflects the new flag value. The default `suspendListening` wrap
 *     in `OwnedMagicItem.update()` blocks the rebuild that would
 *     otherwise happen via an internal change listener, so we drive it
 *     explicitly here from outside that wrap.
 *   - Re-render any open actor sheet apps so the inline "X / Y charges"
 *     display in the magic-items section of the spell tab refreshes.
 *   - Refresh the Argon HUD for the active actor so its accordion-
 *     header X/▢ charge dots read the new number; Argon only
 *     auto-refreshes its portrait panel on `updateItem`, not the spell
 *     accordion.
 */
Hooks.on("updateItem", async (item, change) => {
  if (!foundry.utils.hasProperty(change, `flags.${CONSTANTS.MODULE_ID}`)) return;
  const actor = item.parent;
  if (!actor || actor.documentName !== "Actor") return;

  const magicItemActor = MagicItemActor.get(actor.id);
  if (magicItemActor) {
    try {
      await magicItemActor.buildItems();
    } catch (e) {
      /* Non-fatal — UI may just be stale until next render */
    }
  }

  for (const app of Object.values(actor.apps ?? {})) {
    try {
      app.render?.(false);
    } catch (e) {
      /* Ignore — closing sheets can throw */
    }
  }

  try {
    if (typeof ui !== "undefined" && ui.ARGON?._actor?.id === actor.id && typeof ui.ARGON.refresh === "function") {
      ui.ARGON.refresh();
    }
  } catch (e) {
    /* Ignore — Argon may not be installed or rendered */
  }
});

let tidyApi;

/**
 * Read a Tidy5e API constant by dotted path with a one-shot console.warn
 * if the constant is undefined. Tidy5e renaming a SHEET_PARTS entry in a
 * minor release would otherwise produce `[data-tidy-sheet-part="undefined"]`
 * selectors that silently inject nothing — the warn surfaces the failure.
 */
const _warnedTidyKeys = new Set();
/**
 *
 * @param api
 * @param path
 * @param fallback
 */
function tidyConst(api, path, fallback = "") {
  const value = path.split(".").reduce((o, k) => o?.[k], api?.constants);
  if (value === undefined || value === null) {
    if (!_warnedTidyKeys.has(path)) {
      _warnedTidyKeys.add(path);
      console.warn(
        `magicitems | Tidy5e API constant '${path}' is undefined — sheet injection for this selector will not work. ` +
          "This usually means Tidy5e renamed the constant; please report at https://github.com/PwQt/magic-items-2/issues",
      );
    }
    return fallback;
  }
  return value;
}

Hooks.once("tidy5e-sheet.ready", (api) => {
  tidyApi = api;

  // Register Tidy Item Sheet Tab
  const magicItemsTab = new api.models.HandlebarsTab({
    title: "Magic Item",
    tabId: "magicitems",
    path: "/modules/magicitems/templates/magic-item-tab.hbs",
    enabled: (data) => {
      return MagicItemTab.isAcceptedItemType(data.item) && MagicItemTab.isAllowedToShow();
    },
    getData(data) {
      const flagsData = foundry.utils.getProperty(data.item, `flags.${CONSTANTS.MODULE_ID}`);
      return new MagicItem(flagsData);
    },
    onRender(params) {
      const html = $(params.element);

      if (params.data.editable) {
        const flagsData = foundry.utils.getProperty(params.data.item, `flags.${CONSTANTS.MODULE_ID}`);
        const magicItem = new MagicItem(flagsData);
        MagicItemTab.activateTabContentsListeners({
          html: html,
          item: params.data.item,
          magicItem: magicItem,
        });
        MagicItemTab.activateDropTarget(params.element.querySelector(".magicitems-content"), {
          item: params.data.item,
          magicItem: magicItem,
        });
      } else {
        MagicItemTab.disableMagicItemTabInputs(html);
      }
    },
  });
  api.registerItemTab(magicItemsTab);

  // Register character and NPC spell tab custom content
  api.registerActorContent(
    new api.models.HandlebarsContent({
      path: `modules/${CONSTANTS.MODULE_ID}/templates/magic-item-spell-sheet.html`,
      injectParams: {
        position: "afterbegin",
        selector: `[data-tab-contents-for="${tidyConst(api, "TAB_ID_CHARACTER_SPELLBOOK")}"] .scroll-container`,
      },
      enabled(data) {
        const magicItemActor = MagicItemActor.get(data.actor.id);
        if (!magicItemActor) {
          return false;
        }
        // Required for Tidy to have accurate item data
        magicItemActor.buildItems();
        return ["character", "npc"].includes(data.actor.type) && magicItemActor.hasItemsSpells();
      },
      getData(data) {
        return MagicItemActor.get(data.actor.id);
      },
    }),
  );

  // Register character and NPC feature tab custom content
  const npcAbilitiesTabContainerSelector = `[data-tidy-sheet-part="${tidyConst(api, "SHEET_PARTS.NPC_ABILITIES_CONTAINER")}"]`;
  const characterFeaturesContainerSelector = `[data-tab-contents-for="${tidyConst(api, "TAB_ID_CHARACTER_FEATURES")}"] [data-tidy-sheet-part="${tidyConst(api, "SHEET_PARTS.ITEMS_CONTAINER")}"]`;
  const magicItemFeatureTargetSelector = [npcAbilitiesTabContainerSelector, characterFeaturesContainerSelector].join(
    ", ",
  );
  api.registerActorContent(
    new api.models.HandlebarsContent({
      path: `modules/${CONSTANTS.MODULE_ID}/templates/magic-item-feat-sheet.html`,
      injectParams: {
        position: "afterbegin",
        selector: magicItemFeatureTargetSelector,
      },
      enabled(data) {
        const magicItemActor = MagicItemActor.get(data.actor.id);
        if (!magicItemActor) {
          return false;
        }
        // Required for Tidy to have accurate item data
        magicItemActor.buildItems();
        return ["character", "npc"].includes(data.actor.type) && magicItemActor.hasItemsFeats();
      },
      getData(data) {
        return MagicItemActor.get(data.actor.id);
      },
    }),
  );
});

// Wire Tidy events and register iterated, data-dependent content
Hooks.on("tidy5e-sheet.renderActorSheet", (app, element, data) => {
  // Place wand for visible magic items
  const magicItemActor = MagicItemActor.get(data.actor.id);
  const html = $(element);
  if (!magicItemActor) {
    return;
  }

  const ITEM_TABLE_ROW = tidyConst(tidyApi, "SHEET_PARTS.ITEM_TABLE_ROW");
  const ITEM_NAME = tidyConst(tidyApi, "SHEET_PARTS.ITEM_NAME");
  if (ITEM_TABLE_ROW && ITEM_NAME && typeof tidyApi?.useHandlebarsRendering === "function") {
    magicItemActor.items
      .filter((item) => item.visible)
      .forEach((item) => {
        let itemEl = html.find(`[data-tidy-sheet-part="${ITEM_TABLE_ROW}"][data-item-id="${item.id}"]`);
        let itemNameContainer = itemEl.find(`[data-tidy-sheet-part=${ITEM_NAME}]`);
        let iconHtml = tidyApi.useHandlebarsRendering(CONSTANTS.HTML.MAGIC_ITEM_ICON);
        itemNameContainer.append(iconHtml);
      });
  }

  // Wire events for custom tidy actor sheet content
  MagicItemSheet.handleEvents(html, magicItemActor);
});

Hooks.on("renderItemSheet5e", (app, html, data) => {
  bindItemSheet(app, html, data);
});

Hooks.on("renderActorSheet5eCharacter", (app, html, data) => {
  bindActorSheet(app, html, data);
});

Hooks.on("renderActorSheet5eNPC", (app, html, data) => {
  bindActorSheet(app, html, data);
});

Hooks.on("renderCharacterActorSheet", (app, html, data) => {
  bindActorSheet(app, html, data);
});

Hooks.on("renderNPCActorSheet", (app, html, data) => {
  bindActorSheet(app, html, data);
});

Hooks.on("hotbarDrop", async (bar, data, slot) => {
  if (data.type !== "MagicItem") {
    return;
  }
  // JSON.stringify produces a properly-escaped JS string literal, so
  // item names containing apostrophes, quotes, or backslashes (e.g.
  // "Smith's Wand", `\\u2019`-flavoured curly quotes) don't blow up
  // the generated macro.
  const command = `MagicItems.roll(${JSON.stringify(data.magicItemName)}, ${JSON.stringify(data.itemName)});`;
  let macro = game.macros.find((m) => m.name === data.name && m.command === command);
  if (!macro) {
    macro = await Macro.create(
      {
        name: data.name,
        type: "script",
        img: data.img,
        command: command,
        flags: { "dnd5e.itemMacro": true },
      },
      { renderSheet: false },
    );
  }
  game.user.assignHotbarMacro(macro, slot);

  return false;
});

Hooks.on("createItem", async (item, options, userId) => {
  if (item.actor) {
    const actor = item.actor;
    const miActor = MagicItemActor.get(actor.id);
    if (miActor && miActor.listening && miActor.actor.id === actor.id) {
      await MIGRATION.updateFlagScopeMagicItem(item);
      await miActor.buildItems();
    }
  }
});

Hooks.on("updateItem", async (item, change, options, userId) => {
  if (item.actor) {
    const actor = item.actor;
    const miActor = MagicItemActor.get(actor.id);
    // The `listening` guard skips the module's own write-back: `miItem.update()`
    // suspends listening, so a re-entrant updateItem from that write is ignored.
    if (miActor && miActor.listening && miActor.actor.id === actor.id && item.flags.magicitems?.internal) {
      const miItem = miActor.magicItem(item.id);
      if (miItem) {
        await miItem.updateInternalCharges(item.flags.magicitems?.internal, item);
        miItem.rechargeableLabel = miItem.getRechargeableLabel();
        await miItem.update();
      }
    }
    if (miActor && miActor.listening && miActor.actor.id === actor.id) {
      setTimeout(miActor.buildItems.bind(miActor), 500);
    }
  }
});

Hooks.on("deleteItem", async (item, options, userId) => {
  if (item.actor) {
    const actor = item.actor;
    const miActor = MagicItemActor.get(actor.id);
    if (miActor && miActor.listening && miActor.actor.id === actor.id) {
      await miActor.buildItems();
    }
  }
});
