import Link from "next/link";
import React, { type ComponentPropsWithoutRef } from "react";

/** 保留学生工作区外框，避免站内跳转整页刷新。 */
export function StudentPageLink({
  href,
  ...props
}: ComponentPropsWithoutRef<"a"> & { href: string }) {
  return <Link href={href} prefetch={false} {...props} />;
}
