"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { Compartment, EditorState } from "@codemirror/state";
import {
  EditorView,
  lineNumbers,
  keymap,
  highlightActiveLine,
  highlightActiveLineGutter,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import {
  HighlightStyle,
  syntaxHighlighting,
  bracketMatching,
  indentOnInput,
} from "@codemirror/language";
import { python } from "@codemirror/lang-python";
import { cpp } from "@codemirror/lang-cpp";
import { java } from "@codemirror/lang-java";
import { javascript } from "@codemirror/lang-javascript";
import { tags } from "@lezer/highlight";
import {
  LANGUAGE_DETAILS,
  PROGRAMMING_LANGUAGES,
  type ProgrammingLanguage,
} from "@/lib/programming-language";

const languageExtension = (language: ProgrammingLanguage) =>
  language === "PYTHON"
    ? python()
    : language === "JAVA"
      ? java()
      : language === "JAVASCRIPT"
        ? javascript()
        : cpp();
const colors = HighlightStyle.define([
  { tag: tags.keyword, color: "#7c3aed" },
  { tag: [tags.string, tags.character], color: "#15803d" },
  { tag: [tags.number, tags.bool, tags.null], color: "#c2410c" },
  { tag: tags.comment, color: "#64748b", fontStyle: "italic" },
  {
    tag: [tags.function(tags.variableName), tags.function(tags.propertyName)],
    color: "#0369a1",
  },
  { tag: [tags.typeName, tags.className], color: "#0f766e" },
  { tag: tags.operator, color: "#be185d" },
  { tag: tags.meta, color: "#a16207" },
]);

export function CodeEditor({
  value,
  language = "PYTHON",
  onChange,
  disabled = false,
  label = "代码编辑器",
}: {
  value: string;
  language?: ProgrammingLanguage;
  onChange: (value: string) => void;
  disabled?: boolean;
  label?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<EditorView | null>(null);
  const callback = useRef(onChange);
  callback.current = onChange;
  const initial = useRef({ value, language, disabled, label });
  const compartments = useRef({
    language: new Compartment(),
    editable: new Compartment(),
    label: new Compartment(),
  });
  useEffect(() => {
    if (!host.current) return;
    const config = compartments.current;
    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: initial.current.value,
        extensions: [
          lineNumbers(),
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          bracketMatching(),
          indentOnInput(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          syntaxHighlighting(colors),
          EditorState.tabSize.of(4),
          config.language.of(languageExtension(initial.current.language)),
          config.editable.of([
            EditorState.readOnly.of(initial.current.disabled),
            EditorView.editable.of(!initial.current.disabled),
          ]),
          config.label.of(
            EditorView.contentAttributes.of({
              "aria-label": initial.current.label,
              spellcheck: "false",
            }),
          ),
          EditorView.updateListener.of((update) => {
            if (update.docChanged)
              callback.current(update.state.doc.toString());
          }),
          EditorView.theme({
            "&": {
              backgroundColor: "var(--card)",
              color: "var(--foreground)",
              fontSize: "14px",
            },
            ".cm-scroller": {
              fontFamily: "Consolas, 'Courier New', monospace",
              lineHeight: "1.8",
              overflow: "auto",
              minHeight: "288px",
              maxHeight: "560px",
            },
            ".cm-content": { padding: "16px 0", minHeight: "288px" },
            ".cm-line": { padding: "0 16px" },
            ".cm-gutters": {
              backgroundColor:
                "color-mix(in srgb, var(--muted) 65%, var(--card))",
              color: "var(--muted-foreground)",
              borderRight: "1px solid var(--border)",
              alignSelf: "stretch",
              // CodeMirror writes a content-height minimum inline; short files
              // still need the gutter to fill the editor's empty area.
              minHeight: "288px !important",
              userSelect: "none",
            },
            ".cm-lineNumbers": {
              minWidth: "3.5em",
              fontVariantNumeric: "tabular-nums",
            },
            ".cm-lineNumbers .cm-gutterElement": {
              padding: "0 12px 0 8px",
              textAlign: "right",
            },
            ".cm-activeLineGutter": {
              backgroundColor:
                "color-mix(in srgb, var(--primary) 9%, transparent)",
              color: "var(--primary)",
              fontWeight: "600",
            },
            ".cm-activeLine": {
              backgroundColor:
                "color-mix(in srgb, var(--primary) 6%, transparent)",
            },
            "&.cm-focused": {
              outline: "2px solid var(--ring)",
              outlineOffset: "-2px",
            },
          }),
        ],
      }),
    });
    editor.current = view;
    return () => {
      view.destroy();
      editor.current = null;
    };
  }, []);
  useEffect(() => {
    const view = editor.current;
    if (view && view.state.doc.toString() !== value)
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value },
      });
  }, [value]);
  useEffect(() => {
    editor.current?.dispatch({
      effects: compartments.current.language.reconfigure(
        languageExtension(language),
      ),
    });
  }, [language]);
  useEffect(() => {
    editor.current?.dispatch({
      effects: compartments.current.editable.reconfigure([
        EditorState.readOnly.of(disabled),
        EditorView.editable.of(!disabled),
      ]),
    });
  }, [disabled]);
  useEffect(() => {
    editor.current?.dispatch({
      effects: compartments.current.label.reconfigure(
        EditorView.contentAttributes.of({
          "aria-label": label,
          spellcheck: "false",
        }),
      ),
    });
  }, [label]);
  return (
    <div
      className={`min-w-0 overflow-hidden rounded-b-lg ${disabled ? "opacity-70" : ""}`}
      ref={host}
    />
  );
}

