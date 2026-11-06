import { getErrorStatus } from "@/services/auth/authorization";
import { getApplicationShowcaseSchoolLogo } from "@/services/super-admin/showcase";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ schoolId: string }> },
) {
  try {
    const { schoolId } = await params;
    const logo = await getApplicationShowcaseSchoolLogo(schoolId);
    if (!logo) {
      return new Response(null, {
        status: 404,
        headers: { "cache-control": "private, no-store" },
      });
    }

    return new Response(new Uint8Array(logo.data), {
      headers: {
        "content-type": logo.contentType,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error: unknown) {
    const status = getErrorStatus(error);
    if (status === 500)
      console.error("Showcase school logo read failed", error);
    return new Response(null, {
      status,
      headers: { "cache-control": "private, no-store" },
    });
  }
}
