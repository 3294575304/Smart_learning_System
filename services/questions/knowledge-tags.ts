export function editQuestionKnowledgeTag(
  tags: string[],
  draft: string,
  editingIndex: number | null = null,
): { tags: string[]; error?: undefined } | { error: string; tags?: undefined } {
  const tag = draft.trim();
  if (!tag) return { error: "请输入知识点名称" };
  if (tag.length > 30) return { error: "知识点名称不能超过 30 个字符" };
  if (
    tags.some((existing, index) => existing === tag && index !== editingIndex)
  )
    return { error: "该知识点已添加" };
  if (
    editingIndex !== null &&
    (editingIndex < 0 || editingIndex >= tags.length)
  )
    return { error: "请重新选择要编辑的知识点" };
  if (editingIndex === null && tags.length >= 10)
    return { error: "最多添加 10 个知识点或标签" };
  return {
    tags:
      editingIndex === null
        ? [...tags, tag]
        : tags.map((existing, index) =>
            index === editingIndex ? tag : existing,
          ),
  };
}
