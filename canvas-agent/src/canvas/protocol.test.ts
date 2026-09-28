import assert from "node:assert/strict";
import { test } from "node:test";

import { canvasCapabilities, CANVAS_PROTOCOL_VERSION } from "./protocol.js";

test("advertises an agent-neutral canvas protocol", () => {
  const capabilities = canvasCapabilities(["text", "manju:shot"]);
  assert.equal(capabilities.protocolVersion, CANVAS_PROTOCOL_VERSION);
  assert.equal(capabilities.agentNeutral, true);
  assert.equal(capabilities.confirmationRequired, true);
  assert.deepEqual(capabilities.supportedTransports, [
    "stdio",
    "streamable-http",
  ]);
  assert.deepEqual(capabilities.supportedNodeTypes, ["text", "manju:shot"]);
});
