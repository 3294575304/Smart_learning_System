import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { TeacherBackLink } from "@/components/dashboard/teacher-back-link";
import { safeStudentReturn } from "@/services/assignments/student-query";

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

function findVariableInitializer(
  tree: ts.SourceFile,
  name: string,
): ts.Expression | undefined {
  let initializer: ts.Expression | undefined;
  function visit(node: ts.Node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name &&
      node.initializer
    ) {
      initializer = node.initializer;
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return initializer;
}

function resolveHrefTargets(
  expression: ts.Expression,
  tree: ts.SourceFile,
  visited = new Set<string>(),
): string[] {
  if (ts.isConditionalExpression(expression)) {
    return [
      ...resolveHrefTargets(expression.whenTrue, tree, visited),
      ...resolveHrefTargets(expression.whenFalse, tree, visited),
    ];
  }
  if (
    ts.isStringLiteral(expression) ||
    ts.isNoSubstitutionTemplateLiteral(expression)
  ) {
    return [expression.text];
  }
  if (ts.isTemplateExpression(expression)) {
    let target = expression.head.text;
    for (const span of expression.templateSpans) {
      target += "resource-id" + span.literal.text;
    }
    return [target];
  }
  if (
    ts.isBinaryExpression(expression) &&
    expression.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
  ) {
    return [
      ...resolveHrefTargets(expression.left, tree, visited),
      ...resolveHrefTargets(expression.right, tree, visited),
    ];
  }
  if (
    ts.isBinaryExpression(expression) &&
    expression.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    const left = resolveHrefTargets(expression.left, tree, visited);
    const right = resolveHrefTargets(expression.right, tree, visited);
    if (left.length && right.length) {
      return left.flatMap((prefix) => right.map((suffix) => prefix + suffix));
    }
    if (left.length) return left.map((prefix) => prefix + "resource-id");
    if (right.length) return right.map((suffix) => "resource-id" + suffix);
    return [];
  }
  if (ts.isCallExpression(expression) && expression.arguments[0]) {
    if (
      ts.isIdentifier(expression.expression) &&
      expression.expression.text === "safeStudentReturn"
    ) {
      return [
        safeStudentReturn(),
        safeStudentReturn("/teacher/assignments?view=STUDENTS&page=2"),
      ];
    }
    return resolveHrefTargets(expression.arguments[0], tree, visited);
  }
  if (ts.isIdentifier(expression) && !visited.has(expression.text)) {
    const nextVisited = new Set(visited).add(expression.text);
    const initializer = findVariableInitializer(tree, expression.text);
    if (initializer) return resolveHrefTargets(initializer, tree, nextVisited);
  }
  return [];
}

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
        const expression = ts.isJsxExpression(attribute.initializer)
          ? attribute.initializer.expression
          : ts.isStringLiteral(attribute.initializer)
            ? attribute.initializer
            : undefined;
        assert.ok(expression, `${file}: return target must be an expression`);
        const targets = resolveHrefTargets(expression, tree).map(
          (target) => target.split(/[?#]/)[0],
        );
        assert.ok(targets.length, `${file}: unable to resolve return target`);
        for (const target of targets) {
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
