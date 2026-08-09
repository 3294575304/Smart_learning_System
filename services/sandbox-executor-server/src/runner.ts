import { execFile, spawn } from "node:child_process";
import { chmod, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import type { ExecutorConfig } from "./config.js";
import type {
  SandboxErrorType,
  SandboxExecutionRequest,
  SandboxExecutionResult,
} from "./contract.js";

const execFileAsync = promisify(execFile);

interface DockerState {
  ExitCode?: number;
  OOMKilled?: boolean;
}

interface RuntimeMetrics {
  cpuTimeMs: number | null;
  peakMemoryBytes: number | null;
  processCount: number | null;
  lastSampleAt: number;
}

interface StreamOutcome {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  outputBytes: number;
  timedOut: boolean;
  outputLimited: boolean;
  metrics: RuntimeMetrics;
}

export function parseDockerBytes(value: string) {
  const match = /^([0-9]+(?:\.[0-9]+)?)(B|KiB|MiB|GiB)$/u.exec(value.trim());
  if (!match) return null;
  const amount = Number(match[1]);
  const factors: Record<string, number> = {
    B: 1,
    KiB: 1024,
    MiB: 1024 ** 2,
    GiB: 1024 ** 3,
  };
  const factor = factors[match[2] ?? ""];
  return factor === undefined ? null : Math.round(amount * factor);
}

export function classifySandboxOutcome(input: {
  cancelled: boolean;
  timedOut: boolean;
  outputLimited: boolean;
  oomKilled: boolean;
  exitCode: number | null;
  stderr: string;
  peakProcessCount: number | null;
  processLimit: number;
}): SandboxErrorType {
  if (input.cancelled) return "CANCELLED";
  if (input.outputLimited) return "OUTPUT_LIMIT";
  if (
    input.oomKilled ||
    /MemoryError|Cannot allocate memory/iu.test(input.stderr)
  )
    return "MEMORY_LIMIT";
  if (
    (input.exitCode !== 0 &&
      input.peakProcessCount !== null &&
      input.peakProcessCount >= input.processLimit + 32) ||
    /Resource temporarily unavailable|BlockingIOError/iu.test(input.stderr)
  )
    return "PROCESS_LIMIT";
  if (input.timedOut || input.exitCode === 137 || input.exitCode === 152)
    return "TIME_LIMIT";
  if (input.exitCode === 0) return "NONE";
  if (/SyntaxError|IndentationError|TabError/iu.test(input.stderr))
    return "SYNTAX_ERROR";
  return "RUNTIME_ERROR";
}

function boundedAppend(
  existing: Buffer<ArrayBufferLike>,
  incoming: Buffer<ArrayBufferLike>,
  maximum: number,
): Buffer<ArrayBufferLike> {
  if (existing.length >= maximum) return existing;
  return Buffer.concat([
    existing,
    incoming.subarray(0, maximum - existing.length),
  ]);
}

export class DockerSandboxRunner {
  private readonly containerNames = new Map<string, string>();
  private readonly cancelled = new Set<string>();

  constructor(private readonly config: ExecutorConfig) {}

  async cancel(executionId: string) {
    this.cancelled.add(executionId);
    const containerName = this.containerNames.get(executionId);
    if (!containerName) return;
    await this.ignoreDockerFailure(["kill", containerName]);
  }

  async run(
    executionId: string,
    request: SandboxExecutionRequest,
  ): Promise<SandboxExecutionResult> {
    const containerName = `zhixue-${executionId.replace(/[^a-z0-9]/giu, "")}`;
    const executionRoot = join(this.config.workRoot, executionId);
    const sourcePath = join(executionRoot, "main.py");
    const startedAt = Date.now();
    this.containerNames.set(executionId, containerName);

    try {
      await mkdir(executionRoot, { recursive: true, mode: 0o700 });
      await writeFile(sourcePath, request.sourceCode, {
        encoding: "utf8",
        mode: 0o400,
        flag: "wx",
      });
      await chmod(sourcePath, 0o444);

      const cpuSeconds = Math.max(
        1,
        Math.ceil(request.limits.cpuTimeMs / 1000),
      );
      const memory = String(request.limits.memoryBytes);
      const runtimeProcessLimit = request.limits.processCount + 32;
      await this.docker([
        "create",
        "--name",
        containerName,
        "--runtime",
        this.config.dockerRuntime,
        "--network",
        "none",
        "--read-only",
        "--cap-drop",
        "ALL",
        "--security-opt",
        "no-new-privileges:true",
        "--pids-limit",
        String(runtimeProcessLimit),
        "--ulimit",
        `nproc=${request.limits.processCount}:${request.limits.processCount}`,
        "--memory",
        memory,
        "--memory-swap",
        memory,
        "--cpus",
        "1",
        "--ulimit",
        `cpu=${cpuSeconds}:${cpuSeconds}`,
        "--tmpfs",
        "/tmp:rw,noexec,nosuid,nodev,size=16777216",
        "--mount",
        `type=bind,src=${sourcePath},dst=/workspace/main.py,readonly`,
        "--workdir",
        "/workspace",
        "--hostname",
        "sandbox",
        "--user",
        "65534:65534",
        "--env",
        "PYTHONDONTWRITEBYTECODE=1",
        "--env",
        "PYTHONUNBUFFERED=1",
        "--env",
        "PYTHONHASHSEED=0",
        "--label",
        "zhixue.sandbox=true",
        "--entrypoint",
        "python3",
        this.config.runtimeImage,
        "-I",
        "-B",
        "-S",
        "/workspace/main.py",
      ]);

      if (this.cancelled.has(executionId)) {
        return this.cancelledResult(executionId, Date.now() - startedAt);
      }

      const outcome = await this.startAndCapture(
        executionId,
        containerName,
        request,
      );
      const state = await this.inspectState(containerName);
      const errorType = classifySandboxOutcome({
        cancelled: this.cancelled.has(executionId),
        timedOut: outcome.timedOut,
        outputLimited: outcome.outputLimited,
        oomKilled: state.OOMKilled === true,
        exitCode: state.ExitCode ?? outcome.exitCode,
        stderr: outcome.stderr,
        peakProcessCount: outcome.metrics.processCount,
        processLimit: request.limits.processCount,
      });
      const status =
        errorType === "CANCELLED"
          ? "CANCELLED"
          : errorType === "NONE"
            ? "SUCCEEDED"
            : "FAILED";

      return {
        executionId,
        status,
        executorVersion: this.config.executorVersion,
        errorType,
        exitCode: state.ExitCode ?? outcome.exitCode,
        stdout: outcome.stdout,
        stderr: outcome.stderr,
        resourceUsage: {
          cpuTimeMs:
            outcome.metrics.cpuTimeMs === null
              ? null
              : Math.max(0, Math.round(outcome.metrics.cpuTimeMs)),
          wallTimeMs: Math.max(0, Date.now() - startedAt),
          peakMemoryBytes: outcome.metrics.peakMemoryBytes,
          outputBytes: outcome.outputBytes,
          processCount:
            outcome.metrics.processCount === null
              ? null
              : outcome.metrics.processCount > 32
                ? outcome.metrics.processCount - 32
                : outcome.metrics.processCount,
        },
        tests: [],
      };
    } catch {
      if (this.cancelled.has(executionId)) {
        return this.cancelledResult(executionId, Date.now() - startedAt);
      }
      return {
        executionId,
        status: "FAILED",
        executorVersion: this.config.executorVersion,
        errorType: "INTERNAL_ERROR",
        exitCode: null,
        stdout: "",
        stderr: "",
        resourceUsage: null,
        tests: [],
      };
    } finally {
      await this.ignoreDockerFailure(["rm", "--force", containerName]);
      await rm(executionRoot, { recursive: true, force: true });
      this.containerNames.delete(executionId);
      this.cancelled.delete(executionId);
    }
  }

  private cancelledResult(
    executionId: string,
    wallTimeMs: number,
  ): SandboxExecutionResult {
    return {
      executionId,
      status: "CANCELLED",
      executorVersion: this.config.executorVersion,
      errorType: "CANCELLED",
      exitCode: null,
      stdout: "",
      stderr: "",
      resourceUsage: {
        cpuTimeMs: null,
        wallTimeMs,
        peakMemoryBytes: null,
        outputBytes: 0,
        processCount: null,
      },
      tests: [],
    };
  }

  private async startAndCapture(
    executionId: string,
    containerName: string,
    request: SandboxExecutionRequest,
  ): Promise<StreamOutcome> {
    let stdout: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    let stderr: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    let outputBytes = 0;
    let timedOut = false;
    let outputLimited = false;
    let killRequested = false;
    let statsInFlight = false;
    const metrics: RuntimeMetrics = {
      cpuTimeMs: null,
      peakMemoryBytes: null,
      processCount: null,
      lastSampleAt: Date.now(),
    };

    const requestKill = () => {
      if (killRequested) return;
      killRequested = true;
      void this.ignoreDockerFailure(["kill", containerName]);
    };
    const consume = (target: "stdout" | "stderr", chunk: Buffer) => {
      const remaining = Math.max(0, request.limits.outputBytes - outputBytes);
      const accepted = chunk.subarray(0, remaining);
      outputBytes += accepted.length;
      if (target === "stdout") {
        stdout = boundedAppend(stdout, accepted, request.limits.outputBytes);
      } else {
        stderr = boundedAppend(stderr, accepted, request.limits.outputBytes);
      }
      if (chunk.length > remaining) {
        outputLimited = true;
        requestKill();
      }
    };

    const child = spawn(
      this.config.dockerBinary,
      ["start", "--attach", "--interactive", containerName],
      { stdio: ["pipe", "pipe", "pipe"], windowsHide: true },
    );
    child.stdin.end(request.stdin);
    child.stdout.on("data", (chunk: Buffer) => consume("stdout", chunk));
    child.stderr.on("data", (chunk: Buffer) => consume("stderr", chunk));

    const timeout = setTimeout(() => {
      timedOut = true;
      requestKill();
    }, request.limits.wallTimeMs);
    const stats = setInterval(() => {
      if (statsInFlight) return;
      statsInFlight = true;
      void this.sampleStats(containerName, metrics).finally(() => {
        statsInFlight = false;
      });
    }, 100);

    const exitCode = await new Promise<number | null>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code) => resolve(code));
    }).finally(() => {
      clearTimeout(timeout);
      clearInterval(stats);
    });

    if (this.cancelled.has(executionId)) requestKill();
    await this.sampleStats(containerName, metrics);
    return {
      exitCode,
      stdout: stdout.toString("utf8"),
      stderr: stderr.toString("utf8"),
      outputBytes,
      timedOut,
      outputLimited,
      metrics,
    };
  }

  private async sampleStats(containerName: string, metrics: RuntimeMetrics) {
    try {
      const { stdout } = await execFileAsync(
        this.config.dockerBinary,
        [
          "stats",
          "--no-stream",
          "--format",
          "{{.MemUsage}}|{{.PIDs}}|{{.CPUPerc}}",
          containerName,
        ],
        { maxBuffer: 64 * 1024, timeout: 1_000, windowsHide: true },
      );
      const [memory = "", pids = "0", cpu = "0"] = stdout.trim().split("|");
      const usedMemory = parseDockerBytes(memory.split("/")[0] ?? "");
      const processCount = Number.parseInt(pids.trim(), 10);
      const cpuPercent = Number.parseFloat(cpu.replace("%", "").trim());
      const sampledAt = Date.now();
      const elapsed = Math.max(0, sampledAt - metrics.lastSampleAt);
      if (Number.isFinite(cpuPercent)) {
        metrics.cpuTimeMs =
          (metrics.cpuTimeMs ?? 0) + (cpuPercent / 100) * elapsed;
      }
      metrics.lastSampleAt = sampledAt;
      if (usedMemory !== null) {
        metrics.peakMemoryBytes = Math.max(
          metrics.peakMemoryBytes ?? 0,
          usedMemory,
        );
      }
      if (Number.isFinite(processCount)) {
        metrics.processCount = Math.max(
          metrics.processCount ?? 0,
          processCount,
        );
      }
    } catch {
      // The container may have exited between the scheduler tick and this sample.
    }
  }

  private async inspectState(containerName: string): Promise<DockerState> {
    try {
      const { stdout } = await execFileAsync(
        this.config.dockerBinary,
        ["inspect", "--format", "{{json .State}}", containerName],
        { maxBuffer: 64 * 1024, timeout: 2_000, windowsHide: true },
      );
      return JSON.parse(stdout) as DockerState;
    } catch {
      return {};
    }
  }

  private async docker(args: string[]) {
    await execFileAsync(this.config.dockerBinary, args, {
      maxBuffer: 256 * 1024,
      timeout: 15_000,
      windowsHide: true,
    });
  }

  private async ignoreDockerFailure(args: string[]) {
    try {
      await this.docker(args);
    } catch {
      // Cleanup and cancellation are best effort and never expose Docker errors.
    }
  }
}
