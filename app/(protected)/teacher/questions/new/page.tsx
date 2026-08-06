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
      <p className="rounded-lg border p-4 text-sm text-gray-600">
        创建题目后，可在编辑页将它绑定到任一由你管理且已发布正式知识图谱的课程。
      </p>
    </section>
  );
}
