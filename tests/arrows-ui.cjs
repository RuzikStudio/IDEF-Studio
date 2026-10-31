const { _electron: electron, expect } = require("@playwright/test");
const fs = require("node:fs/promises");
const path = require("node:path");
(async () => {
  const root = path.resolve(__dirname, "..");
  const app = await electron.launch({ args: [root, "--test"], timeout: 60000 });
  let page;
  const errors = [];
  try {
    page = await app.firstWindow();
    page.on("pageerror", (e) => errors.push(e.message));
    await page.waitForSelector("[data-node-id]");
    const arrowId = await page
      .locator("[data-arrow-id]")
      .first()
      .getAttribute("data-arrow-id");
    const rootArrow = () => page.locator(`[data-arrow-id="${arrowId}"]`);
    await rootArrow().locator("text").first().click();
    await page
      .getByRole("button", { name: "Добавить опорную точку", exact: true })
      .click();
    await expect(page.locator("[data-waypoint-index]")).toHaveCount(1);
    const waypoint = page.locator("[data-waypoint-index]").first();
    const before = await waypoint.locator("rect").getAttribute("transform"),
      box = await waypoint.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      box.x + box.width / 2 + 30,
      box.y + box.height / 2 - 40,
      { steps: 5 },
    );
    await page.mouse.up();
    await expect(waypoint.locator("rect")).not.toHaveAttribute(
      "transform",
      before,
    );
    await page
      .getByRole("button", { name: "Отменить (Ctrl+Z)", exact: true })
      .click();
    await rootArrow().locator("text").first().click();
    await expect(page.locator("[data-waypoint-index] rect")).toHaveAttribute(
      "transform",
      before,
    );
    await page
      .getByRole("button", { name: "Повторить (Ctrl+Y)", exact: true })
      .click();
    await rootArrow().locator("text").first().click();
    await page
      .getByRole("button", { name: "Добавить опорную точку", exact: true })
      .click();
    await expect(page.locator("[data-waypoint-index]")).toHaveCount(2);
    await page.getByRole("button", { name: "Удалить опорную точку 2" }).click();
    await expect(page.locator("[data-waypoint-index]")).toHaveCount(1);
    await page.screenshot({
      path: path.join(root, "test-results/02-waypoints.png"),
    });
    await page.getByTestId("tunnel-target").check();
    await expect(page.locator("[data-tunnel-marker]")).toHaveCount(1);
    await page.locator("[data-node-id]").first().dblclick();
    await expect(page.locator("[data-node-id]")).toHaveCount(4);
    await expect(page.locator(".tunnel-banner")).toContainText(
      "Скрыто туннелями родителя: 1",
    );
    await expect(page.locator("[data-arrow-id]")).toHaveCount(16);
    await expect(page.locator("[data-icom-code]")).toHaveCount(10);
    await page.screenshot({
      path: path.join(root, "test-results/02-tunnel.png"),
    });
    // Export must omit the suppressed arrow and retain ICOM and tunnel symbols.
    const exportPath = path.join(root, "test-results/02-tunnel.svg");
    await app.evaluate(({ dialog }, p) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: p });
    }, exportPath);
    await page.getByRole("button", { name: "Экспорт", exact: true }).click();
    await page.getByRole("button", { name: "SVG · векторная схема" }).click();
    await expect(page.getByRole("status")).toContainText(
      "Диаграмма сохранена в SVG",
    );
    const exported = await fs.readFile(exportPath, "utf8");
    if (exported.includes("Задание на"))
      throw Error("Suppressed arrow leaked to export");
    if (
      !exported.includes("data-icom-code") ||
      !exported.includes("data-tunnel-marker")
    )
      throw Error("Missing semantic symbols in export");
    await page.getByRole("button", { name: "К родителю", exact: true }).click();
    await rootArrow().locator("text").first().click();
    await page.getByTestId("tunnel-target").uncheck();
    await page
      .getByRole("button", { name: "Автоматически", exact: true })
      .click();
    await expect(page.locator("[data-waypoint-index]")).toHaveCount(0);
    await page.locator("[data-node-id]").first().dblclick();
    await expect(page.locator("[data-arrow-id]")).toHaveCount(17);
    await expect(page.locator(".tunnel-banner")).toHaveCount(0);
    await page
      .getByRole("button", { name: "Развести стрелки автоматически" })
      .click();
    await page.screenshot({
      path: path.join(root, "test-results/02-auto.png"),
    });
    const savePath = path.join(root, "test-results/02-project.idef.json");
    await app.evaluate(({ dialog }, p) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: p });
    }, savePath);
    await page.getByRole("button", { name: "Сохранить", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Проект сохранён");
    const first = await fs.readFile(savePath, "utf8");
    if (JSON.parse(first).version !== 3) throw Error("Not version 3");
    await page.getByRole("button", { name: "Сохранить", exact: true }).click();
    await expect
      .poll(async () => await fs.readFile(savePath + ".bak", "utf8"))
      .toBe(first);
    // Opening old files offers a new v0.3 destination and leaves the old file untouched.
    const legacyPath = path.join(root, "test-results/legacy.idef.json"),
      legacy = JSON.parse(first);
    legacy.version = 1;
    const original = JSON.stringify(legacy);
    await fs.writeFile(legacyPath, original);
    await app.evaluate(({ dialog }, p) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [p] });
    }, legacyPath);
    await page.getByRole("button", { name: "Открыть", exact: true }).click();
    await expect(page.locator("[data-node-id]")).toHaveCount(1);
    const migratedPath = path.join(root, "test-results/migrated.idef.json");
    await app.evaluate(({ dialog }, p) => {
      dialog.showSaveDialog = async (_win, opts) => {
        global.__lastSaveDefault = opts.defaultPath;
        return { canceled: false, filePath: p };
      };
    }, migratedPath);
    await page.getByRole("button", { name: "Сохранить", exact: true }).click();
    await expect
      .poll(async () => await fs.readFile(migratedPath, "utf8"))
      .toContain('"version": 3');
    const defaultPath = await app.evaluate(() => global.__lastSaveDefault);
    if (!defaultPath.includes("-v0.5.0"))
      throw Error("Migration does not offer a separate file");
    if ((await fs.readFile(legacyPath, "utf8")) !== original)
      throw Error("Old project was modified");
    if (errors.length) throw Error(errors.join("\n"));
    console.log(
      JSON.stringify({
        waypointDrag: true,
        undoRedo: true,
        tunnelRestore: true,
        icom: true,
        export: true,
        fileBackup: true,
        legacyMigration: true,
        rendererErrors: errors,
      }),
    );
  } catch (e) {
    if (page)
      await page
        .screenshot({ path: path.join(root, "test-results/02-failure.png") })
        .catch(() => {});
    throw e;
  } finally {
    await app.evaluate(({ app }) => app.exit(0));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
