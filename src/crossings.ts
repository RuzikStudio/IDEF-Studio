import type { Point } from "./model";
export type Bridge = { x: number; y: number; r: number };
// Only strict interior intersections count: touching endpoints are connections.
export function crossingBridges(
  routes: Map<string, { points: Point[] }>,
): Map<string, Bridge[]> {
  const result = new Map<string, Bridge[]>();
  for (const [id, route] of routes) {
    const bridges: Bridge[] = [];
    for (let i = 1; i < route.points.length; i++) {
      const a = route.points[i - 1],
        b = route.points[i];
      if (a.y !== b.y || a.x === b.x) continue;
      const xs: number[] = [];
      for (const [other, r] of routes) {
        if (other === id) continue;
        for (let j = 1; j < r.points.length; j++) {
          const c = r.points[j - 1],
            d = r.points[j];
          if (c.x !== d.x || c.y === d.y) continue;
          if (
            c.x > Math.min(a.x, b.x) + 2 &&
            c.x < Math.max(a.x, b.x) - 2 &&
            a.y > Math.min(c.y, d.y) + 2 &&
            a.y < Math.max(c.y, d.y) - 2
          )
            xs.push(c.x);
        }
      }
      const sorted = [...new Set(xs)].sort((a, b) => a - b);
      sorted.forEach((x, k) => {
        const r = Math.min(
          7,
          (x - Math.min(a.x, b.x)) / 2,
          (Math.max(a.x, b.x) - x) / 2,
          k ? (x - sorted[k - 1]) / 3 : 7,
          k < sorted.length - 1 ? (sorted[k + 1] - x) / 3 : 7,
        );
        if (r >= 1) bridges.push({ x, y: a.y, r });
      });
    }
    result.set(id, bridges);
  }
  return result;
}
export const bridgePath = ({ x, y, r }: Bridge) =>
  `M ${x - r} ${y} Q ${x} ${y - 2 * r} ${x + r} ${y}`;
