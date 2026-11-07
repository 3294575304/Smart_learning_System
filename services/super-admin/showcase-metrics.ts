import { PROVINCES } from "@/services/schools/provinces";

export interface ShowcaseSchool {
  id: string;
  name: string;
  logoUrl?: string | null;
  provinceCode: string | null;
  joinedAt: string;
  learners: number;
}

export function buildSchoolDistribution(schools: ShowcaseSchool[]) {
  const unique = [
    ...new Map(schools.map((school) => [school.id, school])).values(),
  ];
  const validCodes = new Set(PROVINCES.map((province) => province.code));
  const provinces = PROVINCES.map((province) => ({
    ...province,
    schools: unique
      .filter((school) => school.provinceCode === province.code)
      .sort((a, b) => a.name.localeCompare(b.name, "zh-CN")),
  }));
  const unlocated = unique.filter(
    (school) => !school.provinceCode || !validCodes.has(school.provinceCode),
  );
  const ranking = provinces
    .filter((province) => province.schools.length > 0)
    .sort(
      (a, b) =>
        b.schools.length - a.schools.length || a.code.localeCompare(b.code),
    );
  return {
    provinces,
    unlocated,
    totalSchools: unique.length,
    coveredProvinces: ranking.length,
    totalLearners: unique.reduce((sum, school) => sum + school.learners, 0),
    maxCount: Math.max(
      1,
      ...ranking.map((province) => province.schools.length),
    ),
    ranking,
  };
}

// A continuous light-to-dark scale; zero remains distinct from every nonzero count.
export function provinceFill(count: number, maxCount: number): string {
  if (count <= 0) return "#e6eee8";
  const ratio = Math.min(1, count / Math.max(1, maxCount));
  const intensity = ratio ** 0.65;
  const from = [162, 201, 189],
    to = [23, 93, 90];
  return (
    "#" +
    from
      .map((channel, i) =>
        Math.round(channel + ((to[i] ?? channel) - channel) * intensity)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}

export type SchoolDistribution = ReturnType<typeof buildSchoolDistribution>;
