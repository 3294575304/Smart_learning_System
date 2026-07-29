import path from "node:path";

import { LocalStorageService } from "@/services/storage/local-storage";
import type { StorageService } from "@/services/storage/types";

function uploadRoot(): string {
  const configured = process.env.LOCAL_UPLOAD_ROOT?.trim();
  return configured && configured.length > 0
    ? configured
    : path.join(process.cwd(), ".data", "uploads");
}

export function getStorageService(): StorageService {
  return new LocalStorageService(uploadRoot());
}
