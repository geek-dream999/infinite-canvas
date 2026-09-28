import assert from "node:assert/strict";
import { test } from "node:test";
import { exportStoryEpisode } from "./session.js";
import type { CanvasSnapshot } from "./types.js";

function snapshot(
  overrides: CanvasSnapshot["nodes"] = [],
  connections: CanvasSnapshot["connections"] = [],
): CanvasSnapshot {
  return {
    projectId: "project-1",
    title: "Demo episode",
    nodes: overrides as CanvasSnapshot["nodes"],
    connections,
    selectedNodeIds: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

test("export preflight reports missing assets and review", () => {
  const episode = {
    id: "episode-1",
    type: "manju:episode",
    title: "E1",
    position: { x: 0, y: 0 },
    metadata: { aspectRatio: "16:9" },
  };
  const shot = {
    id: "shot-1",
    type: "manju:shot",
    title: "Shot 1",
    position: { x: 0, y: 0 },
    metadata: { shotNumber: 1, reviewStatus: "pending" },
  };
  const result = exportStoryEpisode(
    snapshot(
      [episode, shot],
      [{ fromNodeId: "episode-1", toNodeId: "shot-1" }],
    ),
    { episodeNodeId: "episode-1" },
  );
  assert.equal(result.ready, false);
  assert.deepEqual(
    result.issues.map((issue) => issue.type),
    ["missing-assets", "review-required"],
  );
});

test("export preflight accepts reviewed completed shots", () => {
  const episode = {
    id: "episode-1",
    type: "manju:episode",
    title: "E1",
    position: { x: 0, y: 0 },
    metadata: { aspectRatio: "16:9" },
  };
  const shot = {
    id: "shot-1",
    type: "manju:shot",
    title: "Shot 1",
    position: { x: 0, y: 0 },
    metadata: { shotNumber: 1, reviewStatus: "approved" },
  };
  const asset = {
    id: "video-1",
    type: "video",
    title: "Shot 1·video",
    position: { x: 0, y: 0 },
    metadata: { sourceShotId: "shot-1", generationStatus: "succeeded" },
  };
  const result = exportStoryEpisode(
    snapshot(
      [episode, shot, asset],
      [
        { fromNodeId: "episode-1", toNodeId: "shot-1" },
        { fromNodeId: "shot-1", toNodeId: "video-1" },
      ],
    ),
    { episodeNodeId: "episode-1" },
  );
  assert.equal(result.ready, true);
  assert.equal(result.aspectRatio, "16:9");
  assert.equal(result.totalDurationSeconds, 4);
  assert.equal(result.timeline[0]?.assets[0]?.nodeId, "video-1");
});
