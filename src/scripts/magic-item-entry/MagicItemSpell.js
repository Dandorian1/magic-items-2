import { AbstractMagicItemEntry } from "./AbstractMagicItemEntry.js";
import { NumberUtils } from "../utils/number.js";
import Logger from "../lib/Logger.js";

export class MagicItemSpell extends AbstractMagicItemEntry {
  constructor(data) {
    super(data);
    this.baseLevel = NumberUtils.parseIntOrGetDefault(this.baseLevel, 0);
    this.level = NumberUtils.parseIntOrGetDefault(this.level, 0);
    this.consumption = NumberUtils.parseIntOrGetDefault(this.consumption, 0);
    this.upcast = this.upcast ? NumberUtils.parseIntOrGetDefault(this.upcast, 0) : this.level;
    this.upcastCost = this.upcastCost ? NumberUtils.parseIntOrGetDefault(this.upcastCost, 0) : 1;
    this.dc = this.flatDc && this.dc ? this.dc : "";
    this.componentsVSM = this.componentsVSM;
    this.componentsALL = this.componentsALL;
    this.atkBonus = this.checkAtkBonus && this.atkBonus ? this.atkBonus : "";
    // Populated by prepareDisplay() before sheet render. Defaults keep
    // the template render correct if prepareDisplay was never called.
    // Structured to mirror the native dnd5e spell-row cells:
    //   ROLL    .item-roll      → <span class="ability">…</span> + <span class="value">…</span>
    //   FORMULA .item-formula   → repeated {formula, damageType, iconPath}
    this.saveAbility = "";
    this.saveDc = "";
    this.attackLabel = "";
    this.damageParts = [];
  }

  /**
   * Resolve the linked spell entity and compute the "ROLL" (save / to-hit)
   * and "FORMULA" (damage) display strings shown in the magic-items section
   * of the spellbook tab, matching the native dnd5e row layout.
   *
   * Reads dnd5e 5.x activity-system data (`system.activities`). Falls back
   * to the legacy `system.save` / `system.damage.parts` shape for older
   * spells that haven't been migrated.
   */
  async prepareDisplay(actor) {
    this.saveAbility = "";
    this.saveDc = "";
    this.attackLabel = "";
    this.damageParts = [];
    if (this.removed || !actor) return;
    let spell;
    try {
      spell = await this.entity();
    } catch (e) {
      return;
    }
    if (!spell) return;

    const flatDc = this.flatDc && this.dc ? Number(this.dc) : null;
    const damageTypes = CONFIG.DND5E?.damageTypes ?? {};
    // Build a single formula/damageType part for the FORMULA cell.
    const pushPart = (formula, damageType) => {
      if (!formula) return;
      const cfg = damageTypes[damageType] ?? {};
      const iconPath = cfg.icon ?? (damageType ? `systems/dnd5e/icons/svg/damage/${damageType}.svg` : "");
      this.damageParts.push({
        formula,
        damageType: damageType ?? "",
        damageTypeLabel: cfg.label ?? "",
        iconPath,
      });
    };

    // dnd5e 5.x activities — Collection or plain object.
    const actsRaw = spell.system?.activities;
    let acts = [];
    if (actsRaw) {
      try {
        acts = Array.from(actsRaw.values?.() ?? Object.values(actsRaw));
      } catch (e) {
        acts = [];
      }
    }
    // Actor-derived spellcasting DC. dnd5e 5.x stores it under
    // `actor.system.abilities[<spellcasting ability>].dc`; the legacy 4.x
    // `attributes.spelldc` is read as a fallback for older actor data.
    const spellcastingAb = actor.system?.attributes?.spellcasting;
    const actorSpellDc =
      (spellcastingAb && actor.system?.abilities?.[spellcastingAb]?.dc) ?? actor.system?.attributes?.spelldc ?? null;

    for (const a of acts) {
      // ROLL column.
      if (!this.saveAbility && !this.attackLabel) {
        const saveAb = a?.save?.ability;
        const ability = saveAb instanceof Set ? Array.from(saveAb)[0] : Array.isArray(saveAb) ? saveAb[0] : saveAb;
        if (ability) {
          const calc = a.save?.dc?.calculation;
          let dc;
          if (flatDc) {
            dc = flatDc;
          } else if (calc === "spellcasting") {
            // The activity's stored dc.value is meaningless on a compendium-
            // loaded spell (ships as the base 8). Recompute from the actor.
            dc = actorSpellDc ?? a.save?.dc?.value;
          } else if (calc && actor.system?.abilities?.[calc]) {
            dc = actor.system.abilities[calc].dc;
          } else {
            dc = a.save?.dc?.value;
          }
          this.saveAbility = String(ability).toLowerCase();
          this.saveDc = dc ?? "";
        } else if (a?.type === "attack" && a?.labels?.toHit) {
          this.attackLabel = a.labels.toHit;
        }
      }
      // FORMULA column — collect every part once.
      if (!this.damageParts.length) {
        if (Array.isArray(a?.labels?.damage) && a.labels.damage.length) {
          for (const p of a.labels.damage) pushPart(p.formula || p.label, p.damageType);
        } else if (Array.isArray(a?.damage?.parts) && a.damage.parts.length) {
          for (const p of a.damage.parts) {
            const types = p?.types ? (p.types instanceof Set ? Array.from(p.types) : Array.from(p.types ?? [])) : [];
            pushPart(p.formula || p.bonus, types[0]);
          }
        }
      }
    }

    // Legacy dnd5e (pre-activities) fallback.
    if (!this.saveAbility && !this.attackLabel) {
      const save = spell.system?.save;
      if (save?.ability) {
        let dc = flatDc ?? save.dc;
        if (!dc) {
          if (save.scaling === "spell" || !save.scaling) dc = actorSpellDc;
          else if (save.scaling !== "flat") dc = actor.system?.abilities?.[save.scaling]?.dc;
        }
        this.saveAbility = String(save.ability).toLowerCase();
        this.saveDc = dc ?? "";
      }
    }
    if (!this.damageParts.length) {
      const parts = spell.system?.damage?.parts;
      if (Array.isArray(parts) && parts.length) {
        for (const p of parts) {
          const formula = Array.isArray(p) ? p[0] : (p?.formula ?? p?.[0]);
          const type = Array.isArray(p) ? p[1] : p?.type;
          pushPart(formula, type);
        }
      }
    }
  }

