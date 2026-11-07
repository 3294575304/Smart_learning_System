"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { requestApi } from "@/components/courses/request-api";
import { useNavigationUserId } from "@/components/dashboard/navigation-memory";
import type { PracticeAccountDraft } from "@/services/practice-sets/draft-schemas";
import { parsePracticeDraft } from "@/services/practice-sets/draft-storage";
import {
  canAnswerPractice,
  type PracticeSet,
} from "@/services/practice-sets/types";
import { practiceDraftFilled } from "@/services/practice-sets/submission";

type Snapshot = NonNullable<PracticeAccountDraft["snapshot"]>;

function fingerprint(snapshot: Snapshot) {
  return JSON.stringify([
    snapshot.current,
    Object.entries(snapshot.drafts).sort(),
  ]);
}

export function usePracticeAccountDraft(
  set: PracticeSet,
  explicitQuestion: string | null | undefined,
  selectQuestion: (id: string) => void,
  returnTo: string,
) {
  const userId = useNavigationUserId();
  const endpoint = `/api/student/practice-sets/${encodeURIComponent(set.id)}/draft`;
  const oldKey = `practice-draft:v1:${userId}:${set.id}`;
  const key = `practice-draft:v2:${userId}:${set.id}`;
  const [drafts, setDrafts] = useState<Snapshot["drafts"]>({});
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [conflict, setConflict] = useState<PracticeAccountDraft | null>(null);
  const [inputVersion, setInputVersion] = useState(0);
  const revision = useRef(0);
  const clean = useRef("");
  const sending = useRef(false);
  const leaving = useRef(false);
  const keys = useRef<Record<string, string>>({});

  const write = useCallback(
    (snapshot: Snapshot, expectedRevision: number, signal?: AbortSignal) =>
      requestApi<PracticeAccountDraft>(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...snapshot, expectedRevision }),
        signal,
      }),
    [endpoint],
  );

  const clear = useCallback(
    (storageKey: string) => {
      if (!userId) return;
      try {
        sessionStorage.removeItem(storageKey);
      } catch {
        // Account drafts remain available when browser storage is disabled.
      }
    },
    [userId],
  );

  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;
    const ids = new Set(set.questions.map((q) => q.id));
    const openIds = set.questions
      .filter((q) => canAnswerPractice(q) && !q.judgingStatus)
      .map((q) => q.id);
    const direct =
      explicitQuestion && ids.has(explicitQuestion) ? explicitQuestion : null;
    async function restore() {
      let local: ReturnType<typeof parsePracticeDraft> = null;
      let old: ReturnType<typeof parsePracticeDraft> = null;
      let cached: ReturnType<typeof parsePracticeDraft> = null;
      if (userId && openIds.length) {
        try {
          cached = parsePracticeDraft(
            JSON.parse(sessionStorage.getItem(key) ?? "null"),
            openIds,
          );
          local = cached?.dirty ? cached : null;
          old = parsePracticeDraft(
            JSON.parse(sessionStorage.getItem(oldKey) ?? "null"),
            openIds,
          );
        } catch {
          // Continue with the account draft if local storage cannot be read.
        }
      }
      const response = await requestApi<PracticeAccountDraft>(endpoint, {
        signal,
      });
      if (signal.aborted) return;
      const account = response.success ? response.data : null;
      revision.current = local?.revision ?? account?.revision ?? 0;
      const fallback = local ?? (!account?.snapshot ? old : null);
      keys.current = (cached ?? old)?.keys ?? {};
      const snapshot = account?.snapshot;
      // Local snapshots contain the full editable answer set, including cleared fields.
      setDrafts(
        local
          ? Object.fromEntries([
              ...Object.entries(snapshot?.drafts ?? {}).filter(
                ([id]) => !openIds.includes(id),
              ),
              ...Object.entries(local.drafts),
            ])
          : (snapshot?.drafts ?? fallback?.drafts ?? {}),
      );
      if (account && local && local.revision !== account.revision) {
        setConflict(account);
        setError("草稿已在其他页面更新，请选择要保留的版本。");
      }
      const last = fallback?.current ?? snapshot?.current;
      const selected = direct ?? (last && ids.has(last) ? last : set.entryId);
      if (selected) selectQuestion(selected);
      const editableCloud = Object.fromEntries(
        Object.entries(snapshot?.drafts ?? {}).filter(([id]) =>
          openIds.includes(id),
        ),
      );
      clean.current = fingerprint({ current: selected, drafts: editableCloud });
      if (!response.success)
        setError("无法读取账号草稿，可以继续作答并重试暂存。");
      else if (snapshot) setMessage("已恢复账号草稿。");

      if (
        account &&
        !snapshot &&
        !local &&
        old?.current &&
        Object.values(old.drafts).some(practiceDraftFilled)
      ) {
        const migrated = await write(
          { current: direct ?? old.current, drafts: old.drafts },
          0,
          signal,
        );
        if (signal.aborted) return;
        if (migrated.success) {
          revision.current = migrated.data.revision;
          clean.current = fingerprint({
            current: selected,
            drafts: old.drafts,
          });
          clear(oldKey);
          setMessage("旧草稿已保存到账号。");
        } else setError(`旧草稿已恢复。暂存失败，${migrated.error}`);
      }
      if (!signal.aborted) setReady(true);
    }
    void restore();
    return () => controller.abort();
  }, [
    clear,
    endpoint,
    explicitQuestion,
    key,
    oldKey,
    selectQuestion,
    set.entryId,
    set.questions,
    userId,
    write,
  ]);

  const cache = useCallback(
    (snapshot: Snapshot) => {
      if (!userId || leaving.current) return;
      try {
        sessionStorage.setItem(
          key,
          JSON.stringify({
            ...snapshot,
            at: Date.now(),
            revision: revision.current,
            dirty: fingerprint(snapshot) !== clean.current,
            keys: keys.current,
          }),
        );
      } catch {
        // The explicit save is still available.
      }
    },
    [key, userId],
  );

  async function saveAndExit(snapshot: Snapshot, overwrite = false) {
    if (!ready || sending.current || (conflict && !overwrite)) return;
    sending.current = true;
    setSaving(true);
    setError("");
    try {
      const result = await write(
        snapshot,
        overwrite && conflict ? conflict.revision : revision.current,
      );
      if (result.success) {
        leaving.current = true;
        clear(key);
        clear(oldKey);
        window.location.assign(returnTo);
        return;
      }
      if (result.code === "PRACTICE_DRAFT_CONFLICT") {
        const latest = await requestApi<PracticeAccountDraft>(endpoint);
        if (latest.success) setConflict(latest.data);
      }
      setError(result.error);
    } finally {
      if (!leaving.current) {
        sending.current = false;
        setSaving(false);
      }
    }
  }

  function useServerDraft() {
    if (!conflict || sending.current) return;
    revision.current = conflict.revision;
    if (conflict.snapshot) clean.current = fingerprint(conflict.snapshot);
    else clear(key);
    setDrafts(conflict.snapshot?.drafts ?? {});
    if (conflict.snapshot?.current) selectQuestion(conflict.snapshot.current);
    setInputVersion((version) => version + 1);
    setConflict(null);
    setError("");
    setMessage("已载入服务器草稿。");
  }

  return {
    drafts,
    setDrafts,
    ready,
    saving,
    error,
    message,
    conflict,
    inputVersion,
    keys,
    cache,
    saveAndExit,
    useServerDraft,
  };
}
