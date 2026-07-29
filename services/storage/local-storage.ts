import { promises as fs } from "node:fs";
import path from "node:path";

import type { StorageService } from "@/services/storage/types";

export class LocalStorageService implements StorageService {
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  private resolveStoragePath(storageKey: string): string {
    if (path.isAbsolute(storageKey)) {
      throw new Error("Storage key must be relative.");
    }

    const resolved = path.resolve(this.root, storageKey);
    const rootWithSeparator = this.root.endsWith(path.sep)
      ? this.root
      : `${this.root}${path.sep}`;

    if (resolved !== this.root && !resolved.startsWith(rootWithSeparator)) {
      throw new Error("Storage key escapes upload root.");
    }

    return resolved;
  }

  async save(storageKey: string, data: Buffer): Promise<void> {
    const targetPath = this.resolveStoragePath(storageKey);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, data, { flag: "wx" });
  }

  async read(storageKey: string): Promise<Buffer> {
    return fs.readFile(this.resolveStoragePath(storageKey));
  }

  async delete(storageKey: string): Promise<void> {
    try {
      await fs.unlink(this.resolveStoragePath(storageKey));
    } catch (error: unknown) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return;
      }
      throw error;
    }
  }
}
