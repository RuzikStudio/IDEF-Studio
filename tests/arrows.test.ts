import { test } from "node:test";
import assert from "node:assert/strict";
import {
  newProject,
  addBlock,
  addArrow,
  nodeEnd,
  boundary,
  decompose,
  setTunnel,
  visibleArrows,
  syncInheritance,
  clone,
  serialize,
  parseProject,
  arrowGeometry,
  addWaypoint,
  resetRoute,
  icomCode,
  deleteArrow,
  branchArrow,
  validate,
} from "../src/model.ts";
import { intersects } from "../src/router.ts";
test("new branches and detached inherited arrows do not keep a tunnel at a removed endpoint", () => {
  const p = newProject(),
    id = p.rootId,
    n = addBlock(p, id),
    parent = addArrow(p, id, boundary("left"), nodeEnd(n.id, "left"), "Поток"),
    child = decompose(p, id, n.id),
    d = p.diagrams[child],
    a = d.arrows[0];
  a.target = nodeEnd(d.nodes[0].id, "left");
  setTunnel(p, child, a.id, "target", true);
  const branch = branchArrow(p, child, a.id);
  assert.equal(branch.target, null);
  assert.equal(branch.tunnelTarget, undefined);
  deleteArrow(p, child, branch.id);
  deleteArrow(p, child, a.id);
  assert.equal(a.target, null);
  assert.equal(a.tunnelTarget, undefined);
  assert(parent);
});
function routing() {
  const p = newProject(),
    id = p.rootId,
    left = addBlock(p, id, "Источник", 150, 310),
    right = addBlock(p, id, "Получатель", 1000, 310),
    obstacle = addBlock(p, id, "Препятствие", 560, 270);
  obstacle.h = 190;
  const a = addArrow(
    p,
    id,
    nodeEnd(left.id, "right"),
    nodeEnd(right.id, "left"),
    "Поток",
  );
  return { p, d: p.diagrams[id], a, left, right, obstacle };
}
function clear(
  d: ReturnType<typeof routing>["d"],
  a: ReturnType<typeof routing>["a"],
) {
  const geo = arrowGeometry(d, a);
  assert.equal(geo.blocked, undefined, geo.blocked);
  for (let i = 1; i < geo.points.length; i++) {
    const p = geo.points[i - 1],
      q = geo.points[i];
    assert(p.x === q.x || p.y === q.y, JSON.stringify([p, q]));
    for (const n of d.nodes)
      assert(!intersects(p, q, n), `Path intersects ${n.name}`);
  }
  return geo;
}
test("automatic arrows go around intermediate blocks and remain orthogonal", () => {
  const { d, a } = routing();
  const geo = clear(d, a);
  assert(geo.points.length >= 4);
});
test("moving a block onto a previously straight arrow causes automatic rerouting", () => {
  const { d, a, obstacle } = routing();
  obstacle.y = 600;
  const before = clear(d, a);
  assert.equal(before.points.length, 2);
  obstacle.y = 270;
  const after = clear(d, a);
  assert(after.points.length > 2);
  assert.notDeepEqual(after.points, before.points);
});
test("manual checkpoints are respected while avoiding blocks, reset returns to automatic", () => {
  const { d, a } = routing();
  const geo = clear(d, a);
  addWaypoint(d, a, geo.handle);
  a.waypoints![0] = { x: 840, y: 180 };
  const manual = clear(d, a);
  assert(manual.points.some((p) => p.y === 180));
  assert.equal(a.routing, "manual");
  resetRoute(a);
  assert.equal(a.waypoints, undefined);
  assert.equal(a.route, undefined);
  clear(d, a);
});
test("checkpoint inside a block reports a conflict instead of claiming a safe route", () => {
  const { d, a } = routing();
  a.waypoints = [{ x: 600, y: 320 }];
  a.routing = "manual";
  assert.match(arrowGeometry(d, a).blocked || "", /Опорная/);
});
test("feedback to a control port routes outside source and target blocks", () => {
  const { p, d, left, right } = routing();
  const a = addArrow(
    p,
    d.id,
    nodeEnd(right.id, "right"),
    nodeEnd(left.id, "top"),
    "Обратная связь",
  );
  clear(d, a);
});
test("floating point positions from dragging stay strictly orthogonal", () => {
  const { d, a, left, right } = routing();
  left.x += 0.1234567;
  left.y += 0.123456789;
  right.x += 0.31938472;
  right.y += 0.393743285;
  clear(d, a);
});
test("overlapping endpoint blocks produce a visible route conflict", () => {
  const { d, a, right, left } = routing();
  right.x = left.x + 150;
  assert(arrowGeometry(d, a).blocked);
});
test("tunneling hides inherited arrows without deleting their attachments or route", () => {
  const p = newProject(),
    id = p.rootId,
    n = addBlock(p, id),
    a = addArrow(p, id, boundary("left"), nodeEnd(n.id, "left"), "Вход"),
    child = decompose(p, id, n.id),
    d = p.diagrams[child],
    inherited = d.arrows[0];
  inherited.target = nodeEnd(d.nodes[0].id, "left");
  inherited.waypoints = [{ x: 180, y: 200 }];
  const before = clone(inherited);
  setTunnel(p, id, a.id, "target", true);
  assert.equal(visibleArrows(d).length, 0);
  assert.equal(d.arrows.length, 1);
  assert.deepEqual(inherited.target, before.target);
  const restored = parseProject(serialize(p));
  setTunnel(restored, id, a.id, "target", false);
  assert.deepEqual(restored.diagrams[child].arrows[0], before);
});
test("tunnel suppression reaches inherited grandchildren and is reversible", () => {
  const p = newProject(),
    id = p.rootId,
    n = addBlock(p, id),
    a = addArrow(p, id, boundary("left"), nodeEnd(n.id, "left"), "Вход"),
    child = decompose(p, id, n.id),
    d = p.diagrams[child];
  d.arrows[0].target = nodeEnd(d.nodes[0].id, "left");
  const grand = decompose(p, child, d.nodes[0].id);
  setTunnel(p, id, a.id, "target", true);
  assert.equal(visibleArrows(p.diagrams[grand]).length, 0);
  setTunnel(p, id, a.id, "target", false);
  assert.equal(visibleArrows(p.diagrams[grand]).length, 1);
});
test("source/output tunnel suppresses only the source decomposition, not receiver", () => {
  const p = newProject(),
    id = p.rootId,
    n1 = addBlock(p, id),
    n2 = addBlock(p, id),
    a = addArrow(
      p,
      id,
      nodeEnd(n1.id, "right"),
      nodeEnd(n2.id, "left"),
      "Общий",
    );
  const c1 = decompose(p, id, n1.id),
    c2 = decompose(p, id, n2.id);
  setTunnel(p, id, a.id, "source", true);
  assert.equal(visibleArrows(p.diagrams[c1]).length, 0);
  assert.equal(visibleArrows(p.diagrams[c2]).length, 1);
});
test("deleting a tunneled parent removes suppressed descendants", () => {
  const p = newProject(),
    id = p.rootId,
    n = addBlock(p, id),
    a = addArrow(p, id, boundary("top"), nodeEnd(n.id, "top"), "Контроль"),
    child = decompose(p, id, n.id);
  setTunnel(p, id, a.id, "target", true);
  deleteArrow(p, id, a.id);
  assert.equal(p.diagrams[child].arrows.length, 0);
});
test("local child boundary defaults to tunneled, gets ICOM on the next level", () => {
  const p = newProject(),
    id = p.rootId,
    n = addBlock(p, id),
    child = decompose(p, id, n.id),
    cn = p.diagrams[child].nodes[0];
  const local = addArrow(
    p,
    child,
    boundary("top"),
    nodeEnd(cn.id, "top"),
    "Локальное правило",
  );
  assert(local.tunnelSource);
  const grand = decompose(p, child, cn.id);
  assert.equal(icomCode(p, grand, p.diagrams[grand].arrows[0]), "C1");
  assert(!p.diagrams[grand].arrows[0].tunnelSource);
});
test("ICOM numbers follow port positions, not labels or order of creation", () => {
  const p = newProject(),
    id = p.rootId,
    n = addBlock(p, id);
  addArrow(p, id, boundary("left"), nodeEnd(n.id, "left", 0.8), "Нижний");
  addArrow(p, id, boundary("left"), nodeEnd(n.id, "left", 0.3), "Верхний");
  const child = decompose(p, id, n.id),
    d = p.diagrams[child];
  assert.equal(icomCode(p, child, d.arrows[0]), "I2");
  assert.equal(icomCode(p, child, d.arrows[1]), "I1");
});
test("version 1 imports preserve numeric routes and upgrade to version 3", () => {
  const { p, d, a } = routing();
  a.route = 900;
  const legacy = JSON.parse(serialize(p));
  legacy.version = 1;
  const read = parseProject(JSON.stringify(legacy));
  assert.equal(read.version, 3);
  assert.equal(read.diagrams[d.id].arrows[0].route, 900);
});
test("malformed waypoints and tunnel flags are rejected on import", () => {
  const { p, d, a } = routing();
  const data = JSON.parse(serialize(p));
  data.diagrams[d.id].arrows[0].waypoints = [{ x: "oops", y: 10 }];
  assert.throws(() => parseProject(JSON.stringify(data)));
  delete data.diagrams[d.id].arrows[0].waypoints;
  data.diagrams[d.id].arrows[0].tunnelSource = "false";
  assert.throws(() => parseProject(JSON.stringify(data)));
});
test("six decomposed functions stay within the diagram sheet", () => {
  const p = newProject(),
    n = addBlock(p, p.rootId),
    id = decompose(p, p.rootId, n.id, 6);
  assert.equal(p.diagrams[id].nodes.length, 6);
  for (const n of p.diagrams[id].nodes)
    assert(n.x + n.w < 1385 && n.y + n.h < 765);
});
