import { describe, it, expect, vi } from "vitest";
import { RetrieveHelpers } from "../../src/scripts/lib/retrieve-helpers.js";

describe("RetrieveHelpers.retrieveUuid (B2)", () => {
  it("uses documentPack === 'world' branch when collection lookup matches", () => {
    // B2 regression: prior to fix, `pack` (undefined) was compared to "world"
    // and the world-collection branch never fired. Force the branch by
    // providing documentCollectionType so the code enters the world block.
    const fakeDoc = { id: "i1", name: "Foo", uuid: "Item.i1" };
    globalThis.game.collections = {
      get: (type) => (type === "Item" ? { get: (id) => (id === "i1" ? fakeDoc : null), find: () => null } : null),
    };
    const out = RetrieveHelpers.retrieveUuid({
      documentName: "Foo",
      documentId: "i1",
      documentCollectionType: "Item",
      documentPack: "world",
    });
    expect(out).toBe("Item.i1");
  });

  it("falls back to compendium pack when world lookup misses", () => {
    globalThis.game.collections = { get: () => null };
    const packIndex = new Map([["x1", { _id: "x1", name: "Bar", uuid: "Compendium.foo.bar.Item.x1" }]]);
    globalThis.game.packs = {
      get: (id) => (id === "foo.bar" ? { index: packIndex } : null),
      getName: () => null,
    };
    vi.spyOn(RetrieveHelpers, "getCompendiumCollectionSync").mockImplementation((id) =>
      id === "foo.bar" ? { index: packIndex } : null,
    );
    const out = RetrieveHelpers.retrieveUuid({
      documentName: "Bar",
      documentId: "x1",
      documentPack: "foo.bar",
    });
    expect(out).toBe("Compendium.foo.bar.Item.x1");
  });
});

describe("RetrieveHelpers.stringIsUuid", () => {
  it("returns true for valid UUIDs that fromUuidSync resolves", () => {
    globalThis.fromUuidSync.mockReturnValueOnce({ uuid: "Item.abc" });
    expect(RetrieveHelpers.stringIsUuid("Item.abc")).toBe(true);
  });
  it("returns false for plain strings without dots", () => {
    expect(RetrieveHelpers.stringIsUuid("plain")).toBe(false);
  });
  it("returns false for strings ending with '.'", () => {
    expect(RetrieveHelpers.stringIsUuid("Item.")).toBe(false);
  });
});
