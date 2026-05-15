import CONSTANTS from "./constants/constants.js";
import { renderTemplate as renderTemplateV2 } from "./lib/foundry-compat.js";

/**
 * Spell upcast / consumption configuration dialog.
 *
 * Implemented on top of `foundry.applications.api.DialogV2` (the v1
 * `Dialog` global is deprecated since v12, removed at v15). DialogV2
 * doesn't have v1's `activateListeners(html)` hook, so the
 * "consumption updates when level changes" wiring is done via the
 * `render` Hook DialogV2 fires after attaching content. Returns the
 * FormData of `#spell-config-form` on the Cast button.
 *
 * Resolves to a `FormData` instance on cast, or `null` if the dialog
 * was dismissed (cancelled / closed).
 */
export class MagicItemUpcastDialog {
  static async create(magicItem, item) {
    const html = await renderTemplateV2(`modules/${CONSTANTS.MODULE_ID}/templates/magic-item-upcast-dialog.html`, item);

    return foundry.applications.api.DialogV2.wait({
      window: { title: `${magicItem.name} > ${item.name}: Spell Configuration` },
      // `dnd5e2` brings v2 form-field styling so the inputs render readably.
      // The marker class `magicitems-upcast-dialog` lets `magicitems.css`
      // override the default v2 parchment dialog background with the dark
      // panel theme the v2 character/item sheets use (the parchment look
      // is dnd5e's default for chat cards, not for the sheet aesthetic).
      classes: ["dnd5e2", "dialog", "magicitems-upcast-dialog"],
      content: html,
      buttons: [
        {
          action: "cast",
          icon: "fas fa-magic",
          label: "Cast",
          callback: (event, button, dialog) => {
            const form = button.form.querySelector("#spell-config-form") ?? button.form;
            return new FormData(form);
          },
        },
      ],
      default: "cast",
      rejectClose: false,
      render: (event, dialog) => {
        const root = dialog.element;
        const levelSel = root.querySelector('select[name="level"]');
        const consumption = root.querySelector('input[name="consumption"]');
        if (levelSel && consumption) {
          levelSel.addEventListener("change", (evt) => {
            const level = parseInt(evt.target.value);
            if (Number.isFinite(level)) consumption.value = item.consumptionAt(level);
          });
        }
      },
    });
  }
}
