import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const layers = ["app", "widgets", "features", "entities", "shared", "i18n"];
async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) =>
        entry.isDirectory()
          ? files(path.join(directory, entry.name))
          : /\.tsx?$/.test(entry.name)
            ? [path.join(directory, entry.name)]
            : [],
      ),
    )
  ).flat();
}

test("module imports respect layer ownership and feature public APIs", async () => {
  const violations = [];
  for (const file of (
    await Promise.all(layers.map((layer) => files(path.join(root, layer))))
  ).flat()) {
    const owner = path.relative(root, file).split(path.sep);
    const source = ts.createSourceFile(
      file,
      await readFile(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    const inspect = (specifier) => {
      if (!specifier.startsWith("@/") && !specifier.startsWith(".")) return;
      const target = path
        .relative(
          root,
          specifier.startsWith("@/")
            ? path.join(root, specifier.slice(2))
            : path.resolve(path.dirname(file), specifier),
        )
        .split(path.sep);
      const fail = (message) =>
        violations.push(
          `${path.relative(root, file)} → ${specifier}: ${message}`,
        );
      if (owner[0] === "shared" && target[0] !== "shared")
        fail("shared code must be domain independent");
      if (
        owner[0] === "entities" &&
        !(
          target[0] === "entities" ||
          (target[0] === "shared" && target[1] === "lib")
        )
      )
        fail("entities cannot depend on presentation or application layers");
      if (
        owner[0] === "features" &&
        (["app", "widgets"].includes(target[0]) ||
          (target[0] === "features" && target[1] !== owner[1]))
      )
        fail("features must not depend on composition or sibling features");
      if (
        owner[0] === "widgets" &&
        target[0] === "features" &&
        target.length > 2
      )
        fail("use the feature public index");
      if (
        owner[0] === "features" &&
        owner[1] === "planet-viewer" &&
        owner[2] === "model" &&
        target[1] === "planet-viewer" &&
        ["ui", "scenes"].includes(target[2])
      )
        fail("renderer state cannot depend on scenes or UI");
      if (["components", "hooks", "lib"].includes(target[0]))
        fail("legacy source root");
    };
    const visit = (node) => {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      )
        inspect(node.moduleSpecifier.text);
      if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        node.arguments[0] &&
        ts.isStringLiteral(node.arguments[0])
      )
        inspect(node.arguments[0].text);
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  assert.deepEqual(violations, []);
});
