const { _electron: electron, expect } = require("@playwright/test");
(async () => {
  const executablePath = process.argv[2];
  if (!executablePath) throw Error("Укажите путь к EXE");
  const app = await electron.launch({
    executablePath,
    args: ["--test"],
    timeout: 60000,
  });
  try {
    const page = await app.firstWindow(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await expect(
      page.getByRole("heading", { name: "Изготовление мебели на заказ", exact: true }),
    ).toBeVisible();
    await expect(page.locator("[data-node-id]")).toHaveCount(1);
    await page.locator("[data-node-id]").first().dblclick();
    await expect(page.locator("[data-node-id]")).toHaveCount(4);
    await expect(page.locator(".status-version")).toHaveText("IDEF Studio 0.5");
    await expect(page.locator("[data-icom-code]")).toHaveCount(11);
    await page
      .getByRole("button", { name: "Развести стрелки автоматически" })
      .click();
    if (errors.length) throw Error(errors.join("\n"));
    console.log(
      JSON.stringify({
        packagedExe: true,
        context: true,
        decomposition: true,
        rendererErrors: errors,
      }),
    );
  } finally {
    await app.evaluate(({ app }) => app.exit(0));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

