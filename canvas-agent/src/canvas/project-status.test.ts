import assert from "node:assert/strict";
import { test } from "node:test";
import { getStoryProjectStatus } from "./session.js";
import type { CanvasSnapshot } from "./types.js";

const snapshot = (
  nodes: CanvasSnapshot["nodes"],
  connections: CanvasSnapshot["connections"],
): CanvasSnapshot => ({
  projectId: "project-1",
  title: "Demo",
  nodes,
  connections,
  selectedNodeIds: [],
  viewport: { x: 0, y: 0, zoom: 1 },
});

test("project status scopes counts to the selected episode graph", () => {
  const nodes = [
    {
      id: "episode",
      type: "manju:episode",
      title: "E1",
      position: { x: 0, y: 0 },
      metadata: { aspectRatio: "16:9" },
    },
    {
      id: "shot",
      type: "manju:shot",
      title: "Shot 1",
      position: { x: 0, y: 0 },
      metadata: { reviewStatus: "approved" },
    },
    {
      id: "asset",
      type: "video",
      title: "Video",
      position: { x: 0, y: 0 },
      metadata: { sourceShotId: "shot", generationStatus: "succeeded" },
    },
    {
      id: "other-shot",
      type: "manju:shot",
      title: "Other",
      position: { x: 0, y: 0 },
      metadata: {},
    },
  ];
  const result = getStoryProjectStatus(
    snapshot(nodes, [
      { fromNodeId: "episode", toNodeId: "shot" },
      { fromNodeId: "shot", toNodeId: "asset" },
    ]),
    { episodeNodeId: "episode" },
  );
  assert.deepEqual(result.counts, {
    episodes: 1,
    scenes: 0,
    characters: 0,
    shots: 1,
    assets: 1,
    approvedShots: 1,
    completedAssets: 1,
    failedAssets: 0,
  });
  assert.equal(result.readyForExport, true);
});

test("project status exposes failed assets as not ready", () => {
  const nodes = [
    {
      id: "episode",
      type: "manju:episode",
      title: "E1",
      position: { x: 0, y: 0 },
      metadata: {},
    },
    {
      id: "shot",
      type: "manju:shot",
      title: "Shot 1",
      position: { x: 0, y: 0 },
      metadata: { reviewStatus: "approved" },
    },
    {
      id: "asset",
      type: "image",
      title: "Image",
      position: { x: 0, y: 0 },
      metadata: { sourceShotId: "shot", generationStatus: "failed" },
    },
  ];
  const result = getStoryProjectStatus(
    snapshot(nodes, [
      { fromNodeId: "episode", toNodeId: "shot" },
      { fromNodeId: "shot", toNodeId: "asset" },
    ]),
    { episodeNodeId: "episode" },
  );
  assert.equal(result.counts.failedAssets, 1);
  assert.equal(result.readyForExport, false);
});
