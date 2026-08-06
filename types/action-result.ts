export type ActionResult<T> =
  | {
      success: true;
      data: T;
    }
  | {
      success: false;
      error: string;
      status: number;
      code?: string;
      fieldErrors?: Record<string, string[]>;
    };
