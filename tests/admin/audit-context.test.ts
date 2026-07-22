import assert from "node:assert/strict";
import test from "node:test";

import { auditRequestContext } from "@/services/audit/request-context";

test("审计请求上下文只保留首个代理地址并清理控制字符", () => {
  const values = new Map([
    ["x-forwarded-for", "203.0.113.5, 10.0.0.1"],
    ["user-agent", "Browser\nInjected"],
    ["cookie", "session=secret"],
  ]);
  const request = {
    headers: { get: (name: string) => values.get(name) ?? null },
  } as unknown as Request;
  const context = auditRequestContext(request);
  assert.equal(context.ipAddress, "203.0.113.5");
  assert.equal(context.userAgent, "Browser Injected");
  assert.equal(JSON.stringify(context).includes("secret"), false);
});
