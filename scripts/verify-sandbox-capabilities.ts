import { HttpSandboxExecutor } from "../services/sandbox-executor/http-executor";
import { runSandboxSecurityCapabilityProbe } from "../services/sandbox-executor/security-probe";

async function main() {
  const report = await runSandboxSecurityCapabilityProbe(
    new HttpSandboxExecutor(),
  );
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Sandbox probe failed",
  );
  process.exitCode = 1;
});
