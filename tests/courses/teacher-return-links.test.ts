import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { TeacherBackLink } from "@/components/dashboard/teacher-back-link";

Object.assign(globalThis, { React });
const root = path.resolve("app/(protected)/teacher");
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(path.join(dir, entry.name))
      : [path.join(dir, entry.name)],
  );
}
const pages = files(root).filter((file) => file.endsWith("page.tsx"));
const routes = pages.map(
  (file) =>
    "/teacher/" +
    path
      .relative(root, file)
      .replaceAll(path.sep, "/")
      .replace(/\/page\.tsx$/, ""),
);

test("teacher return links work as real anchors without JavaScript and expose a visible accessible label", () => {
  const props = { href: "/teacher/courses/course-a", children: "返回课程" };
  const html = renderToStaticMarkup(createElement(TeacherBackLink, props));
  assert.match(html, /<a[^>]*href="\/teacher\/courses\/course-a"/);
  assert.match(html, /返回课程/);
  assert.match(html, /min-h-11/);
  assert.match(html, /focus-visible:/);
});

test("every unified teacher return target resolves to an existing teacher page", () => {
  let checked = 0;
  for (const file of [
    ...pages,
    path.resolve("components/courses/teaching-progress-panel.tsx"),
    path.resolve("components/courses/course-roster-import-wizard.tsx"),
    path.resolve("components/questions/question-bulk-import.tsx"),
  ]) {
    const source = readFileSync(file, "utf8");
    const tree = ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    function visit(node: ts.Node) {
      if (
        ts.isJsxElement(node) &&
        node.openingElement.tagName.getText(tree) === "TeacherBackLink"
      ) {
        const attribute = node.openingElement.attributes.properties.find(
          (prop) =>
            ts.isJsxAttribute(prop) && prop.name.getText(tree) === "href",
        );
        assert.ok(
          attribute && ts.isJsxAttribute(attribute) && attribute.initializer,
          file,
        );
        const initializer = attribute.initializer;
        const candidates =
          ts.isJsxExpression(initializer) &&
          initializer.expression &&
          ts.isConditionalExpression(initializer.expression)
            ? [
                initializer.expression.whenTrue,
                initializer.expression.whenFalse,
              ]
            : [initializer];
        for (const candidate of candidates) {
          const target = candidate
            .getText(tree)
            .replace(/^\{?['"`]|['"`]\}?$/g, "")
            .replace(/\$\{[^}]+\}/g, "resource-id")
            .split(/[?#]/)[0];
          assert.ok(
            routes.some((route) =>
              new RegExp(
                "^" + route.replace(/\[[^\]]+\]/g, "[^/]+") + "$",
                "u",
              ).test(target),
            ),
            `${file}: invalid return target ${target}`,
          );
        }
        checked++;
      }
      ts.forEachChild(node, visit);
    }
    visit(tree);
  }
  assert.ok(
    checked >= 30,
    `Expected all teacher return entries, checked ${checked}`,
  );
});
