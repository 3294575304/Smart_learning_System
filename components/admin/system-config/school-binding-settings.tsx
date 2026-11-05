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
  const [name, setName] = useState(initialSchool.name);
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
    name.trim() !== school.name || logoFile !== null || nameImageFile !== null;
  const previewUrl = localPreviewUrl ?? school.logoUrl;
  const nameImagePreviewUrl = localNameImagePreviewUrl ?? school.nameImageUrl;

  useEffect(() => {
    setSchool(initialSchool);
    setName(initialSchool.name);
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
    setName(result.data.name);
    setLogoFile(null);
    setNameImageFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (nameImageInputRef.current) nameImageInputRef.current.value = "";
    setFeedback({
      type: "success",
      message: "学校信息已保存，顶部校徽和校名已更新。",
    });
    router.refresh();
  }

  return (
    <section className="bg-card rounded-xl border p-5 sm:p-6">
      <div>
        <h2 className="text-lg font-semibold">学校绑定</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          保存后，当前管理员所有页面顶部都会显示绑定的校徽和校名。
        </p>
      </div>

      <form className="mt-5 space-y-5" onSubmit={save}>
        <div className="grid gap-2 md:grid-cols-[minmax(12rem,1fr)_minmax(16rem,1.3fr)] md:gap-6">
          <div>
            <p className="text-sm font-medium">校名题字图片</p>
            <p className="text-muted-foreground mt-1 text-sm leading-6">
              上传学校题字图片，顶部将优先显示该图片。支持
              PNG、JPG、WebP，文件大小不超过 2 MB。
            </p>
          </div>
          <div className="flex min-h-16 flex-wrap items-center gap-4">
            {nameImagePreviewUrl ? (
              <Image
                alt={`${name || "学校"}校名图片预览`}
                className="h-12 max-w-[min(14rem,60vw)] object-contain object-left mix-blend-multiply"
                height={48}
                src={nameImagePreviewUrl}
                unoptimized
                width={220}
              />
            ) : (
              <span className="text-sm text-slate-500">未上传校名题字图片</span>
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

        <div className="grid gap-2 md:grid-cols-[minmax(12rem,1fr)_minmax(16rem,1.3fr)] md:gap-6">
          <label
            className="pt-2 text-sm font-medium"
            htmlFor="admin-school-name"
          >
            学校名称
          </label>
          <input
            autoComplete="organization"
            className="w-full rounded-md border px-3 py-2 text-sm"
            id="admin-school-name"
            maxLength={120}
            onChange={(event) => setName(event.target.value)}
            placeholder="请输入学校名称"
            required
            value={name}
          />
        </div>

        <div className="grid gap-2 md:grid-cols-[minmax(12rem,1fr)_minmax(16rem,1.3fr)] md:gap-6">
          <div>
            <p className="text-sm font-medium">学校校徽</p>
            <p className="text-muted-foreground mt-1 text-sm leading-6">
              支持 PNG、JPG、WebP，文件大小不超过 2 MB。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            {previewUrl ? (
              <Image
                alt={`${name || "学校"}校徽预览`}
                className="h-16 w-16 rounded-full border bg-white object-contain p-1"
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

        <div className="flex justify-end border-t pt-4">
          <button
            className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isSubmitting || !dirty || name.trim().length < 2}
            type="submit"
          >
            {isSubmitting ? "绑定中…" : "保存并绑定"}
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
