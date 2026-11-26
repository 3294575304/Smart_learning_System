import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * 最小 App Router 替身。客户端组件里的 useRouter 在真实应用中有 Router 上下文，
 * 但 node:test + renderToStaticMarkup 没有挂载 Next 运行时会直接抛
 * "invariant expected app router to be mounted"，这里补一个空实现即可。
 */
export const testRouter: AppRouterInstance = {
  back() {},
  forward() {},
  prefetch() {},
  push() {},
  refresh() {},
  replace() {},
};

/** 带 App Router 上下文的静态渲染入口，供包含 useRouter 的客户端组件使用。 */
export function renderWithRouter(element: React.ReactElement) {
  return renderToStaticMarkup(
    React.createElement(
      AppRouterContext.Provider,
      { value: testRouter },
      element,
    ),
  );
}
