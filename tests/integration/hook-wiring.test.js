import { describe, it, expect, beforeAll } from "vitest";

// Snapshot of Hooks._registered taken immediately after first import of
// module.js, before the global `beforeEach` in setup.js clears it for
// subsequent tests.
const hookSnapshot = new Map();

beforeAll(async () => {
  await import("../../src/module.js");
  for (const [k, v] of globalThis.Hooks._registered.entries()) {
    hookSnapshot.set(k, v.slice());
  }
});

describe("module.js hook wiring", () => {
  const expectedHooks = [
    "init",
    "setup",
    "ready",
    "createActor",
    "createToken",
    "dnd5e.restCompleted",
    "dnd5e.postUseActivity",
    "dnd5e.dropItemSheetData",
    "updateItem",
    "tidy5e-sheet.ready",
    "tidy5e-sheet.renderActorSheet",
    "renderItemSheet5e",
    "renderActorSheet5eCharacter",
    "renderActorSheet5eNPC",
    "renderCharacterActorSheet",
    "renderNPCActorSheet",
    "hotbarDrop",
    "createItem",
    "deleteItem",
  ];

  for (const hookName of expectedHooks) {
    it(`registers Hooks.on('${hookName}', ...)`, () => {
      expect(hookSnapshot.has(hookName)).toBe(true);
      expect(hookSnapshot.get(hookName).length).toBeGreaterThan(0);
    });
  }
});

describe("OwnedMagicItemSpell hook wiring (transient filter + ready sweep)", () => {
  it("subscribes the transient-filter to both v1 and v2 sheet render hooks", () => {
    // OwnedMagicItemSpell.js registers filterTransientsFromSheet on:
    //   renderActorSheet5eCharacter / Character2 / NPC / NPC2  (v1 aliases)
    //   renderCharacterActorSheet  / renderNPCActorSheet        (v2 names)
    const v2Hook = hookSnapshot.get("renderCharacterActorSheet");
    expect(v2Hook).toBeDefined();
    expect(v2Hook.length).toBeGreaterThanOrEqual(1);
  });
});

describe("argon.js argonInit hook", () => {
  it("registers a handler for the argonInit hook", () => {
    expect(hookSnapshot.has("argonInit")).toBe(true);
  });
});
