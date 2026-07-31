import { NextResponse } from "next/server";

import {
  claimStudentAccount,
  StudentClaimError,
} from "@/services/auth/registration";
import { registerSchema } from "@/services/auth/schemas";
import {
  MaintenanceModeError,
  SelfRegistrationDisabledError,
} from "@/services/system-config/errors";

function fieldErrors(
  errors: Record<string, string[] | undefined>,
): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(errors).filter(
      (entry): entry is [string, string[]] => entry[1] !== undefined,
    ),
  );
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "请求内容不是有效的 JSON" },
      { status: 400 },
    );
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: "请检查注册信息",
        fieldErrors: fieldErrors(parsed.error.flatten().fieldErrors),
      },
      { status: 400 },
    );
  }

  try {
    const user = await claimStudentAccount(parsed.data);
    return NextResponse.json(
      { success: true, data: { userId: user.id } },
      { status: 201 },
    );
  } catch (error: unknown) {
    if (
      error instanceof StudentClaimError ||
      error instanceof SelfRegistrationDisabledError ||
      error instanceof MaintenanceModeError
    ) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          fieldErrors:
            error instanceof StudentClaimError ? error.fieldErrors : undefined,
        },
        { status: error.status },
      );
    }
    console.error("Failed to claim student account", error);
    return NextResponse.json(
      { success: false, error: "注册暂时失败，请稍后重试" },
      { status: 500 },
    );
  }
}
