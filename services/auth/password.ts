import "server-only";

import { compare, hash } from "bcryptjs";

const PASSWORD_HASH_ROUNDS = 12;
const DUMMY_PASSWORD_HASH =
  "$2b$12$rLtNbLq7NBXWHpa4YpbVhOiojZ1qJcws7kenZqNZyqkKtP0gnNw7K";

export function hashPassword(password: string): Promise<string> {
  return hash(password, PASSWORD_HASH_ROUNDS);
}

export function verifyPassword(
  password: string,
  passwordHash: string | null,
): Promise<boolean> {
  return compare(password, passwordHash ?? DUMMY_PASSWORD_HASH);
}
