import { describe, it, expect, mock } from "bun:test";
import { registerAnalysisTools } from "./analysis";

// Mock the MCP server
const mockServer = {
  registerTool: mock(),
};

describe("tools/analysis", () => {
  it("should register analysis tools without errors", () => {
    expect(() => {
      registerAnalysisTools(mockServer as any);
    }).not.toThrow();

    // Verify that tools were registered
    expect(mockServer.registerTool).toHaveBeenCalledTimes(3); // pharos_unused_js, pharos_resources, pharos_third_parties

    // Verify tool names
    const toolCalls = mockServer.registerTool.mock.calls;
    expect(toolCalls[0][0]).toBe("pharos_unused_js");
    expect(toolCalls[1][0]).toBe("pharos_resources");
    expect(toolCalls[2][0]).toBe("pharos_third_parties");
  });
});
