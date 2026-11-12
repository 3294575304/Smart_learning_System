"use client";

import { useEffect } from "react";

/**
 * 把列表筛选条件镜像到地址栏。
 *
 * 用 `history.replaceState` 而不是 `router.replace`：
 * - 不新增历史记录，浏览器「后退」仍然是退出本页，不会被几十次输入污染；
 * - 不触发 App Router 重新请求服务端组件，所以输入筛选条件仍是纯本地过滤，
 *   结果实时更新、不被网络往返拖慢。
 *
 * 刷新或复制链接时，由页面（服务端）从 searchParams 读回同样的值并作为
 * 初始筛选条件传入，于是刷新与分享都能还原同一份筛选结果。
 */
export function useListFilterUrlSync(params: Record<string, string>) {
  // 用序列化字符串做依赖，避免调用方每次渲染都传新对象导致 effect 反复执行
  const serialized = JSON.stringify(params);

  useEffect(() => {
    const nextParams = JSON.parse(serialized) as Record<string, string>;
    const url = new URL(window.location.href);
    for (const [key, value] of Object.entries(nextParams)) {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }

    const next = `${url.pathname}${url.search}${url.hash}`;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (next === current) return;

    window.history.replaceState(null, "", next);
  }, [serialized]);
}
