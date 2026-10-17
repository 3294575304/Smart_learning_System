import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import type { z } from "zod";

import type { QualityReportStatistics } from "@/services/quality-reports/calculation";
import { QUALITY_REPORT_TEMPLATE_CHECKSUM } from "@/services/quality-reports/constants";
import { normalizeQualityReportNarrative } from "@/services/quality-reports/presentation";
import { runTemplateTool } from "./template-runtime";
import {
  qualityReportNarrativeSchema,
  type QualityReportSourceSnapshot,
} from "@/services/quality-reports/schemas";

const execFileAsync = promisify(execFile);

export interface QualityReportNarrative extends z.infer<
  typeof qualityReportNarrativeSchema
> {
  gradeComposition: string;
}

function pythonCandidates(): string[] {
  return [
    process.env.QUALITY_REPORT_PYTHON?.trim() ?? "",
    path.join(
      process.env.USERPROFILE ?? "",
      ".cache",
      "codex-runtimes",
      "codex-primary-runtime",
      "dependencies",
      "python",
      "python.exe",
    ),
    "python",
  ].filter(Boolean);
}

export async function buildQualityReportDocx(
  source: QualityReportSourceSnapshot,
  statistics: QualityReportStatistics,
  narrative: QualityReportNarrative,
  options: { reviewed: boolean } = { reviewed: false },
): Promise<Buffer> {
  if (source.reportTemplate) {
    const { readFrozenReportTemplate } = await import("./template-service");
    const template = await readFrozenReportTemplate(
      source.course.id,
      source.reportTemplate,
    );
    const percent = (value: number | null) =>
      value === null ? "暂无数据" : `${(value * 100).toFixed(2)}%`;
    const normalized = normalizeQualityReportNarrative(
      narrative,
      source.outcomes,
    );
    const fields = {
      ...source.course,
      courseName: source.course.name,
      classroomName: source.classroom.name,
      participantCount: statistics.participantCount,
      excludedCount: statistics.excludedCount,
      mean: statistics.mean?.toFixed(2) ?? "暂无数据",
      passRate: percent(statistics.passRate),
      excellentRate: percent(statistics.excellentRate),
      ...normalized,
      gradeComposition: narrative.gradeComposition,
      gradeDistribution: statistics.distribution
        .map(
          (item) => `${item.label}：${item.count} 人（${percent(item.ratio)}）`,
        )
        .join("\n"),
      outcomeSummary: statistics.outcomes
        .map(
          (item) =>
            `${item.code} ${item.title}：${item.attainmentIndex === null ? "暂无数据" : item.attainmentIndex.toFixed(4)}`,
        )
        .join("\n"),
      outcomeDetails: normalized.outcomeDetails
        .map((item) => `${item.code}：${item.analysis}`)
        .join("\n"),
      attendanceSummary: `签到 ${statistics.attendance.sessionCount} 次；出勤率 ${percent(statistics.attendance.presentRate)}`,
      surveySummary: !source.survey
        ? "暂无已关闭问卷"
        : source.survey.isSuppressed
          ? "样本不足，问卷细分结果受保护"
          : `参与 ${source.survey.responseCount} 人；响应率 ${percent(source.survey.responseRate)}；${source.survey.themeNarrative}`,
    };
    return runTemplateTool(template, {
      fields,
      mappings: source.reportTemplate.mappings,
    });
  }
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "quality-report-"));
  const payloadPath = path.join(temp, "payload.json");
  const outputPath = path.join(temp, "report.docx");
  const templatePath = path.join(
    process.cwd(),
    "assets",
    "report-templates",
    "quality-report-2024.docx",
  );
  const scriptPath = path.join(
    process.cwd(),
    "services",
    "quality-reports",
    "docx-generator.py",
  );
  try {
    const template = await fs.readFile(templatePath);
    const checksum = createHash("sha256").update(template).digest("hex");
    if (checksum !== QUALITY_REPORT_TEMPLATE_CHECKSUM)
      throw new Error("QUALITY_REPORT_TEMPLATE_CHECKSUM_MISMATCH");
    await fs.writeFile(
      payloadPath,
      JSON.stringify({
        source,
        statistics,
        narrative: normalizeQualityReportNarrative(narrative, source.outcomes),
        reviewed: options.reviewed,
      }),
      "utf8",
    );
    let lastError: unknown = null;
    for (const python of pythonCandidates()) {
      try {
        await execFileAsync(
          python,
          [scriptPath, payloadPath, templatePath, outputPath],
          { timeout: 60_000, windowsHide: true },
        );
        return await fs.readFile(outputPath);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
}
