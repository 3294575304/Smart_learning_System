"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { QualityReportTemplatePicker } from "./quality-report-template-picker";
import { ReviewEditor, type ReportItem } from "./quality-report-workspace";
import type { TemplateSelection } from "@/services/quality-reports/template-schema";

type Preview = { headers: string[]; rowCount: number; sheetName: string };
type Component = { code: string; name: string; column: string; weight: number };
type Outcome = {
  code: string;
  title: string;
  threshold: number;
  allocations: Record<string, number>;
};
type Report = ReportItem & { courseName: string };
type SourceRef = { page: number; quote?: string; verified?: boolean };
type SyllabusResult = {
  fileVersionId: string;
  checksumSha256: string;
  fileName: string;
  courseInfo: {
    courseName: string | null;
    courseCode: string | null;
    credits: number | null;
    courseNature?: string | null;
    applicableMajors?: string | null;
    teachingCollege?: string | null;
    offeredTerm?: string | null;
    sourceRefs: SourceRef[];
  };
  assessments: Array<{
    code: string;
    name: string;
    weight: number | null;
    description: string | null;
    sourceRefs: SourceRef[];
  }>;
  objectives: Array<{
    code: string;
    title: string;
    description: string;
    sourceRefs: SourceRef[];
  }>;
  objectiveAssessmentMappings: Array<{
    objectiveCode: string;
    assessmentCode: string;
    allocationRate: number | null;
  }>;
  teachingContent: string[];
  warnings: string[];
};
type SyllabusJob = {
  jobId: string;
  status: string;
  progress: number;
  errorCode: string | null;
  result: SyllabusResult | null;
};
type CalculationPreview = {
  courseName: string;
  templateName: string;
  participantCount: number;
  excludedCount: number;
  mean: number | null;
  distribution: Array<{ label: string; count: number }>;
  components: Array<{ name: string; mean: number | null; weight: number }>;
  outcomes: Array<{
    code: string;
    title: string;
    attainmentIndex: number | null;
    threshold: number;
    participantCount: number;
  }>;
  survey: {
    responseCount: number;
    eligibleCount: number;
    responseRate: number;
    isSuppressed: boolean;
    overallMean: number | null;
    outcomeCount: number;
    dimensionCount: number;
  } | null;
};
type Envelope<T> = { success: boolean; data?: T; error?: string };
const base = "/api/teacher/quality-reports/standalone";
const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
const buttonClass =
  "rounded-lg border border-sky-300 px-3 py-2 text-sm font-medium text-sky-800 hover:bg-sky-50 disabled:opacity-50";

function ColumnSelect({
  headers,
  value,
  onChange,
  optional = false,
}: {
  headers: string[];
  value: string;
  onChange: (value: string) => void;
  optional?: boolean;
}) {
  return (
    <select
      className={inputClass}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      required={!optional}
    >
      <option value="">{optional ? "不使用" : "选择列"}</option>
      {headers.map((header, index) => (
        <option key={`${index}-${header}`} value={header}>
          {header || `第 ${index + 1} 列`}
        </option>
      ))}
    </select>
  );
}

