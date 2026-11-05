import {
  getErrorStatus,
  requireAuthenticatedUser,
} from "@/services/auth/authorization";
import { readCurrentSchoolNameImage } from "@/services/schools/service";

export async function GET() {
  try {
    const user = await requireAuthenticatedUser();
    const image = await readCurrentSchoolNameImage(user.id);
    if (!image) return new Response(null, { status: 404 });

    return new Response(new Uint8Array(image.data), {
      headers: {
        "content-type": image.contentType,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error: unknown) {
    const status = getErrorStatus(error);
    if (status === 500) console.error("School name image read failed", error);
    return new Response(null, {
      status,
      headers: { "cache-control": "no-store" },
    });
  }
}
