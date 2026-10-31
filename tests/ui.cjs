const { _electron: electron, expect } = require("@playwright/test");
const path = require("node:path");
const fs = require("node:fs/promises");
(async () => {
  const root = path.resolve(__dirname, "..");
  await fs.mkdir(path.join(root, "test-results"), { recursive: true });
  const app = await electron.launch({ args: [root, "--test"], timeout: 60000 });
  let page;
  const errors = [];
  try {
    page = await app.firstWindow();
    page.on("pageerror", (err) => errors.push(err.message));
    await page.waitForSelector("[data-node-id]");
    await expect(
      page.getByRole("heading", { name: "Изготовление мебели на заказ", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: path.join(root, "test-results/context.png"),
    });
    const rootNode = page.locator("[data-node-id]").first();
    await rootNode.click();
    await expect(
      page.getByRole("textbox", { name: "Название функции", exact: true }),
    ).toBeVisible();
    await rootNode.dblclick();
    await expect(page.locator("[data-node-id]")).toHaveCount(4);
    await page.screenshot({
      path: path.join(root, "test-results/decomposition.png"),
    });
    const block = page.locator("[data-node-id]").nth(1);
    await block.click();
    await page
      .getByRole("button", { name: "Декомпозиция", exact: true })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Создать декомпозицию" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Создать диаграмму", exact: true })
      .click();
    await expect(page.locator("[data-node-id]")).toHaveCount(3);
    const count = await page.locator("[data-arrow-id]").count();
    if (count < 4) throw Error("Inherited arrows missing");
    await page.screenshot({
      path: path.join(root, "test-results/inherited.png"),
    });
    const stub = page
      .locator("[data-arrow-id] g")
      .filter({
        has: page.locator("title", { hasText: "Нажмите и выберите порт" }),
      })
      .first();
    // Connect an inherited input using the property editor, preserving boundary semantics.
    const arrows = page.locator("[data-arrow-id]");
    let connected = false;
    for (let i = 0; i < (await arrows.count()); i++) {
      await arrows.nth(i).locator("polyline").first().click({ force: true });
      const target = page.getByRole("combobox", { name: "Приёмник стрелки" });
      if (await target.isEnabled()) {
        const value = await target
          .locator("option")
          .nth(1)
          .getAttribute("value");
        await target.selectOption(value);
        connected = true;
        break;
      }
    }
    if (!connected) throw Error("No inherited input found");
    await page
      .getByRole("textbox", { name: "Название потока" })
      .fill("Проверка наследования — общий поток");
    await page.getByRole("textbox", { name: "Название потока" }).blur();
    await expect(
      page
        .locator("[data-arrow-id] text")
        .filter({ hasText: /Проверка.*наследования/ }),
    ).toHaveCount(1);
    await page.getByRole("button", { name: "На родительский уровень" }).click();
    await expect(page.locator("[data-node-id]")).toHaveCount(4);
    await expect(
      page
        .locator("[data-arrow-id] text")
        .filter({ hasText: /Проверка.*наследования/ }),
    ).toHaveCount(1);
    // Drag a block and undo/redo in the real renderer.
    const dragNode = page.locator("[data-node-id]").first(),
      rect = dragNode.locator("rect").first();
    const before = await rect.getAttribute("x");
    const box = await dragNode.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      box.x + box.width / 2 + 35,
      box.y + box.height / 2 + 18,
      { steps: 5 },
    );
    await page.mouse.up();
    const after = await dragNode
      .locator("rect")
      .filter({ hasNot: page.locator("title") })
      .last()
      .getAttribute("x");
    await page.getByRole("button", { name: "Отменить (Ctrl+Z)" }).click();
    if (
      (await page
        .locator("[data-node-id]")
        .first()
        .locator("rect")
        .first()
        .getAttribute("x")) !== before
    )
      throw Error("Undo drag failed");
    await page.getByRole("button", { name: "Повторить (Ctrl+Y)" }).click();
    // Native file dialogs are stubbed for deterministic filesystem checks.
    const savePath = path.join(root, "test-results/saved.idef.json");
    await app.evaluate(({ dialog }, savePath) => {
      dialog.showSaveDialog = async () => ({
        canceled: false,
        filePath: savePath,
      });
    }, savePath);
    await page.getByRole("button", { name: "Сохранить", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Проект сохранён");
    const json = JSON.parse(await fs.readFile(savePath, "utf8"));
    if (Object.keys(json.diagrams).length !== 3)
      throw Error("Save lost hierarchy");
    await app.evaluate(({ dialog }, savePath) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [savePath],
      });
    }, savePath);
    await page.getByRole("button", { name: "Открыть", exact: true }).click();
    await expect(page.locator("[data-node-id]")).toHaveCount(1);
    await page
      .getByRole("button", { name: /A0 Изготовление мебели на заказ/ })
      .click();
    const pdfPath = path.join(root, "test-results/diagram.pdf");
    await app.evaluate(({ dialog }, p) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: p });
    }, pdfPath);
    await page.getByRole("button", { name: "Экспорт", exact: true }).click();
    await page.getByRole("button", { name: "PDF · текущая диаграмма" }).click();
    await expect(page.getByRole("status")).toContainText(
      "Диаграмма сохранена в PDF",
      { timeout: 20000 },
    );
    const pdf = await fs.readFile(pdfPath);
    if (pdf.subarray(0, 4).toString() !== "%PDF") throw Error("Invalid PDF");
    const svgPath = path.join(root, "test-results/diagram.svg");
    await app.evaluate(({ dialog }, p) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: p });
    }, svgPath);
    await page.getByRole("button", { name: "Экспорт", exact: true }).click();
    await page.getByRole("button", { name: "SVG · векторная схема" }).click();
    await expect(page.getByRole("status")).toContainText(
      "Диаграмма сохранена в SVG",
    );
    if (!(await fs.readFile(svgPath, "utf8")).includes("<svg"))
      throw Error("Invalid SVG");
    if (errors.length) throw Error(errors.join("\n"));
    console.log(
      JSON.stringify({
        ok: true,
        inheritedArrowCount: count,
        modelSaved: true,
        pdfBytes: pdf.length,
        svgSaved: true,
        rendererErrors: errors,
      }),
    );
  } catch (e) {
    if (page)
      await page
        .screenshot({ path: path.join(root, "test-results/failure.png") })
        .catch(() => {});
    throw e;
  } finally {
    await app.evaluate(({ app }) => app.exit(0));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
