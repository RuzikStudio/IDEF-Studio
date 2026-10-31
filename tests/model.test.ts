import { test } from "node:test";
import assert from "node:assert/strict";
import {
  newProject,
  addBlock,
  addArrow,
  boundary,
  nodeEnd,
  decompose,
  syncInheritance,
  clone,
  deleteArrow,
  deleteBlock,
  branchArrow,
  serialize,
  parseProject,
  validate,
  arrowGeometry,
  sides,
  blockCode,
  diagramCode,
} from "../src/model.ts";
import { demoProject } from "../src/demo.ts";
function fixture() {
  const p = newProject("Тест"),
    root = p.rootId,
    n = addBlock(p, root, "Основная функция");
  for (const side of sides)
    addArrow(
      p,
      root,
      side === "right" ? nodeEnd(n.id, side) : boundary(side),
      side === "right" ? boundary(side) : nodeEnd(n.id, side),
      side,
    );
  return { p, root, n };
}
test("all four ICOM types inherit to boundary with dangling internal ends", () => {
  const { p, root, n } = fixture();
  const id = decompose(p, root, n.id, 3),
    d = p.diagrams[id];
  assert.equal(d.arrows.length, 4);
  for (const a of d.arrows) {
    const parent = p.diagrams[root].arrows.find(
      (x) => x.id === a.originArrowId,
    )!;
    assert.equal(a.flowId, parent.flowId);
    const ep = a.inheritedSide === "right" ? a.target : a.source;
    assert.equal(ep?.kind, "boundary");
    assert.equal(ep?.side, a.inheritedSide);
    assert.equal(a.inheritedSide === "right" ? a.source : a.target, null);
  }
  assert.equal(
    validate(p).filter((i) => i.text.includes("не подключена")).length,
    4,
  );
});
test("decomposition is idempotent and synchronization preserves attachments and routes", () => {
  const { p, root, n } = fixture(),
    id = decompose(p, root, n.id);
  const a = p.diagrams[id].arrows[0];
  a.target = nodeEnd(p.diagrams[id].nodes[0].id, "left");
  a.route = 123;
  syncInheritance(p);
  assert.equal(decompose(p, root, n.id), id);
  assert.equal(p.diagrams[id].arrows.length, 4);
  assert.equal(a.route, 123);
  assert.equal(a.target.kind, "node");
});
test("renaming flow is shared across nested decomposition", () => {
  const { p, root, n } = fixture(),
    id = decompose(p, root, n.id),
    d = p.diagrams[id],
    a = d.arrows.find((x) => x.inheritedSide === "left")!;
  a.target = nodeEnd(d.nodes[0].id, "left");
  const grand = decompose(p, id, d.nodes[0].id);
  p.flows[a.flowId].name = "Новое имя";
  assert.equal(p.flows[p.diagrams[grand].arrows[0].flowId].name, "Новое имя");
  assert.equal(p.diagrams[grand].arrows[0].originArrowId, a.id);
});
test("later parent arrows propagate into existing decompositions", () => {
  const { p, root, n } = fixture(),
    id = decompose(p, root, n.id);
  addArrow(
    p,
    root,
    boundary("top", 0.8),
    nodeEnd(n.id, "top", 0.8),
    "Новый регламент",
  );
  assert.equal(p.diagrams[id].arrows.length, 5);
});
test("deleting parent flow removes inherited descendants but keeps unrelated internal flows", () => {
  const { p, root, n } = fixture(),
    id = decompose(p, root, n.id),
    d = p.diagrams[id],
    a = d.arrows.find((x) => x.inheritedSide === "left")!;
  a.target = nodeEnd(d.nodes[0].id, "left");
  const grand = decompose(p, id, d.nodes[0].id);
  const internal = addArrow(
    p,
    id,
    nodeEnd(d.nodes[0].id, "right"),
    nodeEnd(d.nodes[1].id, "left"),
    "Внутренний",
  );
  deleteArrow(p, root, a.originArrowId!);
  assert(!d.arrows.some((x) => x.id === a.id));
  assert(p.diagrams[grand].arrows.every((x) => x.flowId !== a.flowId));
  assert(d.arrows.some((x) => x.id === internal.id));
});
test("removing inherited arrow detaches it and preserves boundary, branch can be deleted", () => {
  const { p, root, n } = fixture(),
    id = decompose(p, root, n.id),
    d = p.diagrams[id],
    a = d.arrows[0];
  a.target = nodeEnd(d.nodes[0].id, "left");
  deleteArrow(p, id, a.id);
  assert.equal(d.arrows.length, 4);
  assert.equal(a.target, null);
  const b = branchArrow(p, id, a.id);
  assert.equal(d.arrows.length, 5);
  assert.equal(b.flowId, a.flowId);
  deleteArrow(p, id, b.id);
  assert.equal(d.arrows.length, 4);
});
test("deleting block removes its subtree and retains inherited boundary stubs", () => {
  const { p, root, n } = fixture(),
    id = decompose(p, root, n.id),
    d = p.diagrams[id],
    a = d.arrows[0];
  a.target = nodeEnd(d.nodes[0].id, "left");
  const child = decompose(p, id, d.nodes[0].id);
  deleteBlock(p, id, d.nodes[0].id);
  assert(!p.diagrams[child]);
  assert.equal(a.target, null);
  assert.equal(d.arrows.length, 4);
});
test("snapshot restores deleted subtrees and inherited links", () => {
  const { p, root, n } = fixture();
  decompose(p, root, n.id);
  const before = clone(p);
  deleteBlock(p, root, n.id);
  assert.equal(Object.keys(p.diagrams).length, 1);
  const restored = parseProject(serialize(before));
  assert.equal(Object.keys(restored.diagrams).length, 2);
  assert.equal(restored.diagrams[root].nodes.length, 1);
});
test("demo survives save/open with hierarchy, shared names and layout unchanged", () => {
  const p = demoProject();
  const read = parseProject(serialize(p));
  assert.deepEqual(read, p);
  assert.equal(Object.keys(p.diagrams).length, 2);
  assert.equal(validate(p).length, 0);
});
test("invalid format, dangling endpoint and cyclic hierarchy rejected", () => {
  assert.throws(() => parseProject("{}"));
  const { p, root, n } = fixture();
  let bad = clone(p);
  bad.diagrams[root].arrows[0].target = nodeEnd("missing", "left");
  assert.throws(() => parseProject(serialize(bad)));
  bad = clone(p);
  bad.diagrams[root].nodes[0].childId = root;
  assert.throws(() => parseProject(serialize(bad)));
  bad = clone(p);
  bad.diagrams[root].nodes[0].x = NaN;
  assert.throws(() => parseProject(serialize(bad)));
});
test("reversed source/target semantics rejected on import", () => {
  const { p, root, n } = fixture();
  p.diagrams[root].arrows[0].source = nodeEnd(n.id, "left");
  assert.throws(() => parseProject(serialize(p)));
});
test("every demo arrow consists only of orthogonal finite segments", () => {
  const p = demoProject();
  for (const d of Object.values(p.diagrams))
    for (const a of d.arrows) {
      const { points } = arrowGeometry(d, a);
      for (let i = 1; i < points.length; i++) {
        assert(Number.isFinite(points[i].x) && Number.isFinite(points[i].y));
        assert(
          points[i].x === points[i - 1].x || points[i].y === points[i - 1].y,
        );
      }
    }
});

test("IDEF0 numbering uses A0, A1 and A11 at successive levels", () => {
  const { p, root, n } = fixture();
  assert.equal(blockCode(p, root, n.id), "A0");
  const child = decompose(p, root, n.id);
  assert.equal(diagramCode(p, child), "A0");
  const first = p.diagrams[child].nodes[0];
  assert.equal(blockCode(p, child, first.id), "A1");
  const grand = decompose(p, child, first.id);
  assert.equal(diagramCode(p, grand), "A1");
  assert.equal(blockCode(p, grand, p.diagrams[grand].nodes[0].id), "A11");
});
