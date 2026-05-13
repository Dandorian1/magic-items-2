# Module no longer in active development. Should you want to continue development, feel free to contact me via GitHub or Discord.


# FoundryVTT - Magic Items
![](https://img.shields.io/endpoint?url=https%3A%2F%2Ffoundryshields.com%2Fversion%3Fstyle%3Dflat%26url%3Dhttps%3A%2F%2Fgithub.com%2FPwQt%2Fmagic-items-2%2Freleases%2Flatest%2Fdownload%2Fmodule.json)
![](https://img.shields.io/endpoint?url=https%3A%2F%2Ffoundryshields.com%2Fsystem%3FnameType%3Dfoundry%26showVersion%3D1%26style%3Dflat%26url%3Dhttps%3A%2F%2Fgithub.com%2FPwQt%2Fmagic-items-2%2Freleases%2Flatest%2Fdownload%2Fmodule.json)
![](https://img.shields.io/badge/dynamic/json?label=Forge%20Installs&query=package.installs&suffix=%25&url=https%3A%2F%2Fforge-vtt.com%2Fapi%2Fbazaar%2Fpackage%2Fmagicitems&colorB=blueviolet)

![GitHub Release](https://img.shields.io/github/v/release/pwqt/magic-items-2)
![GitHub Downloads (specific asset, latest release)](https://img.shields.io/github/downloads/pwqt/magic-items-2/latest/module.zip)
![GitHub Downloads (all assets, all releases)](https://img.shields.io/github/downloads/pwqt/magic-items-2/total)


This module for Foundry VTT and specific for the **DnD5e system**, adds the ability to create magical items with spells or feats that belong to the item itself, such as staffs or 
magic wands, which will be automatically inherited from the character who owns the item.

---

An official continuation of [Magic Items](https://gitlab.com/riccisi/foundryvtt-magic-items/).

If you have an issue that requires quick contact, I've created a [Discord](https://discord.gg/58s7xnNC4j) community.

---
If you wish to buy me a coffee, follow this link:

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/J3J6UHCX0)

## D&D 4 Upgrade
Last working version for D&D 4.x is [5.0.0-beta.2](https://github.com/PwQt/magic-items-2/releases/tag/5.0.0-beta.2)

## Translation

You can now publicly help with translation on Weblate.

<a href="https://hosted.weblate.org/engage/magic-items/">
<img src="https://hosted.weblate.org/widget/magic-items/287x66-grey.png" alt="Translation status" />
</a>


## Installation

You can download the module from [Foundry package listing](https://foundryvtt.com/packages/magicitems).

It's always easiest to install modules from the in game add-on browser.

To install this module manually:
1.  Inside the Foundry "Configuration and Setup" screen, click "Add-on Modules"
2.  Click "Install Module"
3.  In the "Manifest URL" field, paste the following url:
`https://github.com/PwQt/magic-items-2/releases/latest/download/module.json`
4.  Click 'Install' and wait for installation to complete
5.  Don't forget to enable the module in game using the "Manage Module" button

## Usage Instructions

1) Once activated, a new tab named 'Magic Item' will be available for each items of type 'weapon', 'equipment' or 'consumable'.  
2) In this tab, you can drag spells from a compendium and configure its consumption which will be subtracted from the total number of charges each time the spell is used.  
3) It is also possible to configure the max number of charges, if they can be can be recharged and when, and if the item will be destroyed when the charges reach 0.

<div align="center">

![example0](/wiki/example0.png?raw=true)
</div>

Using combinations of these parameters is possible to create, for example:

* A legendary staff equipped with great thaumaturgical spells

<div align="center">

![example1](/wiki/example1.png?raw=true)
</div>

* A globe with a perennial light spell.

<div align="center">

![example2](/wiki/example2.png?raw=true)
</div>

* A scroll with a powerful necromantic spell that dissolves once pronounced.

<div align="center">

![example3](/wiki/example3.png?raw=true)
</div>

In addition to spells, it is also possible to assign feats to the items, or combinations of both:

<div align="center">

![example5](/wiki/example5.png?raw=true)
</div>

When a character is equipped with one or more magical objects, within his sheet in the spellbook/features section, 
a set of inherited spells/feats divided by item will be displayed after his owned items:

<div align="center">

![example4](/wiki/example4.png?raw=true)
</div>

<div align="center">

![example6](/wiki/example6.png?raw=true)
</div>

From here you can cast spells or use feats provided by the items and monitor the consumption/recharges.

You can move the Display of the Spells/Feats up to the top of the sheet in settings.

## Api

All informations about the api and the sheet integration can be found here [API](./wiki/api.md)

## Compatibility
| **Name** | **Compatibility** | **Additional information** |
|----------|:-----------------:|----------------------------|
|Legacy DnD 5e sheet|✔️||
|DND5e 3.0 Sheet|✔️|released in 1.6.0|
|[Compact DnDBeyond-like 5e Character Sheet](https://github.com/eastcw/foundryvtt-compactBeyond5eSheet)|:interrobang:|Works, but doesn't show in Actions tab.|
|[Tidy 5e Sheet Rewrite](https://github.com/kgar/foundry-vtt-tidy-5e-sheets/)|✔️||
|[Enhanced Combat HUD - DnD5e (Argon)](https://github.com/cswendrowski/FoundryVTT-Enhanced-Combat-HUD)|✔️|Magic-item spells appear in the Cast Spell accordion, grouped under the parent magic item, with the item's charge dots in the section header. Requires libWrapper (recommended). See [Argon HUD integration](#argon-hud-integration) below.|
|[midi-qol](https://gitlab.com/tposney/midi-qol) + [chris-premades](https://github.com/chrisk123999/chris-premades)|✔️|Spells cast through magic items materialize as real actor-embedded items for the duration of the cast workflow, so midi-qol & chris-premades hooks see them in `actor.items` and the workflow completes end-to-end (damage and healing apply correctly).|

### Argon HUD integration

When [`enhancedcombathud-dnd5e`](https://github.com/cswendrowski/FoundryVTT-Enhanced-Combat-HUD) is active, magic-item spells are surfaced in the Argon Cast Spell accordion, grouped under the parent magic item (Staff of Healing, Wand of Magic Missiles, etc.) — the same shape Argon already uses for native dnd5e "Cast Activity" magic items. The integration:

- Pulls per-spell save DC / formula / school / range / target / description into Argon's hover tooltip.
- Shows the item's remaining charges as X/▢ dots in the accordion section header.
- Refreshes charge dots immediately on cast (no need to close & re-open the HUD).
- Routes clicks through `MagicItemActor.rollByName(...)` so per-spell consumption, upcast prompts, summoning dialogs, and active-effect prompts all behave the same as casting via the character sheet.

The integration is non-invasive: it uses Argon's own per-component render hooks plus libWrapper to layer onto Argon's existing prepare/click paths. No edits to Argon's source files. libWrapper is recommended but not required (a direct-patch fallback runs if it's missing).

# Build

## Install all packages

```bash
npm install
```

### dev

`dev` will let you develop you own code with hot reloading on the browser

```bash
npm run dev
```

## npm build scripts

### build

`build` will build and set up a symlink between `dist` and your `dataPath`.

```bash
npm run build
```

### build-watch

`build-watch` will build and watch for changes, rebuilding automatically.

```bash
npm run build-watch
```

### prettier-format

`prettier-format` launch the prettier plugin based on the configuration [here](./.prettierrc)

```bash
npm run-script prettier-format
```

### lint and lint:fix

`lint` launch the eslint process based on the configuration [here](./.eslintrc.json)

```bash
npm run-script lint
```

`lint:fix` launch the eslint process with the fix argument

```bash
npm run-script lint:fix
```

## [Changelog](./CHANGELOG.md)

## Issues

Any issues, bugs, or feature requests are always welcome to be reported directly to the [Issue Tracker](https://github.com/PwQt/magic-items-2/issues).

## License

This package is under an [MIT license](LICENSE) and the [Foundry Virtual Tabletop Limited License Agreement for module development](https://foundryvtt.com/article/license/).

## Credit

This is a maintained version of Magic Items module, originally created by Simone.

[Magic Items](https://gitlab.com/riccisi/foundryvtt-magic-items) is a module for Foundry VTT by Simone and is licensed under a [Creative Commons Attribution 4.0 International License](http://creativecommons.org/licenses/by/4.0/).
