import type { Buffer } from "node:buffer";
import type { CourseFileKind, Prisma } from "@prisma/client";

export interface CourseFileUploadFile {
  name: string;
  type: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export type CourseFileResource =
  | { type: "COURSE"; courseId: string }
  | { type: "CLASSROOM"; classroomId: string };

export interface CourseFileUploadedByView {
  id: string;
  displayName: string | null;
  email: string | null;
}

export interface CourseFileResourceView {
  type: "COURSE" | "CLASSROOM";
  id: string;
  name: string;
  courseNo: string | null;
  term: string | null;
}

export interface CourseFileVersionView {
  id: string;
  resource: CourseFileResourceView;
  fileKind: CourseFileKind;
  fileKey: string;
  title: string;
  versionNumber: number;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
  uploadedBy: CourseFileUploadedByView;
}

export interface CourseFileDownload {
  file: CourseFileVersionView;
  data: Buffer;
}

export interface ValidatedCourseFile {
  originalFileName: string;
  extension: "csv" | "xls" | "xlsx";
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string;
  data: Buffer;
  metadata: Prisma.InputJsonObject;
}
