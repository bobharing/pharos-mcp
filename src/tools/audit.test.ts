import { describe, it, expect, mock } from "bun:test";
import { registerAuditTools } from "./audit";

// Mock the MCP server
const mockServer = {
  registerTool: mock(),
};

describe("tools/audit", () => {
  it("should register audit tools without errors", () => {
    expect(() => {
      registerAuditTools(mockServer as any);
    }).not.toThrow();

    // Verify that tools were registered
    expect(mockServer.registerTool).toHaveBeenCalledTimes(1); // pharos_audit

    // Verify tool names
    const toolCalls = mockServer.registerTool.mock.calls;
    expect(toolCalls[0][0]).toBe("pharos_audit");
  });
});
