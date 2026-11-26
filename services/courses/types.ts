import type { Buffer } from "node:buffer";
import type { ClassroomStatus, CourseStatus } from "@prisma/client";

import type { CourseCoverKey } from "@/lib/course-covers";

export interface CourseTemplateView {
  id: string;
  code: string;
  name: string;
  description: string | null;
  version: string;
  coverKey: CourseCoverKey;
  isBuiltin: boolean;
  isActive: boolean;
  courseCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface TeacherCourseTemplateOption {
  id: string;
  code: string;
  name: string;
  description: string | null;
  version: string;
  coverKey: CourseCoverKey;
  isBuiltin: boolean;
}

/** 教师建课时可选的课程目录项，课程号由管理员维护。 */
export interface TeacherCourseCategoryOption {
  id: string;
  name: string;
  courseNo: string | null;
}

export interface TeacherCourseClassroomView {
  id: string;
  name: string;
  description: string | null;
  status: ClassroomStatus;
  allowStudentLeave: boolean;
  studentCount: number;
  currentCourse: {
    id: string;
    name: string;
    courseNo: string;
    term: string;
    status: CourseStatus;
  } | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TeacherCourseListItem {
  id: string;
  template: TeacherCourseTemplateOption;
  questionCategoryId: string;
  questionCategoryName: string;
  courseNo: string;
  term: string;
  name: string;
  description: string | null;
  status: CourseStatus;
  publishedAt: Date | null;
  archivedAt: Date | null;
  classroomCount: number;
  activeClassroomCount: number;
  activeStudentCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface TeacherCourseDetail extends TeacherCourseListItem {
  linkedClassrooms: TeacherCourseClassroomView[];
  classrooms: TeacherCourseClassroomView[];
}

export interface TeacherCourseDeletionResult {
  id: string;
  name: string;
  courseNo: string;
  term: string;
  deletedAt: Date;
}

export interface CourseSyllabusView {
  id: string;
  courseId: string;
  versionNumber: number;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: Date;
  uploadedBy: {
    id: string;
    displayName: string | null;
    email: string | null;
  };
}

export interface CourseSyllabusDownload {
  syllabus: CourseSyllabusView;
  data: Buffer;
}
