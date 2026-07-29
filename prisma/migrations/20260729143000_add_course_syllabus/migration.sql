-- CreateTable
CREATE TABLE "CourseSyllabus" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "originalName" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(100) NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" VARCHAR(191) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseSyllabus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CourseSyllabus_courseId_key" ON "CourseSyllabus"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseSyllabus_storageKey_key" ON "CourseSyllabus"("storageKey");

-- CreateIndex
CREATE INDEX "CourseSyllabus_uploadedById_idx" ON "CourseSyllabus"("uploadedById");

-- AddForeignKey
ALTER TABLE "CourseSyllabus" ADD CONSTRAINT "CourseSyllabus_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseSyllabus" ADD CONSTRAINT "CourseSyllabus_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
