import {attributes} from "./idef1x";
import { crossingBridges, bridgePath } from "./crossings";
import { useMemo } from "react";
import {
  PAGE,
  arrowGeometry,
  position,
  blockCode,
  diagramCode,
  diagramTitle,
  sideNames,
  sides,
  visibleArrows,
  icomCode,
  tunnelAt,
  type Project,
  type Endpoint,
  type Point,
  type Side,
} from "./model";
export function wrap(text: string, max = 24): string[] {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/)) {
      if (line.length + word.length + 1 > max && line) {
        lines.push(line);
        line = "";
      }
      line += (line ? " " : "") + word;
    }
    lines.push(line);
  }
  return lines.length ? lines : [""];
}
function SvgText({
  text,
  x,
  y,
  max = 24,
  size = 14,
  anchor = "middle",
  weight = 400,
  fill = "#243044",
}: {
  text: string;
  x: number;
  y: number;
  max?: number;
  size?: number;
  anchor?: "middle" | "start" | "end";
  weight?: number;
  fill?: string;
}) {
  const lines = wrap(text, max);
  return (
    <text
      x={x}
      y={y}
      textAnchor={anchor}
      fontSize={size}
      fontWeight={weight}
      fill={fill}
      fontFamily="Arial, sans-serif"
    >
      {lines.map((line, i) => (
        <tspan x={x} dy={i === 0 ? 0 : size * 1.2} key={i}>
          {line}
        </tspan>
      ))}
    </text>
  );
}
type Props = {
  project: Project;
  diagramId: string;
  selected?: string;
  interactive?: boolean;
  showGrid?: boolean;
  connecting?: boolean;
  onSelect?: (id: string) => void;
  onNodeDown?: (e: React.PointerEvent, id: string) => void;
  onRouteDown?: (e: React.PointerEvent, id: string, axis: "x" | "y") => void;
  onLabelDown?: (e: React.PointerEvent, id: string) => void;
  onPort?: (e: React.MouseEvent, ep: Endpoint) => void;
  onDecompose?: (id: string) => void;
  onStub?: (id: string) => void;
  onBoundaryDown?: (e: React.PointerEvent, id: string) => void;
  onWaypointAdd?: (id: string, point: Point) => void;
  onWaypointDown?: (e: React.PointerEvent, id: string, index: number) => void;
  onWaypointRemove?: (id: string, index: number) => void;
};
export function DiagramContent({
  project: p,
  diagramId,
  selected,
  interactive = false,
  showGrid = false,
  connecting = false,
  onSelect,
  onNodeDown,
  onRouteDown,
  onLabelDown,
  onPort,
  onDecompose,
  onStub,
  onBoundaryDown,
  onWaypointAdd,
  onWaypointDown,
  onWaypointRemove,
}: Props) {
  const d = p.diagrams[diagramId];
  const geometries = useMemo(
    () => new Map(visibleArrows(d).map((a) => [a.id, arrowGeometry(d, a)])),
    [d],
  );
  const bridges = useMemo(
    () => (p.showCrossings ? crossingBridges(geometries) : new Map()),
    [geometries, p.showCrossings],
  );
  const gridId = `grid-${diagramId}`,
    marker = `arrow-${diagramId}`;
  return (
    <>
      <defs><marker id={`${marker}-er`} viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6"><circle cx="5" cy="5" r="4" fill="#334155"/></marker>
        <pattern
          id={gridId}
          width="20"
          height="20"
          patternUnits="userSpaceOnUse"
        >
          <circle cx="1" cy="1" r=".8" fill="#dce3ee" />
        </pattern>
        <marker
          id={marker}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#334155" />
        </marker>
      </defs>
      <rect width={PAGE.w} height={PAGE.h} fill="white" />
      {showGrid && (
        <rect
          x="24"
          y="76"
          width="1392"
          height="720"
          fill={`url(#${gridId})`}
          pointerEvents="none"
        />
      )}
      <text
        x="40"
        y="43"
        fontFamily="Arial, sans-serif"
        fontSize="12"
        fontWeight="700"
        letterSpacing="1.7"
        fill="#8492a6"
      >
        {p.notation} ·{" "}
        {diagramId === p.rootId ? "КОНТЕКСТ" : "ДЕКОМПОЗИЦИЯ"}
      </text>
      <text
        x="1400"
        y="43"
        textAnchor="end"
        fontFamily="Arial, sans-serif"
        fontSize="12"
        fill="#8492a6"
      >
        {diagramCode(p, diagramId)}
      </text>
      {visibleArrows(d).map((a) => {
        const geo = geometries.get(a.id)!,
          points = geo.points.map((pt) => `${pt.x},${pt.y}`).join(" "),
          active = selected === a.id,
          label = {
            x: geo.label.x + (a.labelDx || 0),
            y: geo.label.y + (a.labelDy || 0),
          },
          pending = !a.source || !a.target;
        const boundaryEp =
          a.source?.kind === "boundary"
            ? a.source
            : a.target?.kind === "boundary"
              ? a.target
              : null;
        const bp = boundaryEp ? position(d, boundaryEp) : null,
          code = icomCode(p, diagramId, a);
        let labelMax = 25;
        if (
          boundaryEp &&
          ["left", "right"].includes(boundaryEp.side) &&
          a.source &&
          a.target
        ) {
          const from = position(d, a.source),
            to = position(d, a.target),
            gap = Math.abs(to.x - from.x);
          labelMax = Math.max(10, Math.min(25, Math.floor(gap / 7.2)));
          if (gap < 190) {
            label.x = (from.x + to.x) / 2 + (a.labelDx || 0);
            label.y =
              bp!.y -
              12 -
              (wrap(p.flows[a.flowId]?.name || "", labelMax).length - 1) * 15 +
              (a.labelDy || 0);
          }
        }
        return (
          <g
            key={a.id}
            className={interactive ? "diagram-arrow" : ""}
            data-arrow-id={a.id}
          >
            {interactive && (
              <polyline
                points={points}
                fill="none"
                stroke="transparent"
                strokeWidth="18"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect?.(a.id);
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  const svg = e.currentTarget.ownerSVGElement!;
                  const rect = svg.getBoundingClientRect();
                  onWaypointAdd?.(a.id, {
                    x: ((e.clientX - rect.left) * PAGE.w) / rect.width,
                    y: ((e.clientY - rect.top) * PAGE.h) / rect.height,
                  });
                }}
                style={{ cursor: "pointer" }}
              />
            )}
            <polyline
              points={points}
              fill="none"
              stroke={
                geo.blocked
                  ? "#dc5252"
                  : active
                    ? "#4f46e5"
                    : pending
                      ? "#c08438"
                      : "#334155"
              }
              strokeWidth={active ? 2.7 : 1.8}
              strokeDasharray={pending || geo.blocked || (p.notation==="IDEF1X"&&!a.identifying) ? "7 5" : undefined}
              strokeLinejoin="round"
              markerEnd={`url(#${marker}${p.notation==="IDEF1X"?"-er":""})`}
              pointerEvents="none"
            />
            <g
              onPointerDown={(e) => onLabelDown?.(e, a.id)}
              onClick={(e) => {
                e.stopPropagation();
                onSelect?.(a.id);
              }}
              style={{ cursor: interactive ? "move" : undefined }}
            >
              <text
                x={label.x}
                y={label.y}
                fontFamily="Arial, sans-serif"
                fontSize="13"
                fill={active ? "#4338ca" : "#334155"}
                stroke="white"
                strokeWidth="5"
                paintOrder="stroke"
                strokeLinejoin="round"
                textAnchor="middle"
              >
                {wrap(p.flows[a.flowId]?.name || "", labelMax).map(
                  (line, i) => (
                    <tspan key={i} x={label.x} dy={i === 0 ? 0 : 15}>
                      {line}
                    </tspan>
                  ),
                )}
              </text>
            </g>
            {p.notation==="IDEF1X" && a.target && <text x={geo.points.at(-1)!.x-14} y={geo.points.at(-1)!.y-10} fontFamily="Arial" fontSize="12">{({many:"",oneOrMore:"P",zeroOrOne:"Z",one:"1"})[a.cardinality||"many"]}</text>}
            {p.notation==="IDEF1X" && a.source && !a.identifying && a.optionalParent && <path d={`M${geo.points[0].x} ${geo.points[0].y-5} l5 5 -5 5 -5 -5 Z`} fill="white" stroke="#334155"/>}
            {bp && code && (
              <text
                data-icom-code={code}
                x={
                  bp.x +
                  (boundaryEp!.side === "left"
                    ? -11
                    : boundaryEp!.side === "right"
                      ? 11
                      : 0)
                }
                y={
                  bp.y +
                  (boundaryEp!.side === "top"
                    ? -13
                    : boundaryEp!.side === "bottom"
                      ? 22
                      : 4)
                }
                textAnchor={
                  boundaryEp!.side === "left"
                    ? "end"
                    : boundaryEp!.side === "right"
                      ? "start"
                      : "middle"
                }
                fontFamily="Arial, sans-serif"
                fontSize="11"
                fill="#7968ab"
              >
                {code}
              </text>
            )}
            {interactive && bp && (
              <g>
                <circle
                  cx={bp.x}
                  cy={bp.y}
                  r={active ? 7 : 5}
                  fill={a.originArrowId ? "#ede9fe" : "#e2e8f0"}
                  stroke={a.originArrowId ? "#8b5cf6" : "#94a3b8"}
                  strokeWidth="1.5"
                  onPointerDown={(e) => onBoundaryDown?.(e, a.id)}
                  style={{ cursor: "move" }}
                >
                  <title>
                    {a.originArrowId
                      ? "Наследованная стрелка · перетащите точку вдоль границы"
                      : "Граничная стрелка · перетащите точку вдоль границы"}
                  </title>
                </circle>
              </g>
            )}
            {interactive && pending && (
              <g
                onClick={(e) => {
                  e.stopPropagation();
                  onStub?.(a.id);
                }}
                style={{ cursor: "crosshair" }}
              >
                <circle
                  cx={geo.handle.x}
                  cy={geo.handle.y}
                  r="9"
                  fill="#fffbeb"
                  stroke="#d89a37"
                  strokeWidth="2"
                />
                <path
                  d={`M${geo.handle.x - 4},${geo.handle.y}h8 M${geo.handle.x},${geo.handle.y - 4}v8`}
                  stroke="#b7791f"
                  strokeWidth="1.5"
                />
                <title>
                  Нажмите и выберите порт функции, чтобы подключить стрелку
                </title>
              </g>
            )}
            {interactive &&
              active &&
              !pending &&
              a.route !== undefined &&
              a.routing !== "auto" &&
              !a.waypoints?.length && (
                <rect
                  x={geo.handle.x - 5}
                  y={geo.handle.y - 5}
                  width="10"
                  height="10"
                  rx="3"
                  fill="white"
                  stroke="#4f46e5"
                  strokeWidth="2"
                  onPointerDown={(e) => onRouteDown?.(e, a.id, geo.axis)}
                  style={{
                    cursor: geo.axis === "x" ? "ew-resize" : "ns-resize",
                  }}
                >
                  <title>Перетащите, чтобы изменить маршрут</title>
                </rect>
              )}
            {interactive && active && !pending && (
              <>
                <g
                  className="waypoint-add"
                  data-testid="add-waypoint"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onWaypointAdd?.(a.id, geo.handle);
                  }}
                  style={{ cursor: "copy" }}
                >
                  <circle
                    cx={geo.handle.x}
                    cy={geo.handle.y}
                    r="8"
                    fill="white"
                    stroke="#6c63dc"
                    strokeWidth="1.5"
                  />
                  <path
                    d={`M${geo.handle.x - 4},${geo.handle.y}h8 M${geo.handle.x},${geo.handle.y - 4}v8`}
                    stroke="#6c63dc"
                  />
                  <title>
                    Добавить опорную точку · двойной щелчок по линии тоже
                    добавляет точку
                  </title>
                </g>
                {(a.waypoints || []).map((pt, i) => (
                  <g
                    key={i}
                    data-waypoint-index={i}
                    onPointerDown={(e) => onWaypointDown?.(e, a.id, i)}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      onWaypointRemove?.(a.id, i);
                    }}
                    style={{ cursor: "move" }}
                  >
                    <rect
                      x={pt.x - 6}
                      y={pt.y - 6}
                      width="12"
                      height="12"
                      rx="3"
                      fill="#6366f1"
                      stroke="white"
                      strokeWidth="2"
                      transform={`rotate(45 ${pt.x} ${pt.y})`}
                    />
                    <title>
                      Опорная точка {i + 1}: перетащите; двойной щелчок удаляет
                    </title>
                  </g>
                ))}
              </>
            )}
          </g>
        );
      })}
      {[...bridges.entries()].flatMap(([id, items]) =>
        items.map((b: import("./crossings").Bridge, i: number) => (
          <g key={id + i} data-crossing={id} pointerEvents="none">
            <line
              x1={b.x - b.r}
              y1={b.y}
              x2={b.x + b.r}
              y2={b.y}
              stroke="white"
              strokeWidth="4"
            />
            <path
              d={bridgePath(b)}
              fill="none"
              stroke="white"
              strokeWidth="7"
            />
            <path
              d={bridgePath(b)}
              fill="none"
              stroke={
                selected === id
                  ? "#4f46e5"
                  : geometries.get(id)?.blocked
                    ? "#dc5252"
                    : "#334155"
              }
              strokeWidth={selected === id ? 2.7 : 1.8}
            />
          </g>
        )),
      )}
      {d.nodes.map((n) => {
        const active = selected === n.id;
        const lines = wrap(n.name, Math.floor((n.w - 32) / 9));
        return (
          <g
            key={n.id}
            data-node-id={n.id}
            className="diagram-node"
            onPointerDown={(e) => onNodeDown?.(e, n.id)}
            onClick={(e) => {
              e.stopPropagation();
              onSelect?.(n.id);
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              onDecompose?.(n.id);
            }}
            style={{ cursor: interactive ? "move" : undefined }}
          >
            {active && interactive && (
              <rect
                x={n.x - 5}
                y={n.y - 5}
                width={n.w + 10}
                height={n.h + 10}
                rx="4"
                fill="none"
                stroke="#c7d2fe"
                strokeWidth="3"
              />
            )}
            <rect
              x={n.x}
              y={n.y}
              width={n.w}
              height={n.h}
              rx={
                (p.notation === "IDEF1X" && d.arrows.some(a=>a.identifying && a.target?.kind==="node"&&a.target.nodeId===n.id)) || p.notation === "DFD" && (!n.kind || n.kind === "process")
                  ? 15
                  : 0
              }
              fill={n.color}
              stroke={active ? "#4f46e5" : "#334155"}
              strokeWidth={active ? 2.5 : 1.8}
            />
            {p.notation === "DFD" && n.kind === "store" && (
              <>
                <line
                  x1={n.x + n.w}
                  y1={n.y + 2}
                  x2={n.x + n.w}
                  y2={n.y + n.h - 2}
                  stroke="white"
                  strokeWidth="5"
                />
                <line
                  x1={n.x + 18}
                  y1={n.y}
                  x2={n.x + 18}
                  y2={n.y + n.h}
                  stroke="#334155"
                />
              </>
            )}
            {p.notation === "DFD" && (
              <text
                x={n.x + 12}
                y={n.y + 20}
                fontFamily="Arial"
                fontSize="11"
                fill="#64748b"
              >
                {n.contextOf
                  ? "Контекст"
                  : n.kind === "store"
                    ? "Хранилище"
                    : n.kind === "entity"
                      ? "Внешняя сущность"
                      : "Процесс"}
              </text>
            )}
            {p.notation==="IDEF1X" ? <g><SvgText text={n.name} x={n.x+n.w/2} y={n.y+24} size={16} weight={600}/><line x1={n.x} x2={n.x+n.w} y1={n.y+36} y2={n.y+36} stroke="#334155"/>{attributes(d,n).map((a,i)=><text key={i} x={n.x+12} y={n.y+58+i*21+(a.pk?0:12)} fontFamily="Arial" fontSize="12">{a.name}{a.fk?" (FK)":""}</text>)}<line x1={n.x} x2={n.x+n.w} y1={n.y+46+attributes(d,n).filter(a=>a.pk).length*21} y2={n.y+46+attributes(d,n).filter(a=>a.pk).length*21} stroke="#334155"/></g> : <SvgText
              text={n.name}
              x={n.x + n.w / 2}
              y={n.y + n.h / 2 - (lines.length - 1) * 9 - 2}
              max={Math.floor((n.w - 32) / 9)}
              size={16}
              weight={600}
            />}
            <text
              x={n.x + n.w - 10}
              y={n.y + n.h - 10}
              textAnchor="end"
              fill="#64748b"
              fontFamily="Arial, sans-serif"
              fontSize="11"
            >
              {blockCode(p, diagramId, n.id)}
            </text>
            {n.childId && (
              <g>
                <rect
                  x={n.x + 8}
                  y={n.y + n.h - 22}
                  width="15"
                  height="12"
                  rx="2"
                  fill="#eef2ff"
                  stroke="#818cf8"
                />
                <path
                  d={`M${n.x + 12},${n.y + n.h - 18}h7 m-7,4h7`}
                  stroke="#818cf8"
                />
              </g>
            )}
            {interactive &&
              sides.flatMap((side) =>
                [0.25, 0.5, 0.75].map((at) => {
                  const ep: Endpoint = { kind: "node", nodeId: n.id, side, at };
                  const pt = position(d, ep);
                  return (
                    <circle
                      key={`${side}${at}`}
                      className={`node-port ${connecting || active ? "visible" : ""}`}
                      cx={pt.x}
                      cy={pt.y}
                      r="5"
                      fill="white"
                      stroke={side === "right" ? "#059669" : "#6366f1"}
                      strokeWidth="2"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        onPort?.(e, ep);
                      }}
                      style={{ cursor: "crosshair" }}
                    >
                      <title>{sideNames[side]} · нажмите для соединения</title>
                    </circle>
                  );
                }),
              )}
          </g>
        );
      })}
      {visibleArrows(d).flatMap((a) =>
        (["source", "target"] as const).map((which) => {
          const ep = a[which];
          if (!ep || !tunnelAt(a, which)) return null;
          const point = position(d, ep),
            out = ep.kind === "node" ? 8 : -8;
          const cx =
              point.x +
              (ep.side === "left" ? -out : ep.side === "right" ? out : 0),
            cy =
              point.y +
              (ep.side === "top" ? -out : ep.side === "bottom" ? out : 0),
            vertical = ep.side === "top" || ep.side === "bottom";
          return (
            <g
              key={`${a.id}-${which}`}
              data-tunnel-marker={which}
              transform={`translate(${cx} ${cy}) rotate(${vertical ? 90 : 0})`}
              pointerEvents="none"
            >
              <path
                d="M -3 -8 Q -10 0 -3 8 M 3 -8 Q 10 0 3 8"
                fill="none"
                stroke="white"
                strokeWidth="4"
              />
              <path
                d="M -3 -8 Q -10 0 -3 8 M 3 -8 Q 10 0 3 8"
                fill="none"
                stroke="#51456a"
                strokeWidth="1.5"
              />
            </g>
          );
        }),
      )}
      {interactive &&
        connecting &&
        p.notation !== "DFD" &&
        sides.map((side) => {
          const pt: Point =
            side === "left"
              ? { x: PAGE.left, y: 430 }
              : side === "right"
                ? { x: PAGE.right, y: 430 }
                : side === "top"
                  ? { x: 720, y: PAGE.top }
                  : { x: 720, y: PAGE.bottom };
          return (
            <g
              key={side}
              onClick={(e) => {
                e.stopPropagation();
                onPort?.(e, { kind: "boundary", side, at: 0.5 });
              }}
              style={{ cursor: "crosshair" }}
            >
              <circle
                cx={pt.x}
                cy={pt.y}
                r="14"
                fill="#eef2ff"
                stroke="#6366f1"
                strokeDasharray="3 2"
              />
              <text
                x={pt.x}
                y={pt.y + 5}
                textAnchor="middle"
                fill="#6366f1"
                fontSize="18"
              >
                +
              </text>
              <title>{sideNames[side]} на границе диаграммы</title>
            </g>
          );
        })}
      <line x1="40" y1="824" x2="1400" y2="824" stroke="#cbd5e1" />
      <text
        x="40"
        y="851"
        fontFamily="Arial, sans-serif"
        fontSize="12"
        fill="#64748b"
      >
        {p.organization || "Организация не указана"}
      </text>
      <text
        x="40"
        y="875"
        fontFamily="Arial, sans-serif"
        fontSize="11"
        fill="#94a3b8"
      >
        {p.author || "Учебная модель"} · {p.notation}
      </text>
      <text
        x="720"
        y="852"
        textAnchor="middle"
        fontFamily="Arial, sans-serif"
        fontSize="14"
        fill="#334155"
      >
        {diagramTitle(p, diagramId).slice(0, 85)}
      </text>
      <text
        x="1400"
        y="852"
        textAnchor="end"
        fontFamily="Arial, sans-serif"
        fontSize="15"
        fontWeight="600"
        fill="#334155"
      >
        {diagramCode(p, diagramId)}
      </text>
    </>
  );
}
