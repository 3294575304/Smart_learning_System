"use client";

import type { LucideIcon } from "lucide-react";
import { ChevronDown, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";
import selectStyles from "./auth-select.module.css";

interface AuthFieldProps {
  className?: string;
  id: string;
  label: string;
  error?: string;
  icon: LucideIcon;
  autoComplete?: string;
  maxLength?: number;
  disabled?: boolean;
  placeholder?: string;
  type?: "email" | "password" | "text";
  registration: UseFormRegisterReturn;
}

export function AuthField({
  className,
  id,
  label,
  error,
  icon: Icon,
  autoComplete,
  maxLength,
  disabled,
  placeholder,
  type = "text",
  registration,
}: AuthFieldProps) {
  const [passwordVisible, setPasswordVisible] = useState(false);
  const isPassword = type === "password";

  return (
    <div className={className}>
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
          maxLength={maxLength}
          disabled={disabled}
          className="min-w-0 flex-1 bg-transparent py-2 outline-none placeholder:text-slate-400"
          id={id}
          placeholder={placeholder}
          type={isPassword && passwordVisible ? "text" : type}
        />
        {isPassword ? (
          <button
            aria-label={passwordVisible ? "隐藏密码" : "显示密码"}
            aria-controls={id}
            aria-pressed={passwordVisible}
            className="ml-2 grid size-8 shrink-0 cursor-pointer place-items-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
            onClick={() => setPasswordVisible((visible) => !visible)}
            type="button"
          >
            {passwordVisible ? (
              <EyeOff aria-hidden="true" size={17} />
            ) : (
              <Eye aria-hidden="true" size={17} />
            )}
          </button>
        ) : null}
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
  className?: string;
  id: string;
  label: string;
  error?: string;
  icon: LucideIcon;
  options: { id: string; name: string }[];
  emptyLabel?: string;
  registration: UseFormRegisterReturn;
}

export function AuthSelectField({
  className,
  id,
  label,
  error,
  icon: Icon,
  options,
  emptyLabel = "请选择学校",
  registration,
}: AuthSelectFieldProps) {
  return (
    <div className={className}>
      <label className="text-sm font-medium" htmlFor={id}>
        {label}
      </label>
      <div
        className={`${selectStyles.shell} border-input focus-within:ring-ring mt-2 flex min-h-12 items-center rounded-md border bg-slate-50 px-3 transition focus-within:ring-2`}
      >
        <Icon aria-hidden="true" className="size-5 shrink-0 text-slate-700" />
        <span
          aria-hidden="true"
          className="mx-3 h-6 border-l border-slate-200"
        />
        <select
          {...registration}
          aria-describedby={error ? `${id}-error` : undefined}
          aria-invalid={Boolean(error)}
          className={`${selectStyles.select} min-w-0 flex-1 appearance-none bg-transparent py-2 outline-none disabled:cursor-not-allowed disabled:text-slate-400`}
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
