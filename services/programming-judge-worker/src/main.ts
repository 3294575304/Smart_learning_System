import { readWorkerConfig } from "./config.js";
import { ProgrammingJudgeWorker } from "./worker.js";

const worker = new ProgrammingJudgeWorker(readWorkerConfig());
process.on("SIGTERM", () => worker.stop());
process.on("SIGINT", () => worker.stop());

worker.runForever().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      event: "programming_judge_worker_failed",
      error: error instanceof Error ? error.name : "UnknownError",
    }),
  );
  process.exitCode = 1;
});
