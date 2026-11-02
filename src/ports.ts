import {
  boundary,
  nodeEnd,
  PAGE,
  position,
  resetRoute,
  visibleArrows,
  type Diagram,
  type Side,
  type Endpoint,
} from "./model";

export function occupied(d: Diagram, id: string, side: Side): number[] {
  return visibleArrows(d)
    .flatMap((a) => [a.source, a.target])
    .filter(
      (e): e is Extract<Endpoint, { kind: "node" }> =>
        e?.kind === "node" && e.nodeId === id && e.side === side,
    )
    .map((e) => e.at);
}
export function freeSlot(points: number[]): number {
  const stops = [0, ...points, 1].sort((a, b) => a - b);
  let width = -1,
    at = 0.5;
  for (let i = 1; i < stops.length; i++) {
    const gap = stops[i] - stops[i - 1];
    if (gap > width) {
      width = gap;
      at = (stops[i] + stops[i - 1]) / 2;
    }
  }
  return at;
}
export function alignedBoundary(d: Diagram, e: Endpoint) {
  const pt = position(d, e),
    horizontal = e.side === "top" || e.side === "bottom";
  const at = horizontal
    ? (pt.x - PAGE.left) / (PAGE.right - PAGE.left)
    : (pt.y - PAGE.top) / (PAGE.bottom - PAGE.top);
  return boundary(e.side, Math.max(0, Math.min(1, at)));
}
export function spreadBoundaryPorts(d: Diagram, id: string, side: Side) {
  const group = visibleArrows(d)
    .flatMap((a) => {
      const e = side === "right" ? a.source : a.target,
        b = side === "right" ? a.target : a.source;
      return e?.kind === "node" &&
        e.nodeId === id &&
        e.side === side &&
        b?.kind === "boundary" &&
        b.side === side
        ? [{ a, e, b }]
        : [];
    })
    .sort((a, b) => a.b.at - b.b.at);
  if (!group.length) return;
  const other = occupied(d, id, side).slice();
  for (const { e } of group) other.splice(other.indexOf(e.at), 1);
  group.forEach(({ a, e, b }, i) => {
    const preferred = (i + 1) / (group.length + 1);
    e.at = other.includes(preferred) ? freeSlot(other) : preferred;
    other.push(e.at);
    b.at = alignedBoundary(d, e).at;
    resetRoute(a);
  });
}
