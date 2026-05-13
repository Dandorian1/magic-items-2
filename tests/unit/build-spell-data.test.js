import { describe, it, expect } from "vitest";
import { __test__ } from "../../src/scripts/magic-item-owned-entry/OwnedMagicItemSpell.js";

const { buildSpellData, iterActivities } = __test__;

function makeSource({ level = 1, activities = null, save = null, damage = null, actionType = null } = {}) {
  return {
    toObject: () => ({
      _id: "src-id",
      name: "Source Spell",
      type: "spell",
      img: "icons/svg/test.svg",
      system: {
        level,
        ...(activities ? { activities } : {}),
        ...(save ? { save } : {}),
        ...(damage ? { damage } : {}),
        ...(actionType ? { actionType } : {}),
      },
    }),
  };
}

function makeMagicItemStub() {
  return { id: "mi-1", actor: { system: { attributes: { prof: 4 } } } };
}

describe("buildSpellData D1 — cantrip no-scaling", () => {
  // D1: for level=0 spells with scaleSpellDamage setting off, the patch must
  // zero each damage activity's `damage.parts[*].scaling.mode = ""`.

  it("zeroes scaling.mode on each damage part for cantrips", () => {
    globalThis.game.settings.set("magicitems", "scaleSpellDamage", false);
    const source = makeSource({
      level: 0,
      activities: {
        a1: {
          type: "damage",
          damage: {
            parts: [
              { number: 1, denomination: 10, scaling: { mode: "whole", number: 1 } },
              { number: 1, denomination: 8, scaling: { mode: "whole", number: 1 } },
            ],
          },
        },
      },
    });
    const data = buildSpellData(source, { name: "Fire Bolt", uuid: "u1" }, makeMagicItemStub());
    const acts = Array.from(iterActivities(data.system));
    expect(acts[0].damage.parts[0].scaling.mode).toBe("");
    expect(acts[0].damage.parts[1].scaling.mode).toBe("");
  });

  it("leaves scaling.mode alone for non-cantrip spells (level > 0)", () => {
    globalThis.game.settings.set("magicitems", "scaleSpellDamage", false);
    const source = makeSource({
      level: 1,
      activities: {
        a1: {
          type: "damage",
          damage: { parts: [{ number: 1, denomination: 8, scaling: { mode: "whole", number: 1 } }] },
        },
      },
    });
    const data = buildSpellData(source, { name: "Cure Wounds", uuid: "u2" }, makeMagicItemStub());
    const acts = Array.from(iterActivities(data.system));
    expect(acts[0].damage.parts[0].scaling.mode).toBe("whole");
  });

  it("leaves scaling.mode alone when scaleSpellDamage setting is on", () => {
    globalThis.game.settings.set("magicitems", "scaleSpellDamage", true);
    const source = makeSource({
      level: 0,
      activities: {
        a1: {
          type: "damage",
          damage: { parts: [{ number: 1, denomination: 10, scaling: { mode: "whole", number: 1 } }] },
        },
      },
    });
    const data = buildSpellData(source, { name: "Fire Bolt", uuid: "u1" }, makeMagicItemStub());
    const acts = Array.from(iterActivities(data.system));
    expect(acts[0].damage.parts[0].scaling.mode).toBe("whole");
  });
});

describe("buildSpellData D2 — flat DC override", () => {
  // D2: when entry.flatDc is true, the patch must set
  // `activity.save.dc = {calculation: "", formula: String(entry.dc)}` on each
  // save activity, AND patch the legacy `system.save.{scaling, dc}` fallback.

  it("writes calculation='' + formula on activity-level save", () => {
    const source = makeSource({
      level: 1,
      activities: {
        a1: { type: "save", save: { dc: { calculation: "spellcasting" }, ability: ["wis"] } },
      },
    });
    const data = buildSpellData(source, { flatDc: true, dc: 15, name: "Bane", uuid: "u3" }, makeMagicItemStub());
    const acts = Array.from(iterActivities(data.system));
    expect(acts[0].save.dc.calculation).toBe("");
    expect(acts[0].save.dc.formula).toBe("15");
  });

  it("preserves legacy system.save.dc fallback on pre-5.x spells", () => {
    const source = makeSource({
      level: 1,
      save: { ability: "wis", dc: 0, scaling: "spell" },
    });
    const data = buildSpellData(source, { flatDc: true, dc: 18, name: "Bane", uuid: "u4" }, makeMagicItemStub());
    expect(data.system.save.dc).toBe(18);
    expect(data.system.save.scaling).toBe("flat");
  });

  it("does not write flat-DC fields when entry.flatDc is false", () => {
    const source = makeSource({
      level: 1,
      activities: {
        a1: { type: "save", save: { dc: { calculation: "spellcasting", formula: "" }, ability: ["wis"] } },
      },
    });
    const data = buildSpellData(source, { flatDc: false, name: "Bane", uuid: "u5" }, makeMagicItemStub());
    const acts = Array.from(iterActivities(data.system));
    expect(acts[0].save.dc.calculation).toBe("spellcasting");
  });
});

