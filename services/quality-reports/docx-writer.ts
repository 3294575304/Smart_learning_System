import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import type { z } from "zod";

import type { QualityReportStatistics } from "@/services/quality-reports/calculation";
import { QUALITY_REPORT_TEMPLATE_CHECKSUM } from "@/services/quality-reports/constants";
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
        narrative,
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
