// Factories for fake Foundry documents used across tests.

let _idCounter = 0;
function makeId(prefix = "id") {
  _idCounter += 1;
  return `${prefix}-${_idCounter}`;
}

/**
 * Build a fake Actor document with the shape MagicItemActor / MagicItemSheet
 * expect: `id`, `name`, `items` (Map-like), `system`, `sheet`, `apps`,
 * `getActiveTokens`, `update`, `testUserPermission`, etc.
 */
export function makeActor({
  id = makeId("actor"),
  name = "Actor",
  items = [],
  hp = 50,
  registerInGameActors = true,
} = {}) {
  const _items = new Map();
  for (const it of items) _items.set(it.id, it);

  // Mimics Foundry's actor.items collection: iterable, .get/.has/.size from Map
  // plus .filter/.map/.find/.length as helpers.
  const itemsApi = {
    get size() {
      return _items.size;
    },
    get length() {
      return _items.size;
    },
    get(id) {
      return _items.get(id);
    },
    has(id) {
      return _items.has(id);
    },
    set(id, value) {
      _items.set(id, value);
    },
    delete(id) {
      return _items.delete(id);
    },
    filter(fn) {
      return Array.from(_items.values()).filter(fn);
    },
    map(fn) {
      return Array.from(_items.values()).map(fn);
    },
    find(fn) {
      return Array.from(_items.values()).find(fn);
    },
    [Symbol.iterator]() {
      return _items.values();
    },
  };

  const actor = {
    id,
    _id: id,
    name,
    documentName: "Actor",
    items: itemsApi,
    system: {
      attributes: {
        hp: { value: hp, max: 50 },
        spellcasting: "wis",
        prof: 3,
      },
      abilities: {
        str: { mod: 0, dc: 10 },
        wis: { mod: 3, dc: 14 },
      },
      details: { level: 9 },
    },
    sheet: { rendered: false, render: () => Promise.resolve(actor.sheet), close: () => Promise.resolve() },
    apps: {},
    token: null,
    isOwner: true,
    testUserPermission: () => true,
    getActiveTokens: () => [],
    update: (patch) => {
      // Apply dotted-path patches to the system tree.
      for (const [k, v] of Object.entries(patch)) {
        if (k.includes(".")) {
          const keys = k.split(".");
          let cur = actor;
          for (let i = 0; i < keys.length - 1; i += 1) {
            if (cur[keys[i]] === null || cur[keys[i]] === undefined || typeof cur[keys[i]] !== "object")
              cur[keys[i]] = {};
            cur = cur[keys[i]];
          }
          cur[keys[keys.length - 1]] = v;
        } else {
          actor[k] = v;
        }
      }
      return Promise.resolve(actor);
    },
    createEmbeddedDocuments: async (type, data) => {
      const created = data.map((d) => {
        const Cls = globalThis.CONFIG.Item.documentClass;
        const inst = new Cls(d, { parent: actor });
        inst.id = inst._id ?? makeId("eitem");
        inst._id = inst.id;
        actor.items.set(inst.id, inst);
        return inst;
      });
      return created;
    },
    deleteEmbeddedDocuments: async (type, ids) => {
      for (const id of ids) actor.items.delete(id);
      return ids;
    },
    updateEmbeddedDocuments: async () => [],
  };

  if (registerInGameActors) {
    globalThis.game.actors.set(id, actor);
  }
  return actor;
}

/**
 * Build a fake spell Item document with `system.activities` (5.x) and the
 * legacy fallbacks the module checks. `activities` is keyed by activity-id.
 */
export function makeSpell({
  id = makeId("spell"),
  name = "Test Spell",
  level = 1,
  activities = null,
  legacy = null,
  effects = [],
  uuid = null,
} = {}) {
  const spell = {
    id,
    _id: id,
    name,
    type: "spell",
    uuid: uuid ?? `Compendium.test.spells.Item.${id}`,
    img: "icons/svg/test.svg",
    system: {
      level,
      preparation: { mode: "prepared" },
      activities: activities ?? {},
      ...(legacy ?? {}),
    },
    effects: { size: effects.length, toObject: () => effects },
    labels: {},
    toObject() {
      return JSON.parse(JSON.stringify({ _id: id, name, type: "spell", img: this.img, system: this.system, effects }));
    },
  };
  return spell;
}

/**
 * Build a fake magic-item Item document with the magicitems flag structure.
 * `spells`, `feats`, `tables` are arrays of `{ name, level, consumption, ... }`
 * entry-config objects (the magicitems flag shape, NOT the source-spell shape).
 */
export function makeMagicItem({
  id = makeId("mi"),
  name = "Staff",
  charges = 10,
  uses = 10,
  spells = [],
  feats = [],
  tables = [],
  type = "weapon",
  chargeType = "c1",
  rechargeable = false,
  internal = false,
} = {}) {
  const item = {
    id,
    _id: id,
    name,
    type,
    flags: {
      magicitems: {
        enabled: true,
        equipped: true,
        attuned: false,
        internal,
        charges,
        chargeType,
        destroy: false,
        destroyCheck: "d1",
        destroyType: "dt1",
        destroyDC: 0,
        rechargeable,
        recharge: "0",
        rechargeType: "t1",
        rechargeUnit: "r1",
        spells: Object.fromEntries(spells.map((s, i) => [String(i), s])),
        feats: Object.fromEntries(feats.map((f, i) => [String(i), f])),
        tables: Object.fromEntries(tables.map((t, i) => [String(i), t])),
        uses,
      },
    },
    system: {
      uses: { max: "", spent: 0 },
      equipped: true,
      attunement: 0,
      identified: true,
    },
  };
  return item;
}
