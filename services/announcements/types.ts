import type {
  AnnouncementStatus,
  AnnouncementTargetType,
} from "@prisma/client";

export interface AnnouncementUserReference {
  id: string;
  displayName: string;
  email: string;
}

export interface AnnouncementView {
  id: string;
  title: string;
  content: string;
  targetType: AnnouncementTargetType;
  status: AnnouncementStatus;
  publishedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: AnnouncementUserReference;
  publishedBy: AnnouncementUserReference | null;
}

export interface AnnouncementListResult {
  items: AnnouncementView[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface AnnouncementPublishResult {
  announcement: AnnouncementView;
  createdNotificationCount: number;
  alreadyPublished: boolean;
}
