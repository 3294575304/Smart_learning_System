import type { LucideIcon } from "lucide-react";
import { ChevronDown } from "lucide-react";
import type { UseFormRegisterReturn } from "react-hook-form";

interface AuthFieldProps {
  id: string;
  label: string;
  error?: string;
  icon: LucideIcon;
  autoComplete?: string;
  placeholder?: string;
  type?: "email" | "password" | "text";
  registration: UseFormRegisterReturn;
}

export function AuthField({
  id,
  label,
  error,
  icon: Icon,
  autoComplete,
  placeholder,
  type = "text",
  registration,
}: AuthFieldProps) {
  return (
    <div>
      <label className="text-sm font-medium" htmlFor={id}>
        {label}
      </label>
      <div className="border-input focus-within:ring-ring mt-2 flex min-h-12 items-center rounded-md border bg-white px-3 transition focus-within:ring-2">
        <Icon aria-hidden="true" className="size-5 shrink-0 text-slate-700" />
        <span
          aria-hidden="true"
          className="mx-3 h-6 border-l border-slate-200"
        />
        <input
          {...registration}
          aria-describedby={error ? `${id}-error` : undefined}
          aria-invalid={Boolean(error)}
          autoComplete={autoComplete}
          className="min-w-0 flex-1 bg-transparent py-2 outline-none placeholder:text-slate-400"
          id={id}
          placeholder={placeholder}
          type={type}
        />
      </div>
      {error ? (
        <p className="text-destructive mt-1 text-sm" id={`${id}-error`}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

interface AuthSelectFieldProps {
  id: string;
  label: string;
  error?: string;
  icon: LucideIcon;
  options: { id: string; name: string }[];
  emptyLabel?: string;
  registration: UseFormRegisterReturn;
}

export function AuthSelectField({
  id,
  label,
  error,
  icon: Icon,
  options,
  emptyLabel = "请选择学校",
  registration,
}: AuthSelectFieldProps) {
  return (
    <div>
      <label className="text-sm font-medium" htmlFor={id}>
        {label}
      </label>
      <div className="border-input focus-within:ring-ring mt-2 flex min-h-12 items-center rounded-md border bg-slate-50 px-3 transition focus-within:ring-2">
        <Icon aria-hidden="true" className="size-5 shrink-0 text-slate-700" />
        <span
          aria-hidden="true"
          className="mx-3 h-6 border-l border-slate-200"
        />
        <select
          {...registration}
          aria-describedby={error ? `${id}-error` : undefined}
          aria-invalid={Boolean(error)}
          className="min-w-0 flex-1 appearance-none bg-transparent py-2 outline-none disabled:cursor-not-allowed disabled:text-slate-400"
          disabled={options.length === 0}
          id={id}
        >
          <option disabled value="">
            {options.length > 0 ? emptyLabel : "暂无可选学校"}
          </option>
          {options.map((school) => (
            <option key={school.id} value={school.id}>
              {school.name}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="size-4 shrink-0 text-slate-400"
        />
      </div>
      {error ? (
        <p className="text-destructive mt-1 text-sm" id={`${id}-error`}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
