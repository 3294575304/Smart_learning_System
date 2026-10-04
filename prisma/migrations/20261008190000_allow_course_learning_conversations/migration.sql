-- 保留章节及知识点历史对话，新增无需预选主题的课程问答。
ALTER TABLE "StudentLearningConversation"
  DROP CONSTRAINT "StudentLearningConversation_topicKind_check";
ALTER TABLE "StudentLearningConversation"
  ADD CONSTRAINT "StudentLearningConversation_topicKind_check"
  CHECK ("topicKind" IN ('COURSE', 'KNOWLEDGE_POINT', 'CHAPTER'));
