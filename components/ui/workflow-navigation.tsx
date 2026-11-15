import React from "react";
import { Check } from "lucide-react";

export interface WorkflowStep {
  id: string;
  title: string;
  description: string;
}

/** Links keep all sections mounted so stepping never discards form values. */
export function WorkflowNavigation({
  steps,
  current,
}: {
  steps: readonly WorkflowStep[];
  current: number;
}) {
  return (
    <nav aria-label="报告处理阶段">
      <ol className="grid gap-3 sm:grid-cols-3">
        {steps.map((step, index) => (
          <li key={step.id}>
            <a
              href={`#${step.id}`}
              aria-current={index === current ? "step" : undefined}
              className={`focus-visible:outline-brand flex h-full min-w-0 gap-3 rounded-xl border p-4 focus-visible:outline-2 focus-visible:outline-offset-2 ${index === current ? "border-brand bg-brand-soft" : "bg-card hover:bg-muted"}`}
            >
              <span
                aria-hidden="true"
                className={`grid size-7 shrink-0 place-items-center rounded-full text-sm font-semibold ${index === current ? "bg-brand text-white" : "bg-muted text-muted-foreground"}`}
              >
                {index < current ? <Check className="size-4" /> : index + 1}
              </span>
              <span className="min-w-0">
                <span className="text-foreground block text-sm font-semibold">
                  {step.title}
                </span>
                <span className="text-muted-foreground mt-1 block text-xs leading-5">
                  {step.description}
                </span>
              </span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
