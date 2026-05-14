# Pack migration recipe

The module ships three default compendium packs (`magicitems`,
`magicitem-feats`, `magicitem-tables`) under `src/packs/_source/`. They
are committed as JSON sources and compiled to LevelDB at build time
by `npm run build:db`.

When dnd5e ships a schema migration (e.g. moving `system.senses` to
`system.senses.ranges` in dnd5e 5.3, or the activity-system migration
in dnd5e 5.0), the pack content needs to be re-saved through the new
schema so end-user worlds don't render migration warnings on every
load.

## The recipe

1. **Stand up a fresh test world** running the dnd5e version we want
   to migrate to. Install the module from a local checkout (symlink
   `dist/magicitems` into the Foundry modules folder, see
   `CONTRIBUTING.md` for the dev-loop setup).

2. **Activate the module** and let Foundry run its migration pass.
   Watch the browser console for migration messages — these are
   informational, not errors, but they tell you which schema fields
   changed.

3. **For each affected default item** (typically all of
   `Compendium.magicitems.magicitems`, `Compendium.magicitems.magicitem-feats`,
   `Compendium.magicitems.magicitem-tables`):
   - Open the item's sheet.
   - Verify no console warnings, no missing fields, no "needs
     migration" badges.
   - If the item has `system.activities`, verify each activity
     renders correctly (Save / Attack / Damage / etc.).
   - Close the sheet. Foundry's migration writes the updated data
     back to the pack on close.

4. **Extract the migrated packs back to JSON sources:**
   ```bash
   npm run build:json
   ```
   This calls `node ./utils/packs.mjs package unpack` which reads
   the LevelDB packs under `src/packs/<pack-name>/` and writes
   normalized JSON files into `src/packs/_source/<pack-name>/`.

5. **Re-normalize the JSONs** to strip ephemeral fields and fix
   whitespace:
   ```bash
   npm run build:clean
   ```

6. **Review the diff**:
   ```bash
   git diff src/packs/_source/
   ```
   You should see only:
   - Schema field renames (e.g. `system.senses.darkvision` →
     `system.senses.ranges.darkvision`).
   - New fields with reasonable defaults.
   - `_stats.lastModifiedBy` set to the cleanup signature
     (`packsbuilder0000`).

   You should NOT see:
   - Content changes (spell names, descriptions, charge counts).
   - Random uuid renames.
   - Whitespace-only diffs.

   If you do, something went wrong — revert and try again.

7. **Commit** `src/packs/_source/**/*.json`. The compiled `.ldb`
   files are gitignored; the release pipeline rebuilds them from the
   updated sources.

## Why we can't auto-migrate from CI

dnd5e's migration code runs inside a live Foundry world — it has
dependencies on `game`, `CONFIG`, the dnd5e system module's
data-prep pipeline, the `dnd5e.migrate` hook chain. There's no
headless mode that runs the migration on a JSON file. So the recipe
above is intentionally manual: open a world, let Foundry do its
thing, extract.

If a future dnd5e ships a CLI migrator, this doc should be revised.

## Smoke test after a pack migration

Before committing:

1. `npm run build:db` — recompile the packs from the new sources.
2. `npm run build` — build the full module.
3. `npm test` — confirm regression suite still passes (pack content
   isn't directly tested, but the build step would catch malformed
   JSON).
4. Install the updated module in a fresh world, open each pack item,
   verify no console warnings on load.
