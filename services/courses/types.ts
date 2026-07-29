import type { ClassroomStatus, CourseStatus } from "@prisma/client";

export interface CourseTemplateView {
  id: string;
  code: string;
  name: string;
  description: string | null;
  version: string;
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
  isBuiltin: boolean;
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
