import { test } from "node:test";
import assert from "node:assert/strict";
import {
  newProject,
  addBlock,
  addArrow,
  nodeEnd,
  boundary,
  position,
  arrowGeometry,
  parseProject,
  serialize,
} from "../src/model";
import {
  alignedBoundary,
  freeSlot,
  occupied,
  spreadBoundaryPorts,
} from "../src/ports";
test("twelve mechanisms receive independent aligned ports, persist and can be spread", () => {
  const p = newProject(),
    d = p.diagrams[p.rootId],
    n = addBlock(p, d.id, "Обработка", 440, 330);
  for (let i = 0; i < 12; i++) {
    const ep = nodeEnd(n.id, "bottom", freeSlot(occupied(d, n.id, "bottom")));
    addArrow(p, d.id, alignedBoundary(d, ep), ep, "Механизм " + i);
  }
  assert.equal(new Set(occupied(d, n.id, "bottom")).size, 12);
  for (const a of d.arrows) {
    const x = position(d, a.target!).x;
    assert.ok(
      arrowGeometry(d, a).points.every((pt) => Math.abs(pt.x - x) < 0.001),
    );
  }
  assert.deepEqual(parseProject(serialize(p)), p);
  for (const a of d.arrows) {
    a.target = nodeEnd(n.id, "bottom");
    a.source = boundary("bottom", 0.5);
  }
  spreadBoundaryPorts(d, n.id, "bottom");
  assert.equal(new Set(occupied(d, n.id, "bottom")).size, 12);
});
