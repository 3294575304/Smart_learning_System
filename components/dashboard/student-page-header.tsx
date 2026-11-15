import type { ComponentProps } from "react";
import { PageHeader } from "./page-header";
export function StudentPageHeader({
  title,
  description,
  actions,
  eyebrow,
}: ComponentProps<typeof PageHeader>) {
  return (
    <PageHeader
      title={title}
      description={description}
      actions={actions}
      eyebrow={eyebrow}
      variant="student"
    />
  );
}
