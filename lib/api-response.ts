import { NextResponse } from "next/server";

export function apiSuccess<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ success: true, data }, { status });
}

export function apiError(error: string, status: number): NextResponse {
  return NextResponse.json({ success: false, error }, { status });
}
