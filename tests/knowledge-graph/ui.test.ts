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
  assert.match(source, /linkCurvature=\{0\}/u, "所有关系保持直线");
  assert.match(source, /aria-pressed=\{breathing\}/u);
  assert.match(source, /aria-pressed=\{autoRotate\}/u);
  assert.match(source, /呼吸与自动旋转可独立开启/u);
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
  assert.match(view, /练习此知识点/u);
  assert.doesNotMatch(view, /尚未将此知识点纳入已授进度/u);
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
  assert.match(
    center,
    /conceptIds: focusedConceptId \? \[focusedConceptId\] : \[\]/u,
  );
  assert.match(center, /自主练习不受教师教学进度限制/u);
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

test("三维图谱以浅色舞台呈现，并默认开启呼吸与自动旋转", async () => {
  const [canvas, visual, page] = await Promise.all([
    readFile(
      new URL(
        "../../components/courses/knowledge-graph-canvas.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../components/courses/knowledge-graph-node-visual.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../app/(protected)/teacher/courses/[courseId]/knowledge-graph/page.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);
  // 模式命名与图标：三维视图不再叫“伸缩球”。
  assert.match(canvas, /\["SPHERE", "3D 图谱"\]/u);
  assert.match(canvas, /SphereGraphIcon/u);
  assert.doesNotMatch(canvas, /伸缩球/u);
  // 默认状态：进入即呼吸并自转，用户仍可单独关闭。
  assert.match(canvas, /const \[breathing, setBreathing\] = useState\(true\)/u);
  assert.match(
    canvas,
    /const \[autoRotate, setAutoRotate\] = useState\(true\)/u,
  );
  // 舞台与荧光配色必须回到浅色工作区，标签改为深字浅底。
  assert.match(canvas, /border-sky-100 bg-white/u);
  assert.match(visual, /rgba\(255, 255, 255, 0\.94\)/u);
  assert.doesNotMatch(visual, /rgba\(8, 15, 30/u);
  // 页面主标题固定为“课程知识图谱”，不再绑定具体课程名。
  assert.match(page, /title="课程知识图谱"/u);
});
