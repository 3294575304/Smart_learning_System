"use client";

import type { SelectHTMLAttributes } from "react";

export function AutoSubmitSelect(
  props: SelectHTMLAttributes<HTMLSelectElement>,
) {
  return (
    <select
      {...props}
      onChange={(event) => {
        props.onChange?.(event);
        event.currentTarget.form?.requestSubmit();
      }}
    />
  );
}
