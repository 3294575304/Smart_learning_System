"use client";

import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import { python } from "@codemirror/lang-python";
import {
  bracketMatching,
  HighlightStyle,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language";
import { Compartment, EditorState } from "@codemirror/state";
import {
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";

/**
 * Python 代码编辑器。
 *
 * 深色台面沿用答题页原有的代码块视觉（`#0e1c2b`），在此之上补行号、语法高亮、
 * 括号匹配、当前行高亮和 Tab 缩进——这几项正是纯 textarea 最缺的部分。
 *
 * `toolbar` 是右槽位，用来把「运行样例」这类主操作并进编辑器顶栏，
 * 避免按钮和它作用的代码块在视觉上分离。
 */
const TOKEN_COLORS = HighlightStyle.define([
  { tag: tags.keyword, color: "#c792ea" },
  { tag: [tags.string, tags.character], color: "#a5e075" },
  { tag: [tags.number, tags.bool, tags.null], color: "#f78c6c" },
  { tag: tags.comment, color: "#6b8299", fontStyle: "italic" },
  {
    tag: [tags.function(tags.variableName), tags.function(tags.propertyName)],
    color: "#82aaff",
  },
  { tag: [tags.typeName, tags.className], color: "#7fdbca" },
  { tag: tags.operator, color: "#89ddff" },
  { tag: tags.meta, color: "#ffcb6b" },
]);

const EDITOR_THEME = EditorView.theme(
  {
    "&": {
      backgroundColor: "#0e1c2b",
      color: "#e2e8f0",
      fontSize: "14px",
    },
    ".cm-scroller": {
      fontFamily: "Consolas, 'Courier New', monospace",
      lineHeight: "1.75",
      overflow: "auto",
      minHeight: "288px",
      maxHeight: "560px",
    },
    ".cm-content": {
      padding: "14px 0",
      minHeight: "288px",
      caretColor: "#7dd3fc",
    },
    ".cm-line": { padding: "0 14px" },
    ".cm-gutters": {
      backgroundColor: "#0b1622",
      color: "#64748b",
      borderRight: "1px solid #1e3a52",
      // CodeMirror 会按内容高度写内联最小值，短代码时仍需撑满编辑区。
      minHeight: "288px !important",
      userSelect: "none",
    },
    ".cm-lineNumbers": {
      minWidth: "3em",
      fontVariantNumeric: "tabular-nums",
    },
    ".cm-lineNumbers .cm-gutterElement": {
      padding: "0 10px 0 8px",
      textAlign: "right",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "#162a3e",
      color: "#7dd3fc",
    },
    ".cm-activeLine": { backgroundColor: "rgba(125, 211, 252, 0.06)" },
    "&.cm-focused": { outline: "2px solid #38bdf8", outlineOffset: "-2px" },
  },
  { dark: true },
);

export function PythonCodeEditor({
  value,
  onChange,
  disabled = false,
  toolbar,
  label = "Python 代码",
  onRun,
  progress,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  toolbar?: ReactNode;
  label?: string;
  /** Ctrl/Cmd + Enter 触发，写代码时比挪鼠标点按钮快得多。 */
  onRun?: () => void;
  /** 0-100；有值时在顶栏下方显示一条进度线。 */
  progress?: number | null;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const callback = useRef(onChange);
  callback.current = onChange;
  const runRef = useRef(onRun);
  runRef.current = onRun;
  const initial = useRef({ value, disabled, label });
  const compartments = useRef({
    editable: new Compartment(),
    label: new Compartment(),
  });

  useEffect(() => {
    if (!host.current) return;
    const config = compartments.current;
    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: initial.current.value,
        extensions: [
          lineNumbers(),
          history(),
          keymap.of([
            {
              key: "Mod-Enter",
              run: () => {
                runRef.current?.();
                return true;
              },
            },
            ...defaultKeymap,
            ...historyKeymap,
            indentWithTab,
          ]),
          bracketMatching(),
          indentOnInput(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          syntaxHighlighting(TOKEN_COLORS),
          EditorState.tabSize.of(4),
          python(),
          config.editable.of([
            EditorState.readOnly.of(initial.current.disabled),
            EditorView.editable.of(!initial.current.disabled),
          ]),
          config.label.of(
            EditorView.contentAttributes.of({
              "aria-label": initial.current.label,
              spellcheck: "false",
              autocapitalize: "off",
              autocorrect: "off",
            }),
          ),
          EditorView.updateListener.of((update) => {
            if (update.docChanged)
              callback.current(update.state.doc.toString());
          }),
          EDITOR_THEME,
        ],
      }),
    });
    view.current = editor;
    return () => {
      editor.destroy();
      view.current = null;
    };
  }, []);

  useEffect(() => {
    const editor = view.current;
    if (editor && editor.state.doc.toString() !== value)
      editor.dispatch({
        changes: { from: 0, to: editor.state.doc.length, insert: value },
      });
  }, [value]);

  useEffect(() => {
    view.current?.dispatch({
      effects: compartments.current.editable.reconfigure([
        EditorState.readOnly.of(disabled),
        EditorView.editable.of(!disabled),
      ]),
    });
  }, [disabled]);

  useEffect(() => {
    view.current?.dispatch({
      effects: compartments.current.label.reconfigure(
        EditorView.contentAttributes.of({
          "aria-label": label,
          spellcheck: "false",
          autocapitalize: "off",
          autocorrect: "off",
        }),
      ),
    });
  }, [label]);

  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-[#162a3e] px-3 py-2">
        <div className="flex items-center gap-2 font-mono text-xs text-slate-300">
          <span>main.py</span>
          <span className="rounded bg-white/10 px-1.5 py-0.5 text-[11px] text-slate-400">
            Python 3
          </span>
        </div>
        {toolbar ? (
          <div className="flex flex-wrap items-center gap-2">{toolbar}</div>
        ) : null}
      </div>
      {typeof progress === "number" ? (
        <div className="h-0.5 w-full bg-sky-950" role="presentation">
          <div
            className="h-full bg-sky-400 transition-[width] duration-300"
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      ) : null}
      <div className={`min-w-0 ${disabled ? "opacity-70" : ""}`} ref={host} />
    </div>
  );
}