  get levels() {
    let levels = {};
    for (let i = this.baseLevel; i <= 9; i++) {
      levels[i] = game.i18n.localize(`MAGICITEMS.SheetSpellLevel${i}`);
      if (i === 0) {
        break;
      }
    }
    return levels;
  }

  get upcasts() {
    let upcasts = {};
    for (let i = this.level; i <= 9; i++) {
      upcasts[i] = game.i18n.localize(`MAGICITEMS.SheetSpellUpcast${i}`);
      if (i === 0) {
        break;
      }
    }
    return upcasts;
  }

  get allowedLevels() {
    let levels = {};
    for (let i = this.level; i <= Math.min(this.upcast, 9); i++) {
      levels[i] = game.i18n.localize(`MAGICITEMS.SheetSpellLevel${i}`);
      if (i === 0) {
        break;
      }
    }
    return levels;
  }

  canUpcast() {
    return this.level < this.upcast;
  }

  canUpcastLabel() {
    return this.canUpcast()
      ? game.i18n.localize(`MAGICITEMS.SheetCanUpcastYes`)
      : game.i18n.localize(`MAGICITEMS.SheetCanUpcastNo`);
  }

  consumptionAt(level) {
    return this.consumption + this.upcastCost * (level - this.level);
  }

  serializeData() {
    return {
      baseLevel: this.baseLevel,
      consumption: this.consumption,
      uuid: this.uuid,
      id: this.id,
      img: this.img,
      level: this.level,
      name: this.name,
      pack: this.pack,
      upcast: this.upcast,
      upcastCost: this.upcastCost,
      flatDc: this.flatDc,
      dc: this.dc,
      uses: this.uses,
      componentsVSM: this.componentsVSM,
      componentsALL: this.componentsALL,
    };
  }
}
