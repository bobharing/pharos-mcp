import { describe, it, expect, mock } from "bun:test";
import { registerSecurityTools } from "./security";

// Mock the MCP server
const mockServer = {
  registerTool: mock(),
};

describe("tools/security", () => {
  it("should register security tools without errors", () => {
    expect(() => {
      registerSecurityTools(mockServer as any);
    }).not.toThrow();

    // Verify that tools were registered
    expect(mockServer.registerTool).toHaveBeenCalledTimes(1); // pharos_security

    // Verify tool names
    const toolCalls = mockServer.registerTool.mock.calls;
    expect(toolCalls[0][0]).toBe("pharos_security");
  });
});
