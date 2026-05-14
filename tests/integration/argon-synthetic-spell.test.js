import { describe, it, expect } from "vitest";
import { __test__ } from "../../src/scripts/integrations/argon.js";

const { getSyntheticFlag, invalidateSourceUuid } = __test__;

describe("argon getSyntheticFlag", () => {
  it("returns null on a button with no item", () => {
    expect(getSyntheticFlag({})).toBeNull();
  });

  it("returns null on a button with a non-synthetic item", () => {
    const btn = { item: { flags: {} } };
    expect(getSyntheticFlag(btn)).toBeNull();
  });

  it("reads the syntheticSpell flag off button.item.flags", () => {
    const btn = {
      item: {
        flags: { magicitems: { syntheticSpell: { magicItemName: "Staff", spellName: "Cure Wounds" } } },
      },
    };
    expect(getSyntheticFlag(btn)).toEqual({ magicItemName: "Staff", spellName: "Cure Wounds" });
  });

  it("reads off button._item if button.item is absent", () => {
    const btn = {
      _item: {
        flags: { magicitems: { syntheticSpell: { magicItemName: "Staff", spellName: "Cure Wounds" } } },
      },
    };
    expect(getSyntheticFlag(btn)).toEqual({ magicItemName: "Staff", spellName: "Cure Wounds" });
  });

  it("reads off button._item.item nested location", () => {
    const btn = {
      _item: {
        item: {
          flags: { magicitems: { syntheticSpell: { magicItemName: "Staff", spellName: "Fire Bolt" } } },
        },
      },
    };
    expect(getSyntheticFlag(btn)).toEqual({ magicItemName: "Staff", spellName: "Fire Bolt" });
  });

  it("supports getFlag() document method as fallback", () => {
    const btn = {
      item: {
        flags: {},
        getFlag: (mod, key) =>
          mod === "magicitems" && key === "syntheticSpell" ? { magicItemName: "X", spellName: "Y" } : undefined,
      },
    };
    expect(getSyntheticFlag(btn)).toEqual({ magicItemName: "X", spellName: "Y" });
  });
});

describe("argon invalidateSourceUuid", () => {
  it("is a no-op on missing uuid", () => {
    expect(() => invalidateSourceUuid()).not.toThrow();
    expect(() => invalidateSourceUuid(null)).not.toThrow();
  });
  it("is idempotent (calling twice doesn't throw)", () => {
    invalidateSourceUuid("Compendium.foo.bar.Item.X");
    expect(() => invalidateSourceUuid("Compendium.foo.bar.Item.X")).not.toThrow();
  });
});
