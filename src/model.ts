import {
  orthogonalRoute,
  padded,
  intersects,
  simplify,
  nearestOnSegment,
  directions,
} from "./router";
import {
  syncDfd,
  dfdBlockCode,
  dfdConnectionError,
  validateDfd,
  kindOf,
  type NodeKind,
} from "./dfd";
import { attributes } from "./idef1x";
export type Notation = "IDEF0" | "DFD" | "IDEF3" | "IDEF1X";
export type Side = "left" | "top" | "right" | "bottom";
export type Endpoint =
  | { kind: "node"; nodeId: string; side: Side; at: number }
  | { kind: "boundary"; side: Side; at: number };
export type Block = {
  center?: string;
  rate?: number;
  hours?: number;
  frequency?: number;
  role?: string;
  cost?: number;
  synchronous?: boolean;
  referentId?: string;
  attributes?: string;
  junction?: "AND" | "OR" | "XOR";
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  description: string;
  childId?: string;
  kind?: NodeKind;
  contextOf?: string;
};
export type Arrow = {
  identifying?: boolean;
  cardinality?: "many" | "oneOrMore" | "zeroOrOne" | "one";
  optionalParent?: boolean;
  id: string;
  flowId: string;
  source: Endpoint | null;
  target: Endpoint | null;
  originArrowId?: string;
  inheritedSide?: Side;
  route?: number;
  labelDx?: number;
  labelDy?: number;
  routing?: "auto" | "manual";
  waypoints?: Point[];
  tunnelSource?: boolean;
  tunnelTarget?: boolean;
  suppressed?: boolean;
  inheritedDirection?: "in" | "out";
};
export type Diagram = {
  notation?: Notation;
  id: string;
  parentDiagramId?: string;
  parentNodeId?: string;
  nodes: Block[];
  arrows: Arrow[];
};
export type Project = {
  format: "idef-studio";
  version: 3;
  notation: Notation;
  showCrossings: boolean;
  title: string;
  organization: string;
  author: string;
  rootId: string;
  diagrams: Record<string, Diagram>;
  flows: Record<string, { name: string; definition?: string }>;
};
export const PAGE = {
  w: 1440,
  h: 900,
  left: 55,
  right: 1385,
  top: 100,
  bottom: 765,
};
export const sideNames: Record<Side, string> = {
  left: "Вход",
  top: "Управление",
  right: "Выход",
  bottom: "Механизм",
};
export const sides: Side[] = ["left", "top", "right", "bottom"];
export const uid = () => crypto.randomUUID();
export const clone = <T>(v: T): T => structuredClone(v);
export const nodeEnd = (nodeId: string, side: Side, at = 0.5): Endpoint => ({
  kind: "node",
  nodeId,
  side,
  at,
});
export const boundary = (side: Side, at = 0.5): Endpoint => ({
  kind: "boundary",
  side,
  at,
});
export function newProject(
  title = "Новая модель",
  notation: Notation = "IDEF0",
): Project {
  const id = uid();
  return {
    format: "idef-studio",
    version: 3,
    notation,
    showCrossings: true,
    title,
    organization: "",
    author: "",
    rootId: id,
    diagrams: { [id]: { id, nodes: [], arrows: [] } },
    flows: {},
  };
}
export function notationOf(p: Project, did: string): Notation {
  return p.diagrams[did]?.notation ?? p.notation;
}
export function addBlock(
  p: Project,
  did: string,
  name = "Новая функция",
  x = 480,
  y = 320,
  kind: NodeKind = "process",
): Block {
  const b: Block = {
    id: uid(),
    name,
    x,
    y,
    w: 235,
    h: 105,
    color: "#ffffff",
    description: "",
  };
  if (notationOf(p, did) === "DFD") {
    b.kind = kind;
    if (kind === "entity") b.color = "#edf2f8";
    if (kind === "store") {
      b.color = "#edf8f4";
      b.h = 85;
    }
  }
  if (notationOf(p, did) === "IDEF1X") {
    b.w = 280;
    b.h = 220;
    b.attributes = "PK id\nНазвание";
  }
  p.diagrams[did].nodes.push(b);
  return b;
}
export function addArrow(
  p: Project,
  did: string,
  source: Endpoint | null,
  target: Endpoint | null,
  name = "Новый поток",
): Arrow {
  if (notationOf(p, did) === "DFD") {
    const error = dfdConnectionError(p.diagrams[did], source, target);
    if (error) throw Error(error);
  }
  const flowId = uid();
  p.flows[flowId] = { name };
  const a: Arrow = { id: uid(), flowId, source, target };
  if (notationOf(p, did) === "IDEF0" && did !== p.rootId) {
    if (source?.kind === "boundary") a.tunnelSource = true;
    if (target?.kind === "boundary") a.tunnelTarget = true;
  }
  p.diagrams[did].arrows.push(a);
  syncInheritance(p);
  return a;
}
export const visibleArrows = (d: Diagram) =>
  d.arrows.filter((a) => !a.suppressed);
