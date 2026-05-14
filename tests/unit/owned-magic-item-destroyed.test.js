import { describe, it, expect } from "vitest";
import { OwnedMagicItem } from "../../src/scripts/magic-item/OwnedMagicItem.js";
import { makeActor, makeMagicItem } from "../helpers/factories.js";

function makeOMI({ uses = 0, destroy = true, destroyCheck = "d1", destroyDC = 0 } = {}) {
  const actor = makeActor({ name: "Erlen" });
  const item = makeMagicItem({ name: "Staff", uses, charges: 10 });
  item.flags.magicitems.destroy = destroy;
  item.flags.magicitems.destroyCheck = destroyCheck;
  item.flags.magicitems.destroyDC = destroyDC;
  item.flags.magicitems.destroyFlavorText = "shatters";
  return new OwnedMagicItem(item, actor, { suspendListening() {}, resumeListening() {} }, item.flags.magicitems);
}

describe("OwnedMagicItem.destroyed (C6)", () => {
  it("returns false immediately when uses > 0", async () => {
    const omi = makeOMI({ uses: 5, destroy: true });
    expect(await omi.destroyed()).toBe(false);
  });

  it("returns false when destroy flag is off, even at 0 uses", async () => {
    const omi = makeOMI({ uses: 0, destroy: false });
    expect(await omi.destroyed()).toBe(false);
  });

  it("returns true on d2 with natural 1 roll", async () => {
    globalThis.Roll.__setRollResult(1);
    const omi = makeOMI({ uses: 0, destroy: true, destroyCheck: "d2" });
    expect(await omi.destroyed()).toBe(true);
  });

  it("returns false on d2 with roll > 1", async () => {
    globalThis.Roll.__setRollResult(7);
    const omi = makeOMI({ uses: 0, destroy: true, destroyCheck: "d2" });
    expect(await omi.destroyed()).toBe(false);
  });

  it("returns true on d3 when roll <= destroyDC", async () => {
    globalThis.Roll.__setRollResult(8);
    const omi = makeOMI({ uses: 0, destroy: true, destroyCheck: "d3", destroyDC: 10 });
    expect(await omi.destroyed()).toBe(true);
  });

  it("returns false on d3 when roll > destroyDC", async () => {
    globalThis.Roll.__setRollResult(15);
    const omi = makeOMI({ uses: 0, destroy: true, destroyCheck: "d3", destroyDC: 10 });
    expect(await omi.destroyed()).toBe(false);
  });

  it("returns true (auto-destroy) on d1 with no roll", async () => {
    const omi = makeOMI({ uses: 0, destroy: true, destroyCheck: "d1" });
    expect(await omi.destroyed()).toBe(true);
  });
});
