import { describe, it, expect, vi } from "vitest";
import { __test__ } from "../../src/scripts/magic-item-owned-entry/OwnedMagicItemSpell.js";

const { scheduleTransientCleanup, safeDeleteTransient } = __test__;

describe("scheduleTransientCleanup", () => {
  // The transient lifecycle: cleanup is wired to dnd5e.postUseActivity AND
  // midi-qol.RollComplete; whichever fires first deletes the embedded
  // transient. A 30s timeout safety-net catches stalled workflows.

  it("registers BOTH dnd5e.postUseActivity AND midi-qol.RollComplete listeners", () => {
    const actor = { id: "a1", items: { has: () => true, get: () => null } };
    const transient = {
      id: "t1",
      system: { activities: { a1: { uuid: "Activity.a1" } } },
    };
    scheduleTransientCleanup(actor, transient);
    expect(globalThis.Hooks._registered.has("dnd5e.postUseActivity")).toBe(true);
    expect(globalThis.Hooks._registered.has("midi-qol.RollComplete")).toBe(true);
  });

  it("ignores postUseActivity events whose activity uuid doesn't match the transient", () => {
    const items = new Map([["t1", { id: "t1" }]]);
    globalThis.game.actors.set("a1", {
      id: "a1",
      items: {
        has: (id) => items.has(id),
        get: (id) => items.get(id),
      },
      deleteEmbeddedDocuments: vi.fn(async (type, ids) => {
        for (const id of ids) items.delete(id);
      }),
    });
    const transient = { id: "t1", system: { activities: { a1: { uuid: "Activity.match" } } } };
    scheduleTransientCleanup({ id: "a1" }, transient);

    // Wrong UUID — should NOT delete.
    globalThis.Hooks.callAll("dnd5e.postUseActivity", { uuid: "Activity.other" });
    expect(items.has("t1")).toBe(true);
  });
});

describe("safeDeleteTransient", () => {
  it("swallows missing-actor / missing-id arguments", async () => {
    await expect(safeDeleteTransient(null, "x")).resolves.toBeUndefined();
    await expect(safeDeleteTransient({}, null)).resolves.toBeUndefined();
  });

  it("no-ops when the actor doesn't have the item", async () => {
    const actor = {
      items: { has: () => false },
      deleteEmbeddedDocuments: vi.fn(),
    };
    await safeDeleteTransient(actor, "ghost");
    expect(actor.deleteEmbeddedDocuments).not.toHaveBeenCalled();
  });

  it("calls deleteEmbeddedDocuments when the item is present", async () => {
    const actor = {
      items: { has: (id) => id === "t1" },
      deleteEmbeddedDocuments: vi.fn(async () => []),
    };
    await safeDeleteTransient(actor, "t1");
    expect(actor.deleteEmbeddedDocuments).toHaveBeenCalledWith("Item", ["t1"]);
  });

  it("swallows errors from deleteEmbeddedDocuments (race-safe under double cleanup)", async () => {
    const actor = {
      items: { has: () => true },
      deleteEmbeddedDocuments: vi.fn(async () => {
        throw new Error("already deleted");
      }),
    };
    await expect(safeDeleteTransient(actor, "t1")).resolves.toBeUndefined();
  });
});
