import type { AnnouncementStatus } from "@prisma/client";

export interface CourseAnnouncementView {
  id: string;
  title: string;
  content: string;
  status: AnnouncementStatus;
  classroom: { id: string; name: string };
  /** 多班发布时共享的批次号；单班为 null。 */
  batchId: string | null;
  /** 同批的其他班级（不含当前这条），用于「同批 N 个班级」标记。 */
  batchClassrooms: Array<{ id: string; name: string }>;
  /** 目标班级当前在读学生数；未发布时用于「本班 N 人将收到」。 */
  audienceCount: number;
  /** 已读通知数；仅已发布 / 已撤回有意义，草稿恒为 0。 */
  readCount: number;
  publishedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CourseAnnouncementListResult {
  items: CourseAnnouncementView[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface CourseAnnouncementPublishResult {
  announcement: CourseAnnouncementView;
  createdNotificationCount: number;
  alreadyPublished: boolean;
}

/** 多班发布时的汇总结果。 */
export interface CourseAnnouncementCreateResult {
  /** 所有班级的公告记录（每条对应一个班）。 */
  announcements: CourseAnnouncementView[];
  /** 合计产生的通知数。 */
  createdNotificationCount: number;
  /** 覆盖的班级数。 */
  classroomCount: number;
}

export interface CourseAnnouncementAudience {
  classrooms: Array<{
    classroomId: string;
    classroomName: string;
    studentCount: number;
  }>;
  /** 所有选中班级的在读学生总数。 */
  totalStudentCount: number;
}

export interface CourseAnnouncementBatchResult {
  revoked: CourseAnnouncementView[];
  deletedNotificationCount: number;
}
