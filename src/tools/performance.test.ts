import { describe, it, expect, mock } from "bun:test";
import { registerPerformanceTools } from "./performance";

// Mock the MCP server
const mockServer = {
  registerTool: mock(),
};

describe("tools/performance", () => {
  it("should register performance tools without errors", () => {
    expect(() => {
      registerPerformanceTools(mockServer as any);
    }).not.toThrow();

    // Verify that tools were registered
    expect(mockServer.registerTool).toHaveBeenCalledTimes(4); // pharos_performance, pharos_core_web_vitals, pharos_compare_devices, pharos_lcp

    // Verify tool names
    const toolCalls = mockServer.registerTool.mock.calls;
    expect(toolCalls[0][0]).toBe("pharos_performance");
    expect(toolCalls[1][0]).toBe("pharos_core_web_vitals");
    expect(toolCalls[2][0]).toBe("pharos_compare_devices");
    expect(toolCalls[3][0]).toBe("pharos_lcp");
  });
});
