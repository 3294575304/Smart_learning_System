"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ArrowRight, RefreshCw } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";

import {
  studentImportMappingFormSchema,
  type StudentImportMappingFormData,
  type StudentImportMappingFormInput,
} from "@/services/student-imports/schemas";
import {
  studentImportFields,
  studentImportFieldLabels,
  type StudentImportField,
  type StudentImportMappingConfig,
} from "@/services/student-imports/types";

function mappingDefaults(
  config: StudentImportMappingConfig,
): StudentImportMappingFormInput {
  const defaults = Object.fromEntries(
    studentImportFields.map((field) => [field, ""]),
  ) as StudentImportMappingFormInput;

  for (const mapping of config.fieldMappings) {
    defaults[mapping.field] = String(mapping.sourceColumnIndex);
  }
  return defaults;
}

export function RosterImportMappingForm({
  config,
  isSubmitting,
  onBack,
  onSubmit,
}: {
  config: StudentImportMappingConfig;
  isSubmitting: boolean;
  onBack: () => void;
  onSubmit: (data: StudentImportMappingFormData) => Promise<void>;
}) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<
    StudentImportMappingFormInput,
    unknown,
    StudentImportMappingFormData
  >({
    resolver: zodResolver(studentImportMappingFormSchema),
    defaultValues: mappingDefaults(config),
  });

  useEffect(() => {
    reset(mappingDefaults(config));
  }, [config, reset]);

  return (
    <form className="space-y-5" noValidate onSubmit={handleSubmit(onSubmit)}>
      <div className="overflow-hidden rounded-lg border">
        <div className="hidden grid-cols-[minmax(170px,0.8fr)_minmax(240px,1.2fr)_120px] gap-4 bg-gray-50 px-4 py-3 text-xs font-medium text-gray-600 md:grid">
          <span>平台字段</span>
          <span>源文件列</span>
          <span>识别状态</span>
        </div>
        <div className="divide-y">
          {studentImportFields.map((field) => {
            const current = config.fieldMappings.find(
              (mapping) => mapping.field === field,
            );
            const required =
              current?.required ??
              [
                "academicTerm",
                "courseNo",
                "studentNo",
                "studentName",
                "className",
              ].includes(field);
            return (
              <div
                className="grid gap-2 px-4 py-3 md:grid-cols-[minmax(170px,0.8fr)_minmax(240px,1.2fr)_120px] md:items-center md:gap-4"
                key={field}
              >
                <label
                  className="text-sm font-medium"
                  htmlFor={`roster-mapping-${field}`}
                >
                  {studentImportFieldLabels[field]}
                  {required ? (
                    <span className="ml-1 text-red-600" aria-label="必填">
                      *
                    </span>
                  ) : (
                    <span className="text-muted-foreground ml-2 text-xs">
                      可选
                    </span>
                  )}
                </label>
                <div>
                  <select
                    {...register(field)}
                    aria-invalid={errors[field] ? true : undefined}
                    className="border-input focus:ring-ring w-full rounded-md border bg-white px-3 py-2 text-sm outline-none focus:ring-2"
                    id={`roster-mapping-${field}`}
                  >
                    <option value="">不导入此字段</option>
                    {config.sourceColumns.map((column) => (
                      <option
                        disabled={column.isBlank}
                        key={column.columnIndex}
                        value={column.columnIndex}
                      >
                        {column.columnName} 列 · {column.header || "空表头"}
                      </option>
                    ))}
                  </select>
                  {errors[field] ? (
                    <p className="mt-1 text-xs text-red-600">
                      {errors[field]?.message}
                    </p>
                  ) : null}
                </div>
                <div>
                  {current ? (
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs ${
                        current.autoDetected
                          ? "bg-blue-50 text-blue-700"
                          : "bg-violet-50 text-violet-700"
                      }`}
                    >
                      {current.autoDetected
                        ? `自动识别 ${Math.round(current.confidence * 100)}%`
                        : "人工调整"}
                    </span>
                  ) : (
                    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600">
                      未映射
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p className="rounded-md bg-blue-50 px-4 py-3 text-sm text-blue-800">
        学号按文本处理。请重点核对学号、课程号和学期列，确认后系统才会生成正式导入预览。
      </p>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <button
          className="inline-flex items-center justify-center gap-2 rounded-md border bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-60"
          disabled={isSubmitting}
          onClick={onBack}
          type="button"
        >
          <ArrowLeft className="h-4 w-4" />
          返回上传
        </button>
        <button
          className="inline-flex items-center justify-center gap-2 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <ArrowRight className="h-4 w-4" />
          )}
          {isSubmitting ? "正在生成预览" : "确认映射并预览"}
        </button>
      </div>
    </form>
  );
}

export function mappingSelectionForField(
  config: StudentImportMappingConfig,
  field: StudentImportField,
): number | null {
  return (
    config.fieldMappings.find((mapping) => mapping.field === field)
      ?.sourceColumnIndex ?? null
  );
}
