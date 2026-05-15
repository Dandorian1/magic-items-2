// Global Foundry mocks installed before any module-under-test is imported.
// Vitest's `setupFiles` config runs this once per worker before tests load.

import { vi, beforeEach } from "vitest";

// ---- Hooks recorder ---------------------------------------------------------
globalThis.Hooks = {
  _registered: new Map(),
  on(name, fn) {
    if (!this._registered.has(name)) this._registered.set(name, []);
    this._registered.get(name).push(fn);
    return this._registered.get(name).length - 1;
  },
  once(name, fn) {
    return this.on(name, fn);
  },
  off(name) {
    this._registered.delete(name);
  },
  callAll(name, ...args) {
    const fns = this._registered.get(name) || [];
    for (const fn of fns) fn(...args);
  },
  call(name, ...args) {
    return this.callAll(name, ...args);
  },
};

// ---- game -------------------------------------------------------------------
function makeActorsCollection() {
  const store = new Map();
  return {
    _store: store,
    get contents() {
      return Array.from(store.values());
    },
    get(id) {
      return store.get(id);
    },
    getName(name) {
      for (const a of store.values()) if (a.name === name) return a;
      return undefined;
    },
    set(id, actor) {
      store.set(id, actor);
    },
    clear() {
      store.clear();
    },
    [Symbol.iterator]() {
      return store.values();
    },
  };
}

function makeItemsCollection() {
  const store = new Map();
  return {
    _store: store,
    get(id) {
      return store.get(id);
    },
    getName(name) {
      for (const i of store.values()) if (i.name === name) return i;
      return undefined;
    },
    set(id, item) {
      store.set(id, item);
    },
    clear() {
      store.clear();
    },
  };
}

globalThis.game = {
  actors: makeActorsCollection(),
  items: makeItemsCollection(),
  user: { id: "gm", _id: "gm", isGM: true, name: "Gamemaster", character: null, targets: new Set() },
  users: { get: () => globalThis.game.user, contents: [] },
  settings: {
    _registered: new Map(),
    _values: new Map(),
    register(scope, key, opts) {
      this._registered.set(`${scope}:${key}`, opts);
      if (opts && "default" in opts) this._values.set(`${scope}:${key}`, opts.default);
    },
    get(scope, key) {
      const k = `${scope}:${key}`;
      return this._values.has(k) ? this._values.get(k) : this._registered.get(k)?.default;
    },
    set(scope, key, value) {
      this._values.set(`${scope}:${key}`, value);
      return Promise.resolve(value);
    },
    clear() {
      this._registered.clear();
      this._values.clear();
    },
  },
  i18n: {
    localize: (k) => k,
    format: (k) => k,
  },
  modules: new Map(),
  packs: { get: () => null, getName: () => null },
  combats: { active: null, contents: [] },
  collections: { get: () => null },
  babele: null,
  version: "13.351",
  system: { id: "dnd5e", version: "5.3.3" },
  world: { id: "test" },
};

// ---- CONFIG -----------------------------------------------------------------
class FakeItem5e {
  constructor(data, ctx = {}) {
    Object.assign(this, data);
    this.parent = ctx.parent ?? null;
    this.system = data.system ?? {};
    this.flags = data.flags ?? {};
    this.effects = {
      size: data.effects?.length ?? 0,
      toObject: () => data.effects ?? [],
    };
  }

  prepareFinalAttributes() {}

  async use() {
    return { id: `chat-${this._id}` };
  }
}

class FakeChatMessage5e {
  static getSpeaker(opts = {}) {
    return { alias: opts?.actor?.name, actor: opts?.actor?.id };
  }

  static create(data) {
    FakeChatMessage5e._creates.push(data);
    return Promise.resolve(data);
  }
}
FakeChatMessage5e._creates = [];

globalThis.CONFIG = {
  Item: { documentClass: FakeItem5e, collection: { instance: new Map() } },
  ChatMessage: { documentClass: FakeChatMessage5e },
  DND5E: {
    actorSizes: { tiny: { label: "Tiny" }, sm: { label: "Small" }, med: { label: "Medium" } },
    creatureTypes: { humanoid: { label: "Humanoid" }, beast: { label: "Beast" } },
    abilities: { str: "Strength", dex: "Dexterity", wis: "Wisdom", int: "Intelligence" },
    damageTypes: { fire: { label: "Fire", icon: "fire.svg" }, cold: { label: "Cold", icon: "cold.svg" } },
  },
};

