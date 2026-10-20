import { z } from "zod";

const problemSchema = z.object({
  status: z.number().optional(),
  code: z.string().optional(),
  detail: z.string().optional(),
  title: z.string().optional(),
  fieldErrors: z.array(z.object({ field: z.string(), message: z.string() })).optional(),
});

export type FieldError = { field: string; message: string };

const FALLBACK_MESSAGE = "Không thể xử lý yêu cầu. Vui lòng thử lại.";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fieldErrors: FieldError[];

  constructor(status: number, code: string, message: string, fieldErrors: FieldError[] = []) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

export async function toApiError(response: Response): Promise<ApiError> {
  const body: unknown = await response.json().catch(() => null);
  const problem = problemSchema.safeParse(body);
  if (!problem.success) {
    return new ApiError(response.status, `HTTP_${response.status}`, FALLBACK_MESSAGE);
  }
  const { code, detail, title, fieldErrors } = problem.data;
  return new ApiError(
    response.status,
    code ?? `HTTP_${response.status}`,
    detail ?? title ?? FALLBACK_MESSAGE,
    fieldErrors ?? [],
  );
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return FALLBACK_MESSAGE;
}
