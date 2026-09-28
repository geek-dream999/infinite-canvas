import assert from "node:assert/strict";
import { test } from "node:test";

import { buildCanvasToolRequest } from "./operations.js";

function opsOf(name: Parameters<typeof buildCanvasToolRequest>[0], input: Record<string, unknown>) {
    const request = buildCanvasToolRequest(name, input, null);
    return (request.input as { ops: Array<Record<string, any>> }).ops;
}

test("generation flow reuses referenced nodes when the prompt only mentions them", () => {
    const ops = opsOf("canvas_generate_image", { prompt: "@[node:text-1]", referenceNodeIds: ["text-1"], title: "Flow", autoRun: true });
    const addedTextNodes = ops.filter((op) => op.type === "add_node" && op.nodeType === "text");
    const config = ops.find((op) => op.type === "add_node" && op.nodeType === "config");
    const runs = ops.filter((op) => op.type === "run_generation");
    assert.equal(addedTextNodes.length, 0);
    assert.equal(ops.filter((op) => op.type === "connect_nodes" && op.fromNodeId === "text-1" && String(op.toNodeId).startsWith("config-")).length, 1);
    assert.match(String(config?.metadata?.prompt), /^@\[node:text-1\]$/);
    assert.equal(runs.length, 1);
});

test("generation flow still creates a prompt node for prose prompts", () => {
    const ops = opsOf("canvas_generate_image", { prompt: "a cat on a roof", referenceNodeIds: ["text-1"], autoRun: true });
    assert.equal(ops.filter((op) => op.type === "add_node" && op.nodeType === "text").length, 1);
    const config = ops.find((op) => op.type === "add_node" && op.nodeType === "config");
    assert.match(String(config?.metadata?.prompt), /@\[node:text-/);
});

test("creates an episode node with horizontal aspect ratio", () => {
    const ops = opsOf("story_create_episode", { title: "Episode 1", script: "A scene", aspectRatio: "16:9" });
    assert.equal(ops[0].nodeType, "manju:episode");
    assert.equal(ops[0].metadata.aspectRatio, "16:9");
});

test("creates image and video assets connected to a shot", () => {
    const state = { projectId: "p", title: "p", nodes: [{ id: "shot-1", type: "manju:shot", title: "Shot 1", position: { x: 0, y: 0 }, width: 300, height: 200, metadata: { content: "hero enters" } }], connections: [], selectedNodeIds: [], viewport: { x: 0, y: 0, k: 1 } };
    const request = buildCanvasToolRequest("story_generate_shot_assets", { shotNodeIds: ["shot-1"], kinds: ["image", "video"] }, state);
    const ops = (request.input as { ops: Array<Record<string, any>> }).ops;
    assert.equal(ops.filter((op) => op.type === "add_node").length, 2);
    assert.equal(ops.filter((op) => op.type === "connect_nodes").length, 2);
    assert.deepEqual(ops.filter((op) => op.type === "run_generation").map((op) => op.mode), ["image", "video"]);
});

test("injects upstream character and scene constraints into shot assets", () => {
    const state = { projectId: "p", title: "p", nodes: [
        { id: "shot-1", type: "manju:shot", title: "Shot 1", position: { x: 0, y: 0 }, width: 300, height: 200, metadata: { content: "hero enters" } },
        { id: "character-1", type: "manju:character", title: "Hero", position: { x: 0, y: 0 }, width: 300, height: 200, metadata: { content: "red coat, silver hair" } },
        { id: "scene-1", type: "manju:scene", title: "Rooftop", position: { x: 0, y: 0 }, width: 300, height: 200, metadata: { location: "rooftop", timeOfDay: "night", mood: "tense" } },
    ], connections: [{ id: "c1", fromNodeId: "character-1", toNodeId: "shot-1" }, { id: "c2", fromNodeId: "scene-1", toNodeId: "shot-1" }], selectedNodeIds: [], viewport: { x: 0, y: 0, k: 1 } };
    const request = buildCanvasToolRequest("story_generate_shot_assets", { shotNodeIds: ["shot-1"], kinds: ["image"] }, state);
    const image = (request.input as { ops: Array<Record<string, any>> }).ops.find((op) => op.nodeType === "image");
    assert.match(String(image?.metadata?.prompt), /red coat/);
    assert.match(String(image?.metadata?.prompt), /rooftop/);
    assert.deepEqual(image?.metadata?.inheritedNodeIds, ["character-1", "scene-1"]);
});

test("parses scenes and connects shots to the episode graph", () => {
    const ops = opsOf("story_parse_script", { episodeNodeId: "episode-1", script: "场景：客厅\n主角推门进入\n场景：屋顶\n两人对视" });
    assert.equal(ops.filter((op) => op.nodeType === "manju:scene").length, 2);
    assert.equal(ops.filter((op) => op.nodeType === "manju:shot").length, 2);
    assert.equal(ops.filter((op) => op.type === "connect_nodes").length, 4);
});

test("infers a default scene when a short script has no scene heading", () => {
  const ops = opsOf("story_parse_script", {
    episodeNodeId: "episode-1",
    script: "夜。旧城天台。林夏望向远处的灯火。",
  });
  const nodes = ops.filter((op: any) => op.type === "add_node");
  const scene = nodes.find((op: any) => op.nodeType === "manju:scene");
  const shot = nodes.find((op: any) => op.nodeType === "manju:shot");
  assert.ok(scene);
  assert.ok(shot);
  assert.deepEqual(
    ops.filter((op: any) => op.type === "connect_nodes"),
    [
      { type: "connect_nodes", fromNodeId: "episode-1", toNodeId: scene.id },
      { type: "connect_nodes", fromNodeId: scene.id, toNodeId: shot.id },
    ],
  );
});

test("attaches characters and scenes to the episode graph when requested", () => {
  const characterOps = opsOf("story_create_characters", { episodeNodeId: "episode-1", characters: [{ name: "林夏", description: "米色风衣" }] });
  const sceneOps = opsOf("story_create_scenes", { episodeNodeId: "episode-1", scenes: [{ name: "天台", location: "旧城天台" }] });
  assert.equal(characterOps.filter((op: any) => op.type === "connect_nodes" && op.fromNodeId === "episode-1").length, 1);
  assert.equal(sceneOps.filter((op: any) => op.type === "connect_nodes" && op.fromNodeId === "episode-1").length, 1);
});
