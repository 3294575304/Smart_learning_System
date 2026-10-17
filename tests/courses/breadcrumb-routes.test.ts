import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import test from "node:test";
import { buildBreadcrumbs } from "@/components/dashboard/breadcrumbs";

async function pageRoutes(directory: URL, prefix = ""): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const routes: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory())
      routes.push(
        ...(await pageRoutes(
          new URL(`${entry.name}/`, directory),
          `${prefix}/${entry.name}`,
        )),
      );
    else if (entry.name === "page.tsx") routes.push(prefix || "/");
  }
  return routes;
}

test("逐一核对所有受保护页面的可点击面包屑，目标必须有真实页面", async () => {
  const routes = await pageRoutes(
    new URL("../../app/(protected)/", import.meta.url),
  );
  const patterns = routes.map(
    (route) =>
      new RegExp(
        `^${route
          .split("/")
          .map((segment) =>
            segment.startsWith("[")
              ? "[^/]+"
              : segment.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"),
          )
          .join("/")}$`,
        "u",
      ),
  );
  for (const route of routes) {
    const path = route
      .split("/")
      .map((segment) => (segment.startsWith("[") ? "resource-id" : segment))
      .join("/");
    for (const crumb of buildBreadcrumbs(path).filter(
      (item) => item.linkable,
    )) {
      const target = crumb.href.split("?")[0];
      assert.ok(
        patterns.some((pattern) => pattern.test(target)),
        `${path} 的面包屑指向不存在页面 ${crumb.href}`,
      );
    }
  }
});
