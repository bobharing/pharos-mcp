export function errorResponse(errorType: string, context: Record<string, unknown>, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: errorType, message, ...context }) }],
    isError: true as const,
  };
}

export function successResponse(data: unknown, warnings?: string[], runtimeError?: { code: string; message: string }) {
  if (!warnings?.length && !runtimeError) {
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data) }],
    };
  }
  const base = (typeof data === "object" && data !== null ? data : { result: data }) as Record<string, unknown>;
  const payload: Record<string, unknown> = { ...base };
  if (warnings?.length) payload.warnings = warnings;
  if (runtimeError) payload.runtimeError = runtimeError;
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload) }],
  };
}
