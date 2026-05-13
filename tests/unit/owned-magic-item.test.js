import { describe, it, expect } from "vitest";
import { OwnedMagicItem } from "../../src/scripts/magic-item/OwnedMagicItem.js";
import { makeActor, makeMagicItem } from "../helpers/factories.js";

function makeOMI({ uses = 5, charges = 10, systemUses = null } = {}) {
  const actor = makeActor({ name: "Erlen" });
  const item = makeMagicItem({ name: "Staff", uses, charges });
  if (systemUses === null) {
    delete item.system.uses;
  } else {
    item.system.uses = systemUses;
  }
  const flagsData = item.flags.magicitems;
  return new OwnedMagicItem(item, actor, { suspendListening() {}, resumeListening() {} }, flagsData);
}

describe("OwnedMagicItem.consume (B5)", () => {
  // B5 regression: prior code did `!this.item.system.uses.autoDestroy` without
  // optional-chaining. When `system.uses` was absent (e.g. feat-typed magic
  // items), this threw TypeError. Fix uses `system.uses?.autoDestroy`.
  it("does not throw when item.system.uses is undefined", async () => {
    const omi = makeOMI({ uses: 5, systemUses: null });
    await expect(omi.consume(1)).resolves.not.toThrow;
    expect(omi.uses).toBe(4);
  });

  it("does not throw when item.system.uses exists but is empty", async () => {
    const omi = makeOMI({ uses: 5, systemUses: {} });
    await expect(omi.consume(1)).resolves.not.toThrow;
    expect(omi.uses).toBe(4);
  });

  it("decrements uses by the consumption amount in the simple branch", async () => {
    const omi = makeOMI({ uses: 10 });
    await omi.consume(3);
    expect(omi.uses).toBe(7);
  });

  it("clamps uses to 0 (no negative)", async () => {
    const omi = makeOMI({ uses: 2 });
    await omi.consume(5);
    expect(omi.uses).toBe(0);
  });
});

describe("OwnedMagicItem.hasSystemUses / getSystemUsesValue", () => {
  it("hasSystemUses returns false when system.uses.max is empty", () => {
    const omi = makeOMI({ systemUses: { max: "", spent: 0 } });
    expect(omi.hasSystemUses()).toBe(false);
  });

  it("hasSystemUses returns true when system.uses.max is set", () => {
    const omi = makeOMI({ systemUses: { max: 10, spent: 0 } });
    expect(omi.hasSystemUses()).toBe(true);
  });

  it("getSystemUsesValue returns max - spent", () => {
    const omi = makeOMI({ systemUses: { max: 10, spent: 3 } });
    expect(omi.getSystemUsesValue()).toBe(7);
  });

  it("getSystemUsesValue prefers explicit value over max - spent", () => {
    const omi = makeOMI({ systemUses: { max: 10, spent: 3, value: 5 } });
    expect(omi.getSystemUsesValue()).toBe(5);
  });
});

describe("OwnedMagicItem visibility + active", () => {
  it("visible = true when identifiedOnly is off", () => {
    globalThis.game.settings.set("magicitems", "identifiedOnly", false);
    const omi = makeOMI();
    expect(omi.visible).toBe(true);
  });
});
