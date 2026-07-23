import type { ActionResult } from "@/types/action-result";
import type { WrongQuestionPracticeInput } from "@/services/wrong-questions/schemas";
import type {
  WrongQuestionMasteryResult,
  WrongQuestionPracticeResult,
} from "@/services/wrong-questions/types";

export const WRONG_QUESTIONS_API_PATH = "/api/student/wrong-questions";

export function wrongQuestionApiPath(wrongQuestionId: string): string {
  return `${WRONG_QUESTIONS_API_PATH}/${encodeURIComponent(wrongQuestionId)}`;
}

export function wrongQuestionPracticeApiPath(wrongQuestionId: string): string {
  return `${wrongQuestionApiPath(wrongQuestionId)}/practice`;
}

interface RequestOptions {
  fetchImplementation?: typeof fetch;
}

function isApiEnvelope(value: unknown): value is {
  success: boolean;
  data?: unknown;
  error?: unknown;
  fieldErrors?: unknown;
} {
  return typeof value === "object" && value !== null && "success" in value;
}

async function requestWrongQuestionApi<T>(
  input: RequestInfo | URL,
  init: RequestInit,
  options: RequestOptions = {},
): Promise<ActionResult<T>> {
  const fetchImplementation = options.fetchImplementation ?? fetch;
  try {
    const response = await fetchImplementation(input, init);
    const body: unknown = await response.json();
    if (!isApiEnvelope(body)) {
      return {
        success: false,
        error: "错题本服务返回异常，请稍后重试",
        status: response.status,
      };
    }
    if (body.success === true && "data" in body) {
      return { success: true, data: body.data as T };
    }
    return {
      success: false,
      error:
        typeof body.error === "string"
          ? body.error
          : "错题本服务暂时不可用，请稍后重试",
      status: response.status,
      ...(typeof body.fieldErrors === "object" && body.fieldErrors !== null
        ? { fieldErrors: body.fieldErrors as Record<string, string[]> }
        : {}),
    };
  } catch {
    return {
      success: false,
      error: "网络连接异常，请稍后重试",
      status: 0,
    };
  }
}

export function updateWrongQuestionMasteryRequest(
  wrongQuestionId: string,
  isMastered: boolean,
  options: RequestOptions = {},
): Promise<ActionResult<WrongQuestionMasteryResult>> {
  return requestWrongQuestionApi<WrongQuestionMasteryResult>(
    wrongQuestionApiPath(wrongQuestionId),
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isMastered }),
    },
    options,
  );
}

export function practiceWrongQuestionRequest(
  wrongQuestionId: string,
  input: WrongQuestionPracticeInput,
  options: RequestOptions = {},
): Promise<ActionResult<WrongQuestionPracticeResult>> {
  return requestWrongQuestionApi<WrongQuestionPracticeResult>(
    wrongQuestionPracticeApiPath(wrongQuestionId),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    },
    options,
  );
}
