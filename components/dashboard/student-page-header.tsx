import type { ComponentProps } from "react";
import { PageHeader } from "./page-header";
export function StudentPageHeader(props: ComponentProps<typeof PageHeader>) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm sm:px-6">
      <PageHeader {...props} />
    </div>
  );
}
