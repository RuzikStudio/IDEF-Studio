import React from "react";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { demoProject } from "../src/demo";
import { dfdDemo } from "../src/dfdDemo";
import { serialize, diagramCode, PAGE } from "../src/model";
import { DiagramContent } from "../src/Diagram";
const output = process.argv[2];
if (!output) throw new Error("Укажите папку для примера");
await mkdir(output, { recursive: true });
const project = process.argv[3] === 'DFD' ? dfdDemo() : demoProject();
await writeFile(
  path.join(output, `${project.title}.idef.json`),
  serialize(project),
  "utf8",
);
for (const diagramId of Object.keys(project.diagrams)) {
  const svg = renderToStaticMarkup(
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={PAGE.w}
      height={PAGE.h}
      viewBox={`0 0 ${PAGE.w} ${PAGE.h}`}
    >
      <DiagramContent project={project} diagramId={diagramId} />
    </svg>,
  );
  await writeFile(
    path.join(output, `${diagramCode(project, diagramId)}.svg`),
    svg,
    "utf8",
  );
}
console.log("Учебный проект и SVG сохранены.");
