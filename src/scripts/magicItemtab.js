import CONSTANTS from "./constants/constants.js";
import { MagicItem } from "./magic-item/MagicItem.js";
import { MagicItemHelpers } from "./magic-item-helpers.js";
import Logger from "./lib/Logger.js";
import { renderTemplate as renderTemplateV2, DragDropClass, TextEditorImpl } from "./lib/foundry-compat.js";

const magicItemTabs = [];

export class MagicItemTab {
  static bind(app, html, item) {
    const doc = app.item ?? app.document ?? item?.document ?? item?.item;
    if (MagicItemTab.isAcceptedItemType(doc)) {
      let tab = magicItemTabs[app.id];
      if (!tab) {
        tab = new MagicItemTab(app);
        magicItemTabs[app.id] = tab;
      }
      tab.init(MagicItemHelpers.normalizeHtml(html), item, app, doc);
    }
  }

  constructor(app) {
    this.activate = false;
  }

  init(html, data, app, doc) {
    this.item = doc ?? app.item ?? app.document;
    this.html = this.getSheetRoot(html);
    this.editable = data?.editable ?? app.isEditable ?? this.item?.isOwner;

    let tabs = this.html.find("form nav.sheet-navigation.tabs, nav.sheet-navigation.tabs, nav.sheet-tabs.tabs");
    if (tabs.find(`a[data-tab=${CONSTANTS.MODULE_ID}]`).length > 0) {
      return; // Already initialized, duplication bug!
    }

    const tabLink = document.createElement("a");
    if (tabs.hasClass("sheet-tabs")) {
      tabLink.dataset.action = "tab";
      tabLink.dataset.group = "primary";
      tabLink.dataset.tab = CONSTANTS.MODULE_ID;
      const span = document.createElement("span");
      span.textContent = "Magic Item";
      tabLink.appendChild(span);
    } else {
      tabLink.className = "item";
      tabLink.dataset.tab = CONSTANTS.MODULE_ID;
      tabLink.textContent = "Magic Item";
    }
    tabs.append(tabLink); // jQuery .append accepts native HTMLElement
    tabLink.addEventListener("click", () => {
      window.setTimeout(() => this.adjustSheetSize(app), 0);
    });

    const tabContent = document.createElement("div");
    tabContent.className = "tab magicitems";
    tabContent.dataset.group = "primary";
    tabContent.dataset.tab = CONSTANTS.MODULE_ID;
    const body = this.html.find(".sheet-body, .window-content, form").first();
    body.append(tabContent);

    const flagsData = foundry.utils.getProperty(this.item, `flags.${CONSTANTS.MODULE_ID}`);
    this.magicItem = new MagicItem(flagsData);

    if (this.editable) {
      if (app._dragDrop && app.form && app._onDragStart && app._onDragOver) {
        const dragDrop = new DragDropClass({
          dropSelector: ".tab.magicitems",
          permissions: {
            dragstart: this._canDragStart.bind(app),
            drop: this._canDragDrop.bind(app),
          },
          callbacks: {
            dragstart: app._onDragStart.bind(app),
            dragover: app._onDragOver.bind(app),
            drop: (event) => {
              this.activate = true;
              MagicItemTab.onDrop({
                event: event,
                item: this.item,
                magicItem: this.magicItem,
              });
            },
          },
        });

        app._dragDrop.push(dragDrop);
        dragDrop.bind(app.form);
      } else {
        MagicItemTab.activateDropTarget(tabContent[0], {
          item: this.item,
          magicItem: this.magicItem,
          onDrop: () => {
            this.activate = true;
          },
        });
      }
    }
    this.render(app);
  }

  getSheetRoot(html) {
    const root = MagicItemHelpers.normalizeHtml(html);
    if (root.find("nav.sheet-navigation.tabs, nav.sheet-tabs.tabs").length) {
      return root;
    }
    const closest = root.closest(".application, .app, .window-app");
    return closest.length ? closest : root;
  }

  static isApplicationV2(app) {
    const applicationV2 = foundry?.applications?.api?.ApplicationV2;
    return Boolean(applicationV2 && app instanceof applicationV2);
  }

