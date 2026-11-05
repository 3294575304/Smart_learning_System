import { z } from "zod";
import provinces from "@/services/schools/provinces-data.json";

export const PROVINCES = provinces;
const codes = new Set(PROVINCES.map((province) => province.code));
export const schoolProvinceSchema = z
  .preprocess(
    (value) => (value === "" ? null : value),
    z
      .string()
      .refine((code) => codes.has(code), "请选择有效的省级地区")
      .nullable(),
  )
  .optional();

export function provinceName(code: string | null | undefined): string {
  return (
    PROVINCES.find((province) => province.code === code)?.name ?? "未设置地区"
  );
}
