import { describe, it, expect } from "vitest";
import { __test__ } from "../../src/scripts/magic-item-owned-entry/OwnedMagicItemSpell.js";

const { iterActivities } = __test__;

/**
 * C7 — Activity-aware effect application.
 *
 * The guard is in OwnedMagicItemSpell.roll() but the decision logic boils
 * down to a one-liner over iterActivities. Test the predicate directly
 * (cheaper than mocking the full cast workflow); the integration test
 * exercises the end-to-end behaviour.
 */
function hasActivityEffects(spell) {
  return Array.from(iterActivities(spell.system)).some((a) => Array.isArray(a?.effects) && a.effects.length > 0);
}

describe("C7 — activity-effects predicate", () => {
  it("returns false for a spell with no activities", () => {
    const spell = { system: {} };
    expect(hasActivityEffects(spell)).toBe(false);
  });

  it("returns false for activities with no effects field", () => {
    const spell = { system: { activities: { a1: { type: "save" } } } };
    expect(hasActivityEffects(spell)).toBe(false);
  });

  it("returns false for activities with empty effects[]", () => {
    const spell = { system: { activities: { a1: { type: "save", effects: [] } } } };
    expect(hasActivityEffects(spell)).toBe(false);
  });

  it("returns true when any activity has a non-empty effects[]", () => {
    const spell = {
      system: {
        activities: {
          a1: { type: "damage", effects: [] },
          a2: { type: "save", effects: [{ _id: "e1", name: "Bane" }] },
        },
      },
    };
    expect(hasActivityEffects(spell)).toBe(true);
  });

  it("returns true when the first activity has effects", () => {
    const spell = {
      system: {
        activities: {
          a1: { type: "save", effects: [{ _id: "e1" }] },
          a2: { type: "damage" },
        },
      },
    };
    expect(hasActivityEffects(spell)).toBe(true);
  });
});
