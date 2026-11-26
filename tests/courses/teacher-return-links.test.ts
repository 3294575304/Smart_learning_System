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

const moduleCache = new Map<string, ts.SourceFile | undefined>();

function loadModule(file: string): ts.SourceFile | undefined {
  if (moduleCache.has(file)) return moduleCache.get(file);
  let tree: ts.SourceFile | undefined;
  for (const candidate of [
    file,
    `${file}.ts`,
    `${file}.tsx`,
    `${file}/index.ts`,
  ]) {
    try {
      const source = readFileSync(candidate, "utf8");
      tree = ts.createSourceFile(
        candidate,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );
      break;
    } catch {
      // 换下一个候选扩展名
    }
  }
  moduleCache.set(file, tree);
  return tree;
}

/** 找到 `name` 在本文件里是从哪个模块导入的，并把别名解析成磁盘路径。 */
function importedModuleFile(
  tree: ts.SourceFile,
  name: string,
): string | undefined {
  for (const statement of tree.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    const matched = bindings.elements.some(
      (element) => element.name.text === name,
    );
    if (!matched) continue;
    const specifier = statement.moduleSpecifier;
    if (!ts.isStringLiteral(specifier)) return undefined;
    const value = specifier.text;
    if (value.startsWith("@/")) return path.resolve(value.slice(2));
    if (value.startsWith(".")) {
      return path.resolve(path.dirname(tree.fileName), value);
    }
    return undefined;
  }
  return undefined;
}

function findFunctionLike(
  tree: ts.SourceFile,
  name: string,
):
  | ts.FunctionDeclaration
  | ts.ArrowFunction
  | ts.FunctionExpression
  | undefined {
  for (const statement of tree.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name?.text === name) {
      return statement;
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (
          ts.isIdentifier(declaration.name) &&
          declaration.name.text === name &&
          declaration.initializer &&
          (ts.isArrowFunction(declaration.initializer) ||
            ts.isFunctionExpression(declaration.initializer))
        ) {
          return declaration.initializer;
        }
      }
    }
  }
  return undefined;
}

/** 收集函数体里所有 return 表达式，跳过内部嵌套函数。 */
function collectReturnExpressions(
  node: ts.Node,
  out: ts.Expression[] = [],
): ts.Expression[] {
  if (ts.isReturnStatement(node)) {
    if (node.expression) out.push(node.expression);
    return out;
  }
  if (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isClassDeclaration(node)
  ) {
    return out;
  }
  // 注意：ts.forEachChild 的回调一旦返回真值就会中断遍历，这里必须包一层 void。
  ts.forEachChild(node, (child) => {
    collectReturnExpressions(child, out);
  });
  return out;
}

/**
 * 链接可能由抽到 lib 里的构造函数拼出来（如 teacherClassroomListHref）。
 * 这里顺着 import 找到实现，再把它的 return 表达式当作候选目标解析。
 */
function resolveImportedReturns(
  name: string,
  tree: ts.SourceFile,
  visited: Set<string>,
): string[] {
  const moduleFile = importedModuleFile(tree, name);
  if (!moduleFile) return [];
  const key = `${moduleFile}#${name}`;
  if (visited.has(key)) return [];
  const importedTree = loadModule(moduleFile);
  if (!importedTree) return [];
  const fn = findFunctionLike(importedTree, name);
  if (!fn || !fn.body) return [];
  const nextVisited = new Set(visited).add(key);
  const expressions = ts.isBlock(fn.body)
    ? collectReturnExpressions(fn.body)
    : [fn.body];
  return expressions.flatMap((expression) =>
    resolveHrefTargets(expression, importedTree, nextVisited),
  );
}

/** 模板串里的占位符若指向字符串常量，就直接内联，避免把已知前缀当成资源 ID。 */
function resolveSpanLiteral(
  expression: ts.Expression,
  tree: ts.SourceFile,
  visited: Set<string>,
): string | undefined {
  if (!ts.isIdentifier(expression)) return undefined;
  const initializer = findVariableInitializer(tree, expression.text);
  if (!initializer) return undefined;
  const resolved = resolveHrefTargets(
    initializer,
    tree,
    new Set(visited).add(expression.text),
  );
  if (resolved.length !== 1 || resolved[0].includes("resource-id")) {
    return undefined;
  }
  return resolved[0];
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
      const literal = resolveSpanLiteral(span.expression, tree, visited);
      target += (literal ?? "resource-id") + span.literal.text;
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
  if (ts.isCallExpression(expression)) {
    const callee = ts.isIdentifier(expression.expression)
      ? expression.expression.text
      : undefined;
    if (callee === "safeStudentReturn") {
      return [
        safeStudentReturn(),
        safeStudentReturn("/teacher/assignments?view=STUDENTS&page=2"),
      ];
    }
    if (callee) {
      // 只接受能解析成绝对路径的结果；像 withClassroomQuery 这种对入参做 URL 运算的
      // 构造函数在这里只会得到占位串，交给下面的实参回退逻辑处理。
      const fromImportedFunction = resolveImportedReturns(
        callee,
        tree,
        visited,
      ).filter((target) => target.startsWith("/"));
      if (fromImportedFunction.length) return fromImportedFunction;
    }
    if (expression.arguments[0]) {
      return resolveHrefTargets(expression.arguments[0], tree, visited);
    }
    return [];
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