export function tunnelAt(a: Arrow, which: "source" | "target"): boolean {
  return !!a[which === "source" ? "tunnelSource" : "tunnelTarget"];
}
export function setTunnel(
  p: Project,
  did: string,
  aid: string,
  which: "source" | "target",
  value: boolean,
): void {
  if (notationOf(p, did) === "DFD")
    throw Error(
      "Туннели относятся к IDEF0. В DFD сохраняйте баланс потоков между уровнями.",
    );
  const a = p.diagrams[did].arrows.find((a) => a.id === aid);
  if (!a || !a[which]) throw Error("Конец стрелки не найден");
  if (a[which]!.kind === "boundary" && (a.originArrowId || did === p.rootId))
    throw Error("Наследованная и контекстная границы не туннелируются здесь.");
  a[which === "source" ? "tunnelSource" : "tunnelTarget"] = value;
  syncInheritance(p);
}
export function icomCode(
  p: Project,
  did: string,
  a: Arrow,
): string | undefined {
  if (notationOf(p, did) !== "IDEF0") return;
  const d = p.diagrams[did];
  if (!a.originArrowId || !d.parentDiagramId) return;
  const parent = p.diagrams[d.parentDiagramId],
    origin = parent.arrows.find((x) => x.id === a.originArrowId);
  if (!origin) return;
  const side = touchingSide(origin, d.parentNodeId!)!;
  const connected = visibleArrows(parent).filter(
    (x) => touchingSide(x, d.parentNodeId!) === side,
  );
  const ep = (x: Arrow) =>
    x.target?.kind === "node" && x.target.nodeId === d.parentNodeId
      ? x.target
      : x.source!;
  connected.sort((a, b) => ep(a).at - ep(b).at);
  return `${{ left: "I", top: "C", right: "O", bottom: "M" }[side]}${connected.findIndex((x) => x.id === origin.id) + 1}`;
}
export function diagramCode(p: Project, did: string): string {
  const d = p.diagrams[did];
  if (notationOf(p, did) === "IDEF1X") return "Модель данных";
  if (notationOf(p, did) === "IDEF3")
    return d.parentNodeId ? "Декомпозиция" : "Сценарий";
  if (notationOf(p, did) === "DFD")
    return d.parentDiagramId
      ? `DFD ${dfdBlockCode(p, d.parentDiagramId, d.parentNodeId!)}`
      : "Контекст";
  if (!d?.parentDiagramId) return "A-0";
  return blockCode(p, d.parentDiagramId, d.parentNodeId!);
}
export function blockCode(p: Project, did: string, nid: string): string {
  if (notationOf(p, did) === "IDEF1X") return "";
  if (notationOf(p, did) === "IDEF3")
    return String(p.diagrams[did].nodes.findIndex((n) => n.id === nid) + 1);
  if (notationOf(p, did) === "DFD") return dfdBlockCode(p, did, nid);
  const d = p.diagrams[did];
  const i = d.nodes.findIndex((n) => n.id === nid);
  return did === p.rootId
    ? i === 0
      ? "A0"
      : `A0.${i + 1}`
    : `${diagramCode(p, did) === "A0" ? "A" : diagramCode(p, did)}${i + 1}`;
}
export function diagramTitle(p: Project, did: string): string {
  const d = p.diagrams[did];
  return d.parentDiagramId
    ? p.diagrams[d.parentDiagramId].nodes.find((n) => n.id === d.parentNodeId)
        ?.name || p.title
    : p.title;
}
export function touchingSide(a: Arrow, nid: string): Side | undefined {
  if (a.target?.kind === "node" && a.target.nodeId === nid)
    return a.target.side;
  if (a.source?.kind === "node" && a.source.nodeId === nid)
    return a.source.side;
}
export function decompose(
  p: Project,
  did: string,
  nid: string,
  count = 3,
  notation: Notation = notationOf(p, did),
): string {
  if (notationOf(p, did) === "IDEF1X")
    throw Error("Сущности не декомпозируются");
  const n = p.diagrams[did].nodes.find((n) => n.id === nid);
  if (!n) throw Error("Функция не найдена");
  if (notationOf(p, did) === "DFD" && (kindOf(n) !== "process" || n.contextOf))
    throw Error("Декомпозиция доступна только для локальных процессов.");
  if (n.childId) return n.childId;
  if (
    notation !== notationOf(p, did) &&
    !(notationOf(p, did) === "IDEF0" && ["DFD", "IDEF3"].includes(notation))
  )
    throw Error("Переход между нотациями недоступен");
  const id = uid();
  p.diagrams[id] = {
    id,
    ...(notation !== p.notation ? { notation } : {}),
    parentDiagramId: did,
    parentNodeId: nid,
    nodes: [],
    arrows: [],
  };
  n.childId = id;
  for (let i = 0; i < count; i++)
    addBlock(
      p,
      id,
      `${notation === "DFD" ? "Процесс" : notation === "IDEF3" ? "Действие" : "Функция"} ${i + 1}`,
      notationOf(p, did) === "DFD"
        ? 350 + (i % 3) * 270
        : count > 4
          ? 200 + (i % 3) * 370
          : 220 + i * 260,
      notationOf(p, did) === "DFD"
        ? 275 + Math.floor(i / 3) * 230
        : count > 4
          ? 240 + Math.floor(i / 3) * 280
          : 210 + i * 130,
    );
  syncInheritance(p);
  return id;
}
// Boundary continuations refer to a parent arrow and share its flow, never copied labels.
export function syncInheritance(p: Project): void {
  if (p.notation === "IDEF1X") {
    for (const d of Object.values(p.diagrams))
      for (const n of d.nodes)
        n.h = Math.max(n.h, 90 + attributes(d, n).length * 21);
    return;
  }
  if (Object.values(p.diagrams).some((d) => notationOf(p, d.id) === "DFD"))
    syncDfd(p);
  const visit = (did: string) => {
    const d = p.diagrams[did];
    for (const a of d.arrows) if (!a.originArrowId) delete a.suppressed;
    for (const n of d.nodes) {
      if (!n.childId) continue;
      const child = p.diagrams[n.childId];
      if (!child) continue;
      if (
        notationOf(p, did) !== "IDEF0" ||
        notationOf(p, child.id) !== "IDEF0"
      ) {
        visit(child.id);
        continue;
      }
      const attached = d.arrows.filter((a) => touchingSide(a, n.id));
      const ids = new Set(attached.map((a) => a.id));
      child.arrows = child.arrows.filter(
        (a) => !a.originArrowId || ids.has(a.originArrowId),
      );
      for (const side of sides) {
        const onSide = attached.filter((a) => touchingSide(a, n.id) === side);
        onSide.forEach((a, i) => {
          const copies = child.arrows.filter((c) => c.originArrowId === a.id);
          if (!copies.length) {
            const ep = boundary(side, (i + 1) / (onSide.length + 1));
            child.arrows.push({
              id: uid(),
              flowId: a.flowId,
              source: side === "right" ? null : ep,
              target: side === "right" ? ep : null,
              originArrowId: a.id,
              inheritedSide: side,
              ...(a.suppressed ||
              tunnelAt(
                a,
                a.target?.kind === "node" && a.target.nodeId === n.id
                  ? "target"
                  : "source",
              )
                ? { suppressed: true }
                : {}),
            });
          } else
            copies.forEach((c) => {
              c.flowId = a.flowId;
              if (
                a.suppressed ||
                tunnelAt(
                  a,
                  a.target?.kind === "node" && a.target.nodeId === n.id
                    ? "target"
                    : "source",
                )
              )
                c.suppressed = true;
              else delete c.suppressed;
              if (c.inheritedSide !== side) {
                c.inheritedSide = side;
                c.source = side === "right" ? null : boundary(side);
                c.target = side === "right" ? boundary(side) : null;
              }
            });
        });
      }
      visit(child.id);
    }
  };
  visit(p.rootId);
}
export function deleteBlock(p: Project, did: string, nid: string): void {
  const d = p.diagrams[did],
    n = d.nodes.find((n) => n.id === nid);
  if (!n) return;
  if (n.contextOf) return;
  const removeTree = (id: string) => {
    const sub = p.diagrams[id];
    for (const b of sub.nodes) if (b.childId) removeTree(b.childId);
    delete p.diagrams[id];
  };
  if (n.childId) removeTree(n.childId);
  d.nodes = d.nodes.filter((b) => b.id !== nid);
  d.arrows = d.arrows.filter((a) => {
    const hitS = a.source?.kind === "node" && a.source.nodeId === nid,
      hitT = a.target?.kind === "node" && a.target.nodeId === nid;
    if (a.originArrowId) {
      if (hitS) {
        a.source = null;
        delete a.tunnelSource;
      }
      if (hitT) {
        a.target = null;
        delete a.tunnelTarget;
      }
      return true;
    }
    return !hitS && !hitT;
  });
  syncInheritance(p);
}
export function deleteArrow(p: Project, did: string, aid: string): void {
  const d = p.diagrams[did],
    a = d.arrows.find((a) => a.id === aid);
  if (!a) return;
  if (
    a.originArrowId &&
    d.arrows.filter((b) => b.originArrowId === a.originArrowId).length === 1
  ) {
    if (a.inheritedSide === "right" || a.inheritedDirection === "out") {
      a.source = null;
      delete a.tunnelSource;
    } else {
      a.target = null;
      delete a.tunnelTarget;
    }
  } else d.arrows = d.arrows.filter((a) => a.id !== aid);
  syncInheritance(p);
}
export function branchArrow(p: Project, did: string, aid: string): Arrow {
  const d = p.diagrams[did],
    a = d.arrows.find((a) => a.id === aid)!;
  const b: Arrow = {
    ...clone(a),
    id: uid(),
    route: undefined,
    waypoints: undefined,
    routing: "auto",
    labelDx: 0,
    labelDy: 0,
  };
  if (
    (b.target?.kind === "boundary" && b.target.side === "right") ||
    b.inheritedDirection === "out"
  ) {
    b.source = null;
    delete b.tunnelSource;
  } else {
    b.target = null;
    delete b.tunnelTarget;
  }
  d.arrows.push(b);
  syncInheritance(p);
  return b;
}
export type Point = { x: number; y: number };
export function position(d: Diagram, e: Endpoint): Point {
  if (e.kind === "boundary")
    return e.side === "left"
      ? { x: PAGE.left, y: PAGE.top + e.at * (PAGE.bottom - PAGE.top) }
      : e.side === "right"
        ? { x: PAGE.right, y: PAGE.top + e.at * (PAGE.bottom - PAGE.top) }
        : e.side === "top"
          ? { x: PAGE.left + e.at * (PAGE.right - PAGE.left), y: PAGE.top }
          : { x: PAGE.left + e.at * (PAGE.right - PAGE.left), y: PAGE.bottom };
  const n = d.nodes.find((n) => n.id === e.nodeId);
  if (!n) return { x: 0, y: 0 };
  return e.side === "left"
    ? { x: n.x, y: n.y + n.h * e.at }
    : e.side === "right"
      ? { x: n.x + n.w, y: n.y + n.h * e.at }
      : e.side === "top"
        ? { x: n.x + n.w * e.at, y: n.y }
        : { x: n.x + n.w * e.at, y: n.y + n.h };
}
const vec: Record<Side, Point> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
};
export function legacyArrowGeometry(
  d: Diagram,
  a: Arrow,
): { points: Point[]; label: Point; handle: Point; axis: "x" | "y" } {
  const se = a.source,
    te = a.target;
  const sp = se ? position(d, se) : null,
    tp = te ? position(d, te) : null;
  if (!sp || !tp) {
    const ep = se || te!;
    const pt = sp || tp!;
    const v = vec[ep.side];
    const sign = ep.kind === "boundary" ? -1 : 1;
    const other = { x: pt.x + v.x * 95 * sign, y: pt.y + v.y * 95 * sign };
    const points = sp ? [pt, other] : [other, pt];
    return {
      points,
      label: { x: (pt.x + other.x) / 2 + 8, y: (pt.y + other.y) / 2 - 10 },
      handle: other,
      axis: "x",
    };
  }
  const sv = vec[se!.side],
    tv = vec[te!.side];
  const s = {
    x: sp.x + sv.x * (se!.kind === "boundary" ? -24 : 24),
    y: sp.y + sv.y * (se!.kind === "boundary" ? -24 : 24),
  };
  const t = {
    x: tp.x + tv.x * (te!.kind === "boundary" ? -24 : 24),
    y: tp.y + tv.y * (te!.kind === "boundary" ? -24 : 24),
  };
  const sh = sv.x !== 0,
    th = tv.x !== 0;
  let mids: Point[], axis: "x" | "y", handle: Point;
  if (sh && th) {
    axis = "x";
    const x = a.route ?? (s.x + t.x) / 2;
    mids = [
      { x, y: s.y },
      { x, y: t.y },
    ];
    handle = { x, y: (s.y + t.y) / 2 };
  } else if (!sh && !th) {
    axis = "y";
    const y = a.route ?? (s.y + t.y) / 2;
    mids = [
      { x: s.x, y },
      { x: t.x, y },
    ];
    handle = { x: (s.x + t.x) / 2, y };
  } else if (sh) {
    axis = "x";
    const x = a.route ?? Math.max(s.x, t.x + 35);
    mids = [{ x, y: s.y }, { x, y: t.y }, t];
    handle = { x, y: (s.y + t.y) / 2 };
  } else {
    axis = "y";
    const y = a.route ?? Math.min(s.y, t.y - 35);
    mids = [{ x: s.x, y }, { x: t.x, y }, t];
    handle = { x: (s.x + t.x) / 2, y };
  }
  const points = [sp, s, ...mids, t, tp].filter(
    (v, i, arr) => i === 0 || v.x !== arr[i - 1].x || v.y !== arr[i - 1].y,
  );
  let longest = 0,
    label = { x: 0, y: 0 };
  for (let i = 1; i < points.length; i++) {
    const b = points[i - 1],
      c = points[i],
      len = Math.abs(b.x - c.x) + Math.abs(b.y - c.y);
    if (len > longest) {
      longest = len;
      label = {
        x: (b.x + c.x) / 2 + (b.x === c.x ? 9 : 0),
        y: (b.y + c.y) / 2 - 9,
      };
    }
  }
  return { points, label, handle, axis };
}
export type ArrowGeometry = ReturnType<typeof legacyArrowGeometry> & {
  blocked?: string;
  legs?: Point[][];
};
function geometryFromPath(
  d: Diagram,
  points: Point[],
  legs: Point[][],
): ArrowGeometry {
  let longest = -1,
    handle = points[0],
    axis: "x" | "y" = "x";
  let best = -Infinity,
    label = { x: points[0].x, y: points[0].y - 15 };
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i],
      length = Math.abs(a.x - b.x) + Math.abs(a.y - b.y),
      horizontal = a.y === b.y;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (length > longest) {
      longest = length;
      handle = mid;
      axis = horizontal ? "y" : "x";
    }
    for (const offset of horizontal
      ? [
          { x: 0, y: -12 },
          { x: 0, y: -42 },
          { x: 0, y: 22 },
        ]
      : [
          { x: 88, y: -15 },
          { x: -88, y: -15 },
        ]) {
      const p = {
        x: Math.max(100, Math.min(1340, mid.x + offset.x)),
        y: Math.max(90, Math.min(775, mid.y + offset.y)),
      };
      const overlap = d.nodes.some(
        (n) =>
          p.x + 78 > n.x &&
          p.x - 78 < n.x + n.w &&
          p.y + 32 > n.y &&
          p.y - 12 < n.y + n.h,
      );
      const score =
        length +
        (horizontal ? 50 : 0) -
        (overlap ? 10000 : 0) -
        Math.abs(offset.y) * 0.1;
      if (score > best) {
        best = score;
        label = p;
      }
    }
  }
  return { points, label, handle, axis, legs };
}
export function arrowGeometry(d: Diagram, a: Arrow): ArrowGeometry {
  if (!a.source || !a.target) return legacyArrowGeometry(d, a);
  if (a.route !== undefined && a.routing !== "auto" && !a.waypoints?.length) {
    const geo = legacyArrowGeometry(d, a);
    const blocked = geo.points.some(
      (pt, i) =>
        i > 0 && d.nodes.some((n) => intersects(geo.points[i - 1], pt, n)),
    );
    return {
      ...geo,
      legs: [geo.points],
      ...(blocked
        ? {
            blocked:
              "Старый ручной маршрут пересекает блок. Нажмите «Автоматически».",
          }
        : {}),
    };
  }
  const sp = position(d, a.source),
    tp = position(d, a.target),
    sv = vec[a.source.side],
    tv = vec[a.target.side];
  const sd = {
    x: sv.x * (a.source.kind === "boundary" ? -1 : 1),
    y: sv.y * (a.source.kind === "boundary" ? -1 : 1),
  };
  const ed = {
    x: tv.x * (a.target.kind === "boundary" ? 1 : -1),
    y: tv.y * (a.target.kind === "boundary" ? 1 : -1),
  };
  const startDir = directions.findIndex((v) => v.x === sd.x && v.y === sd.y),
    endDir = directions.findIndex((v) => v.x === ed.x && v.y === ed.y);
  const pins = a.waypoints || [];
  if (
    !pins.length &&
    ((sp.x === tp.x && sd.y === ed.y && (tp.y - sp.y) * sd.y > 0) ||
      (sp.y === tp.y && sd.x === ed.x && (tp.x - sp.x) * sd.x > 0)) &&
    !d.nodes.some((n) => intersects(sp, tp, n))
  )
    return geometryFromPath(d, [sp, tp], [[sp, tp]]);
  const s = { x: sp.x + sd.x * 16, y: sp.y + sd.y * 16 },
    t = { x: tp.x - ed.x * 16, y: tp.y - ed.y * 16 };
  for (const margin of [12, 4]) {
    const obstacles = padded(d.nodes, margin),
      checkpoints = [s, ...pins, t],
      legs: Point[][] = [];
    for (let i = 1; i < checkpoints.length; i++) {
      const route = orthogonalRoute(
        checkpoints[i - 1],
        checkpoints[i],
        obstacles,
        i === 1 ? startDir : undefined,
        i === checkpoints.length - 1 ? endDir : undefined,
      );
      if (!route) break;
      legs.push(route);
    }
    if (legs.length !== checkpoints.length - 1) continue;
    legs[0] = [sp, ...legs[0]];
    legs[legs.length - 1] = [...legs.at(-1)!, tp];
    const points = simplify(legs.flat());
    if (
      points.some(
        (pt, i) =>
          i > 0 && d.nodes.some((n) => intersects(points[i - 1], pt, n)),
      )
    )
      continue;
    return geometryFromPath(d, points, legs);
  }
  return {
    ...legacyArrowGeometry(d, a),
    blocked: pins.length
      ? "Опорная точка или блок перекрывает маршрут. Передвиньте точку либо верните автоматическую разводку."
      : "Нет свободного маршрута. Раздвиньте пересекающиеся или слишком близкие блоки.",
  };
}
export function addWaypoint(d: Diagram, a: Arrow, point: Point): void {
  const geo = arrowGeometry(d, a);
  let distance = Infinity,
    insert = 0,
    nearest = point;
  for (const [legIndex, leg] of (geo.legs || [geo.points]).entries())
    for (let i = 1; i < leg.length; i++) {
      const q = nearestOnSegment(point, leg[i - 1], leg[i]),
        dist = Math.hypot(q.x - point.x, q.y - point.y);
      if (dist < distance) {
        distance = dist;
        nearest = q;
        insert = legIndex;
      }
    }
  if ((a.waypoints?.length || 0) >= 24)
    throw Error("Максимум 24 опорные точки на стрелку.");
  a.waypoints ??= [];
  a.waypoints.splice(Math.min(insert, a.waypoints.length), 0, nearest);
  a.routing = "manual";
  delete a.route;
}
export function resetRoute(a: Arrow): void {
  a.routing = "auto";
  delete a.route;
  delete a.waypoints;
}
export type Issue = { diagramId: string; objectId?: string; text: string };
export function validate(p: Project): Issue[] {
  return Object.values(p.diagrams).flatMap((d) =>
    validateDiagram({ ...p, notation: notationOf(p, d.id) }, d),
  );
}
function validateDiagram(p: Project, diagram: Diagram): Issue[] {
  if (p.notation === "IDEF1X") {
    const issues: Issue[] = [];
    for (const d of [diagram]) {
      for (const n of d.nodes) {
        const rows = attributes(d, n);
        if (!rows.some((a) => a.pk))
          issues.push({
            diagramId: d.id,
            objectId: n.id,
            text: "У сущности нет первичного ключа.",
          });
        if (new Set(rows.map((a) => a.name.toLowerCase())).size !== rows.length)
          issues.push({
            diagramId: d.id,
            objectId: n.id,
            text: "Повторяющиеся имена атрибутов.",
          });
      }
      for (const a of d.arrows)
        if (!a.source || !a.target)
          issues.push({
            diagramId: d.id,
            objectId: a.id,
            text: "Связь сущностей не подключена.",
          });
    }
    return issues;
  }
  if (p.notation === "IDEF3") {
    const issues: Issue[] = [];
    for(const a of diagram.arrows) if(!a.source || !a.target)issues.push({diagramId:diagram.id,objectId:a.id,text:"Связь предшествования не подключена."});
    for(const n of diagram.nodes){
      if(n.referentId && !Object.values(p.diagrams).some(d=>d.id===n.referentId || d.nodes.some(x=>x.id===n.referentId)))issues.push({diagramId:diagram.id,objectId:n.id,text:"Объект референта был удалён. Выберите другую ссылку."});
      if(n.synchronous){
        const incoming=diagram.arrows.filter(a=>a.target?.kind==="node" && a.target.nodeId===n.id).length;
        const outgoing=diagram.arrows.filter(a=>a.source?.kind==="node" && a.source.nodeId===n.id).length;
        if(!["AND","OR"].includes(n.junction||"") || !(incoming===1 && outgoing>=2 || outgoing===1 && incoming>=2))issues.push({diagramId:diagram.id,objectId:n.id,text:"Синхронный AND/OR должен соединять одну ветвь с несколькими."});
      }
    }
    return issues;
  }
  if (p.notation === "DFD") {
    const issues = validateDfd(p, [diagram]);
    for (const d of [diagram])
      for (const a of d.arrows)
        if (a.source && a.target) {
          const g = arrowGeometry(d, a);
          if (g.blocked)
            issues.push({ diagramId: d.id, objectId: a.id, text: g.blocked });
        }
    return issues;
  }
  const out: Issue[] = [];
  for (const d of [diagram]) {
    if (d.id === p.rootId && d.nodes.length !== 1)
      out.push({
        diagramId: d.id,
        text: "Контекстная диаграмма должна содержать одну функцию.",
      });
    if (d.id !== p.rootId && (d.nodes.length < 3 || d.nodes.length > 6))
      out.push({
        diagramId: d.id,
        text: "Для учебной декомпозиции рекомендуется от 3 до 6 функций.",
      });
    for (const n of d.nodes) {
      if (!n.name.trim())
        out.push({
          diagramId: d.id,
          objectId: n.id,
          text: "У функции нет названия.",
        });
      if (
        !visibleArrows(d).some(
          (a) =>
            a.target?.kind === "node" &&
            a.target.nodeId === n.id &&
            a.target.side === "top",
        )
      )
        out.push({
          diagramId: d.id,
          objectId: n.id,
          text: `${blockCode(p, d.id, n.id)}: не подключено управление.`,
        });
      if (
        !visibleArrows(d).some(
          (a) => a.source?.kind === "node" && a.source.nodeId === n.id,
        )
      )
        out.push({
          diagramId: d.id,
          objectId: n.id,
          text: `${blockCode(p, d.id, n.id)}: не подключён выход.`,
        });
    }
    for (const a of visibleArrows(d)) {
      if (!a.source || !a.target)
        out.push({
          diagramId: d.id,
          objectId: a.id,
          text: `«${p.flows[a.flowId]?.name}»: ${a.originArrowId ? "наследованная стрелка" : "стрелка"} не подключена.`,
        });
      if (!p.flows[a.flowId]?.name.trim())
        out.push({
          diagramId: d.id,
          objectId: a.id,
          text: "У стрелки нет названия.",
        });
      if (a.source && a.target) {
        const geo = arrowGeometry(d, a);
        if (geo.blocked)
          out.push({
            diagramId: d.id,
            objectId: a.id,
            text: `«${p.flows[a.flowId]?.name}»: ${geo.blocked}`,
          });
      }
      if (d.id !== p.rootId && !a.originArrowId) {
        for (const which of ["source", "target"] as const)
          if (a[which]?.kind === "boundary" && !tunnelAt(a, which))
            out.push({
              diagramId: d.id,
              objectId: a.id,
              text: "Локальная граничная стрелка не связана с родителем. Отметьте туннель на границе.",
            });
      }
    }
  }
  return out;
}
export function serialize(p: Project): string {
  const extended =
    Object.values(p.diagrams).some(
      (d) =>
        d.notation ||
        d.nodes.some((n) =>
          [
            n.cost,
            n.role,
            n.rate,
            n.hours,
            n.frequency,
            n.center,
            n.referentId,
            n.synchronous,
          ].some((v) => v !== undefined),
        ),
    ) || Object.values(p.flows).some((f) => f.definition !== undefined);
  return JSON.stringify({ ...p, version: extended ? 4 : 3 }, null, 2);
}
export function parseProject(text: string): Project {
  if (text.length > 20_000_000)
    throw Error("Файл слишком большой (максимум 20 МБ).");
  let p: Project;
  try {
    p = JSON.parse(text);
  } catch {
    throw Error("Файл не содержит корректный JSON.");
  }
  const fail = () => {
    throw Error("Некорректный проект IDEF Studio.");
  };
  if (!p || p.format !== "idef-studio" || ![1, 2, 3, 4].includes(p.version))
    throw Error("Нужен файл проекта IDEF Studio версии 1–4 (.idef.json).");
  const legacy = (p.version as number) === 1;
  if ((p.version as number) < 3) {
    p.notation = "IDEF0";
    p.showCrossings = true;
  }
  if (
    !["IDEF0", "DFD", "IDEF3", "IDEF1X"].includes(p.notation) ||
    typeof p.showCrossings !== "boolean"
  )
    fail();
  if (
    typeof p.title !== "string" ||
    typeof p.organization !== "string" ||
    typeof p.author !== "string" ||
    !p.diagrams ||
    !p.flows ||
    !Object.hasOwn(p.diagrams, p.rootId)
  )
    fail();
  const entries = Object.entries(p.diagrams);
  if (entries.length > 2000) fail();
  const ids = new Set<string>();
  const reg = (id: string) => {
    if (
      typeof id !== "string" ||
      !id ||
      ids.has(id) ||
      ["__proto__", "constructor", "prototype"].includes(id)
    )
      fail();
    ids.add(id);
  };
  const finite = (v: number) =>
    typeof v === "number" && Number.isFinite(v) && Math.abs(v) < 100000;
  for (const [id, d] of entries) {
    if (
      d.id !== id ||
      !Array.isArray(d.nodes) ||
      !Array.isArray(d.arrows) ||
      d.nodes.length > 500 ||
      d.arrows.length > 4000
    )
      fail();
    if (
      d.notation !== undefined &&
      !["IDEF0", "DFD", "IDEF3"].includes(d.notation)
    )
      fail();
    reg(id);
    for (const n of d.nodes) {
      reg(n.id);
      if (
        [n.rate, n.hours, n.frequency].some(
          (v) => v !== undefined && (!Number.isFinite(v) || v < 0),
        ) ||
        (n.center !== undefined && typeof n.center !== "string")
      )
        fail();
      if (
        (n.role !== undefined && typeof n.role !== "string") ||
        (n.cost !== undefined && (!Number.isFinite(n.cost) || n.cost < 0)) ||
        (n.referentId !== undefined && typeof n.referentId !== "string") ||
        (n.synchronous !== undefined && typeof n.synchronous !== "boolean")
      )
        fail();
      if (
        n.attributes !== undefined &&
        (typeof n.attributes !== "string" || n.attributes.length > 10000)
      )
        fail();
      if (
        n.kind !== undefined &&
        !["process", "entity", "store"].includes(n.kind)
      )
        fail();
      if (
        n.contextOf !== undefined &&
        (typeof n.contextOf !== "string" ||
          notationOf(p, d.id) !== "DFD" ||
          kindOf(n) === "process" ||
          n.childId)
      )
        fail();
      if (notationOf(p, d.id) === "IDEF0" && n.kind && n.kind !== "process")
        fail();
      if (n.childId && kindOf(n) !== "process") fail();
      if (
        typeof n.name !== "string" ||
        typeof n.description !== "string" ||
        typeof n.color !== "string" ||
        !/^#[a-fA-F0-9]{6}$/.test(n.color) ||
        ![n.x, n.y, n.w, n.h].every(finite) ||
        n.w < 40 ||
        n.h < 30
      )
        fail();
    }
    for (const a of d.arrows) {
      reg(a.id);
      if (
        a.cardinality !== undefined &&
        !["many", "oneOrMore", "zeroOrOne", "one"].includes(a.cardinality)
      )
        fail();
      if (
        a.optionalParent !== undefined &&
        typeof a.optionalParent !== "boolean"
      )
        fail();
      if (a.identifying !== undefined && typeof a.identifying !== "boolean")
        fail();
      if (
        !Object.hasOwn(p.flows, a.flowId) ||
        typeof p.flows[a.flowId].name !== "string" ||
        (!a.source && !a.target)
      )
        fail();
      for (const v of [a.route, a.labelDx, a.labelDy])
        if (v !== undefined && !finite(v)) fail();
      if (
        a.inheritedDirection !== undefined &&
        !["in", "out"].includes(a.inheritedDirection)
      )
        fail();
      if (
        notationOf(p, d.id) === "DFD" &&
        (a.tunnelSource ||
          a.tunnelTarget ||
          a.suppressed ||
          a.source?.kind === "boundary" ||
          a.target?.kind === "boundary")
      )
        fail();
      if (a.routing !== undefined && !["auto", "manual"].includes(a.routing))
        fail();
      if (
        a.waypoints !== undefined &&
        (!Array.isArray(a.waypoints) ||
          a.waypoints.length > 24 ||
          a.waypoints.some((pt) => !pt || !finite(pt.x) || !finite(pt.y)))
      )
        fail();
      for (const key of ["tunnelSource", "tunnelTarget", "suppressed"] as const)
        if (a[key] !== undefined && typeof a[key] !== "boolean") fail();
      if (legacy && d.id !== p.rootId && !a.originArrowId) {
        if (a.source?.kind === "boundary") a.tunnelSource = true;
        if (a.target?.kind === "boundary") a.tunnelTarget = true;
      }
      for (const [ep, isSource] of [
        [a.source, true],
        [a.target, false],
      ] as const) {
        if (!ep) continue;
        if (
          !sides.includes(ep.side) ||
          !finite(ep.at) ||
          ep.at < 0 ||
          ep.at > 1 ||
          !["node", "boundary"].includes(ep.kind)
        )
          fail();
        if (ep.kind === "node" && !d.nodes.some((n) => n.id === ep.nodeId))
          fail();
        if (
          notationOf(p, d.id) === "IDEF0" &&
          (isSource
            ? ep.kind === "node"
              ? ep.side !== "right"
              : ep.side === "right"
            : ep.kind === "node"
              ? ep.side === "right"
              : ep.side !== "right")
        )
          fail();
      }
    }
  }
  for (const flow of Object.values(p.flows))
    if (flow.definition !== undefined && typeof flow.definition !== "string")
      fail();
  const visited = new Set<string>();
  const walk = (id: string) => {
    if (visited.has(id)) fail();
    visited.add(id);
    const d = p.diagrams[id];
    for (const n of d.nodes)
      if (
        n.contextOf &&
        (!d.parentDiagramId ||
          !p.diagrams[d.parentDiagramId]?.nodes.some(
            (x) => x.id === n.contextOf,
          ))
      )
        fail();
    for (const n of d.nodes)
      if (n.childId) {
        const c = p.diagrams[n.childId];
        if (!c || c.parentDiagramId !== id || c.parentNodeId !== n.id) fail();
        walk(n.childId);
      }
    for (const a of d.arrows)
      if (a.originArrowId) {
        const parent = p.diagrams[d.parentDiagramId!];
        const origin = parent?.arrows.find((x) => x.id === a.originArrowId);
        if (notationOf(p, d.id) === "DFD") {
          if (!origin || a.flowId !== origin.flowId) fail();
          const incoming =
            origin!.target?.kind === "node" &&
            origin!.target.nodeId === d.parentNodeId;
          if (
            !incoming &&
            !(
              origin!.source?.kind === "node" &&
              origin!.source.nodeId === d.parentNodeId
            )
          )
            fail();
          const other = incoming ? origin!.source : origin!.target,
            ep = incoming ? a.source : a.target;
          const ctx =
            ep?.kind === "node"
              ? d.nodes.find((n) => n.id === ep.nodeId)
              : undefined;
          if (
            a.inheritedDirection !== (incoming ? "in" : "out") ||
            other?.kind !== "node" ||
            ctx?.contextOf !== other.nodeId
          )
            fail();
          continue;
        }
        const side = origin && touchingSide(origin, d.parentNodeId!);
        const ep = side === "right" ? a.target : a.source;
        if (
          !origin ||
          a.flowId !== origin.flowId ||
          a.inheritedSide !== side ||
          ep?.kind !== "boundary" ||
          ep.side !== side
        )
          fail();
        if (
          (a.source?.kind === "boundary" && a.tunnelSource) ||
          (a.target?.kind === "boundary" && a.tunnelTarget)
        )
          fail();
      }
  };
  if (p.diagrams[p.rootId].parentDiagramId) fail();
  walk(p.rootId);
  if (visited.size !== entries.length) fail();
  p.version = 3;
  syncInheritance(p);
  return p;
}
