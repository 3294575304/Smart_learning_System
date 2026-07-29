export function encodedAttachmentDisposition(
  fileName: string,
  fallbackName = "download",
): string {
  const fallback =
    fileName
      .replace(/[^\x20-\x7e]+/gu, "_")
      .replace(/["\\;]/gu, "_")
      .trim() || fallbackName;
  const encoded = encodeURIComponent(fileName).replace(
    /['()*]/gu,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );

  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
