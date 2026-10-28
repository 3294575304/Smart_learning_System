import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PracticeCenterTabs } from "../../components/recommendations/practice-center-tabs";

for (const view of ["recommended", "generate", "assistant"] as const) {
  test(`练习页签保留各功能面板并正确展示 ${view} 初始入口`, () => {
    Object.assign(globalThis, { React });
    const markup = renderToStaticMarkup(
      React.createElement(
        AppRouterContext.Provider,
        { value: { push() {} } as unknown as AppRouterInstance },
        React.createElement(
          SearchParamsContext.Provider,
          { value: new URLSearchParams({ view, courseId: "python" }) },
          React.createElement(PracticeCenterTabs, {
            initialView: view,
            practice: React.createElement("p", null, "已加载练习"),
            generation: React.createElement("input", {
              defaultValue: "循环练习",
            }),
          }),
        ),
      ),
    );
    assert.match(
      markup,
      new RegExp(
        `role="tabpanel" id="practice-panel-${view}" aria-labelledby="practice-tab-${view}">`,
      ),
    );
    const other = view === "recommended" ? "generate" : "recommended";
    assert.match(markup, new RegExp(`id="practice-panel-${other}"[^>]*hidden`));
    assert.match(markup, /已加载练习/);
    assert.match(markup, /循环练习/);
    assert.match(markup, /role="tablist"/);
    assert.doesNotMatch(markup, /href=/);
  });
}
