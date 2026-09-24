import { saveGraphBindingsSchema } from "@/services/question-graph-bindings/schemas";
import type {
  GraphQuestionPoint,
  QuestionGraphBindingState,
} from "@/services/question-graph-bindings/types";

export function planKnowledgePointBindingChange(
  state: QuestionGraphBindingState,
  courseId: string,
  graphVersionId: string,
  point: GraphQuestionPoint,
  type: "PRIMARY" | "SECONDARY" | null,
) {
  if (state.currentVersionId !== graphVersionId)
    throw new Error("正式图谱已更新，请刷新题目关联后重新选择。");
  if (state.bindings.some((binding) => !binding.currentNode))
    throw new Error(
      "本题有知识点已不在当前正式图谱中，请先进入题目编辑页审核原有关联。",
    );

  const bindings = state.bindings
    .filter((binding) => binding.conceptId !== point.conceptId)
    .map((binding) => ({
      conceptId: binding.conceptId,
      publishedNodeId: binding.currentNode?.id ?? binding.sourceNodeId,
      type:
        type === "PRIMARY" && binding.type === "PRIMARY"
          ? ("SECONDARY" as const)
          : binding.type,
    }));
  if (type)
    bindings.push({
      conceptId: point.conceptId,
      publishedNodeId: point.publishedNodeId,
      type,
    });
  const result = saveGraphBindingsSchema.safeParse({
    courseId,
    graphVersionId,
    expectedRevision: state.revision,
    bindings,
  });
  if (!result.success)
    throw new Error(result.error.issues[0]?.message ?? "请检查题目关联信息。");
  return result.data;
}
