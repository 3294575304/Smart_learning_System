"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";

import { requestAdminApi } from "@/components/admin/request-api";
import { ProvinceSelect } from "@/components/admin/system-config/province-select";
import { SchoolIdentity } from "@/components/dashboard/school-identity";
import { MAX_SCHOOL_LOGO_BYTES } from "@/services/schools/constants";
import type { AdminSchoolBindingView } from "@/services/schools/service";

export function SchoolBindingSettings({
  initialSchool,
}: {
  initialSchool: AdminSchoolBindingView;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nameImageInputRef = useRef<HTMLInputElement>(null);
  const [school, setSchool] = useState(initialSchool);
  const [provinceCode, setProvinceCode] = useState(
    initialSchool.provinceCode ?? "",
  );
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [nameImageFile, setNameImageFile] = useState<File | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [localNameImagePreviewUrl, setLocalNameImagePreviewUrl] = useState<
    string | null
  >(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const dirty =
    provinceCode !== (school.provinceCode ?? "") ||
    logoFile !== null ||
    nameImageFile !== null;
  const name = school.name;
  const previewUrl = localPreviewUrl ?? school.logoUrl;
  const nameImagePreviewUrl = localNameImagePreviewUrl ?? school.nameImageUrl;

  useEffect(() => {
    setSchool(initialSchool);
    setProvinceCode(initialSchool.provinceCode ?? "");
  }, [initialSchool]);

  useEffect(() => {
    if (!logoFile) {
      setLocalPreviewUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(logoFile);
    setLocalPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [logoFile]);

  useEffect(() => {
    if (!nameImageFile) {
      setLocalNameImagePreviewUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(nameImageFile);
    setLocalNameImagePreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [nameImageFile]);

  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  function handleLogoChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    if (selected && selected.size > MAX_SCHOOL_LOGO_BYTES) {
      setFeedback({ type: "error", message: "校徽图片不能超过 2 MB。" });
      event.target.value = "";
      return;
    }
    setFeedback(null);
    setLogoFile(selected);
  }

  function handleNameImageChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    if (selected && selected.size > MAX_SCHOOL_LOGO_BYTES) {
      setFeedback({ type: "error", message: "校名图片不能超过 2 MB。" });
      event.target.value = "";
      return;
    }
    setFeedback(null);
    setNameImageFile(selected);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    setIsSubmitting(true);
    const body = new FormData();
    body.set("schoolName", name);
    body.set("provinceCode", provinceCode);
    if (logoFile) body.set("logo", logoFile);
    if (nameImageFile) body.set("nameImage", nameImageFile);

    const result = await requestAdminApi<AdminSchoolBindingView>(
      "/api/admin/school-binding",
      { method: "POST", body },
    );
    setIsSubmitting(false);
    if (!result.success) {
      setFeedback({ type: "error", message: result.error });
      return;
    }

    setSchool(result.data);
    setProvinceCode(result.data.provinceCode ?? "");
    setLogoFile(null);
    setNameImageFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (nameImageInputRef.current) nameImageInputRef.current.value = "";
    setFeedback({
      type: "success",
      message: "学校信息已保存，校徽和校名图片已自动适配顶部显示比例。",
    });
    router.refresh();
  }

  return (
    <section className="bg-card rounded-xl border p-5 sm:p-6">
      <div>
        <h2 className="text-lg font-semibold">学校绑定</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          根据本校校名长短和图片比例分别调整尺寸，左对齐显示，并为校徽与校名留出间距。
        </p>
      </div>

      <form className="mt-5 space-y-5" onSubmit={save}>
        <div className="grid gap-2 md:grid-cols-[minmax(12rem,1fr)_minmax(16rem,1.3fr)] md:gap-6">
          <div>
            <p className="text-sm font-medium">学校名称</p>
            <p className="text-muted-foreground mt-1 text-sm">
              学校名称由超级管理员维护，无法在此修改。
            </p>
          </div>
          <p
            className="w-full cursor-default self-start rounded-md border bg-slate-50 px-3 py-2 text-sm text-slate-600"
            id="admin-school-name"
            title="学校归属由超级管理员维护"
          >
            {name || "尚未分配学校"}
          </p>
        </div>

        <div className="grid gap-2 md:grid-cols-[minmax(12rem,1fr)_minmax(16rem,1.3fr)] md:gap-6">
          <div>
            <label
              htmlFor="admin-school-province"
              className="text-sm font-medium"
            >
              所在省级地区
            </label>
            <p className="text-muted-foreground mt-1 text-sm">
              用于系统应用情况地图的省份归属。
            </p>
          </div>
          <ProvinceSelect
            id="admin-school-province"
            value={provinceCode}
            onChange={setProvinceCode}
            disabled={isSubmitting}
          />
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-3 rounded-lg border p-4">
            <div>
              <p className="text-sm font-medium">校名题字图片</p>
              <p className="text-muted-foreground mt-1 text-sm leading-6">
                顶部优先显示此图片。支持 PNG、JPG、WebP，文件大小不超过 2 MB。
              </p>
            </div>
            <div className="flex min-h-16 flex-wrap items-center gap-4">
              {nameImagePreviewUrl ? (
                <Image
                  alt={`${name || "学校"}校名图片预览`}
                  className="h-auto max-h-16 w-auto max-w-[min(14rem,60vw)] object-contain object-left mix-blend-multiply"
                  height={48}
                  src={nameImagePreviewUrl}
                  unoptimized
                  width={220}
                />
              ) : (
                <span className="text-sm text-slate-500">
                  未上传校名题字图片
                </span>
              )}
              <div>
                <input
                  accept="image/png,image/jpeg,image/webp"
                  aria-label="上传学校校名题字图片"
                  className="sr-only"
                  id="admin-school-name-image"
                  onChange={handleNameImageChange}
                  ref={nameImageInputRef}
                  type="file"
                />
                <button
                  className="rounded-md border px-3 py-2 text-sm font-medium transition hover:bg-slate-50"
                  onClick={() => nameImageInputRef.current?.click()}
                  type="button"
                >
                  {nameImageFile ? "更换校名图片" : "上传校名图片"}
                </button>
                {nameImageFile ? (
                  <p className="text-muted-foreground mt-1 max-w-64 truncate text-xs">
                    {nameImageFile.name}
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          <div className="space-y-3 rounded-lg border p-4">
            <div>
              <p className="text-sm font-medium">学校校徽</p>
              <p className="text-muted-foreground mt-1 text-sm leading-6">
                支持 PNG、JPG、WebP，文件大小不超过 2 MB。
              </p>
            </div>
            <div className="flex min-h-16 flex-wrap items-center gap-4">
              {previewUrl ? (
                <Image
                  alt={`${name || "学校"}校徽预览`}
                  className="h-16 w-16 rounded-md border bg-white object-contain p-1"
                  height={64}
                  src={previewUrl}
                  unoptimized
                  width={64}
                />
              ) : (
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-sm text-slate-500">
                  暂无
                </span>
              )}
              <div>
                <input
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  id="admin-school-logo"
                  onChange={handleLogoChange}
                  ref={fileInputRef}
                  type="file"
                />
                <button
                  className="rounded-md border px-3 py-2 text-sm font-medium transition hover:bg-slate-50"
                  onClick={() => fileInputRef.current?.click()}
                  type="button"
                >
                  {logoFile ? "更换校徽" : "上传校徽"}
                </button>
                {logoFile ? (
                  <p className="text-muted-foreground mt-1 max-w-64 truncate text-xs">
                    {logoFile.name}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-lg border bg-white p-4">
          <p className="text-muted-foreground mb-3 text-xs">
            效果图（顶部显示预览）
          </p>
          <div className="mx-auto flex h-16 w-full max-w-60 items-center justify-center">
            <SchoolIdentity
              compact
              name={name || "学校名称"}
              logoUrl={previewUrl}
              nameImageUrl={nameImagePreviewUrl}
            />
          </div>
        </div>

        <div className="flex justify-end border-t pt-4">
          <button
            className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            disabled={
              isSubmitting ||
              (!dirty && !school.logoUrl && !school.nameImageUrl) ||
              school.name.trim().length < 2
            }
            type="submit"
          >
            {isSubmitting ? "正在适配并保存…" : "保存并绑定"}
          </button>
        </div>
      </form>

      {feedback ? (
        <p
          className={`mt-4 rounded-md p-3 text-sm ${
            feedback.type === "success"
              ? "bg-emerald-50 text-emerald-800"
              : "bg-red-50 text-red-700"
          }`}
          role="status"
        >
          {feedback.message}
        </p>
      ) : null}
    </section>
  );
}