describe("buildSpellData D3 — custom attack bonus", () => {
  // D3: when entry.atkBonus or entry.checkAtkBonus is set, the patch must
  // append the bonus to each attack activity's `attack.bonus` FormulaField.

  it("appends explicit entry.atkBonus to activity attack.bonus", () => {
    const source = makeSource({
      level: 1,
      activities: {
        a1: { type: "attack", attack: { bonus: "" } },
      },
    });
    const data = buildSpellData(
      source,
      { checkAtkBonus: true, atkBonus: "3", name: "Magic Missile", uuid: "u6" },
      makeMagicItemStub(),
    );
    const acts = Array.from(iterActivities(data.system));
    expect(acts[0].attack.bonus).toBe("3");
  });

  it("falls back to actor's proficiency bonus when checkAtkBonus is false", () => {
    const source = makeSource({
      level: 1,
      activities: { a1: { type: "attack", attack: { bonus: "" } } },
    });
    const data = buildSpellData(
      source,
      { checkAtkBonus: false, atkBonus: "ignored", name: "X", uuid: "u7" },
      makeMagicItemStub(),
    );
    const acts = Array.from(iterActivities(data.system));
    expect(acts[0].attack.bonus).toBe("4"); // makeMagicItemStub: prof = 4
  });

  it("concatenates onto existing attack.bonus instead of replacing", () => {
    const source = makeSource({
      level: 1,
      activities: { a1: { type: "attack", attack: { bonus: "1d4" } } },
    });
    const data = buildSpellData(
      source,
      { checkAtkBonus: true, atkBonus: "2", name: "X", uuid: "u8" },
      makeMagicItemStub(),
    );
    const acts = Array.from(iterActivities(data.system));
    expect(acts[0].attack.bonus).toBe("1d4 + 2");
  });

  it("patches legacy system.attack.bonus on pre-5.x rsak spells", () => {
    const source = makeSource({
      level: 1,
      actionType: "rsak",
    });
    const data = buildSpellData(
      source,
      { checkAtkBonus: true, atkBonus: "2", name: "X", uuid: "u9" },
      makeMagicItemStub(),
    );
    expect(data.system.attack?.bonus).toBe("2");
  });
});

describe("buildSpellData — transient flag + magicitems mode", () => {
  it("stamps the transient flag with magicItemId, spellName, and createdAt", () => {
    const source = makeSource({ level: 1 });
    const before = Date.now();
    const data = buildSpellData(
      source,
      { name: "Cure Wounds", uuid: "u-c" },
      { id: "mi-1", actor: { system: { attributes: { prof: 4 } } } },
    );
    const flag = data.flags?.magicitems?.transient;
    expect(flag).toBeDefined();
    expect(flag.magicItemId).toBe("mi-1");
    expect(flag.spellName).toBe("Cure Wounds");
    expect(flag.createdAt).toBeGreaterThanOrEqual(before);
  });

  it("sets system.preparation.mode to 'magicitems'", () => {
    const source = makeSource({ level: 1 });
    const data = buildSpellData(source, { name: "X", uuid: "u" }, makeMagicItemStub());
    expect(data.system.preparation.mode).toBe("magicitems");
  });

  it("strips _id so createEmbeddedDocuments assigns a fresh one", () => {
    const source = makeSource({ level: 1 });
    const data = buildSpellData(source, { name: "X", uuid: "u" }, makeMagicItemStub());
    expect(data._id).toBeUndefined();
  });
});

describe("iterActivities helper", () => {
  it("iterates object-shaped activities", () => {
    const acts = Array.from(iterActivities({ activities: { a1: { type: "save" }, a2: { type: "attack" } } }));
    expect(acts.length).toBe(2);
  });

  it("iterates array-shaped activities", () => {
    const acts = Array.from(iterActivities({ activities: [{ type: "save" }, { type: "damage" }] }));
    expect(acts.length).toBe(2);
  });

  it("iterates Collection-shaped activities (has .values())", () => {
    const collection = {
      values() {
        return [{ type: "save" }, { type: "damage" }, { type: "attack" }][Symbol.iterator]();
      },
    };
    const acts = Array.from(iterActivities({ activities: collection }));
    expect(acts.length).toBe(3);
  });

  it("yields nothing for missing activities", () => {
    expect(Array.from(iterActivities({}))).toEqual([]);
    expect(Array.from(iterActivities({ activities: null }))).toEqual([]);
  });
});
