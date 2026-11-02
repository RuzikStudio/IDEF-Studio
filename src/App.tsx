import {
  occupied,
  freeSlot,
  alignedBoundary,
  spreadBoundaryPorts,
} from "./ports";
import { ModelReport, ProcessFields } from "./ModelReport";
import { idef1xDemo } from "./idef1x";
import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  type PointerEvent as RPointer,
  type ReactNode,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  Layers,
  Sun,
  Moon,
  MousePointer2,
  Plus,
  ArrowUpRight,
  Undo2,
  Redo2,
  FolderOpen,
  Save,
  Download,
  ChevronRight,
  ChevronDown,
  ChevronLeft,
  GitBranch,
  Check,
  CheckCircle2,
  AlertCircle,
  FilePlus2,
  Grid3X3,
  Minus,
  Maximize,
  Trash2,
  X,
  HelpCircle,
  PanelRightClose,
  PanelRightOpen,
  ArrowLeftToLine,
  ArrowDownToLine,
  ArrowRightFromLine,
  ArrowUpToLine,
  Copy,
  Link2,
  FileText,
  Keyboard,
  HardDrive,
  RotateCcw,
  WandSparkles,
} from "lucide-react";
import {
  PAGE,
  newProject,
  addBlock,
  addArrow,
  decompose,
  deleteBlock,
  deleteArrow,
  branchArrow,
  syncInheritance,
  clone,
  serialize,
  parseProject,
  validate,
  diagramCode,
  diagramTitle,
  blockCode,
  touchingSide,
  boundary,
  nodeEnd,
  sideNames,
  sides,
  visibleArrows,
  arrowGeometry,
  addWaypoint,
  resetRoute,
  setTunnel,
  tunnelAt,
  icomCode,
  type Project,
  type Side,
  type Endpoint,
  type Point,
} from "./model";
import {
  kindOf,
  kindNames,
  inheritedEnd,
  dfdConnectionError,
  type NodeKind,
} from "./dfd";
import { idef3Demo } from "./idef3Demo";
import { dfdDemo } from "./dfdDemo";
import { demoProject } from "./demo";
import { DiagramContent } from "./Diagram";
import "./styles.css";
declare global {
  interface Window {
    desktop?: {
      open: () => Promise<{ text: string; name: string } | null>;
      acceptOpen: () => Promise<void>;
      save: (text: string, saveAs: boolean) => Promise<string | null>;
      exportFile: (
        text: string,
        name: string,
        kind: "svg" | "pdf",
      ) => Promise<string | null>;
      setDirty: (value: boolean) => void;
      onSave: (cb: () => void) => () => void;
    };
  }
}
type Connection = { start?: Endpoint; arrowId?: string };
type Drag = {
  kind: "node" | "route" | "label" | "boundary" | "waypoint";
  id: string;
  start: Point;
  base: Project;
  axis?: "x" | "y";
  moved: boolean;
  waypointIndex?: number;
};
function Field({
  value,
  onChange,
  multiline = false,
  ...props
}: {
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  placeholder?: string;
  readOnly?: boolean;
  "aria-label"?: string;
}) {
  const [text, setText] = useState(value),
    cancel = useRef(false);
  useEffect(() => setText(value), [value]);
  const shared = {
    ...props,
    value: text,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setText(e.target.value),
    onBlur: () => {
      if (cancel.current) {
        cancel.current = false;
        return;
      }
      if (text !== value) onChange(text);
    },
    onKeyDown: (
      e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
      if (e.key === "Enter" && !multiline) e.currentTarget.blur();
      if (e.key === "Escape") {
        cancel.current = true;
        setText(value);
        e.currentTarget.blur();
      }
    },
  };
  return multiline ? <textarea rows={3} {...shared} /> : <input {...shared} />;
}
function IconButton({
  title,
  onClick,
  children,
  disabled = false,
  active = false,
}: {
  title: string;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      className={`icon-button ${active ? "active" : ""}`}
      aria-label={title}
      title={title}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
const STORAGE = "idef-studio-autosave-v3";
function initial() {
  try {
    const s = localStorage.getItem(STORAGE);
    if (s) return parseProject(s);
  } catch {}
  return demoProject();
}
export default function App() {
  const [dark, setDark] = useState(() => {
    try {
      return localStorage.getItem("studio-theme") === "dark";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    try {
      localStorage.setItem("studio-theme", dark ? "dark" : "light");
    } catch {}
  }, [dark]);
  const [project, setProject] = useState<Project>(initial),
    [did, setDid] = useState(() => project.rootId),
    [selected, setSelected] = useState<string>(),
    [connection, setConnection] = useState<Connection | null>(null);
  const [grid, setGrid] = useState(false),
    [zoom, setZoom] = useState(0.7),
    [fitMode, setFitMode] = useState(true),
    [panel, setPanel] = useState(true),
    [issuesOpen, setIssuesOpen] = useState(false),
    [help, setHelp] = useState(false),
    [toast, setToast] = useState(""),
    [saved, setSaved] = useState(false),
    [dirty, setDirty] = useState(false),
    [filename, setFilename] = useState("");
  const [decomp, setDecomp] = useState<string | null>(null),
    [count, setCount] = useState(3),
    [replace, setReplace] = useState<"new" | "demo" | null>(null),
    [exportMenu, setExportMenu] = useState(false);
  const [newNotation, setNewNotation] = useState<
    "IDEF0" | "DFD" | "IDEF3" | "IDEF1X"
  >("IDEF0");
  const [childNotation, setChildNotation] =
    useState<Project["notation"]>("IDEF0");
  const [report, setReport] = useState(false);
  const notation = project.diagrams[did]?.notation ?? project.notation;
  const er = notation === "IDEF1X";
  const idef3 = notation === "IDEF3";
  const dfd = notation !== "IDEF0";
  const past = useRef<Project[]>([]),
    future = useRef<Project[]>([]),
    [historyVersion, setHistoryVersion] = useState(0),
    svgRef = useRef<SVGSVGElement>(null),
    viewport = useRef<HTMLDivElement>(null),
    drag = useRef<Drag | null>(null),
    fileInput = useRef<HTMLInputElement>(null),
    projectRef = useRef(project);
  projectRef.current = project;
  const currentId = project.diagrams[did] ? did : project.rootId,
    d = {
      ...project.diagrams[currentId],
      arrows: visibleArrows(project.diagrams[currentId]),
    },
    node = d.nodes.find((n) => n.id === selected),
    arrow = d.arrows.find((a) => a.id === selected),
    issues = useMemo(() => validate(project), [project]);
  const selectedGeometry = arrow ? arrowGeometry(d, arrow) : null;
  const notify = useCallback((message: string) => setToast(message), []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4800);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    setSaved(false);
    const t = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE, serialize(project));
        setSaved(true);
      } catch {
        notify(
          "Не удалось сохранить резервную копию. Сохраните проект в файл.",
        );
      }
    }, 450);
    return () => clearTimeout(t);
  }, [project, notify]);
  useEffect(() => window.desktop?.setDirty(dirty), [dirty]);
  useEffect(() => {
    if (!fitMode) return;
    const el = viewport.current;
    if (!el) return;
    const ro = new ResizeObserver(() =>
      setZoom(Math.min(1, (el.clientWidth - 64) / PAGE.w)),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, [fitMode, panel]);
  const pushHistory = (p: Project) => {
    past.current.push(clone(p));
    if (past.current.length > 80) past.current.shift();
    future.current = [];
    setHistoryVersion((v) => v + 1);
  };
  const commit = (fn: (p: Project) => void) => {
    const prev = projectRef.current,
      next = clone(prev);
    fn(next);
    syncInheritance(next);
    pushHistory(prev);
    projectRef.current = next;
    setProject(next);
    setDirty(true);
  };
  const undo = () => {
    if (!past.current.length) return;
    future.current.push(clone(projectRef.current));
    const p = past.current.pop()!;
    if (p.rootId !== projectRef.current.rootId) setFilename("");
    projectRef.current = p;
    setProject(p);
    setSelected(undefined);
    setConnection(null);
    setDirty(true);
    setHistoryVersion((v) => v + 1);
  };
  const redo = () => {
    if (!future.current.length) return;
    past.current.push(clone(projectRef.current));
    const p = future.current.pop()!;
    if (p.rootId !== projectRef.current.rootId) setFilename("");
    projectRef.current = p;
    setProject(p);
    setSelected(undefined);
    setConnection(null);
    setDirty(true);
    setHistoryVersion((v) => v + 1);
  };
  const navigate = (id: string) => {
    setDid(id);
    setSelected(undefined);
    setConnection(null);
    setFitMode(true);
    viewport.current?.scrollTo(0, 0);
  };
  function load(p: Project, name = "") {
    pushHistory(projectRef.current);
    projectRef.current = p;
    setProject(p);
    setDid(p.rootId);
    setSelected(undefined);
    setConnection(null);
    setFilename(name);
    setDirty(false);
    setFitMode(true);
  }
  function download(text: string, name: string, type = "application/json") {
    const url = URL.createObjectURL(new Blob([text], { type })),
      a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  async function save(saveAs = false) {
    try {
      const p = projectRef.current;
      if (window.desktop) {
        const name = await window.desktop.save(
          serialize(p),
          saveAs || !filename,
        );
        if (!name) return;
        setFilename(name);
      } else {
        const name = `${p.title.replace(/[<>:"/\\|?*]/g, "_")}.idef.json`;
        download(serialize(p), name);
        setFilename(name);
      }
      setDirty(false);
      notify("Проект сохранён в файл");
    } catch (e) {
      notify(`Не удалось сохранить: ${(e as Error).message}`);
    }
  }
  async function open() {
    try {
      if (window.desktop) {
        const result = await window.desktop.open();
        if (result) {
          const parsed = parseProject(result.text);
          await window.desktop.acceptOpen();
          load(parsed, result.name);
          notify("Проект открыт");
        }
      } else fileInput.current?.click();
    } catch (e) {
      notify((e as Error).message);
    }
  }
  async function exportDiagram(kind: "svg" | "pdf") {
    setExportMenu(false);
    const markup = renderToStaticMarkup(
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={PAGE.w}
        height={PAGE.h}
        viewBox={`0 0 ${PAGE.w} ${PAGE.h}`}
      >
        <DiagramContent project={project} diagramId={currentId} />
      </svg>,
    );
    const name = `${diagramCode(project, currentId)} — ${diagramTitle(project, currentId).replace(/[<>:"/\\|?*]/g, "_")}.${kind}`;
    try {
      if (window.desktop) {
        if (await window.desktop.exportFile(markup, name, kind))
          notify(`Диаграмма сохранена в ${kind.toUpperCase()}`);
      } else if (kind === "svg") {
        download(markup, name, "image/svg+xml");
        notify("SVG сохранён");
      } else window.print();
    } catch (e) {
      notify(`Ошибка экспорта: ${(e as Error).message}`);
    }
  }
  function remove() {
    if (node) {
      commit((p) => deleteBlock(p, currentId, node.id));
      setSelected(undefined);
    } else if (arrow) {
      commit((p) => deleteArrow(p, currentId, arrow.id));
      setSelected(undefined);
    }
  }
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        (e.ctrlKey || e.metaKey) &&
        (e.code === "KeyS" || e.key.toLowerCase() === "s")
      ) {
        e.preventDefault();
        (document.activeElement as HTMLElement)?.blur();
        void save(e.shiftKey);
        return;
      }
      if ((e.target as HTMLElement)?.closest("input,textarea,select")) return;
      if (e.key === "Escape") {
        setConnection(null);
        setDecomp(null);
        setHelp(false);
        setExportMenu(false);
        setReplace(null);
      }
      if (e.ctrlKey || e.metaKey) {
        if (e.code === "KeyS" || e.key.toLowerCase() === "s") {
          e.preventDefault();
          void save(e.shiftKey);
        }
        if (e.code === "KeyO" || e.key.toLowerCase() === "o") {
          e.preventDefault();
          void open();
        }
        if (e.code === "KeyZ" || e.key.toLowerCase() === "z") {
          e.preventDefault();
          e.shiftKey ? redo() : undo();
        }
        if (e.code === "KeyY" || e.key.toLowerCase() === "y") {
          e.preventDefault();
          redo();
        }
      } else if (e.key === "Delete") remove();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });
  useEffect(() => window.desktop?.onSave(() => void save()), []);
  function askDecompose(id: string) {
    if (er) {
      notify("В IDEF1X сущности связываются на одной диаграмме.");
      return;
    }
    const n = d.nodes.find((n) => n.id === id)!;
    if (n.referentId) {
      const target = Object.values(project.diagrams).find(
        (d) =>
          d.id === n.referentId || d.nodes.some((x) => x.id === n.referentId),
      );
      if (target) {
        navigate(target.id);
        setSelected(n.referentId);
      } else notify("Объект ссылки удалён");
      return;
    }
    if (n.junction) {
      notify("Перекрёсток не декомпозируется.");
      return;
    }
    if (dfd && (kindOf(n) !== "process" || n.contextOf)) {
      notify("Декомпозиция доступна для собственных процессов.");
      return;
    }
    if (n.childId) navigate(n.childId);
    else {
      setChildNotation(notation);
      setDecomp(id);
      setCount(3);
    }
  }
  function makeBlock(kind: NodeKind = "process") {
    if (dfd && currentId === project.rootId && kind === "store") {
      notify("Добавьте хранилище на уровне декомпозиции.");
      return;
    }
    if (
      !er &&
      !idef3 &&
      currentId === project.rootId &&
      kind === "process" &&
      d.nodes.some((n) => kindOf(n) === "process")
    ) {
      notify(
        "На контекстной диаграмме одна функция. Выберите её и нажмите «Декомпозиция».",
      );
      return;
    }
    let id = "";
    commit((p) => {
      const i = d.nodes.length;
      id = addBlock(
        p,
        currentId,
        er
          ? "Сущность"
          : idef3
            ? "Действие"
            : dfd
              ? kindNames[kind]
              : "Новая функция",
        200 + (i % 4) * 270,
        220 + Math.floor(i / 4) * 170,
        kind,
      ).id;
    });
    setSelected(id);
    setConnection(null);
  }
  function addBoundary(side: Side) {
    let id = "";
    commit((p) => {
      const diagram = p.diagrams[currentId];
      const previous = diagram.arrows.find((a) => a.id === selected);
      const previousEnd =
        side === "right" ? previous?.source : previous?.target;
      const n =
        diagram.nodes.find((n) => n.id === selected) ??
        (previousEnd?.kind === "node"
          ? diagram.nodes.find((n) => n.id === previousEnd.nodeId)
          : undefined) ??
        (diagram.nodes.length === 1 ? diagram.nodes[0] : undefined);
      const ep = n
        ? nodeEnd(n.id, side, freeSlot(occupied(diagram, n.id, side)))
        : null;
      const boundarySlots = visibleArrows(diagram)
        .flatMap((a) => [a.source, a.target])
        .flatMap((e) =>
          e?.kind === "boundary" && e.side === side ? [e.at] : [],
        );
      const edge = ep
        ? alignedBoundary(diagram, ep)
        : boundary(side, freeSlot(boundarySlots));
      id = addArrow(
        p,
        currentId,
        side === "right" ? ep : edge,
        side === "right" ? edge : ep,
        `Новый ${sideNames[side].toLowerCase()}`,
      ).id;
    });
    setSelected(id);
    setConnection(null);
  }
  function port(ep: Endpoint) {
    if (dfd) {
      if (connection?.arrowId) {
        const a = d.arrows.find((a) => a.id === connection.arrowId)!;
        const error = dfdConnectionError(
          d,
          a.source || ep,
          a.source ? ep : a.target,
          !!a.originArrowId,
        );
        if (error) {
          notify(error);
          return;
        }
        commit((p) => {
          const a = p.diagrams[currentId].arrows.find(
            (a) => a.id === connection.arrowId,
          )!;
          if (!a.source) a.source = ep;
          else a.target = ep;
        });
        setConnection(null);
        return;
      }
      if (!connection?.start) {
        setConnection({ start: ep });
        return;
      }
      const error = dfdConnectionError(d, connection.start, ep);
      if (error) {
        notify(error);
        return;
      }
      let id = "";
      const start = connection.start;
      commit((p) => {
        id = addArrow(p, currentId, start, ep, "Новый поток данных").id;
      });
      setSelected(id);
      setConnection(null);
      return;
    }
    const isSource =
      ep.kind === "node" ? ep.side === "right" : ep.side !== "right";
    if (connection?.arrowId) {
      const a = d.arrows.find((a) => a.id === connection.arrowId)!;
      if ((!a.source && !isSource) || (!a.target && isSource)) {
        notify(
          !a.source
            ? "Выберите выход функции (правая сторона)."
            : "Выберите вход, управление или механизм функции.",
        );
        return;
      }
      if (ep.kind !== "node") {
        notify("Подключите свободный конец к порту функции.");
        return;
      }
      commit((p) => {
        const a = p.diagrams[currentId].arrows.find(
          (a) => a.id === connection.arrowId,
        )!;
        if (!a.source) a.source = ep;
        else a.target = ep;
      });
      setConnection(null);
      notify("Стрелка подключена");
      return;
    }
    if (!connection?.start) {
      if (!isSource) {
        notify("Начните с выхода функции или входящей границы диаграммы.");
        return;
      }
      setConnection({ start: ep });
      return;
    }
    if (isSource) {
      setConnection({ start: ep });
      return;
    }
    const start = connection.start;
    if (start.kind === "boundary" && ep.kind === "boundary") {
      notify("Стрелка должна быть связана с функцией.");
      return;
    }
    let id = "";
    commit((p) => {
      id = addArrow(p, currentId, start, ep).id;
    });
    setSelected(id);
    setConnection(null);
  }
  function coords(e: { clientX: number; clientY: number }): Point {
    const svg = svgRef.current!,
      rect = svg.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) * PAGE.w) / rect.width,
      y: ((e.clientY - rect.top) * PAGE.h) / rect.height,
    };
  }
  function startDrag(
    e: RPointer,
    id: string,
    kind: Drag["kind"],
    axis?: "x" | "y",
    waypointIndex?: number,
  ) {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (connection && kind === "node") return;
    setSelected(id);
    drag.current = {
      kind,
      id,
      axis,
      start: coords(e),
      base: clone(projectRef.current),
      moved: false,
      waypointIndex,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function moveDrag(e: RPointer) {
    const state = drag.current;
    if (!state) return;
    const pt = coords(e),
      dx = pt.x - state.start.x,
      dy = pt.y - state.start.y;
    if (Math.abs(dx) + Math.abs(dy) < 3 && !state.moved) return;
    state.moved = true;
    const p = clone(state.base),
      dd = p.diagrams[currentId],
      n = dd.nodes.find((n) => n.id === state.id),
      a = dd.arrows.find((a) => a.id === state.id),
      snap = (v: number) => (grid ? Math.round(v / 10) * 10 : v);
    if (state.kind === "node" && n) {
      n.x = Math.max(85, Math.min(1320 - n.w, snap(n.x + dx)));
      n.y = Math.max(125, Math.min(740 - n.h, snap(n.y + dy)));
    }
    if (state.kind === "route" && a)
      a.route = snap(state.axis === "x" ? pt.x : pt.y);
    if (
      state.kind === "waypoint" &&
      a &&
      state.waypointIndex !== undefined &&
      a.waypoints?.[state.waypointIndex]
    ) {
      a.waypoints[state.waypointIndex] = {
        x: Math.max(PAGE.left, Math.min(PAGE.right, snap(pt.x))),
        y: Math.max(PAGE.top, Math.min(790, snap(pt.y))),
      };
    }
    if (state.kind === "label" && a) {
      a.labelDx = (a.labelDx || 0) + dx;
      a.labelDy = (a.labelDy || 0) + dy;
    }
    if (state.kind === "boundary" && a) {
      const ep =
        a.source?.kind === "boundary"
          ? a.source
          : a.target?.kind === "boundary"
            ? a.target
            : null;
      if (ep)
        ep.at = Math.max(
          0.03,
          Math.min(
            0.97,
            ep.side === "left" || ep.side === "right"
              ? (pt.y - PAGE.top) / (PAGE.bottom - PAGE.top)
              : (pt.x - PAGE.left) / (PAGE.right - PAGE.left),
          ),
        );
    }
    projectRef.current = p;
    setProject(p);
  }
  function endDrag() {
    const state = drag.current;
    if (state?.moved) {
      pushHistory(state.base);
      setDirty(true);
    }
    drag.current = null;
  }
  function endpointValue(ep: Endpoint | null) {
    return ep?.kind === "node"
      ? `${ep.nodeId}|${ep.side}`
      : ep?.kind === "boundary"
        ? "boundary"
        : "";
  }
  function insertWaypoint(id: string, point: Point) {
    const a = d.arrows.find((a) => a.id === id);
    if (!a || !a.source || !a.target) return;
    if ((a.waypoints?.length || 0) >= 24) {
      notify("Максимум 24 опорные точки на стрелку.");
      return;
    }
    commit((p) => {
      const dd = p.diagrams[currentId];
      addWaypoint(
        dd,
        dd.arrows.find((a) => a.id === id)!,
        point,
      );
    });
    setSelected(id);
  }
  function removeWaypoint(id: string, index: number) {
    commit((p) => {
      const a = p.diagrams[currentId].arrows.find((a) => a.id === id)!;
      a.waypoints?.splice(index, 1);
      if (!a.waypoints?.length) resetRoute(a);
    });
  }
  function rerouteAll() {
    commit((p) => {
      for (const a of visibleArrows(p.diagrams[currentId])) resetRoute(a);
    });
    notify(
      "Стрелки разведены автоматически. Ручные точки убраны; действие можно отменить.",
    );
  }
  function changeEndpoint(which: "source" | "target", value: string) {
    if (dfd && arrow) {
      if (inheritedEnd(arrow, which)) return;
      const [id, side] = value.split("|");
      const ep = value ? nodeEnd(id, side as Side) : null;
      const error = dfdConnectionError(
        d,
        which === "source" ? ep : arrow.source,
        which === "target" ? ep : arrow.target,
        !!arrow.originArrowId,
      );
      if (error) {
        notify(error);
        return;
      }
    }
    if (!value && !arrow?.[which === "source" ? "target" : "source"]) {
      notify("У стрелки должен оставаться хотя бы один подключённый конец.");
      return;
    }
    commit((p) => {
      const a = p.diagrams[currentId].arrows.find((a) => a.id === arrow!.id)!;
      if (!value) a[which] = null;
      else {
        const [nodeId, side] = value.split("|");
        a[which] = nodeEnd(
          nodeId,
          side as Side,
          freeSlot(occupied(p.diagrams[currentId], nodeId, side as Side)),
        );
      }
      if (!a[which])
        delete a[which === "source" ? "tunnelSource" : "tunnelTarget"];
    });
  }
  function renderTree(id: string, depth = 0): ReactNode {
    const dd = project.diagrams[id];
    return (
      <div key={id}>
        <button
          className={`tree-row ${id === currentId ? "current" : ""}`}
          style={{ paddingLeft: 16 + depth * 16 }}
          onClick={() => navigate(id)}
        >
          <span className="tree-chevron">
            {dd.nodes.some((n) => n.childId) ? (
              <ChevronDown size={13} />
            ) : (
              <FileText size={13} />
            )}
          </span>
          <b>{diagramCode(project, id)}</b>
          <span>
            {id === project.rootId ? "Контекст" : diagramTitle(project, id)}
          </span>
          {id === currentId && <i />}
        </button>
        {dd.nodes.map((n) =>
          n.childId ? (
            renderTree(n.childId, depth + 1)
          ) : (
            <button
              key={n.id}
              className={`tree-row leaf ${id === currentId && n.id === selected ? "chosen" : ""}`}
              style={{ paddingLeft: 32 + depth * 16 }}
              onClick={() => {
                navigate(id);
                setSelected(n.id);
              }}
            >
              <span className="tree-chevron">
                <span className="tiny-square" />
              </span>
              <b>{blockCode(project, id, n.id)}</b>
              <span>{n.name}</span>
            </button>
          ),
        )}
      </div>
    );
  }
  const crumb: string[] = [];
  let cur = d;
  while (cur.parentDiagramId) {
    crumb.unshift(cur.parentDiagramId);
    cur = project.diagrams[cur.parentDiagramId];
  }
  const decompNode = d.nodes.find((n) => n.id === decomp),
    inheritedCount = decompNode
      ? d.arrows.filter((a) => touchingSide(a, decompNode.id)).length
      : 0;
  void historyVersion;
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">
            <Layers size={22} />
          </span>
          <span>
            IDEF<span className="brand-light"> Studio</span>
          </span>
        </div>
        <div className="header-project">
          <span className="project-dot" />
          {project.title}
          {dirty && (
            <span
              className="dirty-dot"
              title="Есть изменения, не сохранённые в файл"
            />
          )}
        </div>
        <div className="header-actions">
          <button
            className="theme-button"
            aria-label="Тёмная тема"
            aria-pressed={dark}
            title={dark ? "Включить светлую тему" : "Включить тёмную тему"}
            onClick={() => setDark(!dark)}
          >
            {dark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button className="quiet-button" onClick={open}>
            <FolderOpen size={16} />
            Открыть
          </button>
          <button className="primary-button" onClick={() => save()}>
            <Save size={16} />
            Сохранить
          </button>
          <IconButton title="Как работать" onClick={() => setHelp(true)}>
            <HelpCircle size={19} />
          </IconButton>
        </div>
      </header>
      <div className="workspace">
        <aside className="sidebar">
          <div className="sidebar-heading">
            <span>Проект</span>
            <IconButton title="Новый проект" onClick={() => setReplace("new")}>
              <FilePlus2 size={16} />
            </IconButton>
          </div>
          <div className="project-card">
            <div className="project-icon">
              <Layers size={20} />
            </div>
            <div>
              <strong>{project.title}</strong>
              <span>Модель · {project.notation}</span>
            </div>
          </div>
          <div className="tree-heading">
            ДИАГРАММЫ <span>{Object.keys(project.diagrams).length}</span>
          </div>
          <div className="diagram-tree">{renderTree(project.rootId)}</div>
          <button className="sample-button" onClick={() => setReport(true)}>
            Отчёт по модели
          </button>
          <button className="sample-button" onClick={() => setReplace("demo")}>
            <RotateCcw size={14} />
            Открыть учебный пример
          </button>
          <div className="sidebar-bottom">
            <div className="tip-card">
              <span className="tip-icon">
                <GitBranch size={18} />
              </span>
              <strong>От общего к частному</strong>
              <p>
                {dfd
                  ? "Соедините элементы и настройте свойства выбранной связи."
                  : "Раскройте функцию: её стрелки перейдут на границы дочерней диаграммы."}
              </p>
              <button onClick={() => setHelp(true)}>
                Как это работает <ArrowUpRight size={14} />
              </button>
            </div>
            <div className="local-label">
              <HardDrive size={14} />
              <span>Локально на вашем компьютере</span>
            </div>
          </div>
        </aside>
        <main className="main-area">
          <div className="diagram-heading">
            <div className="breadcrumbs">
              {crumb.map((id) => (
                <span key={id}>
                  <button onClick={() => navigate(id)}>
                    {diagramCode(project, id)}
                  </button>
                  <ChevronRight size={13} />
                </span>
              ))}
              <span className="crumb-current">
                {diagramCode(project, currentId)}
              </span>
              <span className="crumb-divider">/</span>
              <span>
                {currentId === project.rootId
                  ? "Контекстная диаграмма"
                  : "Декомпозиция"}
              </span>
            </div>
            <div className="diagram-title-row">
              <h1>{diagramTitle(project, currentId)}</h1>
              <span className="notation-tag">{notation}</span>
              <div className="diagram-title-actions">
                <button
                  className={`quiet-button validation-button ${issuesOpen ? "active" : ""}`}
                  onClick={() => setIssuesOpen(!issuesOpen)}
                >
                  {issues.length ? (
                    <AlertCircle size={15} />
                  ) : (
                    <CheckCircle2 size={15} />
                  )}
                  Проверка {issues.length > 0 && <span>{issues.length}</span>}
                </button>
                <div className="export-wrap">
                  <button
                    className="quiet-button"
                    onClick={() => setExportMenu(!exportMenu)}
                  >
                    <Download size={16} />
                    Экспорт
                    <ChevronDown size={13} />
                  </button>
                  {exportMenu && (
                    <div className="dropdown">
                      <button onClick={() => exportDiagram("svg")}>
                        SVG · векторная схема
                      </button>
                      <button onClick={() => exportDiagram("pdf")}>
                        PDF · текущая диаграмма
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="toolbar">
            <div className="toolbar-group">
              <IconButton
                title="Выбор (Esc)"
                active={!connection}
                onClick={() => setConnection(null)}
              >
                <MousePointer2 size={17} />
              </IconButton>
              <button className="tool-button" onClick={() => makeBlock()}>
                <Plus size={17} />
                {er ? "Сущность" : dfd ? "Процесс" : "Функция"}
              </button>
              <button
                className={`tool-button ${connection ? "active" : ""}`}
                onClick={() => setConnection(connection ? null : {})}
              >
                <ArrowUpRight size={17} />
                Связь
              </button>
            </div>
            <span className="toolbar-separator" />
            {er ? null : idef3 ? (
              <div className="toolbar-group">
                {["AND", "OR", "XOR"].map((j) => (
                  <button
                    className="tool-button"
                    key={j}
                    onClick={() =>
                      commit((p) => {
                        const n = addBlock(p, currentId, j, 650, 400);
                        n.junction = j as "AND" | "OR" | "XOR";
                        n.w = 80;
                        n.h = 80;
                      })
                    }
                  >
                    {j}
                  </button>
                ))}
              </div>
            ) : dfd ? (
              <div className="toolbar-group">
                <button
                  className="tool-button"
                  onClick={() => makeBlock("entity")}
                >
                  Сущность
                </button>
                <button
                  className="tool-button"
                  onClick={() => makeBlock("store")}
                >
                  Хранилище
                </button>
              </div>
            ) : (
              <div className="toolbar-group boundary-tools">
                <IconButton
                  title="Добавить вход"
                  onClick={() => addBoundary("left")}
                >
                  <ArrowLeftToLine size={17} />
                </IconButton>
                <IconButton
                  title="Добавить управление"
                  onClick={() => addBoundary("top")}
                >
                  <ArrowDownToLine size={17} />
                </IconButton>
                <IconButton
                  title="Добавить выход"
                  onClick={() => addBoundary("right")}
                >
                  <ArrowRightFromLine size={17} />
                </IconButton>
                <IconButton
                  title="Добавить механизм"
                  onClick={() => addBoundary("bottom")}
                >
                  <ArrowUpToLine size={17} />
                </IconButton>
              </div>
            )}
            <span className="toolbar-separator" />
            <button
              className="tool-button decompose-button"
              disabled={
                !node ||
                er ||
                (dfd && (kindOf(node) !== "process" || !!node.contextOf))
              }
              onClick={() => node && askDecompose(node.id)}
            >
              <GitBranch size={17} />
              Декомпозиция
            </button>
            <div className="toolbar-spacer" />
            <IconButton
              title="Мостики на пересечениях"
              active={project.showCrossings}
              onClick={() =>
                commit((p) => {
                  p.showCrossings = !p.showCrossings;
                })
              }
            >
              <GitBranch size={17} />
            </IconButton>
            <IconButton
              title="Отменить (Ctrl+Z)"
              disabled={!past.current.length}
              onClick={undo}
            >
              <Undo2 size={17} />
            </IconButton>
            <IconButton
              title="Повторить (Ctrl+Y)"
              disabled={!future.current.length}
              onClick={redo}
            >
              <Redo2 size={17} />
            </IconButton>
            <span className="toolbar-separator" />
            <IconButton
              title="Сетка и привязка"
              active={grid}
              onClick={() => setGrid(!grid)}
            >
              <Grid3X3 size={17} />
            </IconButton>
            <IconButton
              title="Развести стрелки автоматически"
              onClick={rerouteAll}
            >
              <WandSparkles size={17} />
            </IconButton>
            <IconButton
              title="Панель свойств"
              active={panel}
              onClick={() => setPanel(!panel)}
            >
              {panel ? (
                <PanelRightClose size={17} />
              ) : (
                <PanelRightOpen size={17} />
              )}
            </IconButton>
          </div>
          {project.diagrams[currentId].arrows.some((a) => a.suppressed) && (
            <div className="tunnel-banner">
              <Link2 size={14} />
              <span>
                Скрыто туннелями родителя:{" "}
                {
                  project.diagrams[currentId].arrows.filter((a) => a.suppressed)
                    .length
                }
                . Подключения сохранены.
              </span>
              <button
                onClick={() => d.parentDiagramId && navigate(d.parentDiagramId)}
              >
                К родителю
                <ChevronRight size={13} />
              </button>
            </div>
          )}
          {connection && (
            <div className="connection-banner">
              <Link2 size={15} />
              <span>
                {dfd
                  ? connection.arrowId
                    ? "Выберите порт процесса для свободного конца потока."
                    : connection.start
                      ? "Выберите порт получателя данных."
                      : "Нажмите порт источника, затем порт получателя. Доступны все стороны."
                  : connection.arrowId
                    ? "Выберите порт функции для свободного конца стрелки."
                    : connection.start
                      ? "Теперь выберите вход, управление, механизм или выходную границу."
                      : "Нажмите на выход функции (справа), затем на порт другой функции."}
              </span>
              <button onClick={() => setConnection(null)}>
                Отмена <X size={13} />
              </button>
            </div>
          )}
          <div
            className="canvas-viewport"
            ref={viewport}
            onWheel={(e) => {
              if (e.ctrlKey) {
                e.preventDefault();
                setFitMode(false);
                setZoom((z) =>
                  Math.max(0.25, Math.min(1.6, z - e.deltaY * 0.001)),
                );
              }
            }}
          >
            <div className="page-positioner">
              <svg
                ref={svgRef}
                className="diagram-page"
                data-testid="diagram"
                width={PAGE.w * zoom}
                height={PAGE.h * zoom}
                viewBox={`0 0 ${PAGE.w} ${PAGE.h}`}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onPointerDown={(e) => {
                  if (
                    e.target === e.currentTarget ||
                    ((e.target as SVGElement).tagName === "rect" &&
                      !(e.target as Element).closest(
                        "[data-node-id],[data-arrow-id]",
                      ))
                  )
                    setSelected(undefined);
                }}
              >
                <DiagramContent
                  project={project}
                  diagramId={currentId}
                  selected={selected}
                  interactive
                  showGrid={grid}
                  connecting={!!connection}
                  onSelect={setSelected}
                  onNodeDown={(e, id) => startDrag(e, id, "node")}
                  onRouteDown={(e, id, axis) => startDrag(e, id, "route", axis)}
                  onLabelDown={(e, id) => startDrag(e, id, "label")}
                  onBoundaryDown={(e, id) => startDrag(e, id, "boundary")}
                  onWaypointAdd={insertWaypoint}
                  onWaypointDown={(e, id, index) =>
                    startDrag(e, id, "waypoint", undefined, index)
                  }
                  onWaypointRemove={removeWaypoint}
                  onPort={(_, ep) => port(ep)}
                  onDecompose={askDecompose}
                  onStub={(id) => {
                    setSelected(id);
                    setConnection({ arrowId: id });
                  }}
                />
              </svg>
            </div>
          </div>
          <div className="canvas-footer">
            <span className="canvas-hint">
              {node
                ? "Потяните блок · дважды нажмите для декомпозиции"
                : arrow
                  ? "Двойной щелчок по линии добавляет опорную точку"
                  : "Выберите функцию или стрелку на схеме"}
            </span>
            <div className="zoom-control">
              <IconButton
                title="Уменьшить"
                onClick={() => {
                  setFitMode(false);
                  setZoom((z) => Math.max(0.25, z - 0.1));
                }}
              >
                <Minus size={14} />
              </IconButton>
              <span>{Math.round(zoom * 100)}%</span>
              <IconButton
                title="Увеличить"
                onClick={() => {
                  setFitMode(false);
                  setZoom((z) => Math.min(1.6, z + 0.1));
                }}
              >
                <Plus size={14} />
              </IconButton>
              <span className="toolbar-separator" />
              <IconButton
                title="Уместить по ширине"
                onClick={() => setFitMode(true)}
              >
                <Maximize size={14} />
              </IconButton>
            </div>
          </div>
        </main>
        {panel && (
          <aside className="properties">
            <div className="properties-heading">
              <strong>
                {node
                  ? dfd
                    ? kindNames[kindOf(node)]
                    : "Функция"
                  : arrow
                    ? "Стрелка"
                    : "Свойства модели"}
              </strong>
              <span>
                {node
                  ? blockCode(project, currentId, node.id)
                  : arrow
                    ? arrow.originArrowId
                      ? "Наследование"
                      : "Поток"
                    : "Проект"}
              </span>
            </div>
            {node ? (
              <>
                <label>
                  Название
                  <Field
                    aria-label="Название функции"
                    multiline
                    readOnly={!!node.contextOf}
                    value={node.name}
                    onChange={(value) =>
                      commit((p) => {
                        p.diagrams[currentId].nodes.find(
                          (n) => n.id === node.id,
                        )!.name = value;
                      })
                    }
                  />
                </label>
                <label>
                  Описание
                  <Field
                    aria-label="Описание функции"
                    multiline
                    placeholder="Что выполняет эта функция?"
                    readOnly={!!node.contextOf}
                    value={node.description}
                    onChange={(value) =>
                      commit((p) => {
                        p.diagrams[currentId].nodes.find(
                          (n) => n.id === node.id,
                        )!.description = value;
                      })
                    }
                  />
                </label>
                {er && (
                  <label>
                    АТРИБУТЫ (по строке, PK перед ключом)
                    <Field
                      aria-label="Атрибуты"
                      multiline
                      value={node.attributes || ""}
                      onChange={(value) =>
                        commit((p) => {
                          const n = p.diagrams[currentId].nodes.find(
                            (n) => n.id === node.id,
                          )!;
                          n.attributes = value;
                          n.h = Math.max(
                            n.h,
                            100 + value.split("\n").length * 22,
                          );
                        })
                      }
                    />
                    <small>
                      Внешние ключи добавляются из родительских сущностей
                      автоматически.
                    </small>
                  </label>
                )}
                <div className="property-section">
                  <span className="field-caption">Цвет блока</span>
                  <div className="swatches">
                    {[
                      "#ffffff",
                      "#fff4ce",
                      "#e8f0ff",
                      "#e9f6ef",
                      "#f2eaff",
                    ].map((color) => (
                      <button
                        key={color}
                        className={node.color === color ? "chosen" : ""}
                        style={{ background: color }}
                        aria-label={`Цвет ${color}`}
                        onClick={() =>
                          commit((p) => {
                            p.diagrams[currentId].nodes.find(
                              (n) => n.id === node.id,
                            )!.color = color;
                          })
                        }
                      >
                        {node.color === color && <Check size={15} />}
                      </button>
                    ))}
                  </div>
                </div>
                <ProcessFields
                  node={node}
                  notation={notation}
                  project={project}
                  update={(fn) =>
                    commit((p) =>
                      fn(
                        p.diagrams[currentId].nodes.find(
                          (n) => n.id === node.id,
                        )!,
                      ),
                    )
                  }
                  jump={(id) => {
                    const target = Object.values(project.diagrams).find(
                      (d) => d.id === id || d.nodes.some((n) => n.id === id),
                    );
                    if (target) {
                      navigate(target.id);
                      setSelected(id);
                    }
                  }}
                />
                {notation === "IDEF0" && (
                  <button
                    className="secondary-button"
                    onClick={() =>
                      commit((p) => {
                        for (const side of sides)
                          spreadBoundaryPorts(
                            p.diagrams[currentId],
                            node.id,
                            side,
                          );
                      })
                    }
                  >
                    Развести граничные стрелки
                  </button>
                )}
                <div className="size-fields">
                  <label>
                    Ширина
                    <input
                      aria-label="Ширина функции"
                      type="number"
                      min="160"
                      max="650"
                      value={node.w}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        if (v >= 160 && v <= 650)
                          commit((p) => {
                            p.diagrams[currentId].nodes.find(
                              (n) => n.id === node.id,
                            )!.w = v;
                          });
                      }}
                    />
                  </label>
                  <label>
                    Высота
                    <input
                      aria-label="Высота функции"
                      type="number"
                      min="80"
                      max="300"
                      value={node.h}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        if (v >= 80 && v <= 300)
                          commit((p) => {
                            p.diagrams[currentId].nodes.find(
                              (n) => n.id === node.id,
                            )!.h = v;
                          });
                      }}
                    />
                  </label>
                </div>
                {!er &&
                  (!dfd || (kindOf(node) === "process" && !node.contextOf)) && (
                    <div className="inheritance-card">
                      <GitBranch size={19} />
                      <strong>
                        {node.childId
                          ? "Декомпозиция создана"
                          : "Раскрыть функцию"}
                      </strong>
                      <p>
                        {dfd
                          ? "Входящие и исходящие потоки и их участники появятся на следующем уровне."
                          : "Входы, выходы, управление и механизмы появятся на следующем уровне."}
                      </p>
                      <button
                        className="secondary-button"
                        onClick={() => askDecompose(node.id)}
                      >
                        {node.childId
                          ? "Открыть диаграмму"
                          : "Создать декомпозицию"}
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  )}
                {node.contextOf && (
                  <p className="inline-note">
                    Элемент контекста. Название и потоки изменяются на
                    родительской диаграмме.
                  </p>
                )}
                <button
                  className="danger-button"
                  disabled={!!d.nodes.find((n) => n.id === selected)?.contextOf}
                  onClick={remove}
                >
                  <Trash2 size={15} />
                  Удалить функцию{node.childId ? " и её уровни" : ""}
                </button>
              </>
            ) : arrow ? (
              <>
                <label>
                  Название потока
                  <Field
                    aria-label="Название потока"
                    multiline
                    value={project.flows[arrow.flowId].name}
                    onChange={(value) =>
                      commit((p) => {
                        p.flows[arrow.flowId].name = value;
                      })
                    }
                  />
                </label>
                <label>
                  Определение потока
                  <Field
                    multiline
                    value={project.flows[arrow.flowId].definition || ""}
                    onChange={(v) =>
                      commit((p) => {
                        p.flows[arrow.flowId].definition = v;
                      })
                    }
                  />
                </label>
                {(arrow.originArrowId ||
                  Object.values(project.diagrams).some((dd) =>
                    dd.arrows.some(
                      (a) => a.id !== arrow.id && a.flowId === arrow.flowId,
                    ),
                  )) && (
                  <div className="inline-note">
                    <Link2 size={15} />
                    <span>
                      Название общее для всех продолжений этого потока.
                    </span>
                  </div>
                )}
                {er && (
                  <label>
                    <input
                      type="checkbox"
                      checked={!!arrow.identifying}
                      onChange={(e) =>
                        commit((p) => {
                          p.diagrams[currentId].arrows.find(
                            (a) => a.id === arrow.id,
                          )!.identifying = e.target.checked;
                        })
                      }
                    />
                    Идентифицирующая связь (FK входит в PK)
                  </label>
                )}
                {er && (
                  <>
                    <label>
                      КОЛИЧЕСТВО ДОЧЕРНИХ ЗАПИСЕЙ
                      <select
                        aria-label="Кардинальность"
                        value={arrow.cardinality || "many"}
                        onChange={(e) =>
                          commit((p) => {
                            p.diagrams[currentId].arrows.find(
                              (a) => a.id === arrow.id,
                            )!.cardinality = e.target.value as
                              "many" | "oneOrMore" | "zeroOrOne" | "one";
                          })
                        }
                      >
                        <option value="many">0 или больше</option>
                        <option value="oneOrMore">1 или больше (P)</option>
                        <option value="zeroOrOne">0 или 1 (Z)</option>
                        <option value="one">Ровно 1</option>
                      </select>
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        disabled={!!arrow.identifying}
                        checked={!arrow.identifying && !!arrow.optionalParent}
                        onChange={(e) =>
                          commit((p) => {
                            p.diagrams[currentId].arrows.find(
                              (a) => a.id === arrow.id,
                            )!.optionalParent = e.target.checked;
                          })
                        }
                      />
                      Родитель необязателен
                    </label>
                  </>
                )}
                {(["source", "target"] as const).map((which) => {
                  const ep = arrow[which];
                  return (
                    <label key={which}>
                      {which === "source" ? "ОТКУДА" : "КУДА"}
                      <select
                        aria-label={
                          which === "source"
                            ? "Источник стрелки"
                            : "Приёмник стрелки"
                        }
                        value={endpointValue(ep)}
                        disabled={
                          ep?.kind === "boundary" ||
                          (dfd && inheritedEnd(arrow, which))
                        }
                        onChange={(e) => changeEndpoint(which, e.target.value)}
                      >
                        {ep?.kind === "boundary" ? (
                          <option value="boundary">
                            Граница · {sideNames[ep.side]}
                          </option>
                        ) : (
                          <>
                            <option value="">Не подключено</option>
                            {d.nodes.flatMap((n) =>
                              (dfd
                                ? sides
                                : which === "source"
                                  ? (["right"] as Side[])
                                  : (["left", "top", "bottom"] as Side[])
                              ).map((side) => (
                                <option
                                  key={`${n.id}${side}`}
                                  value={`${n.id}|${side}`}
                                >
                                  {blockCode(project, currentId, n.id)} ·{" "}
                                  {sideNames[side]} · {n.name}
                                </option>
                              )),
                            )}
                          </>
                        )}
                      </select>
                    </label>
                  );
                })}
                <div className="routing-card">
                  <span className="field-caption">Маршрут стрелки</span>
                  <div className="routing-mode">
                    <button
                      className={
                        arrow.routing !== "manual" && arrow.route === undefined
                          ? "chosen"
                          : ""
                      }
                      onClick={() =>
                        commit((p) =>
                          resetRoute(
                            p.diagrams[currentId].arrows.find(
                              (a) => a.id === arrow.id,
                            )!,
                          ),
                        )
                      }
                    >
                      <WandSparkles size={13} />
                      Автоматически
                    </button>
                    <span>
                      {arrow.waypoints?.length
                        ? `${arrow.waypoints.length} точек`
                        : arrow.route !== undefined
                          ? "Ручной"
                          : "Обход блоков"}
                    </span>
                  </div>
                  {selectedGeometry?.blocked ? (
                    <p className="route-warning">
                      <AlertCircle size={14} />
                      {selectedGeometry.blocked}
                    </p>
                  ) : (
                    <p>
                      Двойной щелчок по линии добавляет опорную точку.
                      Перетащите её, чтобы изменить изгиб.
                    </p>
                  )}
                  {arrow.source && arrow.target && (
                    <button
                      className="secondary-button"
                      onClick={() =>
                        selectedGeometry &&
                        insertWaypoint(arrow.id, selectedGeometry.handle)
                      }
                    >
                      <Plus size={14} />
                      Добавить опорную точку
                    </button>
                  )}
                  {!!arrow.waypoints?.length && (
                    <div className="waypoint-list">
                      {arrow.waypoints.map((pt, i) => (
                        <div key={i}>
                          <span>
                            Точка {i + 1}
                            <small>
                              {Math.round(pt.x)}, {Math.round(pt.y)}
                            </small>
                          </span>
                          <button
                            aria-label={`Удалить опорную точку ${i + 1}`}
                            onClick={() => removeWaypoint(arrow.id, i)}
                          >
                            <X size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {!dfd &&
                  (["source", "target"] as const).some(
                    (which) =>
                      arrow[which]?.kind === "node" ||
                      (arrow[which]?.kind === "boundary" &&
                        !arrow.originArrowId &&
                        currentId !== project.rootId),
                  ) && (
                    <div className="tunnel-card">
                      <span className="field-caption">Туннелирование</span>

                      {(["source", "target"] as const).map((which) => {
                        const ep = arrow[which];
                        if (
                          !ep ||
                          (ep.kind === "boundary" &&
                            (arrow.originArrowId ||
                              currentId === project.rootId))
                        )
                          return null;
                        return (
                          <label className="checkbox-field" key={which}>
                            <input
                              type="checkbox"
                              data-testid={`tunnel-${which}`}
                              checked={tunnelAt(arrow, which)}
                              onChange={(e) =>
                                commit((p) =>
                                  setTunnel(
                                    p,
                                    currentId,
                                    arrow.id,
                                    which,
                                    e.target.checked,
                                  ),
                                )
                              }
                            />
                            <span>
                              {ep.kind === "node"
                                ? `Скрыть в декомпозиции ${blockCode(project, currentId, ep.nodeId)}`
                                : "Туннель на границе"}
                              <small>
                                {ep.kind === "node"
                                  ? "Скрытые подключения сохраняются и вернутся при снятии галочки."
                                  : "Локальный поток, которого нет на родительском уровне."}
                              </small>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                <button
                  className="secondary-button"
                  onClick={() => {
                    let id = "";
                    commit((p) => {
                      id = branchArrow(p, currentId, arrow.id).id;
                    });
                    setSelected(id);
                    setConnection({ arrowId: id });
                  }}
                >
                  <GitBranch size={15} />
                  Добавить ветвь
                </button>
                <button
                  className="quiet-button reset-route"
                  onClick={() =>
                    commit((p) => {
                      const a = p.diagrams[currentId].arrows.find(
                        (a) => a.id === arrow.id,
                      )!;
                      resetRoute(a);
                      a.labelDx = 0;
                      a.labelDy = 0;
                    })
                  }
                >
                  <RotateCcw size={14} />
                  Сбросить расположение
                </button>
                {arrow.originArrowId && (
                  <div className="inheritance-card">
                    <Link2 size={18} />
                    <strong>Связь с родительским уровнем</strong>
                    <p>
                      {icomCode(project, currentId, arrow)} · Стрелка перенесена
                      из {diagramCode(project, d.parentDiagramId!)}. Её
                      {dfd
                        ? "связь с участником контекста сохраняется."
                        : "граничный конец сохраняется при редактировании."}
                    </p>
                    <button
                      onClick={() => navigate(d.parentDiagramId!)}
                      className="secondary-button"
                    >
                      <ChevronLeft size={14} />
                      На родительский уровень
                    </button>
                  </div>
                )}
                <button
                  className="danger-button"
                  disabled={!!d.nodes.find((n) => n.id === selected)?.contextOf}
                  onClick={remove}
                >
                  <Trash2 size={15} />
                  {arrow.originArrowId
                    ? "Отсоединить / удалить ветвь"
                    : "Удалить стрелку"}
                </button>
              </>
            ) : (
              <>
                <label>
                  Название проекта
                  <Field
                    aria-label="Название проекта"
                    value={project.title}
                    onChange={(v) =>
                      commit((p) => {
                        p.title = v;
                      })
                    }
                  />
                </label>
                <label>
                  Организация
                  <Field
                    aria-label="Организация"
                    placeholder="Например, университет"
                    value={project.organization}
                    onChange={(v) =>
                      commit((p) => {
                        p.organization = v;
                      })
                    }
                  />
                </label>
                <label>
                  Автор
                  <Field
                    aria-label="Автор"
                    placeholder="Имя, группа"
                    value={project.author}
                    onChange={(v) =>
                      commit((p) => {
                        p.author = v;
                      })
                    }
                  />
                </label>
                <div className="property-section">
                  <span className="field-caption">На этой диаграмме</span>
                  <div className="stat-row">
                    <span>{dfd ? "Элементы" : "Функции"}</span>
                    <b>{d.nodes.length}</b>
                  </div>
                  <div className="stat-row">
                    <span>Стрелки</span>
                    <b>{d.arrows.length}</b>
                  </div>
                  <div className="stat-row">
                    <span>Наследованные</span>
                    <b>{d.arrows.filter((a) => a.originArrowId).length}</b>
                  </div>
                </div>
                <div className="empty-properties">
                  <MousePointer2 size={25} />
                  <p>Выберите элемент на схеме, чтобы изменить его свойства.</p>
                </div>
                <div className="legend">
                  <span>
                    <i className="legend-inherited" />
                    Наследованная стрелка
                  </span>
                  <span>
                    <i className="legend-pending" />
                    Нужно подключить к функции
                  </span>
                </div>
              </>
            )}
            <div className="properties-bottom">
              <span className="field-caption">Файл проекта</span>
              <p title={filename}>{filename || "Ещё не сохранён в файл"}</p>
              <button onClick={() => save(true)}>
                <Copy size={13} />
                Сохранить как…
              </button>
            </div>
          </aside>
        )}
      </div>
      <footer className="status-bar">
        <span className={saved ? "saved" : ""}>
          {saved ? <CheckCircle2 size={13} /> : <span className="saving-dot" />}
          {saved ? "Резервная копия сохранена" : "Сохраняем резервную копию…"}
        </span>
        <span>
          {Object.keys(project.diagrams).length} диаграмм ·{" "}
          {Object.values(project.diagrams).reduce(
            (n, d) => n + d.nodes.length,
            0,
          )}{" "}
          функций
        </span>
        <button onClick={() => setHelp(true)}>
          <Keyboard size={13} />
          Горячие клавиши
        </button>
        <span className="status-version">IDEF Studio 0.6</span>
      </footer>
      {issuesOpen && (
        <div className="issues-panel">
          <div>
            <strong>Проверка модели</strong>
            <IconButton
              title="Закрыть проверку"
              onClick={() => setIssuesOpen(false)}
            >
              <X size={17} />
            </IconButton>
          </div>
          <p>
            Базовая проверка связей и структуры. Это не полная сертификация по
            правилам выбранной нотации.
          </p>
          {!issues.length ? (
            <div className="all-good">
              <CheckCircle2 size={18} />
              Неподключённых стрелок и базовых ошибок не найдено.
            </div>
          ) : (
            issues.map((issue, i) => (
              <button
                key={i}
                onClick={() => {
                  navigate(issue.diagramId);
                  setSelected(issue.objectId);
                }}
              >
                <AlertCircle size={16} />
                <span>
                  <b>{diagramCode(project, issue.diagramId)}</b>
                  {issue.text}
                </span>
                <ChevronRight size={14} />
              </button>
            ))
          )}
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <span>{toast}</span>
          <button onClick={() => setToast("")}>
            <X size={14} />
          </button>
        </div>
      )}
      {decompNode && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-label="Создать декомпозицию"
          >
            <span className="modal-icon">
              <GitBranch size={25} />
            </span>
            <h2>
              Раскрыть функцию {blockCode(project, currentId, decompNode.id)}
            </h2>
            <p>{decompNode.name}</p>
            {notation === "IDEF0" && (
              <label>
                Нотация дочерней диаграммы
                <select
                  value={childNotation}
                  onChange={(e) =>
                    setChildNotation(e.target.value as Project["notation"])
                  }
                >
                  {["IDEF0", "DFD", "IDEF3"].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Сколько функций создать?
              <select
                aria-label="Количество функций"
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
              >
                {[0, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n === 0 ? "Пустая диаграмма" : `${n} функции`}
                  </option>
                ))}
              </select>
            </label>
            <div className="modal-note">
              <Link2 size={18} />
              <span>
                <strong>
                  {childNotation === notation
                    ? `${inheritedCount} стрелок перейдут на следующий уровень.`
                    : "На границе разных нотаций связи задаются вручную."}
                </strong>{" "}
                Подключите их к новым функциям. Названия останутся связанными с
                родительской диаграммой.
              </span>
            </div>
            <div className="modal-actions">
              <button className="quiet-button" onClick={() => setDecomp(null)}>
                Отмена
              </button>
              <button
                className="primary-button"
                onClick={() => {
                  let child = "";
                  commit((p) => {
                    child = decompose(
                      p,
                      currentId,
                      decompNode.id,
                      count,
                      childNotation,
                    );
                  });
                  setDecomp(null);
                  navigate(child);
                  notify(
                    `Декомпозиция создана. Перенесено стрелок: ${inheritedCount}`,
                  );
                }}
              >
                Создать диаграмму
                <ArrowUpRight size={15} />
              </button>
            </div>
          </section>
        </div>
      )}
      {replace && (
        <div className="modal-backdrop">
          <section className="modal" role="dialog">
            <h2>{replace === "new" ? "Новая модель" : "Учебный пример"}</h2>
            <label>
              Нотация
              <select
                aria-label="Нотация"
                value={newNotation}
                onChange={(e) =>
                  setNewNotation(
                    e.target.value as "IDEF0" | "DFD" | "IDEF3" | "IDEF1X",
                  )
                }
              >
                <option>IDEF0</option>
                <option>DFD</option>
                <option>IDEF3</option>
                <option>IDEF1X</option>
              </select>
            </label>
            <p>
              Текущая модель будет заменена. Сохраните её в файл, если хотите
              продолжить работу с ней позже. Замену также можно отменить через
              Ctrl+Z.
            </p>
            <div className="modal-actions">
              <button className="quiet-button" onClick={() => setReplace(null)}>
                Отмена
              </button>
              <button className="secondary-button" onClick={() => save()}>
                Сохранить текущую
              </button>
              <button
                className="primary-button"
                onClick={() => {
                  const p =
                    replace === "demo"
                      ? newNotation === "IDEF1X"
                        ? idef1xDemo()
                        : newNotation === "IDEF3"
                          ? idef3Demo()
                          : newNotation === "DFD"
                            ? dfdDemo()
                            : demoProject()
                      : newProject("Новая модель", newNotation);
                  if (replace === "new") {
                    const n = addBlock(
                      p,
                      p.rootId,
                      "Основная функция",
                      500,
                      345,
                    );
                    n.w = 440;
                    n.h = 150;
                  }
                  load(p);
                  setReplace(null);
                }}
              >
                Продолжить
              </button>
            </div>
          </section>
        </div>
      )}
      {report && (
        <ModelReport
          project={project}
          close={() => setReport(false)}
          notify={notify}
        />
      )}
      {help && (
        <div className="modal-backdrop">
          <section
            className="modal help-modal"
            role="dialog"
            aria-label="Как работать"
          >
            <div className="help-heading">
              <span className="brand-mark">
                <Layers size={22} />
              </span>
              <h2>Первый проект в IDEF Studio</h2>
              <IconButton
                title="Закрыть справку"
                onClick={() => setHelp(false)}
              >
                <X size={19} />
              </IconButton>
            </div>
            {dfd && (
              <p>
                <b>DFD.</b> На контексте создайте один процесс и внешние
                сущности. При декомпозиции добавьте процессы и хранилища, затем
                подключите унаследованные потоки. Нажмите на любой порт
                источника, затем получателя. Между сущностями и хранилищами
                необходим процесс. Элементы контекста редактируются на
                родительском уровне.
              </p>
            )}
            <p>
              <b>Пересечения.</b> Мостик означает, что линии не соединены.
              Кнопка «Мостики на пересечениях» включает их для всей модели;
              настройка сохраняется в файле и учитывается при экспорте.
            </p>
            <ol>
              <li>
                <strong>Начните с контекста A-0.</strong> Одна функция A0
                описывает весь процесс. Назовите её в правой панели.
              </li>
              <li>
                <strong>Добавьте граничные стрелки.</strong> Выберите функцию и
                используйте четыре кнопки на панели: вход слева, управление
                сверху, выход справа, механизм снизу.
              </li>
              <li>
                <strong>Создайте декомпозицию.</strong> Дважды нажмите функцию
                или кнопку «Декомпозиция». Все связанные стрелки появятся на
                границе новой диаграммы.
              </li>
              <li>
                <strong>Подключите наследованные стрелки.</strong> Нажмите
                жёлтый плюс у свободного конца, затем подходящий порт функции.
                Можно выбрать функцию в свойствах стрелки.
              </li>
              <li>
                <strong>Свяжите внутренние функции.</strong> Нажмите выходной
                порт справа, затем входной порт другой функции. Подписи, блоки,
                граничные точки и квадрат маршрута можно перетаскивать.
              </li>
              <li>
                <strong>Сохраните результат.</strong> Ctrl+S сохраняет
                редактируемый проект. Экспорт SVG/PDF сохраняет текущую
                диаграмму.
              </li>
            </ol>
            <div className="shortcut-grid">
              <span>
                <kbd>Ctrl S</kbd>Сохранить
              </span>
              <span>
                <kbd>Ctrl O</kbd>Открыть
              </span>
              <span>
                <kbd>Ctrl Z</kbd>Отменить
              </span>
              <span>
                <kbd>Ctrl Y</kbd>Повторить
              </span>
              <span>
                <kbd>Delete</kbd>Удалить
              </span>
              <span>
                <kbd>Esc</kbd>Завершить связь
              </span>
            </div>
            <p className="help-footnote">
              Версия 0.2: стрелки обходят блоки автоматически. Двойной щелчок по
              линии добавляет опорную точку; двойной щелчок по точке удаляет её.
              Туннель в свойствах стрелки скрывает её на следующем уровне,
              сохраняя подключения. Коды I/C/O/M связывают границы с родителем.
            </p>
            <button className="primary-button" onClick={() => setHelp(false)}>
              Начать работу
            </button>
          </section>
        </div>
      )}
      <input
        ref={fileInput}
        type="file"
        accept=".json,.idef.json"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f)
            try {
              load(parseProject(await f.text()), f.name);
              notify("Проект открыт");
            } catch (err) {
              notify((err as Error).message);
            }
          e.target.value = "";
        }}
      />
    </div>
  );
}
