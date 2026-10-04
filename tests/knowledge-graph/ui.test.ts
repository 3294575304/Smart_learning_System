import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
test("教师图谱页面包含来源过期、进度、审核、发布、筛选与离页保护", async () => {
  const source = await readFile(
    new URL(
      "../../components/courses/knowledge-graph-workspace.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  for (const text of [
    "当前正式图谱来自旧正式大纲",
    "进度",
    "保存审核稿",
    "发布知识图谱",
    "重试 AI 增强",
    "搜索编码或名称",
    "筛选节点类型",
    "筛选关系类型",
    "节点详情与审核",
    "关系审核与编辑",
    "发布前版本差异预览",
    "beforeunload",
  ])
    assert.match(source, new RegExp(text, "u"));
});

test("教师图谱提供可平移缩放的图形视图和文字图例", async () => {
  const source = await readFile(
    new URL(
      "../../components/courses/knowledge-graph-canvas.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(source, /课程知识图谱，可拖动节点、平移并使用按钮缩放/u);
  assert.match(source, /enableNodeDrag=\{true\}/u);
  assert.match(source, /onNodeDragEnd=\{handleNodeDragEnd\}/u);
  assert.match(source, /缩小图谱/u);
  assert.match(source, /放大图谱/u);
  assert.match(source, /aria-label="复位节点布局"/u);
  assert.match(source, /onClick=\{resetNodeLayout\}/u);
  assert.match(source, /node\.x = position\.x/u);
  assert.match(source, /node\.fx = position\.x/u);
  assert.match(source, /fg\.d3ReheatSimulation\(\)/u);
  assert.match(source, /重置图谱视图/u);
  assert.match(source, /PREREQUISITE/u);
  assert.match(source, /RELATED/u);
});

test("学生只查看有成员权限课程的正式图谱并复用图谱画布", async () => {
  const [service, page, view] = await Promise.all([
    readFile(
      new URL("../../services/knowledge-graph/service.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../../app/(protected)/student/courses/[courseId]/knowledge-graph/page.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../components/courses/knowledge-graph-published-view.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);
  assert.match(service, /getStudentPublishedKnowledgeGraph/u);
  assert.match(service, /status: MembershipStatus\.ACTIVE/u);
  assert.match(service, /currentPublishedKnowledgeGraphVersion/u);
  assert.match(service, /concept: \{ select: \{ stableKey: true \} \}/u);
  assert.match(page, /requirePageRole\(Role\.STUDENT\)/u);
  assert.match(page, /getStudentPublishedKnowledgeGraph/u);
  assert.match(page, /getStudentLearnerProfile/u);
  assert.match(view, /KnowledgeGraphCanvas/u);
  assert.match(view, /KnowledgeGraphDirectory/u);
  assert.match(view, /个人掌握度图例/u);
  assert.match(view, /nodeColorByKey/u);
  assert.match(view, /练习这个知识点/u);
  assert.match(view, /尚未将此知识点纳入已授进度/u);
  assert.match(view, /conceptId=/u);
  assert.doesNotMatch(view, /KnowledgeGraphWorkspace/u);
});

test("学生从图谱进入练习时预选课程和知识点", async () => {
  const [page, center] = await Promise.all([
    readFile(
      new URL(
        "../../app/(protected)/student/recommendations/page.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../components/recommendations/course-practice-center.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);
  assert.match(page, /initialCourseId/u);
  assert.match(page, /initialConceptId/u);
  assert.match(center, /requestedCourse/u);
  assert.match(center, /\[initialConceptId\]/u);
  assert.match(center, /尚未纳入当前教学进度/u);
});

test("课程推荐列表优先显示冻结的中文 Concept 名称", async () => {
  const [repository, service] = await Promise.all([
    readFile(
      new URL("../../services/recommendations/repository.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../services/recommendations/service.ts", import.meta.url),
      "utf8",
    ),
  ]);
  assert.match(repository, /conceptSnapshots:/u);
  assert.match(repository, /resolvedNode: \{ select: \{ name: true \} \}/u);
  assert.match(service, /record\.conceptSnapshots\.length/u);
  assert.match(service, /name: snapshot\.resolvedNode\.name/u);
});

test("课程节点作为目录根项包裹章节且点击后可从筛选中定位", async () => {
  const [directory, studentView, teacherWorkspace] = await Promise.all([
    readFile(
      new URL(
        "../../components/courses/knowledge-graph-directory.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../components/courses/knowledge-graph-published-view.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../components/courses/knowledge-graph-workspace.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);
  assert.match(
    directory,
    /graph\.nodes\.find\(\(node\) => node\.type === "COURSE"\)/u,
  );
  assert.match(directory, /node\.type !== "COURSE"/u);
  assert.match(directory, /onClick=\{\(\) => onSelect\(courseNode\.key\)\}/u);
  assert.match(studentView, /setChapterKey\("ALL"\)/u);
  assert.match(studentView, /setSelectedKey\(key\)/u);
  assert.match(teacherWorkspace, /setChapterKey\("ALL"\)/u);
});

test("发布请求携带并发与大纲上下文且后端错误码可见", async () => {
  const source = await readFile(
    new URL(
      "../../components/courses/knowledge-graph-workspace.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(
    source,
    /expectedRevisionNumber: state\.review\.revisionNumber/u,
  );
  assert.match(source, /publishedSyllabusStructureId:/u);
  assert.match(source, /result\.code/u);
  assert.match(source, /await load\(true\)/u);
  assert.match(source, /setNotice\(`知识图谱第/u);
  assert.match(source, /warning && !error/u);
});

test("AI 增强后保存使用隐藏审核稿的最新修订号", async () => {
  const source = await readFile(
    new URL(
      "../../components/courses/knowledge-graph-workspace.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(source, /latestReviewRevisionNumber: number/u);
  assert.match(
    source,
    /expectedRevisionNumber: state\.latestReviewRevisionNumber/u,
  );
});
