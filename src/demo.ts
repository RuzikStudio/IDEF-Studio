import {
  newProject,
  addBlock,
  addArrow,
  decompose,
  nodeEnd,
  boundary,
  syncInheritance,
  resetRoute,
  type Project,
  type Side,
} from "./model";
export function demoProject(): Project {
  const p = newProject("Изготовление мебели на заказ");
  p.organization = "Учебная мебельная мастерская";
  p.author = "Учебная модель";
  const root = p.rootId;
  const n = addBlock(p, root, p.title, 500, 345);
  n.w = 440;
  n.h = 150;
  n.color = "#fff4ce";
  n.description =
    "Изготовить и передать заказчику мебель: от требований и материалов до готового изделия.";
  const groups: Record<Side, string[]> = {
    left: ["Заказ и пожелания клиента", "Материалы и комплектующие"],
    top: [
      "Договор и срок исполнения",
      "Критерии качества",
      "Технологическая карта",
    ],
    right: [
      "Готовая мебель и акт передачи",
      "Детали мебели",
    ],
    bottom: [
      "Менеджер и конструктор",
      "Мастер контроля качества",
      "Станки и инструменты",
    ],
  };
  for (const [side, names] of Object.entries(groups) as [Side, string[]][]) {
    names.forEach((name, i) => {
      const at = (i + 1) / (names.length + 1);
      const bAt =
        side === "left" || side === "right"
          ? (n.y + n.h * at - 100) / 665
          : (n.x + n.w * at - 55) / 1330;
      const a = addArrow(
        p,
        root,
        side === "right" ? nodeEnd(n.id, side, at) : boundary(side, bAt),
        side === "right" ? boundary(side, bAt) : nodeEnd(n.id, side, at),
        name,
      );
      if (side === "top") a.route = 210;
      if (side === "bottom") a.route = 640;
    });
  }
  const cid = decompose(p, root, n.id, 0);
  const a1 = addBlock(
    p,
    cid,
    "Согласовать заказ и подготовить материалы",
    185,
    205,
  );
  const a2 = addBlock(
    p,
    cid,
    "Изготовить детали мебели",
    475,
    345,
  );
  a2.color = "#fff4ce";
  const a3 = addBlock(p, cid, "Собрать и проверить изделие", 765, 485);
  const a4 = addBlock(
    p,
    cid,
    "Упаковать и передать заказ",
    1055,
    625,
  );
  const d = p.diagrams[cid];
  const find = (name: string) =>
    d.arrows.find((a) => p.flows[a.flowId].name === name)!;
  for (const [i, name] of groups.left.entries()) {
    const a = find(name);
    a.source = boundary("left", 0.21 + i * 0.06);
    a.target = nodeEnd(a1.id, "left", 0.35 + i * 0.35);
    a.route = 140;
  }
  const controlNodes = [a1, a3, a2];
  groups.top.forEach((name, i) => {
    const a = find(name);
    a.source = boundary("top", (controlNodes[i].x + 117 - 55) / 1330);
    a.target = nodeEnd(controlNodes[i].id, "top");
  });
  groups.right.forEach((name, i) => {
    const a = find(name);
    a.source = nodeEnd((i === 0 ? a4 : a2).id, "right", 0.7);
    a.target = boundary("right", i === 0 ? 0.85 : 0.58);
    if (i === 1) a.route = 1340;
  });
  const mechNodes = [a1, a3, a2];
  groups.bottom.forEach((name, i) => {
    const a = find(name);
    a.source = boundary("bottom", (mechNodes[i].x + 90 - 55) / 1330);
    a.target = nodeEnd(mechNodes[i].id, "bottom", 0.38);
    a.route = 750;
  });
  addArrow(
    p,
    cid,
    nodeEnd(a1.id, "right", 0.35),
    nodeEnd(a2.id, "top", 0.28),
    "Согласованный чертёж",
  ).route = 440;
  addArrow(
    p,
    cid,
    nodeEnd(a1.id, "right", 0.73),
    nodeEnd(a2.id, "left", 0.6),
    "Подготовленные материалы",
  ).route = 450;
  addArrow(
    p,
    cid,
    nodeEnd(a2.id, "right", 0.35),
    nodeEnd(a3.id, "left", 0.6),
    "Детали мебели",
  ).route = 745;
  addArrow(
    p,
    cid,
    nodeEnd(a3.id, "right", 0.72),
    nodeEnd(a4.id, "left", 0.6),
    "Проверенная мебель",
  ).route = 1035;
  const feedback = addArrow(
    p,
    cid,
    nodeEnd(a3.id, "right", 0.25),
    nodeEnd(a2.id, "top", 0.8),
    "Детали на доработку",
  );
  feedback.route = 1020;
  feedback.labelDx = 20;
  feedback.labelDy = -80;
  addArrow(
    p,
    cid,
    boundary("top", 0.84),
    nodeEnd(a4.id, "top"),
    "Правила упаковки и передачи",
  );
  // A shared mechanism branches to another function, preserving the flow identity.
  const mech = find(groups.bottom[2]);
  d.arrows.push({
    ...structuredClone(mech),
    id: crypto.randomUUID(),
    source: boundary("bottom", 0.84),
    target: nodeEnd(a4.id, "bottom"),
    route: 775,
  });
  syncInheritance(p);
  for (const diagram of Object.values(p.diagrams))
    for (const arrow of diagram.arrows) {
      resetRoute(arrow);
      arrow.labelDx = 0;
      arrow.labelDy = 0;
    }
  return p;
}
