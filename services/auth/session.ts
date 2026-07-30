import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { UserStatus } from "@prisma/client";
import { cookies } from "next/headers";
import { cache } from "react";

import { prisma } from "@/lib/prisma";
import {
  SESSION_COOKIE_NAME,
  SESSION_DURATION_SECONDS,
} from "@/services/auth/constants";
import type { AuthenticatedUser } from "@/services/auth/types";

function createSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function sessionExpiresAt(): Date {
  return new Date(Date.now() + SESSION_DURATION_SECONDS * 1000);
}

export async function createSession(userId: string): Promise<void> {
  const token = createSessionToken();
  const expiresAt = sessionExpiresAt();

  await prisma.authSession.create({
    data: {
      userId,
      tokenHash: hashSessionToken(token),
      expiresAt,
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export const getCurrentUser = cache(
  async (): Promise<AuthenticatedUser | null> => {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    if (!token) {
      return null;
    }

    const session = await prisma.authSession.findUnique({
      where: { tokenHash: hashSessionToken(token) },
      include: {
        user: {
          include: { profile: true },
        },
      },
    });

    if (!session) {
      return null;
    }

    if (
      session.expiresAt <= new Date() ||
      session.user.status !== UserStatus.ACTIVE
    ) {
      await prisma.authSession.deleteMany({ where: { id: session.id } });
      return null;
    }

    return {
      id: session.user.id,
      email: session.user.email,
      role: session.user.role,
      displayName: session.user.profile?.displayName ?? session.user.email,
      mustChangePassword: session.user.mustChangePassword,
    };
  },
);

export async function destroyCurrentSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    await prisma.authSession.deleteMany({
      where: { tokenHash: hashSessionToken(token) },
    });
  }

  cookieStore.delete(SESSION_COOKIE_NAME);
}
