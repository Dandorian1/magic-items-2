import { describe, it, expect } from "vitest";
import { MagicItemActor } from "../../src/scripts/magicitemactor.js";
import { makeActor } from "../helpers/factories.js";

describe("MagicItemActor A1 — WeakMap storage", () => {
  it("bind(actor) then get(actorId) returns a MIA", () => {
    const erlen = makeActor({ id: "erlen", name: "Erlen" });
    MagicItemActor.bind(erlen);
    const mia = MagicItemActor.get("erlen");
    expect(mia).toBeDefined();
    expect(mia.id).toBe("erlen");
  });

  it("bind(actor) then getForActor(actor) returns the same instance as get(actorId)", () => {
    const erlen = makeActor({ id: "erlen", name: "Erlen" });
    MagicItemActor.bind(erlen);
    const viaId = MagicItemActor.get("erlen");
    const viaActor = MagicItemActor.getForActor(erlen);
    expect(viaActor).toBe(viaId);
  });

  it("get() returns undefined for an unknown actor id", () => {
    expect(MagicItemActor.get("ghost")).toBeUndefined();
  });

  it("getForActor() returns undefined when called with no actor", () => {
    expect(MagicItemActor.getForActor(undefined)).toBeUndefined();
    expect(MagicItemActor.getForActor(null)).toBeUndefined();
  });

  it("re-bind replaces the MIA instance for the same actor doc", () => {
    const erlen = makeActor({ id: "erlen", name: "Erlen" });
    MagicItemActor.bind(erlen);
    const mia1 = MagicItemActor.get("erlen");
    MagicItemActor.bind(erlen);
    const mia2 = MagicItemActor.get("erlen");
    expect(mia1).not.toBe(mia2);
    expect(MagicItemActor.getForActor(erlen)).toBe(mia2);
  });

  it("synthetic/unlinked token actor (not in game.actors) is findable by id via side-Map", () => {
    // Build an actor without registering in game.actors — simulates an
    // unlinked token actor with its own synthetic id.
    const synth = makeActor({ id: "synth-1", name: "Synthetic", registerInGameActors: false });
    MagicItemActor.bind(synth);
    const mia = MagicItemActor.get("synth-1");
    expect(mia).toBeDefined();
  });

  it("bind(undefined) is a no-op", () => {
    expect(() => MagicItemActor.bind(undefined)).not.toThrow();
  });
});

describe("MagicItemActor.buildItems", () => {
  it("filters items by flags.magicitems.enabled", async () => {
    const enabled = {
      id: "i1",
      name: "Staff",
      flags: { magicitems: { enabled: true, spells: {}, feats: {}, tables: {}, charges: 10, uses: 10 } },
      system: {},
    };
    const disabled = {
      id: "i2",
      name: "Wand",
      flags: { magicitems: { enabled: false } },
      system: {},
    };
    const noFlag = { id: "i3", name: "Plain", flags: {}, system: {} };
    const erlen = makeActor({ id: "e", name: "Erlen", items: [enabled, disabled, noFlag] });
    MagicItemActor.bind(erlen);
    const mia = MagicItemActor.get("e");
    await mia.buildItems();
    expect(mia.items.length).toBe(1);
    expect(mia.items[0].name).toBe("Staff");
  });

  it("fires onChange listeners after buildItems", async () => {
    const erlen = makeActor({ id: "e", name: "Erlen" });
    MagicItemActor.bind(erlen);
    const mia = MagicItemActor.get("e");
    let calls = 0;
    mia.onChange(() => {
      calls += 1;
    });
    await mia.buildItems();
    // Wait a tick for the async listeners forEach
    await Promise.resolve();
    expect(calls).toBeGreaterThanOrEqual(1);
  });
});
