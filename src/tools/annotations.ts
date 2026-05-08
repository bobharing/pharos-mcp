export const READ_ONLY_OPEN = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true, // tools access external URLs via Chrome
} as const;
