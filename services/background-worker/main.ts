import "dotenv/config";

import { readLongTaskWorkerConfig } from "@/services/background-worker/config";
import { PersistentLongTaskWorker } from "@/services/background-worker/worker";

const worker = new PersistentLongTaskWorker(readLongTaskWorkerConfig());
process.once("SIGINT", () => void worker.stop());
process.once("SIGTERM", () => void worker.stop());

worker.runForever().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      event: "persistent_long_task_worker_failed",
      error: error instanceof Error ? error.name : "UnknownError",
    }),
  );
  process.exitCode = 1;
});
