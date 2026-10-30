import type { ReactNode } from "react";
/** Use document navigation so a stale same-page RSC transition cannot retain a different class scope. */
export function StudentAnalyticsLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a href={href} className={className}>
      {children}
    </a>
  );
}
