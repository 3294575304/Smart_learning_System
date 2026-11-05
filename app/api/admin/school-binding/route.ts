import { Role } from "@prisma/client";
import { Buffer } from "node:buffer";

import { apiError, apiSuccess } from "@/lib/api-response";
import { formDataFile } from "@/lib/form-data-file";
import {
  getErrorStatus,
  getSafeErrorMessage,
  requireAuthenticatedUser,
} from "@/services/auth/authorization";
import { auditRequestContext } from "@/services/audit/request-context";
import {
  SchoolBindingOperationError,
  schoolBindingNameSchema,
  updateAdminSchoolBinding,
} from "@/services/schools/service";
import { MAX_SCHOOL_LOGO_BYTES } from "@/services/schools/constants";

function schoolBindingApiError(error: unknown) {
  if (error instanceof SchoolBindingOperationError) {
    return apiError(error.message, error.status);
  }
  const status = getErrorStatus(error);
  if (status === 500) console.error("School binding request failed", error);
  return apiError(getSafeErrorMessage(error), status);
}

export async function POST(request: Request) {
  try {
    const admin = await requireAuthenticatedUser([Role.ADMIN]);
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > MAX_SCHOOL_LOGO_BYTES * 2 + 64 * 1024) {
      return apiError("图片文件总大小不能超过 4 MB。", 413);
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return apiError("请使用学校绑定表单提交。", 400);
    }

    const parsedName = schoolBindingNameSchema.safeParse(
      form.get("schoolName"),
    );
    if (!parsedName.success) {
      return apiError(
        parsedName.error.issues[0]?.message ?? "学校名称无效。",
        422,
      );
    }

    const logoValue = form.get("logo");
    const file = formDataFile(logoValue);
    if (logoValue !== null && !file) {
      return apiError("请选择有效的校徽图片。", 422);
    }
    if (file && (file.size <= 0 || file.size > MAX_SCHOOL_LOGO_BYTES)) {
      return apiError("校徽图片不能为空且不能超过 2 MB。", 413);
    }

    const nameImageValue = form.get("nameImage");
    const nameImageFile = formDataFile(nameImageValue);
    if (nameImageValue !== null && !nameImageFile) {
      return apiError("请选择有效的校名图片。", 422);
    }
    if (
      nameImageFile &&
      (nameImageFile.size <= 0 || nameImageFile.size > MAX_SCHOOL_LOGO_BYTES)
    ) {
      return apiError("校名图片不能为空且不能超过 2 MB。", 413);
    }

    return apiSuccess(
      await updateAdminSchoolBinding(
        admin.id,
        {
          name: parsedName.data,
          ...(file
            ? {
                logo: {
                  data: Buffer.from(await file.arrayBuffer()),
                  contentType: file.type,
                },
              }
            : {}),
          ...(nameImageFile
            ? {
                nameImage: {
                  data: Buffer.from(await nameImageFile.arrayBuffer()),
                  contentType: nameImageFile.type,
                },
              }
            : {}),
        },
        auditRequestContext(request),
      ),
    );
  } catch (error: unknown) {
    return schoolBindingApiError(error);
  }
}
