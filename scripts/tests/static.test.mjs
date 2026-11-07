import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { parse } from "acorn";
import { analyze } from "eslint-scope";
import globals from "globals";

function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(path.join(directory, entry.name))
      : entry.name.endsWith(".js")
        ? [path.join(directory, entry.name)]
        : [],
  );
}
test("módulos frontend/backend sin referencias a variables no definidas", () => {
  const problems = [];
  for (const file of [...files("public/js"), ...files("src"), "server.js"]) {
    const source = readFileSync(file, "utf8");
    let ast;
    try {
      ast = parse(source, {
        ecmaVersion: "latest",
        sourceType: "module",
        ranges: true,
        locations: true,
      });
    } catch (error) {
      assert.fail(`${file}: ${error.message}`);
    }
    const known = new Set(
      Object.keys({
        ...globals.builtin,
        ...(file.startsWith("public") ? globals.browser : globals.node),
      }),
    );
    const scope = analyze(ast, {
      ecmaVersion: 2024,
      sourceType: "module",
      optimistic: true,
    });
    for (const reference of scope.globalScope.through) {
      if (!known.has(reference.identifier.name))
        problems.push(
          `${file}:${reference.identifier.loc.start.line}: ${reference.identifier.name}`,
        );
    }
  }
  assert.deepEqual(problems, []);
});

test("los imports locales usan exports que existen", () => {
  const modules = new Map();
  for (const file of [...files("public/js"), ...files("src"), "server.js"]) {
    const ast = parse(readFileSync(file, "utf8"), {
      ecmaVersion: "latest",
      sourceType: "module",
    });
    const exports = new Set();
    for (const statement of ast.body) {
      if (statement.type === "ExportDefaultDeclaration") exports.add("default");
      if (statement.type === "ExportNamedDeclaration") {
        if (statement.declaration?.id)
          exports.add(statement.declaration.id.name);
        for (const declaration of statement.declaration?.declarations || [])
          exports.add(declaration.id.name);
        for (const specifier of statement.specifiers)
          exports.add(specifier.exported.name);
      }
    }
    modules.set(path.resolve(file), { ast, exports });
  }
  const problems = [];
  for (const [file, { ast }] of modules) {
    for (const statement of ast.body.filter(
      (node) =>
        node.type === "ImportDeclaration" && node.source.value.startsWith("."),
    )) {
      const target = path.resolve(path.dirname(file), statement.source.value);
      if (!modules.has(target)) {
        problems.push(`${file}: módulo inexistente ${target}`);
        continue;
      }
      for (const specifier of statement.specifiers) {
        if (specifier.type === "ImportNamespaceSpecifier") continue;
        const name =
          specifier.type === "ImportDefaultSpecifier"
            ? "default"
            : specifier.imported.name;
        if (!modules.get(target).exports.has(name))
          problems.push(`${file}: falta export ${name} en ${target}`);
      }
    }
  }
  assert.deepEqual(problems, []);
});
