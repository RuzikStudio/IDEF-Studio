import { test } from "node:test";
import assert from "node:assert/strict";
import { dfdDemo } from "../src/dfdDemo";
import {
  parseProject,
  serialize,
  decompose,
  nodeEnd,
  syncInheritance,
  deleteArrow,
  addArrow,
  validate,
  clone,
} from "../src/model";
import { crossingBridges } from "../src/crossings";
test("DFD roundtrip preserves hierarchy, all port directions and context", () => {
  const p = dfdDemo();
  assert.deepEqual(parseProject(serialize(p)), p);
  assert.equal(
    validate(p).filter((i) => i.text.includes("не подключён")).length,
    0,
  );
});
test("DFD nested decomposition preserves flow identity and synchronizes context names", () => {
  const p = dfdDemo(),
    child = Object.values(p.diagrams).find((d) => d.parentDiagramId)!,
    n = child.nodes.find((n) => n.kind === "process")!;
  const id = decompose(p, child.id, n.id, 2),
    d = p.diagrams[id];
  assert.ok(d.arrows.length);
  const a = d.arrows[0],
    ctx = d.nodes.find(
      (n) =>
        n.contextOf &&
        child.nodes.some((x) => x.id === n.contextOf && !x.contextOf),
    )!;
  child.nodes.find((n) => n.id === ctx.contextOf)!.name = "Переименовано";
  syncInheritance(p);
  assert.equal(ctx.name, "Переименовано");
  assert.ok(
    child.arrows.some((x) => x.id === a.originArrowId && x.flowId === a.flowId),
  );
  assert.doesNotThrow(() => parseProject(serialize(p)));
});
test("DFD parent flow deletion removes inherited continuation", () => {
  const p = dfdDemo(),
    root = p.diagrams[p.rootId],
    id = root.arrows[0].id;
  deleteArrow(p, root.id, id);
  syncInheritance(p);
  assert.ok(
    Object.values(p.diagrams).every((d) =>
      d.arrows.every((a) => a.originArrowId !== id),
    ),
  );
});
test("DFD disallows entity to entity and entity decomposition", () => {
  const p = dfdDemo(),
    d = p.diagrams[p.rootId],
    nodes = d.nodes.filter((n) => n.kind === "entity");
  assert.throws(() =>
    addArrow(
      p,
      d.id,
      nodeEnd(nodes[0].id, "right"),
      nodeEnd(nodes[1].id, "left"),
    ),
  );
  assert.throws(() => decompose(p, d.id, nodes[0].id, 3));
});
test("v2 files migrate to IDEF0 with crossings enabled", () => {
  const p: any = clone(dfdDemo());
  p.version = 2;
  p.diagrams = { [p.rootId]: { id: p.rootId, nodes: [], arrows: [] } };
  delete p.notation;
  delete p.showCrossings;
  assert.equal(parseProject(JSON.stringify(p)).notation, "IDEF0");
});
test("bridges mark perpendicular interiors, not endpoints; duplicates collapse", () => {
  const routes = new Map([
    [
      "h",
      {
        points: [
          { x: 0, y: 20 },
          { x: 100, y: 20 },
        ],
      },
    ],
    [
      "v",
      {
        points: [
          { x: 50, y: 0 },
          { x: 50, y: 40 },
        ],
      },
    ],
    [
      "v2",
      {
        points: [
          { x: 50, y: 0 },
          { x: 50, y: 40 },
        ],
      },
    ],
    [
      "end",
      {
        points: [
          { x: 0, y: 0 },
          { x: 0, y: 20 },
        ],
      },
    ],
  ]);
  const bridges = crossingBridges(routes);
  assert.equal(bridges.get("h")!.length, 1);
  assert.equal(bridges.get("h")![0].x, 50);
  assert.equal(bridges.get("v")!.length, 0);
});
