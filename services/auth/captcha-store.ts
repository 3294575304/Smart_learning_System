import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  mkdir,
  open,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

import { captchaIdSchema, type LoginCaptchaInput } from "./captcha-schema";

export const CAPTCHA_TTL_MS = 5 * 60_000;
const MAX_CHALLENGES = 2000;
const recordSchema = z.object({
  bindingHash: z.string().regex(/^[a-f0-9]{64}$/),
  answerHash: z.string().regex(/^[a-f0-9]{64}$/),
  expiresAt: z.number().int(),
});

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function missingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function alreadyClaimed(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "EEXIST";
}

export class CaptchaCapacityError extends Error {}

// Immutable challenge files plus exclusive markers keep consumption single-use
// across Node workers sharing the same private directory, including restarts.
export class CaptchaChallengeStore {
  constructor(private readonly directory: string) {}

  async issue(answer: string, binding: string, now = Date.now()) {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const files = await readdir(this.directory);
    let active = 0;
    for (const name of files) {
      if (!/^[a-f0-9]{48}\.(json|used)$/.test(name)) continue;
      const path = join(this.directory, name);
      try {
        const metadata = await stat(path);
        if (metadata.mtimeMs + CAPTCHA_TTL_MS <= now) {
          await rm(path, { force: true });
        } else {
          if (name.endsWith(".json")) active += 1;
        }
      } catch (error) {
        if (!missingFile(error)) throw error;
      }
    }
    if (active >= MAX_CHALLENGES) throw new CaptchaCapacityError();

    const id = randomBytes(24).toString("hex");
    const expiresAt = now + CAPTCHA_TTL_MS;
    await writeFile(
      join(this.directory, `${id}.json`),
      JSON.stringify({
        bindingHash: digest(binding),
        answerHash: digest(`${id}:${answer.trim().toUpperCase()}`),
        expiresAt,
      }),
      { flag: "wx", mode: 0o600 },
    );
    return { id, expiresAt };
  }

  async consume(
    input: LoginCaptchaInput,
    binding: string,
    now = Date.now(),
  ): Promise<boolean> {
    const record = await this.claim(input.captchaId, binding);
    if (!record || record.expiresAt <= now) return false;
    const actual = Buffer.from(
      digest(`${input.captchaId}:${input.captchaAnswer.trim().toUpperCase()}`),
      "hex",
    );
    return timingSafeEqual(actual, Buffer.from(record.answerHash, "hex"));
  }

  async invalidate(id: string, binding: string): Promise<void> {
    await this.claim(id, binding);
  }

  private async claim(id: string, binding: string) {
    if (!captchaIdSchema.safeParse(id).success || !binding) return null;
    const source = join(this.directory, `${id}.json`);
    const consumed = join(this.directory, `${id}.used`);
    try {
      const record = recordSchema.parse(
        JSON.parse(await readFile(source, "utf8")),
      );
      if (
        !timingSafeEqual(
          Buffer.from(record.bindingHash, "hex"),
          Buffer.from(digest(binding), "hex"),
        )
      )
        return null;
      // Keep the marker until expiry: removing it here would allow another
      // request that already read the answer hash to consume the challenge again.
      const marker = await open(consumed, "wx", 0o600);
      await marker.close();
      return record;
    } catch (error) {
      if (missingFile(error) || alreadyClaimed(error)) return null;
      throw error;
    }
  }
}
