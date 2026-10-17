import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { QualityReportOperationError } from "./errors";
import { templateManifestSchema } from "./template-schema";

const execute = promisify(execFile);
export async function runTemplateTool(
  data: Buffer,
  payload?: unknown,
): Promise<Buffer> {
  const root = path.resolve(process.cwd(), ".data", "tmp");
  await fs.mkdir(root, { recursive: true });
  const temp = await fs.mkdtemp(path.join(root, "report-template-"));
  try {
    const input = path.join(temp, "template.docx"),
      output = path.join(temp, payload ? "report.docx" : "manifest.json"),
      params = path.join(temp, "payload.json");
    await fs.writeFile(input, data);
    if (payload) await fs.writeFile(params, JSON.stringify(payload));
    const candidates = [
      process.env.QUALITY_REPORT_PYTHON,
      path.join(
        process.env.USERPROFILE ?? "",
        ".cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe",
      ),
      "python",
    ].filter((value): value is string => Boolean(value));
    for (const python of candidates) {
      try {
        await execute(
          python,
          [
            path.join(
              process.cwd(),
              "services/quality-reports/custom-template.py",
            ),
            payload ? "render" : "inspect",
            input,
            output,
            ...(payload ? [params] : []),
          ],
          { windowsHide: true, timeout: 20_000, maxBuffer: 100_000 },
        );
        return await fs.readFile(output);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw new QualityReportOperationError(
          "模板无法解析或含不支持的内容。请使用无宏、无外部链接的 DOCX，保留 {{字段名}} 占位符或空白表格填写位置。",
          400,
          "REPORT_TEMPLATE_INVALID",
        );
      }
    }
    throw new QualityReportOperationError(
      "模板解析服务暂不可用，请联系管理员检查 Python 环境。",
      503,
    );
  } finally {
    if (path.dirname(temp) === root)
      await fs.rm(temp, { recursive: true, force: true });
  }
}
export async function inspectReportTemplate(data: Buffer) {
  return templateManifestSchema.parse(
    JSON.parse((await runTemplateTool(data)).toString("utf8")),
  );
}
