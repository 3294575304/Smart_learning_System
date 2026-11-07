import "dotenv/config";

import { PrismaClient } from "@prisma/client";

import { assertSafeSeedDatabase } from "./seed-safety";
import { ensureSuperAdminAccount } from "./bootstrap-super-admin-account";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  assertSafeSeedDatabase();
  const account = await ensureSuperAdminAccount(prisma);
  if (account.created) {
    console.info(`超级管理员账号：${account.email}`);
    console.info("已使用 SEED_SUPER_ADMIN_PASSWORD 创建账号；密码不会输出到终端。");
  } else {
    console.info(`超级管理员账号 ${account.email} 已存在，密码未重置。`);
  }
}

main()
  .catch((error: unknown) => {
    console.error("Failed to bootstrap super administrator", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
