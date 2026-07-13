import { PrismaClient, Role } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

interface SeedUser {
  name: string;
  email: string;
  password: string;
  role: Role;
}

const seedUsers: SeedUser[] = [
  {
    name: "系统管理员",
    email: process.env.SEED_ADMIN_EMAIL ?? "admin@example.com",
    password: process.env.SEED_ADMIN_PASSWORD ?? "Admin123!",
    role: Role.ADMIN,
  },
  {
    name: "示例教师",
    email: process.env.SEED_TEACHER_EMAIL ?? "teacher@example.com",
    password: process.env.SEED_TEACHER_PASSWORD ?? "Teacher123!",
    role: Role.TEACHER,
  },
  {
    name: "示例学生",
    email: process.env.SEED_STUDENT_EMAIL ?? "student@example.com",
    password: process.env.SEED_STUDENT_PASSWORD ?? "Student123!",
    role: Role.STUDENT,
  },
];

async function upsertUser(user: SeedUser): Promise<void> {
  const password = await hash(user.password, 12);

  await prisma.user.upsert({
    where: { email: user.email },
    update: { name: user.name, password, role: user.role },
    create: {
      name: user.name,
      email: user.email,
      password,
      role: user.role,
    },
  });
}

async function main(): Promise<void> {
  await Promise.all(seedUsers.map(upsertUser));
}

main()
  .catch((error: unknown) => {
    console.error("Failed to seed the database:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
