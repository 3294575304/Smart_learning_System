import { ClipboardList, FlaskConical, PencilLine } from "lucide-react";
import {
  ASSIGNMENT_CATEGORY_LABELS,
  type AssignmentCategoryValue,
} from "@/services/assignments/category";

const presentation = {
  PRACTICE: {
    icon: PencilLine,
    style: "border-violet-200 bg-violet-50 text-violet-800",
    target: "平时表现",
  },
  COURSE_ASSIGNMENT: {
    icon: ClipboardList,
    style: "border-sky-200 bg-sky-50 text-sky-800",
    target: "课程作业",
  },
  COURSE_EXPERIMENT: {
    icon: FlaskConical,
    style: "border-teal-200 bg-teal-50 text-teal-800",
    target: "课程实验",
  },
};

export function AssignmentCategoryBadge({
  category = "PRACTICE",
}: {
  category?: AssignmentCategoryValue;
}) {
  const { icon: Icon, style, target } = presentation[category];
  return (
    <span
      title={`作业类别：${ASSIGNMENT_CATEGORY_LABELS[category]}；对应${target}考核项目`}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium ${style}`}
    >
      <Icon aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
      {ASSIGNMENT_CATEGORY_LABELS[category]}
    </span>
  );
}
