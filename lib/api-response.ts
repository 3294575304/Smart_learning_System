import { NextResponse } from "next/server";

export function apiSuccess<T>(
  data: T,
  status = 200,
  headers?: HeadersInit,
): NextResponse {
  return NextResponse.json({ success: true, data }, { status, headers });
}

export function apiError(
  error: string,
  status: number,
  fieldErrors?: Record<string, string[]>,
): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error,
      ...(status === 503 ? { code: "SYSTEM_MAINTENANCE" } : {}),
      ...(fieldErrors ? { fieldErrors } : {}),
    },
    { status },
  );
}
