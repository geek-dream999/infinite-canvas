import { toolNames } from "./schemas.js";

export const CANVAS_PROTOCOL_VERSION = "1.0";

export type CanvasAgentProvider =
  "codex" | "claude" | "deepseek-harness" | "gemini" | "custom";

export type CanvasCapabilities = {
  protocolVersion: string;
  agentNeutral: true;
  supportedTransports: Array<"stdio" | "streamable-http">;
  confirmationRequired: true;
  supportedTools: readonly string[];
  supportedNodeTypes: string[];
  supportedGenerationModes: Array<"text" | "image" | "video" | "audio">;
};

export function canvasCapabilities(
  nodeTypes: string[] = [],
): CanvasCapabilities {
  return {
    protocolVersion: CANVAS_PROTOCOL_VERSION,
    agentNeutral: true,
    supportedTransports: ["stdio", "streamable-http"],
    confirmationRequired: true,
    supportedTools: toolNames,
    supportedNodeTypes: nodeTypes,
    supportedGenerationModes: ["text", "image", "video", "audio"],
  };
}
