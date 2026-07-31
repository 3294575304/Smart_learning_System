export function normalizeStudentNo(value: string): string {
  return value.normalize("NFKC").trim().toUpperCase();
}

export function normalizeStudentName(value: string): string {
  return value.trim();
}
