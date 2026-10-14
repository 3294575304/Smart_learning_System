"use client";

export function TeacherCardClassroomFilter({
  label,
  classrooms,
  value,
  onChange,
}: {
  label: string;
  classrooms: Array<{ id: string; name: string }>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="inline-flex max-w-full min-w-0 items-center gap-1.5 text-xs text-slate-500">
      <span className="shrink-0">班级</span>
      <select
        aria-label={label}
        title={classrooms.find((item) => item.id === value)?.name ?? "全部班级"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-8 w-36 max-w-full min-w-0 rounded-lg border border-slate-200 bg-slate-50/70 px-2 py-1 text-slate-700 focus-visible:outline-2 focus-visible:outline-sky-600"
      >
        <option value="">全部班级</option>
        {classrooms.map((classroom) => (
          <option key={classroom.id} value={classroom.id}>
            {classroom.name}
          </option>
        ))}
      </select>
    </label>
  );
}
