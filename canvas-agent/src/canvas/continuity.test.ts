import assert from "node:assert/strict";
import { test } from "node:test";
import { validateStoryContinuity } from "./session.js";
import type { CanvasSnapshot } from "./types.js";

const base = (
  nodes: CanvasSnapshot["nodes"],
  connections: CanvasSnapshot["connections"] = [],
): CanvasSnapshot => ({
  projectId: "project-1",
  title: "Demo",
  nodes,
  connections,
  selectedNodeIds: [],
  viewport: { x: 0, y: 0, zoom: 1 },
});

test("continuity reports an isolated shot and missing character relation", () => {
  const result = validateStoryContinuity(
    base([
      {
        id: "shot",
        type: "manju:shot",
        title: "Shot",
        position: { x: 0, y: 0 },
        metadata: { content: "A shot", aspectRatio: "16:9" },
      },
    ]),
    {},
  );
  assert.equal(result.valid, false);
  assert.deepEqual(
    result.issues.map((issue) => issue.issue),
    ["镜头未连接到场景或剧集", "镜头未关联角色设定"],
  );
});

test("continuity accepts a shot with episode, scene, and character context", () => {
  const nodes = [
    {
      id: "episode",
      type: "manju:episode",
      title: "E1",
      position: { x: 0, y: 0 },
      metadata: {},
    },
    {
      id: "scene",
      type: "manju:scene",
      title: "Room",
      position: { x: 0, y: 0 },
      metadata: { location: "Room", content: "Interior" },
    },
    {
      id: "character",
      type: "manju:character",
      title: "Hero",
      position: { x: 0, y: 0 },
      metadata: { content: "Hero appearance" },
    },
    {
      id: "shot",
      type: "manju:shot",
      title: "Shot",
      position: { x: 0, y: 0 },
      metadata: { content: "Hero enters", aspectRatio: "16:9" },
    },
  ];
  const connections = [
    { fromNodeId: "episode", toNodeId: "scene" },
    { fromNodeId: "scene", toNodeId: "shot" },
    { fromNodeId: "character", toNodeId: "shot" },
  ];
  const result = validateStoryContinuity(base(nodes, connections), {
    nodeIds: ["shot"],
  });
  assert.equal(result.valid, true);
  assert.equal(result.checkedNodes, 1);
});
