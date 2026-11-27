import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * 公开健康检查：供负载均衡与容器编排探针使用。
 * 只暴露「进程在不在、数据库通不通」，不返回任何内部错误、连接串或版本信息。
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json(
      { status: "ok", database: "ok" },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return Response.json(
      { status: "degraded", database: "unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