// ---- foundry namespace ------------------------------------------------------
function getProp(obj, path) {
  if (!obj || !path) return undefined;
  return path.split(".").reduce((o, k) => o?.[k], obj);
}
function setProp(obj, path, value) {
  const keys = path.split(".");
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i += 1) {
    if (cur[keys[i]] === null || cur[keys[i]] === undefined || typeof cur[keys[i]] !== "object") cur[keys[i]] = {};
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
}
function mergeObject(target, source) {
  if (!source) return target;
  for (const [k, v] of Object.entries(source)) {
    if (k.includes(".")) {
      setProp(target, k, v);
    } else if (
      v !== null &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      typeof target[k] === "object" &&
      target[k] !== null
    ) {
      mergeObject(target[k], v);
    } else {
      target[k] = v;
    }
  }
  return target;
}

globalThis.foundry = {
  utils: {
    getProperty: getProp,
    setProperty: setProp,
    hasProperty: (obj, path) => getProp(obj, path) !== undefined,
    mergeObject,
    deepClone: (v) => (v === null || v === undefined ? v : JSON.parse(JSON.stringify(v))),
  },
  applications: {
    api: {
      DialogV2: {
        wait: vi.fn(() => Promise.resolve(null)),
        prompt: vi.fn(() => Promise.resolve(null)),
      },
    },
    handlebars: {
      // No `registerHelper` — that namespace lands in v14, not v13. Leaving it
      // out makes module.js exercise the global-Handlebars fallback v13 uses.
      renderTemplate: vi.fn(() => Promise.resolve("<div></div>")),
    },
    ux: {
      DragDrop: { implementation: class FakeDragDrop {} },
      TextEditor: { implementation: { getDragEventData: () => null } },
    },
    sheets: { ActorSheetV2: class FakeActorSheetV2 {} },
  },
  documents: { collections: { CompendiumCollection: class FakeCompendiumCollection {} } },
  appv1: { sheets: { ItemSheet: class FakeItemSheetV1 {} } },
};

// ---- Roll / ChatMessage globals --------------------------------------------
let _rollResult = 10;
globalThis.Roll = class FakeRoll {
  constructor(formula) {
    this.formula = formula;
  }

  async evaluate() {
    this.total = _rollResult;
    this.result = String(_rollResult);
    return this;
  }

  async toMessage(msg) {
    FakeRoll._messages.push({ ...msg, total: this.total });
    return msg;
  }

  static __setRollResult(n) {
    _rollResult = n;
  }

  static __reset() {
    _rollResult = 10;
    FakeRoll._messages = [];
  }
};
globalThis.Roll._messages = [];

globalThis.ChatMessage = FakeChatMessage5e;

// ---- Document classes -------------------------------------------------------
globalThis.Actor = class FakeActor {};
globalThis.Item = FakeItem5e;
globalThis.Journal = class FakeJournal {};
globalThis.Macro = class FakeMacro {
  static create(data) {
    return Promise.resolve(data);
  }
};
globalThis.RollTable = class FakeRollTable {};
globalThis.Scene = class FakeScene {};
globalThis.TokenDocument = class FakeTokenDocument {};
globalThis.User = class FakeUser {};
globalThis.PlaylistSound = class FakePlaylistSound {};
globalThis.ActiveEffect = { implementation: { create: vi.fn() } };

// ---- fromUuid lookups -------------------------------------------------------
globalThis.fromUuid = vi.fn(() => Promise.resolve(null));
globalThis.fromUuidSync = vi.fn(() => null);

// ---- canvas -----------------------------------------------------------------
globalThis.canvas = {
  tokens: {
    controlled: [],
    placeables: [],
    releaseAll: vi.fn(),
    get: () => null,
  },
  scene: { id: "test-scene" },
};

// ---- ui ---------------------------------------------------------------------
globalThis.ui = {
  ARGON: null,
  windows: {},
};

// ---- CONST ------------------------------------------------------------------
globalThis.CONST = {
  DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0, LIMITED: 1, OBSERVER: 2, OWNER: 3 },
};

// ---- dnd5e namespace -------------------------------------------------------
globalThis.dnd5e = { documents: { macro: { rollItem: vi.fn() } } };

// ---- libWrapper sentinel ----------------------------------------------------
globalThis.libWrapper = undefined;

// ---- Handlebars (used by module.js handlebar-helper registration) ----------
globalThis.Handlebars = {
  registerHelper: vi.fn(),
};

// ---- Per-test reset --------------------------------------------------------
beforeEach(() => {
  globalThis.Hooks._registered.clear();
  globalThis.game.actors.clear();
  globalThis.game.items.clear();
  globalThis.game.settings.clear();
  globalThis.game.modules = new Map();
  globalThis.game.user.targets = new Set();
  FakeChatMessage5e._creates.length = 0;
  globalThis.Roll.__reset();
  vi.clearAllMocks();
});
