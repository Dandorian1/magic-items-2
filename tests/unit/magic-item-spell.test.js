import { describe, it, expect } from "vitest";
import { MagicItemSpell } from "../../src/scripts/magic-item-entry/MagicItemSpell.js";
import { makeActor } from "../helpers/factories.js";

function fakeSpell({ activities = null, save = null, damage = null } = {}) {
  return {
    system: {
      activities,
      ...(save ? { save } : {}),
      ...(damage ? { damage } : {}),
    },
  };
}

describe("MagicItemSpell.prepareDisplay — activities schema (dnd5e 5.x)", () => {
  it("computes saveAbility + saveDc from activity-level save with calculation='spellcasting'", async () => {
    const actor = makeActor({ name: "Erlen" });
    actor.system.attributes.spellcasting = "wis";
    actor.system.abilities = { wis: { dc: 14, mod: 3 } };
    const spell = new MagicItemSpell({ name: "Bane", level: 1, baseLevel: 1, uuid: "u1" });
    spell.removed = false;
    spell.entity = async () =>
      fakeSpell({
        activities: {
          a1: { type: "save", save: { ability: ["wis"], dc: { calculation: "spellcasting", value: 8 } } },
        },
      });
    await spell.prepareDisplay(actor);
    expect(spell.saveAbility).toBe("wis");
    expect(spell.saveDc).toBe(14);
  });

  it("uses activity dc.value when calculation is an unknown key", async () => {
    const actor = makeActor({ name: "Erlen" });
    const spell = new MagicItemSpell({ name: "Bane", level: 1, baseLevel: 1, uuid: "u2" });
    spell.removed = false;
    spell.entity = async () =>
      fakeSpell({
        activities: {
          a1: { type: "save", save: { ability: ["wis"], dc: { calculation: "", value: 17 } } },
        },
      });
    await spell.prepareDisplay(actor);
    expect(spell.saveDc).toBe(17);
  });

  it("uses flat DC override when entry.flatDc is true", async () => {
    const actor = makeActor({ name: "Erlen" });
    const spell = new MagicItemSpell({ name: "Bane", level: 1, baseLevel: 1, uuid: "u3", flatDc: true, dc: 20 });
    spell.removed = false;
    spell.entity = async () =>
      fakeSpell({
        activities: {
          a1: { type: "save", save: { ability: ["wis"], dc: { calculation: "spellcasting", value: 8 } } },
        },
      });
    await spell.prepareDisplay(actor);
    expect(spell.saveDc).toBe(20);
  });

  it("computes attackLabel from activity.labels.toHit when no save activity present", async () => {
    const actor = makeActor({ name: "Erlen" });
    const spell = new MagicItemSpell({ name: "Fire Bolt", level: 0, baseLevel: 0, uuid: "u4" });
    spell.removed = false;
    spell.entity = async () =>
      fakeSpell({
        activities: { a1: { type: "attack", labels: { toHit: "+7" } } },
      });
    await spell.prepareDisplay(actor);
    expect(spell.attackLabel).toBe("+7");
  });

  it("populates damageParts from activity damage.parts", async () => {
    const actor = makeActor({ name: "Erlen" });
    const spell = new MagicItemSpell({ name: "Fire Bolt", level: 0, baseLevel: 0, uuid: "u5" });
    spell.removed = false;
    spell.entity = async () =>
      fakeSpell({
        activities: {
          a1: {
            type: "damage",
            damage: { parts: [{ formula: "1d10", types: new Set(["fire"]) }] },
          },
        },
      });
    await spell.prepareDisplay(actor);
    expect(spell.damageParts.length).toBe(1);
    expect(spell.damageParts[0].formula).toBe("1d10");
    expect(spell.damageParts[0].damageType).toBe("fire");
  });
});

describe("MagicItemSpell.prepareDisplay — legacy schema fallback", () => {
  it("falls back to system.save when no activities", async () => {
    const actor = makeActor({ name: "Erlen" });
    actor.system.attributes.spellcasting = "wis";
    actor.system.abilities = { wis: { dc: 14, mod: 3 } };
    const spell = new MagicItemSpell({ name: "Old Spell", level: 1, baseLevel: 1, uuid: "u6" });
    spell.removed = false;
    spell.entity = async () => fakeSpell({ save: { ability: "wis", dc: 14, scaling: "spell" } });
    await spell.prepareDisplay(actor);
    expect(spell.saveAbility).toBe("wis");
    expect(spell.saveDc).toBe(14);
  });

  it("falls back to system.damage.parts for damage display", async () => {
    const actor = makeActor({ name: "Erlen" });
    const spell = new MagicItemSpell({ name: "Old Spell", level: 1, baseLevel: 1, uuid: "u7" });
    spell.removed = false;
    spell.entity = async () => fakeSpell({ damage: { parts: [["1d8", "fire"]] } });
    await spell.prepareDisplay(actor);
    expect(spell.damageParts.length).toBe(1);
    expect(spell.damageParts[0].formula).toBe("1d8");
    expect(spell.damageParts[0].damageType).toBe("fire");
  });
});

describe("MagicItemSpell — constructor defaults + serialization", () => {
  it("constructor coerces level / consumption / upcast to integers with defaults", () => {
    const spell = new MagicItemSpell({});
    expect(spell.baseLevel).toBe(0);
    expect(spell.level).toBe(0);
    expect(spell.consumption).toBe(0);
  });

  it("canUpcast reflects level < upcast", () => {
    const spell = new MagicItemSpell({ baseLevel: 1, level: 1, upcast: 4 });
    expect(spell.canUpcast()).toBe(true);
    const noUpcast = new MagicItemSpell({ baseLevel: 1, level: 1, upcast: 1 });
    expect(noUpcast.canUpcast()).toBe(false);
  });

  it("consumptionAt scales consumption by level delta", () => {
    const spell = new MagicItemSpell({ baseLevel: 1, level: 1, consumption: 1, upcast: 4, upcastCost: 1 });
    expect(spell.consumptionAt(3)).toBe(3); // 1 + 1*(3-1) = 3
  });
});
