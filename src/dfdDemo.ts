import {
  newProject,
  addBlock,
  addArrow,
  nodeEnd,
  decompose,
  syncInheritance,
} from "./model";
export function dfdDemo() {
  const p = newProject("Обработка заказов", "DFD");
  p.organization = "Учебный пример";
  const root = p.rootId,
    process = addBlock(p, root, "Обработать заказ", 590, 350),
    client = addBlock(p, root, "Клиент", 140, 350, "entity"),
    warehouse = addBlock(p, root, "Склад", 1080, 350, "entity");
  addArrow(
    p,
    root,
    nodeEnd(client.id, "right", 0.3),
    nodeEnd(process.id, "left", 0.3),
    "Заказ",
  );
  addArrow(
    p,
    root,
    nodeEnd(process.id, "left", 0.7),
    nodeEnd(client.id, "right", 0.7),
    "Подтверждение",
  );
  addArrow(
    p,
    root,
    nodeEnd(process.id, "right", 0.3),
    nodeEnd(warehouse.id, "left", 0.3),
    "Заявка на отгрузку",
  );
  addArrow(
    p,
    root,
    nodeEnd(warehouse.id, "left", 0.7),
    nodeEnd(process.id, "right", 0.7),
    "Статус отгрузки",
  );
  const child = decompose(p, root, process.id, 3);
  const d = p.diagrams[child],
    nodes = d.nodes.filter((n) => !n.contextOf);
  nodes[0].name = "Принять заказ";
  nodes[1].name = "Проверить заказ";
  nodes[2].name = "Организовать отгрузку";
  nodes.forEach((n, i) => {
    n.x = 350 + i * 270;
    n.y = 250 + i * 120;
  });
  for (const a of d.arrows) {
    const label = p.flows[a.flowId].name;
    if (a.inheritedDirection === "in")
      a.target = nodeEnd(label === "Заказ" ? nodes[0].id : nodes[2].id, "left");
    else
      a.source = nodeEnd(
        label === "Подтверждение" ? nodes[0].id : nodes[2].id,
        "right",
      );
  }
  addArrow(
    p,
    child,
    nodeEnd(nodes[0].id, "right"),
    nodeEnd(nodes[1].id, "left"),
    "Данные заказа",
  );
  addArrow(
    p,
    child,
    nodeEnd(nodes[1].id, "right"),
    nodeEnd(nodes[2].id, "top"),
    "Проверенный заказ",
  );
  const store = addBlock(p, child, "Заказы", 500, 650, "store");
  addArrow(
    p,
    child,
    nodeEnd(nodes[1].id, "bottom", 0.3),
    nodeEnd(store.id, "top", 0.3),
    "Запись заказа",
  );
  addArrow(
    p,
    child,
    nodeEnd(store.id, "top", 0.7),
    nodeEnd(nodes[1].id, "bottom", 0.7),
    "Сведения о заказе",
  );
  syncInheritance(p);
  return p;
}
