"use client";

import { Plus } from "lucide-react";
import { createContext, useContext, useState, type ReactNode } from "react";

import { EditorDialog } from "@/components/assignments/editor-dialog";

const CreateEntryContext = createContext<{
  title: string;
  openDialog: () => void;
} | null>(null);

export function CreateEntryProvider({
  title,
  form,
  children,
}: {
  title: string;
  form: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <CreateEntryContext.Provider
      value={{ title, openDialog: () => setOpen(true) }}
    >
      {children}
      <EditorDialog
        open={open}
        title={title}
        onClose={() => setOpen(false)}
        showCloseButton
      >
        <div className="mt-5">{form}</div>
      </EditorDialog>
    </CreateEntryContext.Provider>
  );
}

export function CreateEntry({ card = false }: { card?: boolean }) {
  const entry = useContext(CreateEntryContext);
  if (!entry) return null;

  return (
    <button
      aria-haspopup="dialog"
      className={
        card
          ? "flex min-h-40 w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-sky-400 bg-sky-50/30 px-5 py-6 text-sm font-medium text-sky-800 transition-colors duration-150 hover:border-sky-600 hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 active:bg-sky-100"
          : "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-sky-700 ps-3.5 pe-4 text-sm font-medium text-white transition-colors duration-150 hover:bg-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 active:bg-sky-900"
      }
      onClick={(event) => {
        event.currentTarget.focus();
        entry.openDialog();
      }}
      type="button"
    >
      <span
        className={
          card
            ? "grid size-10 place-items-center rounded-full bg-sky-100"
            : undefined
        }
      >
        <Plus aria-hidden="true" className={card ? "size-5" : "size-4"} />
      </span>
      {entry.title}
    </button>
  );
}
