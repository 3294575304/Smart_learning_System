"use client";
import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  FileText,
  Upload,
  ChevronDown,
  AlertCircle,
  Search,
  Loader2,
} from "lucide-react";
import {
  reportTemplateFields,
  type TemplateManifest,
  type TemplateSelection,
} from "@/services/quality-reports/template-schema";
import {
  suggestTemplateMappings,
  getTemplateSelection,
} from "@/services/quality-reports/template-matching";

type Template = TemplateManifest & { id: string; name: string };
export function QualityReportTemplatePicker({
  courseId,
  disabled,
  onChange,
  onBusyChange,
}: {
  courseId: string;
  disabled: boolean;
  onChange: (value: TemplateSelection) => void;
  onBusyChange: (value: boolean) => void;
}) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selected, setSelected] = useState("");
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [onlyPending, setOnlyPending] = useState(false);
  const [query, setQuery] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/teacher/courses/${courseId}/quality-report-templates`,
        { cache: "no-store" },
      );
      const payload = await response.json();
      if (!response.ok || !payload.success)
        throw new Error(payload.error ?? "模板加载失败");
      const values = payload.data as Template[];
      setTemplates(values);
      return values;
    } finally {
      setLoading(false);
    }
  }, [courseId]);
  useEffect(() => {
    void load().catch((reason: unknown) =>
      setError(reason instanceof Error ? reason.message : "模板加载失败"),
    );
  }, [load]);
  const choose = (id: string, values = templates) => {
    const item = values.find((value) => value.id === id);
    setSelected(id);
    setQuery("");
    if (!item) {
      setMappings({});
      setExpanded(false);
      onChange({});
      return;
    }
    const proposed = suggestTemplateMappings(item),
      selection = getTemplateSelection(id, item, proposed);
    setMappings(proposed);
    setExpanded(!selection.templateMappingConfirmed);
    setOnlyPending(!selection.templateMappingConfirmed);
    onChange(selection);
  };
  async function upload(file: File) {
    if (
      !file.name.toLowerCase().endsWith(".docx") ||
      file.size > 10 * 1024 * 1024 ||
      !file.size
    ) {
      setError("请选择 10 MB 以内的 DOCX 模板。");
      return;
    }
    setBusy(true);
    onBusyChange(true);
    setError("");
    try {
      const body = new FormData();
      body.set("file", file);
      const response = await fetch(
        `/api/teacher/courses/${courseId}/quality-report-templates`,
        { method: "POST", body },
      );
      const payload = await response.json();
      if (!response.ok || !payload.success)
        throw new Error(payload.error ?? "模板上传失败");
      const values = await load();
      if (!values.some((item) => item.id === payload.data.id))
        throw new Error("模板已上传，请刷新列表后选择。");
      choose(payload.data.id, values);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "模板上传失败");
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  }
  const template = templates.find((item) => item.id === selected);
  const pending =
    template?.slots.filter(
      (slot) => slot.kind === "TOKEN" && !mappings[slot.id],
    ) ?? [];
  const ready = template
    ? Boolean(
        getTemplateSelection(selected, template, mappings)
          .templateMappingConfirmed,
      )
    : true;
  const filled = Object.values(mappings).filter(
    (value) => value && value !== "BLANK",
  ).length;
  const rows =
    template?.slots.filter(
      (slot) =>
        (!onlyPending || (slot.kind === "TOKEN" && !mappings[slot.id])) &&
        slot.label.toLowerCase().includes(query.toLowerCase()),
    ) ?? [];
  return (
    <section className="space-y-4" aria-label="报告模板设置">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-0 flex-1 space-y-2 text-sm font-medium text-slate-700">
          报告模板
          <div className="flex items-center gap-2 rounded-xl border bg-white px-3 focus-within:ring-2 focus-within:ring-sky-200">
            <FileText className="h-5 w-5 shrink-0 text-sky-600" />
            <select
              className="min-w-0 flex-1 bg-transparent py-3 outline-none"
              value={selected}
              disabled={disabled || busy || loading}
              onChange={(event) => choose(event.target.value)}
            >
              <option value="">系统默认 · 2024 版</option>
              {templates.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
        </label>
        <label
          className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium text-sky-700 ${disabled || busy ? "opacity-50" : "cursor-pointer bg-sky-50 hover:bg-sky-100"}`}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          {busy ? "识别模板中…" : "上传模板"}
          <input
            aria-label="上传新报告模板"
            type="file"
            accept=".docx"
            className="sr-only"
            disabled={disabled || busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void upload(file);
            }}
          />
        </label>
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
        >
          {error}{" "}
          <button
            type="button"
            className="ml-2 underline"
            onClick={() => {
              setError("");
              void load().catch((reason: unknown) =>
                setError(
                  reason instanceof Error ? reason.message : "模板加载失败",
                ),
              );
            }}
          >
            刷新模板列表
          </button>
        </p>
      )}
      {template ? (
        <div
          className={`rounded-xl border p-4 ${ready ? "border-emerald-100 bg-emerald-50/60" : "border-amber-200 bg-amber-50/60"}`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-2">
              {ready ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              ) : (
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              )}
              <div>
                <p className="text-sm font-medium text-slate-800">
                  {ready
                    ? `已匹配 ${filled} 个填写位置，可直接生成`
                    : pending.length
                      ? `${pending.length} 个位置需要选择填写内容`
                      : "请至少选择一项报告内容"}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {ready
                    ? "生成时会采用下方对应关系；签名、审批和日期保留空白。"
                    : "只需处理未识别的位置，已匹配内容无需重复配置。"}
                </p>
              </div>
            </div>
            <button
              type="button"
              aria-expanded={expanded}
              className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-medium text-sky-700 hover:bg-white"
              onClick={() => {
                setExpanded(!expanded);
                if (!expanded) setOnlyPending(!ready);
              }}
            >
              {expanded ? "收起设置" : "查看 / 调整"}
              <ChevronDown
                className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
              />
            </button>
          </div>
          {expanded && (
            <div className="mt-4 border-t border-slate-200/70 pt-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  aria-pressed={onlyPending}
                  onClick={() => setOnlyPending(true)}
                  className={`rounded-lg px-3 py-1.5 text-xs ${onlyPending ? "bg-sky-600 text-white" : "bg-white text-slate-600"}`}
                >
                  待处理 {pending.length}
                </button>
                <button
                  type="button"
                  aria-pressed={!onlyPending}
                  onClick={() => setOnlyPending(false)}
                  className={`rounded-lg px-3 py-1.5 text-xs ${!onlyPending ? "bg-sky-600 text-white" : "bg-white text-slate-600"}`}
                >
                  全部 {template.slots.length}
                </button>
                <label className="ml-auto flex items-center gap-2 rounded-lg border bg-white px-2">
                  <Search className="h-3.5 w-3.5 text-slate-400" />
                  <input
                    aria-label="搜索模板填写位置"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="查找填写位置"
                    className="w-32 bg-transparent py-1.5 text-xs outline-none"
                  />
                </label>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {rows.map((slot) => (
                  <label
                    key={slot.id}
                    className="min-w-0 rounded-lg border border-slate-200 bg-white p-3"
                  >
                    <span className="mb-2 block text-xs font-medium break-words text-slate-600">
                      {slot.label}
                      {slot.kind === "TOKEN" && !mappings[slot.id]
                        ? " · 待选择"
                        : ""}
                    </span>
                    <select
                      aria-label={`对应字段：${slot.label}`}
                      value={mappings[slot.id] ?? ""}
                      className="w-full min-w-0 rounded-lg border bg-white p-2 text-sm"
                      disabled={disabled || busy}
                      onChange={(event) => {
                        const next = {
                          ...mappings,
                          [slot.id]: event.target.value,
                        };
                        setMappings(next);
                        onChange(
                          getTemplateSelection(selected, template, next),
                        );
                      }}
                    >
                      <option value="">
                        {slot.kind === "CELL" ? "不填此位置" : "请选择内容"}
                      </option>
                      <option value="BLANK">保留空白</option>
                      {Object.entries(reportTemplateFields).map(
                        ([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                ))}
              </div>
              {!rows.length && (
                <p className="py-5 text-center text-sm text-slate-500">
                  {onlyPending && !pending.length
                    ? "全部必填位置已匹配，可以直接生成报告。"
                    : "没有匹配的填写位置。"}
                </p>
              )}
            </div>
          )}
        </div>
      ) : (
        <p className="flex items-center gap-2 text-xs text-slate-500">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          默认模板已配置完成，无需设置填写位置。
        </p>
      )}
      <details className="text-xs text-slate-500">
        <summary className="w-fit cursor-pointer text-sky-700">
          上传模板的格式说明
        </summary>
        <p className="mt-2 leading-6">
          支持 10 MB 以内的 DOCX。在 Word 中使用 {"{{课程名称}}"}、
          {"{{成绩分析}}"}{" "}
          等占位符，或带空白单元格的表格。系统自动匹配明确的名称，不能确定时再由你选择。
        </p>
      </details>
    </section>
  );
}
