"use client";

import { useCallback, useSyncExternalStore } from "react";

const preferenceChanged = "zhixue:teacher-assistant:preference-changed";
export const defaultAssistantPosition = { x: 1, y: 0.5 };

export function assistantPositionKey(teacherId: string) {
  return `zhixue:teacher-assistant:position:v1:${teacherId}`;
}

export function subscribeToAssistantPreference(
  key: string,
  onChange: () => void,
) {
  function onStorage(event: StorageEvent) {
    if (
      event.storageArea === window.localStorage &&
      (event.key === key || event.key === null)
    )
      onChange();
  }
  function onLocalChange(event: Event) {
    if (event instanceof CustomEvent && event.detail === key) onChange();
  }

  window.addEventListener("storage", onStorage);
  window.addEventListener(preferenceChanged, onLocalChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(preferenceChanged, onLocalChange);
  };
}

export function saveAssistantPreference(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    return false;
  }
  window.dispatchEvent(new CustomEvent(preferenceChanged, { detail: key }));
  return true;
}

export function resetTeacherAssistantPosition(teacherId: string) {
  return saveAssistantPreference(
    assistantPositionKey(teacherId),
    JSON.stringify(defaultAssistantPosition),
  );
}

export function useTeacherAssistantVisibility(teacherId: string) {
  const key = `zhixue:teacher-assistant:visible:v1:${teacherId}`;
  const subscribe = useCallback(
    (onChange: () => void) => subscribeToAssistantPreference(key, onChange),
    [key],
  );
  const getSnapshot = useCallback(() => {
    try {
      return window.localStorage.getItem(key) !== "off";
    } catch {
      return true;
    }
  }, [key]);
  const visible = useSyncExternalStore(subscribe, getSnapshot, () => true);

  return {
    visible,
    setVisible(next: boolean) {
      return saveAssistantPreference(key, next ? "on" : "off");
    },
  };
}
