#!/usr/bin/env node

import { readFile } from "node:fs/promises";

const configPath = `${process.env.HOME}/.infinite-canvas/canvas-agent.json`;
const config = JSON.parse(await readFile(configPath, "utf8"));
const endpoint = process.env.MCP_HTTP_URL || "http://127.0.0.1:8787/mcp";
const headers = {
  "content-type": "application/json",
  accept: "application/json, text/event-stream",
  "x-canvas-agent-token": config.token,
};

let requestId = 0;
const retryableConnectionError = (error) => /没有已连接画布|没有已连接网页|未连接|not connected|no connected canvas/i.test(String(error?.message || error));
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function call(name, args) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: ++requestId,
          method: "tools/call",
          params: { name, arguments: args },
        }),
      });
      const raw = await response.text();
      const line = raw.split("\n").find((item) => item.startsWith("data: "));
      if (!line) throw new Error(`${name}: MCP returned no data`);
      const envelope = JSON.parse(line.slice(6));
      if (envelope.error) throw new Error(`${name}: ${JSON.stringify(envelope.error)}`);
      const text = envelope.result?.content?.[0]?.text || "{}";
      return JSON.parse(text);
    } catch (error) {
      if (!retryableConnectionError(error) || attempt === 4) throw error;
      await delay(250 * (attempt + 1));
    }
  }
  throw new Error(`${name}: MCP request exhausted retries`);
}

function descendants(state, rootId) {
  const ids = new Set([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const connection of state.connections || []) {
      if (ids.has(connection.fromNodeId) && !ids.has(connection.toNodeId)) {
        ids.add(connection.toNodeId);
        changed = true;
      }
    }
  }
  return ids;
}

const title = `MCP smoke ${new Date().toISOString()}`;
await call("canvas_get_protocol_info", {});
await call("canvas_get_capabilities", {});
const createdEpisodeState = await call("story_create_episode", { title, episodeNumber: 1, aspectRatio: "16:9" });
let state = createdEpisodeState;
let episode = state.nodes.find((node) => node.type === "manju:episode" && node.title === title);
for (let attempt = 0; attempt < 8 && !episode; attempt += 1) {
  state = await call("canvas_get_state", {});
  episode = state.nodes.find((node) => node.type === "manju:episode" && node.title === title);
  if (!episode) await delay(100 * (attempt + 1));
}
if (!episode) throw new Error("smoke episode was not created");

await call("story_parse_script", {
  episodeNodeId: episode.id,
  script: "场景：旧城天台·夜\n林夏握紧一封信，望向远处的灯火。\n她低声说：我终于回来了。",
});
await call("story_create_characters", {
  episodeNodeId: episode.id,
  characters: [{ name: `林夏-${Date.now()}`, description: "黑色长发，米色风衣，手持旧信封。" }],
});
state = await call("canvas_get_state", {});
const ids = descendants(state, episode.id);
const shots = state.nodes.filter((node) => ids.has(node.id) && node.type === "manju:shot");
const characters = state.nodes.filter((node) => ids.has(node.id) && node.type === "manju:character");
for (const character of characters) {
  await call("canvas_connect_nodes", { connections: shots.map((shot) => ({ fromNodeId: character.id, toNodeId: shot.id })) });
}

const validation = await call("story_validate_continuity", { nodeIds: [episode.id, ...shots.map((shot) => shot.id), ...characters.map((character) => character.id)] });
const status = await call("story_get_project_status", { episodeNodeId: episode.id });
const manifest = await call("story_export_episode", { episodeNodeId: episode.id, format: "manifest" });
if (!validation.valid) throw new Error(`continuity validation failed: ${JSON.stringify(validation.issues)}`);
if (manifest.ready) throw new Error("export preflight unexpectedly passed without assets or review");

console.log(JSON.stringify({
  ok: true,
  episodeId: episode.id,
  counts: status.counts,
  continuity: "passed",
  exportPreflight: { ready: manifest.ready, issueTypes: [...new Set(manifest.issues.map((issue) => issue.type))] },
}, null, 2));

if (process.env.SMOKE_KEEP !== "1") {
  const cleanupState = await call("canvas_get_state", {});
  const cleanupIds = [...descendants(cleanupState, episode.id)];
  const ownedCharacters = cleanupState.nodes
    .filter((node) => node.type === "manju:character" && node.title.startsWith("林夏-") && cleanupIds.includes(node.id))
    .map((node) => node.id);
  const ids = [...new Set([...cleanupIds, ...ownedCharacters])];
  if (ids.length) await call("canvas_delete_nodes", { ids });
  console.log(`Cleaned up ${ids.length} smoke nodes. Use SMOKE_KEEP=1 to keep them.`);
}
