import { useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DiagramContent } from "./Diagram";
import {
  blockCode,
  diagramTitle,
  diagramCode,
  notationOf,
  PAGE,
  type Block,
  type Project,
  type Diagram,
  type Notation,
} from "./model";

export function costOf(p: Project, n: Block): number {
  const child = n.childId && p.diagrams[n.childId];
  if (child)
    return child.nodes
      .filter(isWork)
      .reduce((sum, node) => sum + costOf(p, node), 0);
  return (n.cost || 0) + (n.rate || 0) * (n.hours || 0) * (n.frequency ?? 1);
}
function isWork(n: Block) {
  return (
    !n.contextOf &&
    !n.junction &&
    !n.referentId &&
    (!n.kind || n.kind === "process")
  );
}
const money = (v: number) =>
  v.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
export function ProcessFields({
  node: n,
  project: p,
  notation,
  update,
  jump,
}: {
  node: Block;
  project: Project;
  notation: Notation;
  update: (fn: (n: Block) => void) => void;
  jump: (id: string) => void;
}) {
  if (notation === "IDEF1X" || n.contextOf) return null;
  const scenarios = Object.values(p.diagrams)
    .filter((d) => notationOf(p, d.id) === "IDEF3")
    .map((d) => ({ id: d.id, name: "Сценарий · " + diagramTitle(p, d.id) }));
  const targets = Object.values(p.diagrams).flatMap((d) =>
    d.nodes
      .filter((x) => x.id !== n.id && isWork(x))
      .map((x) => ({ id: x.id, name: diagramTitle(p, d.id) + " / " + x.name })),
  );
  return (
    <section className="analysis-fields">
      {notation === "IDEF3" && (
        <>
          <label>
            Исполнитель
            <input
              value={n.role || ""}
              onChange={(e) =>
                update((x) => {
                  x.role = e.target.value;
                })
              }
            />
          </label>
          {n.junction && n.junction !== "XOR" && (
            <label>
              <input
                type="checkbox"
                checked={!!n.synchronous}
                onChange={(e) =>
                  update((x) => {
                    x.synchronous = e.target.checked;
                  })
                }
              />
              Синхронный перекрёсток
            </label>
          )}
          {!n.junction && !n.childId && (
            <label>
              Референт
              <select
                value={n.referentId || ""}
                onChange={(e) =>
                  update((x) => {
                    x.referentId = e.target.value || undefined;
                  })
                }
              >
                <option value="">Обычное действие</option>
                {[...scenarios, ...targets].map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {n.referentId && (
            <button onClick={() => jump(n.referentId!)}>
              Перейти к действию ↗
            </button>
          )}
        </>
      )}
      {isWork(n) && (
        <details key={n.id} className="cost-panel">
          <summary>Стоимость работы <b>{money(costOf(p, n))} ₽</b></summary>
          <div className="cost-fields">
          {n.childId ? (
            <small>Сумма дочерних работ</small>
          ) : (
            <>
              <label>
                Центр затрат
                <input
                  value={n.center || ""}
                  onChange={(e) =>
                    update((x) => {
                      x.center = e.target.value;
                    })
                  }
                />
              </label>
              {(
                [
                  ["cost", "Прямые затраты, ₽"],
                  ["rate", "Ставка, ₽/ч"],
                  ["hours", "Часов за выполнение"],
                  ["frequency", "Число выполнений"],
                ] as const
              ).map(([key, title]) => (
                <label key={key}>
                  {title}
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={n[key] ?? (key === "frequency" ? 1 : 0)}
                    onChange={(e) => {
                      const v = e.target.valueAsNumber;
                      if (Number.isFinite(v) && v >= 0)
                        update((x) => {
                          x[key] = v;
                        });
                    }}
                  />
                </label>
              ))}
            </>
          )}
          </div>
        </details>
      )}
    </section>
  );
}
function ordered(p: Project) {
  const out: Diagram[] = [];
  function walk(id: string) {
    const d = p.diagrams[id];
    out.push(d);
    for (const n of d.nodes) if (n.childId) walk(n.childId);
  }
  walk(p.rootId);
  return out;
}
function Tree({ p }: { p: Project }) {
  function list(d: Diagram) {
    return (
      <ul>
        {d.nodes
          .filter((n) => !n.contextOf)
          .map((n) => (
            <li key={n.id}>
              <span>
                {blockCode(p, d.id, n.id)} {n.name}
              </span>
              {n.childId && list(p.diagrams[n.childId])}
            </li>
          ))}
      </ul>
    );
  }
  return (
    <div className="node-tree">
      <b>{p.title}</b>
      {list(p.diagrams[p.rootId])}
    </div>
  );
}
function Lanes({ d }: { d: Diagram }) {
  const roles = [...new Set(d.nodes.map((n) => n.role || "Без исполнителя"))];
  const pos = (n: Block) => ({
    x: 165 + d.nodes.indexOf(n) * 145,
    y: 55 + roles.indexOf(n.role || "Без исполнителя") * 96,
  });
  return (
    <svg
      viewBox={`0 0 ${200 + d.nodes.length * 145} ${roles.length * 96 + 20}`}
      style={{ width: "100%", background: "white" }}
    >
      <defs>
        <marker
          id={"lane" + d.id}
          viewBox="0 0 10 10"
          markerWidth="6"
          markerHeight="6"
          refX="9"
          refY="5"
          orient="auto"
        >
          <path d="M0 0L10 5L0 10z" />
        </marker>
      </defs>
      {roles.map((r, i) => (
        <g key={r}>
          <path
            d={`M0 ${i * 96 + 10}h${200 + d.nodes.length * 145}`}
            stroke="#aab6bf"
          />
          <text x="8" y={50 + i * 96} fontSize="14">
            {r}
          </text>
        </g>
      ))}
      {d.arrows.map((a,index) => {
        const s = d.nodes.find(
            (n) => a.source?.kind === "node" && a.source.nodeId === n.id,
          ),
          t = d.nodes.find(
            (n) => a.target?.kind === "node" && a.target.nodeId === n.id,
          );
        if (!s || !t) return null;
        const u = pos(s),
          v = pos(t);
        return (
          <path
            key={a.id}
            d={`M${u.x + 120} ${u.y} H${u.x+129} V${u.y-30-index%4*3} H${v.x-10} V${v.y} H${v.x}`}
            stroke="#42586a"
            fill="none"
            markerEnd={`url(#lane${d.id})`}
          />
        );
      })}
      {d.nodes.map((n) => {
        const { x, y } = pos(n);
        return (
          <g key={n.id}>
            <rect
              x={x}
              y={y - 24}
              width="120"
              height="48"
              fill="white"
              stroke="#42586a"
            />
            <foreignObject x={x + 3} y={y - 22} width="114" height="44">
              <div style={{ font: "12px Arial", textAlign: "center" }}>
                {n.name}
              </div>
            </foreignObject>
          </g>
        );
      })}
    </svg>
  );
}
function ReportBody({ p, query = "", section="all" }: { p: Project; query?: string;section?:string }) {
  const ds = ordered(p),
    match = (s: string) =>
      s.toLocaleLowerCase().includes(query.toLocaleLowerCase());
  return (
    <article className="report-body">
      <h1>{p.title}</h1>
      <p>
        {p.organization} · {p.author}
      </p>
      {["all","tree"].includes(section)&&<><h2>Дерево узлов</h2>
      <Tree p={p} /></>}
      {["all","dictionary"].includes(section)&&<><h2>Словарь работ и элементов</h2>
      <table>
        <tbody>
          {ds.flatMap((d) =>
            d.nodes
              .filter((n) => match(n.name + " " + n.description))
              .map((n) => (
                <tr key={n.id}>
                  <td>{n.name}</td>
                  <td>{n.description}</td>
                  <td>
                    {diagramCode(p, d.id)} · {diagramTitle(p, d.id)}
                  </td>
                </tr>
              )),
          )}
        </tbody>
      </table>
      <h2>Словарь потоков</h2>
      <table>
        <tbody>
          {Object.entries(p.flows)
            .filter(([, f]) => match(f.name + " " + (f.definition || "")))
            .map(([id, f]) => {
              const uses = ds.flatMap((d) =>
                d.arrows
                  .filter((a) => a.flowId === id)
                  .map((a) => {
                    const end = (ep: typeof a.source) =>
                      ep?.kind === "node"
                        ? d.nodes.find((n) => n.id === ep.nodeId)?.name
                        : "Граница";
                    return (
                      diagramCode(p, d.id) +
                      " · " +
                      end(a.source) +
                      " → " +
                      end(a.target)
                    );
                  }),
              );
              return uses.length ? (
                <tr key={id}>
                  <td>{f.name}</td>
                  <td>{f.definition}</td>
                  <td>{uses.join("; ")}</td>
                </tr>
              ) : null;
            })}
        </tbody>
      </table>
      </>}{["all","cost"].includes(section)&&p.notation !== "IDEF1X" && (
        <>
          <h2>Стоимость работ, ₽</h2>
          <p>Общая стоимость · {money(p.diagrams[p.rootId].nodes.filter(isWork).reduce((sum,n)=>sum+costOf(p,n),0))} ₽</p><table>
            <tbody>
              {ds.flatMap((d) =>
                d.nodes.filter(isWork).map((n) => (
                  <tr key={n.id}>
                    <td>{n.name}</td>
                    <td>{n.childId ? "Сумма дочерних работ" : n.center}</td>
                    <td>{money(costOf(p, n))}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </>
      )}
      {ds.filter(d=>section==="all" || section==="lanes" && notationOf(p,d.id)==="IDEF3").map((d) => (
        <section className="report-sheet" key={d.id}>
          <h2>
            {diagramCode(p, d.id)} · {diagramTitle(p, d.id)} ·{" "}
            {notationOf(p, d.id)}
          </h2>
          {section==="all" && <svg viewBox={`0 0 ${PAGE.w} ${PAGE.h}`} style={{ width: "100%" }}>
            <DiagramContent project={p} diagramId={d.id} />
          </svg>}
          {notationOf(p, d.id) === "IDEF3" && (
            <div style={{breakInside:"avoid"}}>
              <h3>Дорожки исполнителей</h3>
              <Lanes d={d} />
            </div>
          )}
        </section>
      ))}
    </article>
  );
}
const sheetStyle =
  ".report-body{font:14px Arial;color:#20282c;background:white;padding:16px}.report-body table{border-collapse:collapse;width:100%}.report-body td{vertical-align:top;padding:6px;border-bottom:1px solid #cbd3d7}.report-sheet{break-before:page}.node-tree ul{border-left:1px solid #70818c;padding-left:22px;margin:4px 0}.node-tree li{list-style:none;margin:6px 0}.node-tree li>span{border:1px solid #a9b3ba;padding:3px 8px;display:inline-block}.report-body tr{break-inside:avoid}";
export function ModelReport({
  project,
  close,
  notify,
}: {
  project: Project;
  close: () => void;
  notify: (s: string) => void;
}) {
  const [section,setSection]=useState("all");
  const [query, setQuery] = useState("");
  async function pdf() {
    try {
      if (!window.desktop) return;
      const markup = renderToStaticMarkup(
        <>
          <style>{sheetStyle}</style>
          <ReportBody p={project} section={section} query={query}/>
        </>,
      );
      if (
        await window.desktop.exportFile(
          markup,
          project.title + " — отчёт.pdf",
          "pdf",
        )
      )
        notify("Отчёт сохранён");
    } catch (e) {
      notify(String(e));
    }
  }
  return (
    <div className="modal-backdrop">
      <section
        className="model-report"
        role="dialog"
        aria-label="Отчёт по модели"
      >
        <header>
          <h2>Отчёт по модели</h2>
          <select aria-label="Раздел отчёта" value={section} onChange={e=>setSection(e.target.value)}><option value="all">Вся модель</option><option value="tree">Дерево узлов</option><option value="dictionary">Словари</option><option value="lanes">Дорожки IDEF3</option><option value="cost">Затраты</option></select>
          <input
            aria-label="Поиск в словарях"
            placeholder="Поиск в словарях"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="primary-button" onClick={pdf}>
            Сохранить PDF
          </button>
          <button onClick={close}>Закрыть</button>
        </header>
        <style>{sheetStyle}</style>
        <ReportBody p={project} query={query} section={section}/>
      </section>
    </div>
  );
}
