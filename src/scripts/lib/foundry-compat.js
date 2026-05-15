/**
 * Centralised Foundry v13+ shims.
 *
 * Foundry has been steadily relocating its API surface from top-level
 * globals into the `foundry.*` namespaces (deprecation since v12, removal
 * targeted at v14/v15). We capture the namespaced reference at module load
 * with a legacy-global fallback so the module keeps working across the
 * transition window. The `foundry.*` namespace shims are read at
 * file-evaluation time — those namespaces are populated before any module
 * code runs. `RollImpl` / `ChatMessageImpl` are the exception: they read
 * `CONFIG.*`, which dnd5e populates in its `init` hook (after module import),
 * so they re-resolve at `setup`.
 *
 * Use these named imports instead of re-introducing the
 * `foundry.X ?? globalThis.X` ternary inline in every file.
 */

/** dnd5e v1 ItemSheet, used by the `MagicItemTab` decorator to detect v1
 * sheets it can `hack(app)`. v15 removes `globalThis.ItemSheet`. */
export const ItemSheetClass = foundry.appv1?.sheets?.ItemSheet ?? globalThis.ItemSheet;

/** V13 namespaced renderTemplate. The global is deprecated since v12 and
 * removed at v15. */
export const renderTemplate = foundry.applications?.handlebars?.renderTemplate ?? globalThis.renderTemplate;

/** V13 namespaced DragDrop. The global is deprecated since v13 and removed
 * at v15. */
export const DragDropClass = foundry.applications?.ux?.DragDrop?.implementation ?? globalThis.DragDrop;

/** V13 namespaced TextEditor. */
export const TextEditorImpl =
  foundry.applications?.ux?.TextEditor?.implementation ?? (typeof TextEditor !== "undefined" ? TextEditor : null);

/** V13 namespaced CompendiumCollection. */
export const CompendiumCollectionClass =
  foundry.documents?.collections?.CompendiumCollection ?? globalThis.CompendiumCollection;

/** System-aware Roll class — re-resolved at `setup` (dnd5e registers its Roll
 * subclasses into `CONFIG.Dice.rolls` in its `init` hook, after module import).
 * `export let` + re-assignment propagates to importers via live bindings. */
export let RollImpl = globalThis.CONFIG?.Dice?.rolls?.[0] ?? globalThis.Roll;

/** System-aware ChatMessage document class (dnd5e's ChatMessage5e adds the
 * card-render hooks midi-qol expects) — see `RollImpl` for the lazy rationale. */
export let ChatMessageImpl = globalThis.CONFIG?.ChatMessage?.documentClass ?? globalThis.ChatMessage;

// Re-resolve the CONFIG-backed classes once dnd5e's `init` handler has run.
Hooks.once("setup", () => {
  RollImpl = globalThis.CONFIG?.Dice?.rolls?.[0] ?? globalThis.Roll;
  ChatMessageImpl = globalThis.CONFIG?.ChatMessage?.documentClass ?? globalThis.ChatMessage;
});

/** DialogV2 helper — convenience wrapper around the wait-style API used by
 * the simple yes/no flows in this module. Resolves to the action string the
 * clicked button returned, or `null` if the dialog was dismissed.
 *
 * @param {object}   opts
 * @param {string}   opts.title              Window title.
 * @param {string}   opts.content            Inner HTML.
 * @param {Array}    opts.buttons            DialogV2 button definitions.
 * @param {string}  [opts.default]           Default button action.
 * @param {boolean} [opts.modal=false]
 */
export async function dialogWait({ title, content, buttons, default: def, modal = false }) {
  return foundry.applications.api.DialogV2.wait({
    window: { title },
    content,
    buttons,
    default: def,
    modal,
    rejectClose: false,
  });
}
