import { describe, it, expect } from "vitest";
import { MagicItemHelpers } from "../../src/scripts/magic-item-helpers.js";

describe("MagicItemHelpers.createSummoningOptions (B6)", () => {
  // B6 regression: Set.reduce isn't standard JS; the prior code threw on
  // multi-size / multi-type summoning. Fix wraps in Array.from() first.
  function fakeItem({ sizes, types, profileLevel = 5 } = {}) {
    return {
      system: {
        summons: {
          profiles: [{ _id: "p1", uuid: "Compendium.test.actors.Actor.x1", level: { min: 0, max: 20 } }],
          mode: "cr",
          relevantLevel: profileLevel,
          creatureSizes: new Set(sizes ?? []),
          creatureTypes: new Set(types ?? []),
          getProfileLabel: () => "1 × Test",
        },
      },
      getRollData: () => ({}),
    };
  }

  it("does not throw on multi-size Sets (pre-fix would have)", () => {
    expect(() => MagicItemHelpers.createSummoningOptions(fakeItem({ sizes: ["tiny", "sm", "med"] }))).not.toThrow();
  });

  it("converts creatureSizes Set into a label-keyed object", () => {
    const out = MagicItemHelpers.createSummoningOptions(fakeItem({ sizes: ["tiny", "sm"] }));
    expect(out.creatureSizes).toBeDefined();
    expect(Object.keys(out.creatureSizes).sort()).toEqual(["sm", "tiny"]);
    expect(out.creatureSizes.tiny).toBe("Tiny");
  });

  it("converts creatureTypes Set into a label-keyed object", () => {
    const out = MagicItemHelpers.createSummoningOptions(fakeItem({ types: ["beast", "humanoid"] }));
    expect(out.creatureTypes).toBeDefined();
    expect(Object.keys(out.creatureTypes).sort()).toEqual(["beast", "humanoid"]);
  });

  it("returns null when there are no profiles", () => {
    const out = MagicItemHelpers.createSummoningOptions({
      system: { summons: { profiles: [] } },
      getRollData: () => ({}),
    });
    expect(out).toBeNull();
  });
});

describe("MagicItemHelpers.rollDestroyCheck (C6)", () => {
  // C6 helper extracted from OwnedMagicItem.destroyed() and
  // AbstractOwnedMagicItemEntry.destroyed() — single source for the d20
  // destroy check.

  it("returns true on d2 with natural 1", async () => {
    globalThis.Roll.__setRollResult(1);
    const r = await MagicItemHelpers.rollDestroyCheck({
      name: "Staff",
      actor: { name: "Erlen" },
      destroyCheck: "d2",
    });
    expect(r).toBe(true);
  });

  it("returns false on d2 with non-1", async () => {
    globalThis.Roll.__setRollResult(15);
    const r = await MagicItemHelpers.rollDestroyCheck({
      name: "Staff",
      actor: { name: "Erlen" },
      destroyCheck: "d2",
    });
    expect(r).toBe(false);
  });

  it("returns true on d3 when roll <= destroyDC", async () => {
    globalThis.Roll.__setRollResult(5);
    const r = await MagicItemHelpers.rollDestroyCheck({
      name: "Staff",
      actor: { name: "Erlen" },
      destroyCheck: "d3",
      destroyDC: 10,
    });
    expect(r).toBe(true);
  });

  it("returns false on d3 when roll > destroyDC", async () => {
    globalThis.Roll.__setRollResult(15);
    const r = await MagicItemHelpers.rollDestroyCheck({
      name: "Staff",
      actor: { name: "Erlen" },
      destroyCheck: "d3",
      destroyDC: 10,
    });
    expect(r).toBe(false);
  });

  it("returns true (auto-destroy) when destroyCheck is anything else", async () => {
    const r = await MagicItemHelpers.rollDestroyCheck({
      name: "Staff",
      actor: { name: "Erlen" },
      destroyCheck: "d1",
    });
    expect(r).toBe(true);
  });
});

describe("MagicItemHelpers.isMidiItemEffectWorkflowOn", () => {
  it("is falsy when midi-qol is not active", () => {
    globalThis.game.modules = new Map();
    expect(MagicItemHelpers.isMidiItemEffectWorkflowOn()).toBeFalsy();
  });

  it("is truthy when midi-qol is active with autoItemEffects != 'off'", () => {
    globalThis.game.modules = new Map([["midi-qol", { active: true }]]);
    globalThis.game.settings.set("midi-qol", "ConfigSettings", { autoItemEffects: "always" });
    expect(MagicItemHelpers.isMidiItemEffectWorkflowOn()).toBeTruthy();
  });

  it("is falsy when midi-qol is active but autoItemEffects = 'off'", () => {
    globalThis.game.modules = new Map([["midi-qol", { active: true }]]);
    globalThis.game.settings.set("midi-qol", "ConfigSettings", { autoItemEffects: "off" });
    expect(MagicItemHelpers.isMidiItemEffectWorkflowOn()).toBeFalsy();
  });
});

describe("MagicItemHelpers.isLevelScalingSettingOn", () => {
  it("reads the scaleSpellDamage world setting", () => {
    globalThis.game.settings.set("magicitems", "scaleSpellDamage", true);
    expect(MagicItemHelpers.isLevelScalingSettingOn()).toBe(true);
    globalThis.game.settings.set("magicitems", "scaleSpellDamage", false);
    expect(MagicItemHelpers.isLevelScalingSettingOn()).toBe(false);
  });
});

describe("MagicItemHelpers.sortByLevel", () => {
  it("sorts by level then by displayName", () => {
    const items = [
      { level: 3, displayName: "Fireball" },
      { level: 1, displayName: "Cure Wounds" },
      { level: 1, displayName: "Bane" },
      { level: 2, displayName: "Lesser Restoration" },
    ];
    items.sort(MagicItemHelpers.sortByLevel);
    expect(items.map((i) => i.displayName)).toEqual(["Bane", "Cure Wounds", "Lesser Restoration", "Fireball"]);
  });
});
