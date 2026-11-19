const { _electron, expect } = require("@playwright/test");
const { writeFile, mkdir } = require("node:fs/promises");
const path = require("node:path");
require("tsx/cjs");
const {
  newProject,
  addBlock,
  addArrow,
  boundary,
  nodeEnd,
  decompose,
  serialize,
} = require("../src/model.ts");

async function drag(page, locator, dx, dy) {
  const box = await locator.boundingBox();
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 5 });
  await page.mouse.up();
}

(async () => {
  const root = path.resolve(__dirname, "..");
  const fixture = path.join(root, "test-results", "block-routing.idef.json");
  await mkdir(path.dirname(fixture), { recursive: true });
  const model = newProject();
  const main = addBlock(model, model.rootId);
  const rootArrow = addArrow(
    model,
    model.rootId,
    boundary("left", 0.7),
    nodeEnd(main.id, "left"),
    "Вход",
  );
  const child = model.diagrams[decompose(model, model.rootId, main.id)];
  for (const block of child.nodes) block.y = 300;
  const inherited = child.arrows[0];
  await writeFile(fixture, serialize(model), "utf8");
  const app = await _electron.launch(
    process.argv[2]
      ? { executablePath: path.resolve(process.argv[2]), args: ["--test"] }
      : { args: [root, "--test"] },
  );
  try {
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [file],
      });
    }, fixture);
    const page = await app.firstWindow();
    page.setDefaultTimeout(8000);
    await page.getByRole("button", { name: "Открыть", exact: true }).click();
    const nodes = page.locator("[data-node-id]");
    await expect(nodes).toHaveCount(1);
    const rootLabel = page.locator(
      '[data-arrow-label="' + rootArrow.id + '"] text',
    );
    await expect(rootLabel).toBeVisible();
    const rootPath = page.locator(
      '[data-arrow-id="' + rootArrow.id + '"] polyline[marker-end]',
    );
    const pathLength = () =>
      rootPath.evaluate((line) => line.points.numberOfItems);
    expect(await pathLength()).toBeGreaterThan(2);
    await rootLabel.click();
    await page
      .getByRole("button", { name: "Выпрямить стрелку", exact: true })
      .first()
      .click();
    expect(await pathLength()).toBe(2);
    await page
      .getByRole("button", { name: "Отменить (Ctrl+Z)", exact: true })
      .click();
    expect(await pathLength()).toBeGreaterThan(2);
    const viewport = page.locator(".canvas-viewport");
    const normalWidth = (await viewport.boundingBox()).width;
    await page
      .getByRole("button", {
        name: "Развернуть рабочую область (F11)",
        exact: true,
      })
      .click();
    await expect(page.locator(".sidebar")).toBeHidden();
    await expect(page.locator(".properties")).toBeHidden();
    expect((await viewport.boundingBox()).width).toBeGreaterThan(
      normalWidth + 200,
    );
    await expect
      .poll(() => viewport.evaluate((el) => el.scrollHeight - el.clientHeight))
      .toBeLessThan(2);
    await page.keyboard.press("F11");
    await expect(page.locator(".sidebar")).toBeVisible();
    await nodes.first().dblclick();
    await expect(nodes).toHaveCount(3);
    const labelFor = (id) =>
      page.locator('[data-arrow-label="' + id + '"] text');
    await labelFor(inherited.id).click();
    await page
      .getByRole("button", { name: "Удалить с этой диаграммы" })
      .click();
    await expect(page.locator("[data-arrow-id]")).toHaveCount(0);
    await page.getByRole("button", { name: "Связь", exact: true }).click();
    await nodes.nth(0).click();
    await nodes.nth(1).click();
    const arrow = page.locator("[data-arrow-id]").first();
    const id = await arrow.getAttribute("data-arrow-id");
    const polyline = arrow.locator("polyline[marker-end]");
    const points = () =>
      polyline.evaluate((line) =>
        [...line.points].map(({ x, y }) => ({ x, y })),
      );
    expect(await points()).toHaveLength(2);
    await drag(page, nodes.nth(1), 0, 25);
    expect(await points()).toHaveLength(2);
    const resize = page.locator("[data-block-resize]");
    const before = await resize.getAttribute("x");
    await drag(page, resize, 24, 14);
    await expect(resize).not.toHaveAttribute("x", before);
    expect(await points()).toHaveLength(2);
    await labelFor(id).click();
    const color = "#176947";
    await page.getByLabel("Цвет стрелки", { exact: true }).fill(color);
    await page.getByRole("button", { name: "Добавить ветвь" }).click();
    await nodes.nth(2).click();
    await expect(
      page.locator('polyline[marker-end][stroke="' + color + '"]'),
    ).toHaveCount(2);
    const sources = await page
      .locator('polyline[marker-end][stroke="' + color + '"]')
      .evaluateAll((lines) =>
        lines.map((line) => {
          const start = line.points.getItem(0);
          return [start.x, start.y];
        }),
      );
    expect(sources[0]).toEqual(sources[1]);
    await expect(page.locator("[data-arrow-label]")).toHaveCount(1);
    await expect(labelFor(id)).toContainText("Новый поток");
    await page.screenshot({
      path: path.join(root, "test-results", "block-routing.png"),
    });
    console.log(
      "Block click, straight routing after move and resize, inherited removal, branch color and label passed",
    );
  } finally {
    await app.evaluate(({ app }) => app.exit());
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