export function ProgrammingEditor({
  value,
  language = "PYTHON",
  onChange,
  disabled,
  label = "编程代码",
}: {
  value: string;
  language?: ProgrammingLanguage;
  onChange: (code: string, language: ProgrammingLanguage) => void;
  disabled?: boolean;
  label?: string;
}) {
  const id = useId();
  const drafts = useRef<Partial<Record<ProgrammingLanguage, string>>>({});
  const current = useRef({ language, value });
  const [announcement, setAnnouncement] = useState("");
  // A parent may restore a saved draft, so always remember its latest code.
  current.current = { language, value };
  drafts.current[language] = value;
  function select(next: ProgrammingLanguage) {
    drafts.current[current.current.language] = current.current.value;
    onChange(drafts.current[next] ?? LANGUAGE_DETAILS[next].starter, next);
    setAnnouncement(
      `已切换至 ${LANGUAGE_DETAILS[next].label}，原语言代码已保留在本题编辑草稿中。`,
    );
  }
  return (
    <div className="mt-4 min-w-0 overflow-hidden rounded-lg border border-slate-200">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2">
        <label className="sr-only" htmlFor={id}>
          编程语言
        </label>
        <select
          className="rounded-md border bg-white px-3 py-1.5 text-sm font-medium text-slate-800 disabled:opacity-60"
          id={id}
          value={language}
          disabled={disabled}
          onChange={(event) =>
            select(event.target.value as ProgrammingLanguage)
          }
        >
          {PROGRAMMING_LANGUAGES.map((item) => (
            <option value={item} key={item}>
              {LANGUAGE_DETAILS[item].label}
            </option>
          ))}
        </select>
        <span className="text-xs text-slate-500">
          {LANGUAGE_DETAILS[language].runtime}
        </span>
        <span className="ml-auto font-mono text-xs text-slate-400">
          {LANGUAGE_DETAILS[language].filename}
        </span>
      </div>
      <CodeEditor
        value={value}
        language={language}
        disabled={disabled}
        label={`${label} · ${LANGUAGE_DETAILS[language].label}`}
        onChange={(code) => onChange(code, language)}
      />
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
