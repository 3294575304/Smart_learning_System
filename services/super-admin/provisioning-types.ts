export interface CreatedPartnerSchool {
  id: string;
  name: string;
  provinceCode: string | null;
}

export interface CreatedSchoolAdmin {
  id: string;
  email: string;
  displayName: string;
  school: { id: string; name: string };
}
