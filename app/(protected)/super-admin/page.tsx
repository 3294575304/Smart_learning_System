import { ShieldCheck } from "lucide-react";

export default function SuperAdminPage() {
  return (
    <section className="bg-card rounded-xl border border-sky-100 p-6 shadow-sm">
      <div className="flex items-start gap-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-700">
          <ShieldCheck aria-hidden="true" className="size-5" />
        </span>
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            超级管理员模块
          </h1>
          <p className="text-muted-foreground mt-2 text-sm leading-6">
            平台级入口已建立。学校管理员管理与授权功能将在后续迭代中接入。
          </p>
        </div>
      </div>
    </section>
  );
}
