export type ActionResult<T> =
  | {
      success: true;
      data: T;
    }
  | {
      success: false;
      error: string;
      status: number;
      fieldErrors?: Record<string, string[]>;
    };
