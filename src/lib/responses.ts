export function errorResponse(errorType: string, context: Record<string, unknown>, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: errorType, message, ...context }) }],
    isError: true as const,
  };
}

export function successResponse(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
  };
}