export function StandaloneQualityReportWorkspace() {
  const formRef = useRef<HTMLFormElement>(null);
  const [syllabusFile, setSyllabusFile] = useState<File | null>(null);
  const [syllabusJob, setSyllabusJob] = useState<SyllabusJob | null>(null);
  const [syllabusBusy, setSyllabusBusy] = useState(false);
  const [syllabusApplied, setSyllabusApplied] = useState(false);
  const [syllabusError, setSyllabusError] = useState("");
  const [template, setTemplate] = useState<TemplateSelection>({});
  const [templateBusy, setTemplateBusy] = useState(false);
  const [gradeFile, setGradeFile] = useState<File | null>(null);
  const [surveyFile, setSurveyFile] = useState<File | null>(null);
  const [gradePreview, setGradePreview] = useState<Preview | null>(null);
  const [surveyPreview, setSurveyPreview] = useState<Preview | null>(null);
  const [idColumn, setIdColumn] = useState("");
  const [nameColumn, setNameColumn] = useState("");
  const [statusColumn, setStatusColumn] = useState("");
  const [components, setComponents] = useState<Component[]>([]);
  const [outcomes, setOutcomes] = useState<Outcome[]>([
    { code: "1", title: "课程目标 1", threshold: 60, allocations: {} },
  ]);
  const [surveyColumns, setSurveyColumns] = useState({
    kind: "",
    code: "",
    title: "",
    count: "",
    mean: "",
  });
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [calculationPreview, setCalculationPreview] =
    useState<CalculationPreview | null>(null);
  const [previewKey, setPreviewKey] = useState("");
  const loadReports = useCallback(async () => {
    const response = await fetch(base, { cache: "no-store" });
    const payload = (await response.json()) as Envelope<Report[]>;
    if (!response.ok || !payload.success)
      throw new Error(payload.error ?? "报告列表加载失败");
    setReports(payload.data ?? []);
  }, []);
  useEffect(() => {
    void loadReports()
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "报告列表加载失败"),
      )
      .finally(() => setLoading(false));
  }, [loadReports]);
  useEffect(() => {
    if (
      !reports.some(
        (item) => item.status === "QUEUED" || item.status === "PROCESSING",
      )
    )
      return;
    const timer = window.setInterval(
      () =>
        void loadReports().catch((reason: unknown) =>
          setError(reason instanceof Error ? reason.message : "进度刷新失败"),
        ),
      2500,
    );
    return () => window.clearInterval(timer);
  }, [loadReports, reports]);
  useEffect(() => {
    if (!syllabusJob || !["PENDING", "RUNNING"].includes(syllabusJob.status))
      return;
    const timer = window.setInterval(() => {
      void fetch(`${base}/syllabus/${syllabusJob.jobId}`, { cache: "no-store" })
        .then(async (response) => {
          const payload = (await response.json()) as Envelope<SyllabusJob>;
          if (!response.ok || !payload.success || !payload.data)
            throw new Error(payload.error ?? "大纲解析进度获取失败");
          setSyllabusJob(payload.data);
          if (payload.data.status === "FAILED")
            setSyllabusError("教学大纲解析失败，请重新上传或手动填写。");
        })
        .catch((reason: unknown) =>
          setSyllabusError(
            reason instanceof Error ? reason.message : "大纲解析进度获取失败",
          ),
        );
    }, 2500);
    return () => window.clearInterval(timer);
  }, [syllabusJob]);
  async function parseSyllabus() {
    if (!syllabusFile) return;
    setSyllabusBusy(true);
    setSyllabusError("");
    setSyllabusApplied(false);
    try {
      const values = new FormData(formRef.current ?? undefined);
      const body = new FormData();
      body.set("file", syllabusFile);
      for (const key of ["courseName", "courseNo", "term"])
        body.set(key, String(values.get(key) ?? ""));
      const response = await fetch(`${base}/syllabus`, {
        method: "POST",
        body,
      });
      const payload = (await response.json()) as Envelope<{
        jobId: string;
        status: string;
      }>;
      if (!response.ok || !payload.success || !payload.data)
        throw new Error(payload.error ?? "教学大纲上传失败");
      const jobResponse = await fetch(
        `${base}/syllabus/${payload.data.jobId}`,
        { cache: "no-store" },
      );
      const jobPayload = (await jobResponse.json()) as Envelope<SyllabusJob>;
      if (!jobResponse.ok || !jobPayload.success || !jobPayload.data)
        throw new Error(jobPayload.error ?? "大纲解析状态获取失败");
      setSyllabusJob(jobPayload.data);
    } catch (reason) {
      setSyllabusError(
        reason instanceof Error ? reason.message : "教学大纲上传失败",
      );
    } finally {
      setSyllabusBusy(false);
    }
  }
  function applySyllabus(result: SyllabusResult) {
    const elements = formRef.current?.elements;
    const fill = (name: string, value: string | number | null | undefined) => {
      const field = elements?.namedItem(name);
      if (
        field instanceof HTMLInputElement ||
        field instanceof HTMLTextAreaElement
      )
        if (value !== null && value !== undefined) field.value = String(value);
    };
    fill("courseName", result.courseInfo.courseName);
    fill("courseNo", result.courseInfo.courseCode);
    fill("term", result.courseInfo.offeredTerm);
    fill("credits", result.courseInfo.credits);
    fill("courseNature", result.courseInfo.courseNature);
    fill("college", result.courseInfo.teachingCollege);
    fill("major", result.courseInfo.applicableMajors);
    fill("teachingContent", result.teachingContent.join("\n"));
    fill(
      "scoringCriteria",
      result.assessments
        .filter((item) => item.description)
        .map((item) => `${item.name}：${item.description}`)
        .join("\n")
        .slice(0, 2000),
    );
    const selected = result.assessments.slice(0, 30);
    if (selected.length)
      setComponents(
        selected.map((item) => ({
          code: item.code,
          name: item.name,
          weight: item.weight ?? 0,
          column:
            gradePreview?.headers.find(
              (header) => header === item.name || header.includes(item.name),
            ) ?? "",
        })),
      );
    if (result.objectives.length)
      setOutcomes(
        result.objectives.slice(0, 30).map((item) => ({
          code: item.code,
          title: item.title,
          threshold: 60,
          allocations: Object.fromEntries(
            result.objectiveAssessmentMappings
              .filter(
                (mapping) =>
                  mapping.objectiveCode === item.code &&
                  mapping.allocationRate !== null,
              )
              .map((mapping) => [
                mapping.assessmentCode,
                mapping.allocationRate ?? 0,
              ]),
          ),
        })),
      );
    setSyllabusApplied(true);
    setCalculationPreview(null);
    setPreviewKey("");
    setSuccess("大纲建议已填入，请核对并补全成绩列、权重和目标分配。");
  }
  async function preview(file: File, type: "grade" | "survey") {
    setError("");
    const body = new FormData();
    body.set("file", file);
    const response = await fetch(`${base}/preview`, { method: "POST", body });
    const payload = (await response.json()) as Envelope<Preview>;
    if (!response.ok || !payload.success || !payload.data)
      throw new Error(payload.error ?? "文件预览失败");
    if (type === "grade") {
      setGradeFile(file);
      setGradePreview(payload.data);
      setIdColumn(
        payload.data.headers.find((item) => /学号|编号/u.test(item)) ?? "",
      );
      setNameColumn(
        payload.data.headers.find((item) => /姓名/u.test(item)) ?? "",
      );
      setStatusColumn(
        payload.data.headers.find((item) => /状态|标识/u.test(item)) ?? "",
      );
      const first = payload.data.headers.find(
        (item) =>
          /成绩|分数|考试|作业|实验/u.test(item) && !/总评|最终/u.test(item),
      );
      setComponents((current) =>
        current.length && syllabusApplied
          ? current.map((item) => ({
              ...item,
              column:
                payload.data!.headers.find(
                  (header) =>
                    header === item.name || header.includes(item.name),
                ) ?? item.column,
            }))
          : first
            ? [{ code: "C1", name: first, column: first, weight: 100 }]
            : [],
      );
    } else {
      setSurveyFile(file);
      setSurveyPreview(payload.data);
      const pick = (pattern: RegExp) =>
        payload.data!.headers.find((item) => pattern.test(item)) ?? "";
      setSurveyColumns({
        kind: pick(/类型|类别/u),
        code: pick(/编码|代码/u),
        title: pick(/名称|指标|题目/u),
        count: pick(/人数|样本|数量/u),
        mean: pick(/均值|平均/u),
      });
    }
  }
  function changeComponent(index: number, patch: Partial<Component>) {
    setComponents((current) =>
      current.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  }
  function changeOutcome(index: number, patch: Partial<Outcome>) {
    setOutcomes((current) =>
      current.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  }
  async function submit(form: HTMLFormElement) {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      if (!gradeFile || !surveyFile || !gradePreview || !surveyPreview)
        throw new Error("请先上传并预览成绩和问卷文件。");
      if (!template.templateFileVersionId || !template.templateMappingConfirmed)
        throw new Error("请先上传模板并确认字段对应关系。");
      if (!components.length || !outcomes.length)
        throw new Error("请确认成绩项目和课程目标。");
      const values = new FormData(form);
      const input = {
        courseName: values.get("courseName"),
        courseNo: values.get("courseNo"),
        term: values.get("term"),
        teacherName: values.get("teacherName"),
        classroomName: values.get("classroomName"),
        courseNature: values.get("courseNature"),
        credits: Number(values.get("credits")),
        college: values.get("college"),
        major: values.get("major"),
        teachingMethodDetails: values.get("teachingMethodDetails"),
        scoringCriteria: values.get("scoringCriteria"),
        teachingContent: values.get("teachingContent"),
        syllabusReference:
          syllabusApplied && syllabusJob?.result
            ? {
                jobId: syllabusJob.jobId,
                fileVersionId: syllabusJob.result.fileVersionId,
                checksumSha256: syllabusJob.result.checksumSha256,
              }
            : undefined,
        grade: {
          studentNoColumn: idColumn || undefined,
          nameColumn: nameColumn || undefined,
          statusColumn: statusColumn || undefined,
          components: components.map((item) => ({
            ...item,
            weight: item.weight / 100,
          })),
        },
        outcomes: outcomes.map((item) => ({
          code: item.code,
          title: item.title,
          threshold: item.threshold / 100,
          allocations: components
            .filter(
              (part) =>
                Number(
                  item.allocations[part.code] ??
                    (outcomes.length === 1 ? 100 : 0),
                ) > 0,
            )
            .map((part) => ({
              componentCode: part.code,
              rate:
                Number(
                  item.allocations[part.code] ??
                    (outcomes.length === 1 ? 100 : 0),
                ) / 100,
            })),
        })),
        survey: {
          responseCount: Number(values.get("responseCount")),
          eligibleCount: Number(values.get("eligibleCount")),
          kindColumn: surveyColumns.kind,
          codeColumn: surveyColumns.code || undefined,
          titleColumn: surveyColumns.title,
          countColumn: surveyColumns.count,
          meanColumn: surveyColumns.mean,
        },
        ...template,
      };
      const body = new FormData();
      body.set("input", JSON.stringify(input));
      body.set("grade", gradeFile);
      body.set("survey", surveyFile);
      const key = `${JSON.stringify(input)}:${gradeFile.name}:${gradeFile.size}:${gradeFile.lastModified}:${surveyFile.name}:${surveyFile.size}:${surveyFile.lastModified}`;
      if (previewKey !== key) {
        const response = await fetch(`${base}/preview`, {
          method: "POST",
          body,
        });
        const payload = (await response.json()) as Envelope<CalculationPreview>;
        if (!response.ok || !payload.success || !payload.data)
          throw new Error(payload.error ?? "报告数据预览失败");
        setCalculationPreview(payload.data);
        setPreviewKey(key);
        setSuccess("请核对计算预览；确认无误后再次点击生成。");
        return;
      }
      const response = await fetch(base, { method: "POST", body });
      const payload = (await response.json()) as Envelope<unknown>;
      if (!response.ok || !payload.success)
        throw new Error(payload.error ?? "报告生成请求失败");
      setSuccess("报告生成任务已提交。完成后请审核分析内容，再下载正式 DOCX。");
      setPreviewKey("");
      await loadReports();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "报告生成请求失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-6">
      <form
        ref={formRef}
        className="space-y-6 rounded-xl border bg-white p-5"
        onSubmit={(event) => {
          event.preventDefault();
          void submit(event.currentTarget);
        }}
      >
        <div>
          <h2 className="text-lg font-semibold">新建独立报告</h2>
          <p className="text-sm text-slate-600">
            当前支持 Python
            程序设计课程。上传文件后确认字段、权重和目标分配；数据只用于本次报告，不写入平台成绩或问卷。
          </p>
        </div>
        <QualityReportTemplatePicker
          disabled={busy}
          onChange={setTemplate}
          onBusyChange={setTemplateBusy}
        />
        <section className="space-y-3 border-t pt-5">
          <h3 className="font-semibold">教学大纲（可选）</h3>
          <p className="text-sm text-slate-600">
            上传文本型 PDF 或 DOCX，由 AI
            提取课程信息、考核方式和课程目标。解析建议须由教师核对后应用；也可直接在下方自行填写。
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              aria-label="上传教学大纲"
              type="file"
              accept=".pdf,.docx"
              className={`${inputClass} max-w-lg`}
              onChange={(event) => {
                setSyllabusFile(event.target.files?.[0] ?? null);
                setSyllabusJob(null);
                setSyllabusApplied(false);
                setSyllabusError("");
              }}
            />
            <button
              type="button"
              className={buttonClass}
              disabled={!syllabusFile || syllabusBusy}
              onClick={() => void parseSyllabus()}
            >
              {syllabusBusy ? "正在上传…" : "AI 解析教学大纲"}
            </button>
          </div>
          {syllabusJob &&
            ["PENDING", "RUNNING"].includes(syllabusJob.status) && (
              <p role="status" className="text-sm">
                大纲解析中，进度 {syllabusJob.progress}%。可继续填写其他信息。
              </p>
            )}
          {syllabusError && (
            <p role="alert" className="text-sm text-red-700">
              {syllabusError}
            </p>
          )}
          {syllabusJob?.status === "SUCCEEDED" && syllabusJob.result && (
            <div className="space-y-2 rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm">
              <p className="font-medium">
                解析建议 · {syllabusJob.result.fileName}
              </p>
              <p>
                课程：{syllabusJob.result.courseInfo.courseName ?? "未识别"}
                ；课程号：{syllabusJob.result.courseInfo.courseCode ?? "未识别"}
                ；学分：{syllabusJob.result.courseInfo.credits ?? "未识别"}。
              </p>
              <ul className="list-inside list-disc">
                <li>
                  基本信息来源：
                  {syllabusJob.result.courseInfo.sourceRefs
                    .map(
                      (ref) =>
                        `第 ${ref.page} 页${ref.quote ? `「${ref.quote}」` : ""}`,
                    )
                    .join("；") || "待核对"}
                </li>
              </ul>
              <div>
                <p className="font-medium">考核方式</p>
                <ul className="list-inside list-disc">
                  {syllabusJob.result.assessments.map((item) => (
                    <li key={item.code}>
                      {item.name} ·{" "}
                      {item.weight === null ? "权重待核对" : `${item.weight}%`}
                      ；来源：
                      {item.sourceRefs
                        .map(
                          (ref) =>
                            `第 ${ref.page} 页${ref.quote ? `「${ref.quote}」` : ""}`,
                        )
                        .join("；") || "待核对"}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="font-medium">课程目标</p>
                <ul className="list-inside list-disc">
                  {syllabusJob.result.objectives.map((item) => (
                    <li key={item.code}>
                      {item.code} {item.title}；来源：
                      {item.sourceRefs
                        .map(
                          (ref) =>
                            `第 ${ref.page} 页${ref.quote ? `「${ref.quote}」` : ""}`,
                        )
                        .join("；") || "待核对"}
                    </li>
                  ))}
                </ul>
              </div>
              {syllabusJob.result.warnings.length > 0 && (
                <p className="text-amber-800">
                  待核对：{syllabusJob.result.warnings.join("；")}
                </p>
              )}
              <button
                type="button"
                className={buttonClass}
                onClick={() => {
                  if (syllabusJob.result) applySyllabus(syllabusJob.result);
                }}
              >
                {syllabusApplied ? "重新应用解析建议" : "核对后应用到表单"}
              </button>
              {syllabusApplied && (
                <span className="ml-2 text-emerald-800">
                  已应用，可在下方修改
                </span>
              )}
            </div>
          )}
        </section>
        <section className="space-y-3 border-t pt-5">
          <h3 className="font-semibold">课程信息</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ["courseName", "课程名称", true],
              ["courseNo", "课程号", false],
              ["term", "学期", true],
              ["teacherName", "授课教师", true],
              ["classroomName", "班级", true],
              ["courseNature", "课程性质", false],
              ["credits", "学分", false],
              ["college", "学院", false],
              ["major", "专业", false],
            ].map(([name, label, required]) => (
              <label key={String(name)} className="space-y-1 text-sm">
                <span>{label}</span>
                <input
                  className={inputClass}
                  name={String(name)}
                  required={Boolean(required)}
                  type={name === "credits" ? "number" : "text"}
                  min={name === "credits" ? 0 : undefined}
                  max={name === "credits" ? 20 : undefined}
                  step={name === "credits" ? 0.5 : undefined}
                  defaultValue={name === "credits" ? 0 : undefined}
                />
              </label>
            ))}
          </div>
          <label className="block space-y-1 text-sm">
            教学内容与章节（每行一项）
            <textarea
              className={inputClass}
              name="teachingContent"
              maxLength={6000}
              rows={4}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              教学方式说明
              <textarea
                className={inputClass}
                name="teachingMethodDetails"
                maxLength={2000}
              />
            </label>
            <label className="space-y-1 text-sm">
              评分标准说明
              <textarea
                className={inputClass}
                name="scoringCriteria"
                maxLength={2000}
              />
            </label>
          </div>
        </section>
        <section className="space-y-4 border-t pt-5">
          <h3 className="font-semibold">成绩文件与分项映射</h3>
          <input
            aria-label="上传成绩文件"
            type="file"
            accept=".xls,.xlsx,.csv"
            required
            className={inputClass}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file)
                void preview(file, "grade").catch((reason: unknown) =>
                  setError(
                    reason instanceof Error ? reason.message : "成绩预览失败",
                  ),
                );
            }}
          />
          {gradePreview && (
            <>
              <p className="text-sm text-slate-600">
                {gradePreview.sheetName} · {gradePreview.rowCount}{" "}
                行。选择需要的列并填写权重，合计为 100%。
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  ["学生标识", idColumn, setIdColumn],
                  ["姓名", nameColumn, setNameColumn],
                  ["特殊状态", statusColumn, setStatusColumn],
                ].map(([label, value, setter]) => (
                  <label key={String(label)} className="space-y-1 text-sm">
                    {String(label)}
                    <ColumnSelect
                      headers={gradePreview.headers}
                      value={value as string}
                      onChange={setter as (value: string) => void}
                      optional
                    />
                  </label>
                ))}
              </div>
              {components.map((item, index) => (
                <div
                  key={index}
                  className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_1fr_auto]"
                >
                  <label className="text-sm">
                    项目名称
                    <input
                      className={inputClass}
                      value={item.name}
                      onChange={(event) =>
                        changeComponent(index, { name: event.target.value })
                      }
                      required
                    />
                  </label>
                  <label className="text-sm">
                    成绩列
                    <ColumnSelect
                      headers={gradePreview.headers}
                      value={item.column}
                      onChange={(value) =>
                        changeComponent(index, { column: value })
                      }
                    />
                  </label>
                  <label className="text-sm">
                    权重 %
                    <input
                      className={inputClass}
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={item.weight}
                      onChange={(event) =>
                        changeComponent(index, {
                          weight: Number(event.target.value),
                        })
                      }
                      required
                    />
                  </label>
                  <button
                    className={buttonClass}
                    type="button"
                    onClick={() =>
                      setComponents((current) =>
                        current.filter((_, i) => i !== index),
                      )
                    }
                  >
                    移除
                  </button>
                </div>
              ))}
              <button
                className={buttonClass}
                type="button"
                onClick={() =>
                  setComponents((current) => [
                    ...current,
                    { code: `C${Date.now()}`, name: "", column: "", weight: 0 },
                  ])
                }
              >
                添加成绩项目
              </button>
              <p className="text-sm">
                当前权重合计：
                {components
                  .reduce((sum, item) => sum + item.weight, 0)
                  .toFixed(2)}
                %
              </p>
            </>
          )}
        </section>
        <section className="space-y-4 border-t pt-5">
          <h3 className="font-semibold">课程目标与成绩分配</h3>
          <p className="text-sm text-slate-600">
            每项成绩在所有课程目标间的分配比例须合计 100%。
          </p>
          {outcomes.map((item, index) => (
            <div key={index} className="space-y-3 rounded-lg border p-3">
              <div className="grid gap-2 sm:grid-cols-[8rem_1fr_8rem_auto]">
                <label className="text-sm">
                  目标编码
                  <input
                    className={inputClass}
                    value={item.code}
                    onChange={(event) =>
                      changeOutcome(index, { code: event.target.value })
                    }
                    required
                  />
                </label>
                <label className="text-sm">
                  目标名称
                  <input
                    className={inputClass}
                    value={item.title}
                    onChange={(event) =>
                      changeOutcome(index, { title: event.target.value })
                    }
                    required
                  />
                </label>
                <label className="text-sm">
                  达成阈值 %
                  <input
                    className={inputClass}
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={item.threshold}
                    onChange={(event) =>
                      changeOutcome(index, {
                        threshold: Number(event.target.value),
                      })
                    }
                    required
                  />
                </label>
                <button
                  className={buttonClass}
                  type="button"
                  onClick={() =>
                    setOutcomes((current) =>
                      current.filter((_, i) => i !== index),
                    )
                  }
                >
                  移除目标
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                {components.map((part) => (
                  <label key={part.code} className="text-sm">
                    {part.name || part.code} 分配 %
                    <input
                      className={inputClass}
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={
                        item.allocations[part.code] ??
                        (outcomes.length === 1 ? 100 : 0)
                      }
                      onChange={(event) =>
                        changeOutcome(index, {
                          allocations: {
                            ...item.allocations,
                            [part.code]: Number(event.target.value),
                          },
                        })
                      }
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}
          <button
            className={buttonClass}
            type="button"
            onClick={() =>
              setOutcomes((current) => [
                ...current.map((item) => ({
                  ...item,
                  allocations: Object.fromEntries(
                    components.map((part) => [
                      part.code,
                      item.allocations[part.code] ??
                        (current.length === 1 ? 100 : 0),
                    ]),
                  ),
                })),
                {
                  code: String(current.length + 1),
                  title: `课程目标 ${current.length + 1}`,
                  threshold: 60,
                  allocations: {},
                },
              ])
            }
          >
            添加课程目标
          </button>
        </section>
        <section className="space-y-4 border-t pt-5">
          <h3 className="font-semibold">问卷汇总文件与字段映射</h3>
          <p className="text-sm text-slate-600">
            文件每行一个汇总指标；类型使用“总体、目标、维度、主题”，均值为
            1–5。目标编码须与上方课程目标一致。请勿上传逐份答卷。
          </p>
          <input
            aria-label="上传问卷汇总文件"
            type="file"
            accept=".xlsx,.csv"
            required
            className={inputClass}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file)
                void preview(file, "survey").catch((reason: unknown) =>
                  setError(
                    reason instanceof Error ? reason.message : "问卷预览失败",
                  ),
                );
            }}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              有效回答数
              <input
                className={inputClass}
                name="responseCount"
                type="number"
                min="0"
                required
              />
            </label>
            <label className="text-sm">
              应答人数
              <input
                className={inputClass}
                name="eligibleCount"
                type="number"
                min="1"
                required
              />
            </label>
          </div>
          {surveyPreview && (
            <>
              <p className="text-sm text-slate-600">
                {surveyPreview.sheetName} · {surveyPreview.rowCount} 行
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                {(
                  [
                    ["kind", "指标类型"],
                    ["code", "指标编码（选填）"],
                    ["title", "指标名称"],
                    ["count", "样本数"],
                    ["mean", "量表均值"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="space-y-1 text-sm">
                    {label}
                    <ColumnSelect
                      headers={surveyPreview.headers}
                      value={surveyColumns[key]}
                      onChange={(value) =>
                        setSurveyColumns((current) => ({
                          ...current,
                          [key]: value,
                        }))
                      }
                      optional={key === "code"}
                    />
                  </label>
                ))}
              </div>
            </>
          )}
        </section>
        {calculationPreview && (
          <section
            className="space-y-2 rounded-lg border border-sky-200 bg-sky-50 p-4"
            aria-label="报告数据计算预览"
          >
            <h3 className="font-semibold">
              提交前核对 · {calculationPreview.courseName}
            </h3>
            <p className="text-sm">
              模板：{calculationPreview.templateName}；有效成绩{" "}
              {calculationPreview.participantCount} 人，特殊状态或未录入{" "}
              {calculationPreview.excludedCount} 人；均分{" "}
              {calculationPreview.mean?.toFixed(2) ?? "暂无"}。
            </p>
            <p className="text-sm">
              成绩分布：
              {calculationPreview.distribution
                .map((item) => `${item.label} ${item.count} 人`)
                .join("；")}
            </p>
            <p className="text-sm">
              分项：
              {calculationPreview.components
                .map(
                  (item) =>
                    `${item.name}（${(item.weight * 100).toFixed(1)}%）均分 ${item.mean?.toFixed(2) ?? "暂无"}`,
                )
                .join("；")}
            </p>
            <ul className="list-inside list-disc text-sm">
              {calculationPreview.outcomes.map((item) => (
                <li key={item.code}>
                  {item.title}：达成度{" "}
                  {item.attainmentIndex === null
                    ? "暂无"
                    : `${(item.attainmentIndex * 100).toFixed(2)}%`}
                  ，阈值 {(item.threshold * 100).toFixed(2)}%，有效{" "}
                  {item.participantCount} 人
                </li>
              ))}
            </ul>
            <p className="text-sm">
              问卷：
              {calculationPreview.survey
                ? `${calculationPreview.survey.responseCount}/${calculationPreview.survey.eligibleCount} 份，响应率 ${(calculationPreview.survey.responseRate * 100).toFixed(1)}%；${calculationPreview.survey.isSuppressed ? "小样本，细分结果已隐藏" : `总体均值 ${calculationPreview.survey.overallMean?.toFixed(2) ?? "暂无"}，目标 ${calculationPreview.survey.outcomeCount} 项、维度 ${calculationPreview.survey.dimensionCount} 项`}`
                : "暂无"}
            </p>
          </section>
        )}
        {error && (
          <p
            role="alert"
            className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
          >
            {error}
          </p>
        )}
        {success && (
          <p
            role="status"
            className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800"
          >
            {success}
          </p>
        )}
        <button
          disabled={busy || templateBusy}
          className="rounded-lg bg-sky-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          type="submit"
        >
          {busy
            ? "正在处理…"
            : previewKey
              ? "确认预览并生成待审核稿"
              : "预览报告数据"}
        </button>
      </form>
      <section className="space-y-3 rounded-xl border bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">我的独立报告</h2>
          <button
            className={buttonClass}
            type="button"
            onClick={() =>
              void loadReports().catch((reason: unknown) =>
                setError(reason instanceof Error ? reason.message : "刷新失败"),
              )
            }
          >
            刷新
          </button>
        </div>
        {loading ? (
          <p role="status">正在加载…</p>
        ) : reports.length === 0 ? (
          <p className="text-sm text-slate-600">暂无独立报告。</p>
        ) : (
          reports.map((report) => (
            <article
              key={report.id}
              className="space-y-3 rounded-lg border p-4"
            >
              <div>
                <h3 className="font-medium">
                  {report.courseName} · v{report.versionNumber}
                </h3>
                <p className="text-sm text-slate-600">
                  {report.templateName} ·{" "}
                  {report.status === "SUCCEEDED"
                    ? report.reviewStatus === "APPROVED"
                      ? "已审核"
                      : "待审核"
                    : report.status === "FAILED"
                      ? "生成失败，可用相同文件重新提交"
                      : `生成中 ${report.backgroundJob?.progress ?? 0}%`}
                </p>
              </div>
              {report.status === "SUCCEEDED" && (
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ["draft-docx", "下载审核稿"],
                      ["xlsx", "下载成绩工作簿"],
                      ...(report.reviewStatus === "APPROVED"
                        ? [["docx", "下载正式 DOCX"]]
                        : []),
                    ] as string[][]
                  ).map(([artifact, label]) => (
                    <a
                      key={artifact}
                      className={buttonClass}
                      href={`${base}/${report.id}/download?artifact=${artifact}`}
                    >
                      {label}
                    </a>
                  ))}
                </div>
              )}
              {report.status === "SUCCEEDED" &&
                report.reviewStatus === "PENDING_REVIEW" && (
                  <ReviewEditor
                    courseId={null}
                    report={report}
                    onApproved={loadReports}
                  />
                )}
            </article>
          ))
        )}
      </section>
    </div>
  );
}
