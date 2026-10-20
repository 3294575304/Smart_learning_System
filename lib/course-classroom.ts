/** Carry a selected classroom across course workspace links without losing other filters. */
export function withClassroomQuery(href: string, classroomId?: string | null) {
  if (!classroomId) return href;
  const url = new URL(href, "http://localhost");
  url.searchParams.set("classroomId", classroomId);
  return `${url.pathname}${url.search}${url.hash}`;
}