  async render(app) {
    let template = await renderTemplateV2(
      `modules/${CONSTANTS.MODULE_ID}/templates/magic-item-tab.hbs`,
      this.magicItem,
    );
    let el = this.html.find(".magicitems-content");
    if (el.length) {
      el.replaceWith(template);
    } else {
      this.html.find(".tab.magicitems").append(template);
    }

    if (this.editable) {
      this.activateTabManagementListeners();
      MagicItemTab.activateTabContentsListeners({
        html: this.html,
        item: this.item,
        magicItem: this.magicItem,
        onItemUpdatingCallback: () => {
          this.activate = true;
        },
      });
    } else {
      MagicItemTab.disableMagicItemTabInputs(this.html);
    }

    if (this.activate && !this.isActive()) {
      if (app.changeTab) {
        app.changeTab(CONSTANTS.MODULE_ID, "primary");
      } else {
        app._tabs?.[0]?.activate(`${CONSTANTS.MODULE_ID}`);
      }
      this.adjustSheetSize(app);
    }

    if (this.isActive()) {
      this.adjustSheetSize(app);
    }

    this.activate = false;
  }

  isActive() {
    return (
      $(this.html).find(`a.item[data-tab="${CONSTANTS.MODULE_ID}"]`).hasClass("active") ||
      $(this.html).find(`[data-tab="${CONSTANTS.MODULE_ID}"].active`).length > 0 ||
      $(this.html).find(`[data-tab="${CONSTANTS.MODULE_ID}"][aria-selected="true"]`).length > 0
    );
  }

  adjustSheetSize(app) {
    if (!app?.setPosition) {
      return;
    }

    const hasMagicItemRows = this.html.find(".magicitems-entry-row, .magic-item-list .item").length > 0;
    const targetWidth = hasMagicItemRows ? 1040 : 760;
    const currentWidth = app.position?.width ?? app.element?.offsetWidth ?? app.element?.[0]?.offsetWidth ?? 0;
    const viewportWidth = window.innerWidth ?? document.documentElement?.clientWidth ?? targetWidth;
    const maxWidth = Math.max(700, viewportWidth - 32);
    const width = Math.min(Math.max(currentWidth, targetWidth), maxWidth);

    // When the Magic Item tab is active, force `height: "auto"` so the
    // sheet expands to fit the rows (replaces the prior `hack()` monkey-patch).
    // Only meaningful on v1 sheets; v2 sheets auto-size via their own
    // ApplicationV2 lifecycle.
    const isActive = this.isActive();
    const isV2 = MagicItemTab.isApplicationV2(app);
    const heightOverride = isActive && !isV2 ? "auto" : undefined;

    if (width > currentWidth + 8) {
      app.setPosition(heightOverride ? { width, height: heightOverride } : { width });
    } else if (heightOverride) {
      app.setPosition({ height: heightOverride });
    } else {
      app.setPosition();
    }

    this.html.find(".window-content, .tab.magicitems, .magicitems-content").scrollLeft(0);
  }

  _canDragDrop() {
    return true;
  }

  _canDragStart() {
    return true;
  }

  activateTabManagementListeners() {
    this.html.find(".magicitems-content").on("change", ":input", (evt) => {
      this.activate = true;
    });
  }

  /**
   * Disable all relevant inputs in the magic items tab.
   * @param html
   */
  static disableMagicItemTabInputs(html) {
    html.find(".magicitems-content input").prop("disabled", true);
    html.find(".magicitems-content select").prop("disabled", true);
  }

  /**
   * Handles drop event for compatible magic item source (for example, a spell).
   *
   * @param {object} params Parameters needed to handle item drops to the magic item tab.
   * @param {DragEvent} params.event The drop event.
   * @param {Item5e} params.item The target item.
   * @param {MagicItem} params.magicItem The relevant magic item associated with the target item.
   * @returns
   */
  static async onDrop({ event, item, magicItem }) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();

