export const SUBMISSION_ATTACHMENT_MIME_TYPES: Readonly<
  Record<string, string>
> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
};

export const SUBMISSION_ATTACHMENT_ACCEPT = Object.keys(
  SUBMISSION_ATTACHMENT_MIME_TYPES,
)
  .map((extension) => `.${extension}`)
  .join(",");

export const SUBMISSION_ATTACHMENT_FORMATS = "PNG、JPG、PDF、DOC、DOCX、TXT";
