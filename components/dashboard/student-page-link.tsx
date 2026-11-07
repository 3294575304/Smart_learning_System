import React, { type ComponentPropsWithoutRef } from "react";

/** Full navigation keeps student drill-downs usable without a client router transition. */
export function StudentPageLink({
  href,
  ...props
}: ComponentPropsWithoutRef<"a"> & { href: string }) {
  return <a href={href} {...props} />;
}