    const data = MagicItemTab.getDropData(event);
    return MagicItemTab.onDropData({ data, item, magicItem });
  }

  static async onDropData({ data, item, magicItem }) {
    if (!data || !magicItem.support(data.type)) {
      return false;
    }

    let entity;
    try {
      entity = await fromUuid(data.uuid);
    } catch (err) {
      return false;
    }

    if (!entity) {
      return false;
    }

    const pack = entity.pack ? entity.pack : "world";

    if (entity && magicItem.compatible(entity)) {
      magicItem.addEntity(entity, pack);
      await item.update({
        flags: {
          [CONSTANTS.MODULE_ID]: magicItem.serializeData(),
        },
      });
      return true;
    }
    return false;
  }

  static getDropData(event) {
    if (TextEditorImpl?.getDragEventData) {
      return TextEditorImpl.getDragEventData(event);
    }

    const rawData = event.dataTransfer?.getData("application/json") || event.dataTransfer?.getData("text/plain");
    try {
      return JSON.parse(rawData);
    } catch (err) {
      return null;
    }
  }

  static activateDropTarget(element, { item, magicItem, onDrop = null }) {
    if (!element) {
      return;
    }

    element.addEventListener(
      "dragover",
      (event) => {
        event.preventDefault();
        event.stopPropagation();
      },
      true,
    );
    element.addEventListener(
      "drop",
      (event) => {
        onDrop?.();
        MagicItemTab.onDrop({ event, item, magicItem });
      },
      true,
    );
  }

  static isMagicItemTabActive(app) {
    const element = app?.element?.jquery ? app.element[0] : app?.element;
    if (!element) {
      return false;
    }

    return Boolean(
      element.querySelector(
        `[data-tab="${CONSTANTS.MODULE_ID}"].active, [data-tab="${CONSTANTS.MODULE_ID}"][aria-selected="true"], .tab.magicitems.active`,
      ),
    );
  }

  /**
   * Activates listeners related to tab contents.
   *
   * @param {object}    params The parameters for wiring up tab content event handling.
   * @param {jQuery}    params.html The sheet HTML jQuery element
   * @param {Item5e}    params.item The item which is to be changed.
   * @param {MagicItem} params.magicItem A Magic Item instance
   * @param {Function}  params.onItemUpdatingCallback A callback for handling when item updates are about to be applied. This is useful for current tab management.
   */
  static async activateTabContentsListeners({
    html,
    item,
    magicItem,
    onItemUpdatingCallback: onMagicItemUpdatingCallback = null,
  }) {
    html.find(".item-delete.item-spell").click((evt) => {
      magicItem.removeSpell(evt.target.getAttribute("data-spell-idx"));
      onMagicItemUpdatingCallback?.();
      item.update({
        flags: {
          [CONSTANTS.MODULE_ID]: magicItem.serializeData(),
        },
      });
    });
    html.find(".item-delete.item-feat").click((evt) => {
      magicItem.removeFeat(evt.target.getAttribute("data-feat-idx"));
      onMagicItemUpdatingCallback?.();
      item.update({
        flags: {
          [CONSTANTS.MODULE_ID]: magicItem.serializeData(),
        },
      });
    });
    html.find(".item-delete.item-table").click((evt) => {
      magicItem.removeTable(evt.target.getAttribute("data-table-idx"));
      onMagicItemUpdatingCallback?.();
      item.update({
        flags: {
          [CONSTANTS.MODULE_ID]: magicItem.serializeData(),
        },
      });
    });

    html.find("input[name='flags.magicitems.internal']").click(async (evt) => {
      await magicItem.updateInternalCharges(evt.target.checked, item);
      onMagicItemUpdatingCallback?.();
      item.update({
        flags: {
          [CONSTANTS.MODULE_ID]: magicItem.serializeData(),
        },
      });
    });

    magicItem.spells.forEach((spell, idx) => {
      html.find(`a[data-spell-idx="${idx}"]`).click((evt) => {
        spell.renderSheet();
      });
    });
    magicItem.feats.forEach((feat, idx) => {
      html.find(`a[data-feat-idx="${idx}"]`).click((evt) => {
        feat.renderSheet();
      });
    });
    magicItem.tables.forEach((table, idx) => {
      html.find(`a[data-table-idx="${idx}"]`).click((evt) => {
        table.renderSheet();
      });
    });
  }

  static get acceptedItemTypes() {
    return ["weapon", "equipment", "consumable", "tool", "backpack", "feat"];
  }

  static isAcceptedItemType(doc) {
    return MagicItemTab.acceptedItemTypes.includes(doc?.type);
  }

  static isAllowedToShow() {
    return game.user.isGM || !game.settings.get(CONSTANTS.MODULE_ID, "hideFromPlayers");
  }
}
