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
    console.info(`初始密码：${account.password}`);
    console.info("首次登录后必须修改初始密码。");
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
