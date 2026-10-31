const { _electron: electron, expect } = require("@playwright/test");
const path = require("node:path"),
  fs = require("node:fs/promises");
(async () => {
  const root = path.resolve(__dirname, "..");
  const app = await electron.launch({ args: [root, "--test"], timeout: 60000 });
  let page;
  try {
    page = await app.firstWindow();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.waitForSelector("[data-node-id]");
    await page.getByRole("button", { name: "Открыть учебный пример" }).click();
    await page.getByLabel("Нотация", { exact: true }).selectOption("DFD");
    await page.getByRole("button", { name: "Продолжить", exact: true }).click();
    await expect(page.locator("[data-node-id]")).toHaveCount(3);
    await expect(page.locator(".notation-tag")).toHaveText("DFD");
    await page.locator("[data-node-id]").first().dblclick();
    await expect(page.locator("[data-node-id]")).toHaveCount(6);
    await page.screenshot({ path: path.join(root, "test-results/03-dfd.png") });
    const count = await page.locator("[data-crossing]").count();
    if (!count) throw Error("No crossings in DFD example");
    await page.getByRole("button", { name: "Мостики на пересечениях" }).click();
    await expect(page.locator("[data-crossing]")).toHaveCount(0);
    await page.getByRole("button", { name: "Мостики на пересечениях" }).click();
    await expect(page.locator("[data-crossing]")).toHaveCount(count);
    const save = path.join(root, "test-results/03-dfd.idef.json");
    await app.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    }, save);
    await page.getByRole("button", { name: "Сохранить", exact: true }).click();
    await expect
      .poll(async () => JSON.parse(await fs.readFile(save, "utf8")).notation)
      .toBe("DFD");
    for (const kind of ["svg", "pdf"]) {
      const file = path.join(root, "test-results/03-dfd." + kind);
      await app.evaluate(({ dialog }, file) => {
        dialog.showSaveDialog = async () => ({
          canceled: false,
          filePath: file,
        });
      }, file);
      await page.getByRole("button", { name: "Экспорт", exact: true }).click();
      await page
        .getByRole("button", {
          name:
            kind === "svg"
              ? "SVG · векторная схема"
              : "PDF · текущая диаграмма",
        })
        .click();
      await expect
        .poll(async () => {
          try {
            return (await fs.stat(file)).size;
          } catch {
            return 0;
          }
        })
        .toBeGreaterThan(1000);
      if (
        kind === "svg" &&
        !(await fs.readFile(file, "utf8")).includes("data-crossing")
      )
        throw Error("Export missing bridges");
    }
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [file],
      });
    }, save);
    await page.getByRole("button", { name: "Открыть", exact: true }).click();
    await expect(page.locator("[data-node-id]")).toHaveCount(3);
    await page.locator("[data-node-id]").first().dblclick();
    await page.locator("[data-node-id]").first().click();
    await page
      .getByRole("button", { name: "Декомпозиция", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Создать диаграмму", exact: true })
      .click();
    await expect(page.locator("[data-node-id]")).toHaveCount(5);
    if (errors.length) throw Error(errors.join("\n"));
    console.log(
      "DFD: example, crossings toggle, native save/open, SVG/PDF, nested decomposition passed",
    );
  } catch (e) {
    if (page)
      await page
        .screenshot({ path: path.join(root, "test-results/03-failure.png") })
        .catch(() => {});
    throw e;
  } finally {
    await app.evaluate(({ app }) => app.exit(0));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
