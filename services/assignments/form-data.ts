import { AssignmentOperationError } from "./errors";

/** Enforce the multipart budget while reading, including chunked requests. */
export async function readAssignmentFormData(
  request: Request,
  limit = 6 * 1024 * 1024,
): Promise<FormData> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > limit)
    throw new AssignmentOperationError(
      "上传内容过大，单个文件不能超过5MB",
      413,
    );
  if (!request.body) throw new AssignmentOperationError("请选择上传文件", 400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new AssignmentOperationError(
          "上传内容过大，单个文件不能超过5MB",
          413,
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return await new Response(Buffer.concat(chunks, size), {
      headers: { "content-type": request.headers.get("content-type") ?? "" },
    }).formData();
  } catch {
    throw new AssignmentOperationError("上传格式无效，请重新选择文件", 400);
  }
}
