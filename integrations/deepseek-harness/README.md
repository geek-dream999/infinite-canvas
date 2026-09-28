# DeepSeek Harness integration

DeepSeek Harness can load the Infinite Canvas MCP server through its official
`@deepseek-ai/dsh-mcp-client` plugin.

## Start

For local development, start both the canvas and its MCP bridge with one
command:

```bash
node scripts/start-platform.mjs
```

The canvas listens on `http://localhost:3000` and the Streamable HTTP MCP
bridge listens on `http://127.0.0.1:8787/mcp`.

The company startup script keeps the local Canvas Agent HTTP bridge running and
also starts the agent-neutral MCP gateway:

```bash
node scripts/start-platform.mjs
```

Then start DeepSeek Harness with the overlay:

```bash
npx @deepseek-ai/dsh web \
  --patch /Users/liuyahui/codes/projects/infinite-canvas-company/integrations/deepseek-harness/cordis.yml
```

Open `http://127.0.0.1:3080/`, create a new session, and wait for the tools
whose names start with `mcp__infinite-canvas__` to appear. Ask the Harness:

```text
读取当前 Infinite Canvas 画布，创建一个横屏漫剧单集，并检查画布中的连续性问题。
```

## Tool flow

The DSH MCP client launches the stdio server and exposes the canvas tools as:

```text
mcp__infinite-canvas__canvas_get_state
mcp__infinite-canvas__story_create_episode
mcp__infinite-canvas__story_parse_script
mcp__infinite-canvas__story_generate_shot_assets
mcp__infinite-canvas__story_validate_continuity
```

The first calls an Agent should make are `canvas_get_protocol_info`,
`canvas_get_capabilities`, and `canvas_get_state`. This keeps the integration
independent from Codex-specific threads or UI assumptions.

For a single-episode production run, use this tool order:

```text
canvas_get_state
story_create_episode
story_parse_script
story_validate_continuity
story_generate_shot_assets
generation_get_status
story_get_project_status
story_review_shot
story_export_episode
```

`story_validate_continuity` returns actionable `suggestedAction` values for
missing metadata or graph edges. `story_export_episode` returns `ready: false`
and structured `issues` until all shot assets are complete and reviewed.

The MCP server still talks to the already-connected browser through the local
Canvas Agent HTTP bridge. The DSH Web UI at port 3080 is only the Harness UI;
it is not the canvas bridge endpoint.

## Remote Agent connection

For Claude Desktop, Gemini-based clients, Cursor, or an internal Agent that
supports Streamable HTTP MCP, start the gateway instead:

```bash
MCP_HTTP_PORT=8787 node /Users/liuyahui/codes/projects/infinite-canvas-company/canvas-agent/dist/index.js mcp-http
```

Use `http://127.0.0.1:8787/mcp` as the MCP endpoint and send either
`Authorization: Bearer <canvas-agent-token>` or
`x-canvas-agent-token: <canvas-agent-token>`. The gateway keeps the same
confirmation and browser-canvas authority model as the stdio integration.

The same endpoint can be used by any MCP-compatible Agent. A generic client
configuration example is available at
`integrations/mcp-client-config.example.json`.

Provider configuration is intentionally separate from canvas data. Start from
`integrations/provider-config.example.json`, keep secrets in environment

For SuperToken, use `integrations/supertoken-provider-config.json` and set
capability-scoped keys locally: `SUPERTOKEN_VIDEO_API_KEY`,
`SUPERTOKEN_IMAGE_API_KEY`, and `SUPERTOKEN_TEXT_API_KEY`. The
OpenAI-compatible gateway is
`https://api.supertoken.cc/v1`; never commit the key or paste it into chat.
variables, and expose only provider IDs and model names to the browser.

For production, prefer separate capability keys when the provider account uses
different permissions: `SUPERTOKEN_VIDEO_API_KEY`, `SUPERTOKEN_IMAGE_API_KEY`,
and `SUPERTOKEN_TEXT_API_KEY`. The example config maps each key to only the
capability it is allowed to call.

## Provider preflight

Before starting a production run, verify the configured SuperToken key without
printing it:

```bash
SUPERTOKEN_VIDEO_API_KEY="$(pbpaste)" node scripts/verify-provider.mjs
```

The command reports HTTP status, model count, and capability counts only. Keep
the key in the process environment and never commit it to a config file.

## Local development variant

After building this repository's `canvas-agent`, replace the command in the
overlay with:

```yaml
command: node
args:
  - /Users/liuyahui/codes/projects/infinite-canvas-company/canvas-agent/dist/index.js
  - mcp
```

This variant exposes the company-specific `story_*` tools implemented in this
branch instead of the published package.
