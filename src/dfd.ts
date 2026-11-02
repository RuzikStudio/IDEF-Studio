import type { Project, Diagram, Block, Endpoint, Arrow, Issue } from "./model";
export type NodeKind = "process" | "entity" | "store";
export const kindNames: Record<NodeKind, string> = {
  process: "Процесс",
  entity: "Внешняя сущность",
  store: "Хранилище данных",
};
export const kindOf = (n: Block): NodeKind => n.kind || "process";
export const inheritedEnd = (a: Arrow, which: "source" | "target") =>
  !!a.originArrowId &&
  (a.inheritedDirection === "in"
    ? which === "source"
    : a.inheritedDirection === "out"
      ? which === "target"
      : false);
export function dfdConnectionError(
  d: Diagram,
  source: Endpoint | null,
  target: Endpoint | null,
  inherited = false,
): string | undefined {
  if (source?.kind === "boundary" || target?.kind === "boundary")
    return "В DFD потоки связывают процессы, сущности и хранилища; граничных стрелок нет.";
  if (!source || !target) return;
  const s = d.nodes.find((n) => n.id === (source as { nodeId: string }).nodeId),
    t = d.nodes.find((n) => n.id === (target as { nodeId: string }).nodeId);
  if (!s || !t) return "Элемент потока не найден.";
  if (s.id === t.id) return "Поток должен соединять два разных элемента.";
  if (kindOf(s) !== "process" && kindOf(t) !== "process")
    return "Поток между сущностями и хранилищами должен проходить через процесс.";
  if (!inherited && (s.contextOf || t.contextOf))
    return "Потоки контекста добавляются на родительском уровне. Для продолжения используйте «Добавить ветвь».";
}
export function dfdBlockCode(p: Project, did: string, nid: string): string {
  const d = p.diagrams[did],
    n = d.nodes.find((n) => n.id === nid);
  if (!n) return "?";
  if (n.contextOf && d.parentDiagramId)
    return dfdBlockCode(p, d.parentDiagramId, n.contextOf);
  if (kindOf(n) !== "process") {
    const all = Object.values(p.diagrams)
      .flatMap((x) => x.nodes)
      .filter((x) => !x.contextOf && kindOf(x) === kindOf(n));
    return `${kindOf(n) === "store" ? "D" : "E"}${all.findIndex((x) => x.id === nid) + 1}`;
  }
  const index = d.nodes
    .filter((x) => !x.contextOf && kindOf(x) === "process")
    .findIndex((x) => x.id === nid);
  if (!d.parentDiagramId) return `${index}`;
  const parent = dfdBlockCode(p, d.parentDiagramId, d.parentNodeId!);
  return parent === "0"
    ? `${index + 1}.0`
    : `${parent.replace(/\.0$/, "")}.${index + 1}`;
}
// Context references are local drawings of the process's neighbours, not free boundary arrows.
export function syncDfd(p: Project): void {
  const visit = (did: string) => {
    const d = p.diagrams[did];
    for (const n of [...d.nodes]) {
      if (!n.childId) continue;
      const child = p.diagrams[n.childId];
      if (!child) continue;
      if (
        (child.notation ?? p.notation) !== "DFD" ||
        (d.notation ?? p.notation) !== "DFD"
      ) {
        visit(child.id);
        continue;
      }
      const attached = d.arrows.filter(
        (a) =>
          (a.source?.kind === "node" && a.source.nodeId === n.id) ||
          (a.target?.kind === "node" && a.target.nodeId === n.id),
      );
      const ids = new Set(attached.map((a) => a.id));
      child.arrows = child.arrows.filter(
        (a) => !a.originArrowId || ids.has(a.originArrowId),
      );
      const partners = new Map<string, Block>();
      for (const a of attached) {
        const incoming = a.target?.kind === "node" && a.target.nodeId === n.id,
          other = incoming ? a.source : a.target;
        if (other?.kind === "node") {
          const partner = d.nodes.find((x) => x.id === other.nodeId);
          if (partner) partners.set(partner.id, partner);
        }
      }
      const removed = new Set(
        child.nodes
          .filter((c) => c.contextOf && !partners.has(c.contextOf))
          .map((c) => c.id),
      );
      child.nodes = child.nodes.filter((c) => !removed.has(c.id));
      child.arrows = child.arrows.filter(
        (a) =>
          !(a.source?.kind === "node" && removed.has(a.source.nodeId)) &&
          !(a.target?.kind === "node" && removed.has(a.target.nodeId)),
      );
      let index = 0;
      for (const partner of partners.values()) {
        let context = child.nodes.find((c) => c.contextOf === partner.id);
        if (!context) {
          const col = index % 2,
            row = Math.floor(index / 2);
          context = {
            id: crypto.randomUUID(),
            name: partner.name,
            description: partner.description,
            kind: kindOf(partner) === "store" ? "store" : "entity",
            contextOf: partner.id,
            x: col ? 1165 : 65,
            y: 150 + row * 145,
            w: 205,
            h: 85,
            color: "#f4f1fc",
          };
          child.nodes.push(context);
        }
        context.name = partner.name;
        context.description = partner.description;
        context.kind = kindOf(partner) === "store" ? "store" : "entity";
        index++;
      }
      for (const a of attached) {
        const incoming = a.target?.kind === "node" && a.target.nodeId === n.id,
          other = incoming ? a.source : a.target;
        if (other?.kind !== "node") continue;
        const context = child.nodes.find((c) => c.contextOf === other.nodeId);
        if (!context) continue;
        const direction = incoming ? "in" : "out",
          copies = child.arrows.filter((c) => c.originArrowId === a.id),
          ep: Endpoint = {
            kind: "node",
            nodeId: context.id,
            side: context.x < 720 ? "right" : "left",
            at: other.at,
          };
        if (!copies.length)
          child.arrows.push({
            id: crypto.randomUUID(),
            flowId: a.flowId,
            originArrowId: a.id,
            inheritedDirection: direction,
            source: incoming ? ep : null,
            target: incoming ? null : ep,
            routing: "auto",
          });
        else
          for (const c of copies) {
            c.flowId = a.flowId;
            delete c.suppressed;
            if (c.inheritedDirection !== direction) {
              c.source = incoming ? ep : null;
              c.target = incoming ? null : ep;
              c.inheritedDirection = direction;
            } else {
              const which = incoming ? "source" : "target";
              const old = c[which];
              c[which] =
                old?.kind === "node" && old.nodeId === context.id ? old : ep;
            }
          }
      }
      visit(child.id);
    }
  };
  visit(p.rootId);
}
export function validateDfd(
  p: Project,
  diagrams = Object.values(p.diagrams),
): Issue[] {
  const issues: Issue[] = [];
  for (const d of diagrams) {
    const add = (text: string, objectId?: string) =>
      issues.push({ diagramId: d.id, objectId, text });
    if (
      d.id === p.rootId &&
      d.nodes.filter((n) => kindOf(n) === "process").length !== 1
    )
      add("Контекст DFD должен содержать один процесс и внешние сущности.");
    if (d.id === p.rootId && d.nodes.some((n) => kindOf(n) === "store"))
      add("Хранилища показываются на декомпозиции, а не на контекстной DFD.");
    for (const n of d.nodes) {
      if (!n.name.trim()) add("У элемента нет названия.", n.id);
      const input = d.arrows.some(
          (a) =>
            a.source && a.target?.kind === "node" && a.target.nodeId === n.id,
        ),
        output = d.arrows.some(
          (a) =>
            a.target && a.source?.kind === "node" && a.source.nodeId === n.id,
        );
      if (kindOf(n) === "process") {
        if (!input)
          add(
            `${dfdBlockCode(p, d.id, n.id)}: у процесса нет входящего потока данных.`,
            n.id,
          );
        if (!output)
          add(
            `${dfdBlockCode(p, d.id, n.id)}: у процесса нет исходящего потока данных.`,
            n.id,
          );
      } else if (!input && !output)
        add(
          `${dfdBlockCode(p, d.id, n.id)}: элемент не связан с процессами.`,
          n.id,
        );
    }
    for (const a of d.arrows) {
      const error = dfdConnectionError(
        d,
        a.source,
        a.target,
        !!a.originArrowId,
      );
      if (error) add(error, a.id);
      if (!a.source || !a.target)
        add(
          `«${p.flows[a.flowId]?.name}»: поток не подключён${a.originArrowId ? " — баланс с родителем не завершён" : ""}.`,
          a.id,
        );
      if (!p.flows[a.flowId]?.name.trim())
        add("У потока данных нет названия.", a.id);
    }
  }
  return issues;
}
