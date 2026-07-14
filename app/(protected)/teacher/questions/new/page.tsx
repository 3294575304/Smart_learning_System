import { Role } from "@prisma/client";
import Link from "next/link";

import { QuestionForm } from "@/components/questions/question-form";
import { requirePageRole } from "@/services/auth/page-authorization";
import { listKnowledgePointOptions } from "@/services/questions/service";

export default async function NewQuestionPage() {
  await requirePageRole(Role.TEACHER);
  const knowledgePoints = await listKnowledgePointOptions();
  return (
    <section className="space-y-6">
      <div>
        <Link
          className="text-sm text-gray-500 hover:underline"
          href="/teacher/questions"
        >
          ← 返回题库
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">创建题目</h1>
      </div>
      <QuestionForm knowledgePoints={knowledgePoints} mode="create" />
    </section>
  );
}
