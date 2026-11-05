import {
  getErrorStatus,
  requireAuthenticatedUser,
} from "@/services/auth/authorization";
import { readCurrentSchoolLogo } from "@/services/schools/service";

export async function GET() {
  try {
    const user = await requireAuthenticatedUser();
    const logo = await readCurrentSchoolLogo(user.id);
    if (!logo) return new Response(null, { status: 404 });

    return new Response(new Uint8Array(logo.data), {
      headers: {
        "content-type": logo.contentType,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error: unknown) {
    const status = getErrorStatus(error);
    if (status === 500) console.error("School emblem read failed", error);
    return new Response(null, {
      status,
      headers: { "cache-control": "no-store" },
    });
  }
}
