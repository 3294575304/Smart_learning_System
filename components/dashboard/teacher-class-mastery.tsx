"use client";

import { useState } from "react";
import { TeacherCardClassroomFilter } from "@/components/dashboard/teacher-card-classroom-filter";
import { filterDashboardClassroomItems } from "@/services/dashboard/teacher-dashboard-view";
import Link from "next/link";
import type { TeacherDashboardData } from "@/services/dashboard/teacher-dashboard";

import styles from "./teacher-workspace.module.css";

type Workspace = NonNullable<TeacherDashboardData["workspace"]>;

function tone(score: number | null) {
  if (score === null) return "bg-slate-50 text-slate-600";
  if (score < 50) return "bg-amber-50 text-amber-900";
  if (score < 80) return "bg-sky-50 text-sky-900";
  return "bg-emerald-50 text-emerald-900";
}

export function TeacherClassMastery({ workspace }: { workspace: Workspace }) {
  const [classroomId, setClassroomId] = useState("");
  const { course, chapters } = workspace;
  const mastery = filterDashboardClassroomItems(workspace.mastery, classroomId);
  return (
    <section
      aria-labelledby="class-mastery-title"
      className={`${styles.card} order-3 min-w-0 rounded-xl border bg-white p-4 xl:order-none`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            id="class-mastery-title"
            className={`${styles.heading} font-semibold`}
          >
            班级知识掌握概览
          </h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            {workspace.classrooms.find((item) => item.id === classroomId)
              ?.name ?? "全部班级"}{" "}
            ·{" "}
            {workspace.graphVersion
              ? `正式图谱 V${workspace.graphVersion}`
              : "尚未发布正式图谱"}
          </p>
        </div>
        <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto">
          <TeacherCardClassroomFilter
            label="知识掌握班级"
            classrooms={workspace.classrooms}
            value={classroomId}
            onChange={setClassroomId}
          />
          <Link
            className="rounded-lg border border-sky-200 px-3 py-2 text-xs font-medium text-sky-700 hover:bg-sky-50"
            href={`/teacher/courses/${course.id}/knowledge-graph`}
          >
            查看课程图谱
          </Link>
        </div>
      </div>
      {workspace.graphOutdated ? (
        <p className="mt-4 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-900">
          当前图谱来源于旧版大纲。以下仍按现有正式图谱统计，更新图谱需教师审核发布。
        </p>
      ) : null}
      {!chapters.length || !mastery.length ? (
        <div className="flex min-h-36 flex-col items-center justify-center gap-2 px-4 text-center">
          <p className="text-sm font-medium text-slate-700">
            {!chapters.length
              ? "暂无可展示的正式知识结构"
              : "当前课程尚无有效班级"}
          </p>
          <p className="max-w-sm text-xs leading-6 text-slate-500">
            {!chapters.length
              ? "发布正式图谱后，将按章节展示各班级的学习证据与掌握情况。"
              : "创建课程班级后，可在此对比班级知识掌握情况。"}
          </p>
          <Link
            className="text-sm text-sky-700 underline underline-offset-4"
            href={`/teacher/courses/${course.id}`}
          >
            进入课程详情
          </Link>
        </div>
      ) : (
        <>
          <div
            className={`${styles.scrollArea} mt-3 max-h-64 overflow-auto rounded-xl border border-slate-100`}
            tabIndex={0}
            role="region"
            aria-label="各班章节掌握情况，可横向滚动"
          >
            <table className="w-full text-left text-sm">
              <caption className="sr-only">
                按在读成员分组的课程知识掌握情况，未评估不计零分。
              </caption>
              <thead className="sticky top-0 z-20 border-b bg-slate-50 text-xs text-slate-600">
                <tr>
                  <th
                    scope="col"
                    className="sticky left-0 z-10 min-w-36 bg-slate-50 px-3 py-2.5 font-medium"
                  >
                    班级与人数
                  </th>
                  {chapters.map((chapter) => (
                    <th
                      key={chapter.id}
                      scope="col"
                      className="min-w-32 px-3 py-2.5 font-medium"
                    >
                      <span className="block max-w-48">{chapter.name}</span>
                      <span className="mt-1 block font-normal text-slate-500">
                        {chapter.conceptCount} 个知识点
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mastery.map((classroom) => (
                  <tr
                    className="border-b last:border-0"
                    key={classroom.classroomId}
                  >
                    <th
                      scope="row"
                      className="sticky left-0 z-10 bg-white px-3 py-3 font-medium"
                    >
                      <Link
                        className="line-clamp-2 text-slate-700 hover:text-teal-700 hover:underline"
                        title={classroom.classroomName}
                        href={`/teacher/courses/${course.id}/profiles?classroomId=${classroom.classroomId}`}
                      >
                        {classroom.classroomName}
                      </Link>
                      <span className="mt-1 block text-xs font-normal text-slate-500">
                        {classroom.studentCount} 名在读学生
                      </span>
                    </th>
                    {classroom.chapters.map((chapter) => (
                      <td className="p-2" key={chapter.chapterId}>
                        <div
                          className={`min-w-28 rounded-xl px-3 py-2 ${tone(chapter.score)}`}
                        >
                          <span className="block font-semibold tabular-nums">
                            {chapter.score === null
                              ? chapter.evidenceCount
                                ? "证据不足"
                                : "未评估"
                              : `${chapter.score}%`}
                          </span>
                          <span className="mt-1 block text-[11px]">
                            稳定覆盖 {chapter.stableCount}/{chapter.totalCount}{" "}
                            项
                          </span>
                          <span className="mt-1 block text-[11px] opacity-80">
                            {chapter.score === null
                              ? "待积累有效证据"
                              : chapter.score < 50
                                ? "需要关注"
                                : chapter.score < 80
                                  ? "逐步掌握"
                                  : "掌握较好"}
                          </span>
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            表格内滚动查看班级与章节，点击班级查看学生画像与证据。
          </p>
          <details className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-6 text-slate-500">
            <summary className="cursor-pointer font-medium text-slate-600">
              统计说明与更新时间
            </summary>
            <p className="mt-2">
              按当前在读成员分组，读取各学生本课程最新掌握度修订，包含作业与自主练习证据，并非仅统计本班作业。每项为一名学生的一个知识点；有效证据达到现有画像门槛（3
              条）后纳入均值，未评估与证据不足不计零分。章节值为已达门槛项目的平均值，覆盖不足时不宜直接比较班级优劣。
            </p>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
              {mastery.map((classroom) => (
                <span key={classroom.classroomId}>
                  {classroom.classroomName}：
                  {classroom.updatedAt
                    ? classroom.updatedAt.toLocaleString("zh-CN", {
                        timeZone: "Asia/Shanghai",
                      })
                    : "暂无有效证据"}
                </span>
              ))}
            </div>
          </details>
        </>
      )}
    </section>
  );
}
