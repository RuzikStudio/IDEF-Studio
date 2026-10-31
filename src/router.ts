import type { Point, Block } from "./model";

export type Rect = { x: number; y: number; w: number; h: number };
export const directions: Point[] = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
];
const EPS = 0.001;
export function inside(p: Point, r: Rect): boolean {
  return (
    p.x > r.x + EPS &&
    p.x < r.x + r.w - EPS &&
    p.y > r.y + EPS &&
    p.y < r.y + r.h - EPS
  );
}
export function intersects(a: Point, b: Point, r: Rect): boolean {
  if (Math.abs(a.y - b.y) < EPS)
    return (
      a.y > r.y + EPS &&
      a.y < r.y + r.h - EPS &&
      Math.max(a.x, b.x) > r.x + EPS &&
      Math.min(a.x, b.x) < r.x + r.w - EPS
    );
  if (Math.abs(a.x - b.x) < EPS)
    return (
      a.x > r.x + EPS &&
      a.x < r.x + r.w - EPS &&
      Math.max(a.y, b.y) > r.y + EPS &&
      Math.min(a.y, b.y) < r.y + r.h - EPS
    );
  return true;
}
export function simplify(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out.at(-1);
    if (last && p.x === last.x && p.y === last.y) continue;
    if (out.length > 1) {
      const prev = out.at(-2)!;
      if (
        (prev.x === last!.x &&
          last!.x === p.x &&
          (last!.y - prev.y) * (p.y - last!.y) >= 0) ||
        (prev.y === last!.y &&
          last!.y === p.y &&
          (last!.x - prev.x) * (p.x - last!.x) >= 0)
      )
        out.pop();
    }
    out.push(p);
  }
  return out;
}
class MinHeap {
  items: { key: number; score: number }[] = [];
  push(item: { key: number; score: number }) {
    const a = this.items;
    let i = a.length;
    a.push(item);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (a[parent].score <= item.score) break;
      a[i] = a[parent];
      i = parent;
    }
    a[i] = item;
  }
  pop() {
    const a = this.items,
      top = a[0],
      last = a.pop()!;
    if (a.length) {
      let i = 0;
      while (i * 2 + 1 < a.length) {
        let j = i * 2 + 1;
        if (j + 1 < a.length && a[j + 1].score < a[j].score) j++;
        if (a[j].score >= last.score) break;
        a[i] = a[j];
        i = j;
      }
      a[i] = last;
    }
    return top;
  }
}
export function orthogonalRoute(
  start: Point,
  end: Point,
  boxes: Rect[],
  startDir?: number,
  endDir?: number,
): Point[] | null {
  if (
    boxes.length > 60 ||
    [start, end].some((p) => boxes.some((r) => inside(p, r)))
  )
    return null;
  if (start.x === end.x && start.y === end.y) return [start];
  const xs = Array.from(
    new Set([
      start.x,
      end.x,
      65,
      1375,
      ...boxes.flatMap((r) => [r.x, r.x + r.w]),
    ]),
  ).sort((a, b) => a - b);
  const ys = Array.from(
    new Set([
      start.y,
      end.y,
      110,
      785,
      ...boxes.flatMap((r) => [r.y, r.y + r.h]),
    ]),
  ).sort((a, b) => a - b);
  const w = xs.length,
    h = ys.length,
    total = w * h,
    point = (id: number): Point => ({
      x: xs[id % w],
      y: ys[Math.floor(id / w)],
    });
  const idOf = (p: Point) => ys.indexOf(p.y) * w + xs.indexOf(p.x);
  const from = idOf(start),
    to = idOf(end);
  const valid = new Uint8Array(total);
  for (let i = 0; i < total; i++)
    valid[i] = boxes.some((r) => inside(point(i), r)) ? 0 : 1;
  const costs = new Float64Array(total * 4).fill(Infinity),
    prev = new Int32Array(total * 4).fill(-1),
    heap = new MinHeap(),
    closed = new Uint8Array(total * 4);
  const heuristic = (p: Point) => Math.abs(p.x - end.x) + Math.abs(p.y - end.y);
  for (const dir of startDir === undefined ? [0, 1, 2, 3] : [startDir]) {
    const key = from * 4 + dir;
    costs[key] = 0;
    heap.push({ key, score: heuristic(start) });
  }
  const edges = new Map<string, boolean>();
  let finish = -1;
  while (heap.items.length) {
    const { key } = heap.pop();
    if (closed[key]) continue;
    closed[key] = 1;
    const id = Math.floor(key / 4),
      dir = key % 4,
      p = point(id);
    if (id === to && (endDir === undefined || dir !== (endDir + 2) % 4)) {
      finish = key;
      break;
    }
    const x = id % w,
      y = Math.floor(id / w);
    const adjacent = [
      x + 1 < w ? id + 1 : -1,
      y + 1 < h ? id + w : -1,
      x > 0 ? id - 1 : -1,
      y > 0 ? id - w : -1,
    ];
    for (let nd = 0; nd < 4; nd++) {
      const next = adjacent[nd];
      if (next < 0 || !valid[next] || nd === (dir + 2) % 4) continue;
      const q = point(next),
        ek = `${Math.min(id, next)}:${Math.max(id, next)}`;
      let clear = edges.get(ek);
      if (clear === undefined) {
        clear = !boxes.some((r) => intersects(p, q, r));
        edges.set(ek, clear);
      }
      if (!clear) continue;
      const nk = next * 4 + nd,
        g =
          costs[key] +
          Math.abs(q.x - p.x) +
          Math.abs(q.y - p.y) +
          (nd === dir ? 0 : 22);
      if (g + EPS < costs[nk]) {
        costs[nk] = g;
        prev[nk] = key;
        heap.push({ key: nk, score: g + heuristic(q) });
      }
    }
  }
  if (finish < 0) return null;
  const result: Point[] = [];
  for (let k = finish; k >= 0; k = prev[k])
    result.push(point(Math.floor(k / 4)));
  result.reverse();
  result[0] = start;
  result[result.length - 1] = end;
  return simplify(result);
}
export function padded(nodes: Block[], margin: number): Rect[] {
  return nodes.map((n) => ({
    x: n.x - margin,
    y: n.y - margin,
    w: n.w + margin * 2,
    h: n.h + margin * 2,
  }));
}
export function nearestOnSegment(p: Point, a: Point, b: Point): Point {
  const vx = b.x - a.x,
    vy = b.y - a.y,
    length = vx * vx + vy * vy,
    t = length
      ? Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / length))
      : 0;
  return { x: a.x + t * vx, y: a.y + t * vy };
}
