# Local platform runtime

Start the canvas, browser bridge Agent, and agent-neutral MCP gateway together:

```bash
node scripts/start-platform.mjs
```

The services listen on `http://localhost:3000`, `http://127.0.0.1:17371`, and
`http://127.0.0.1:8787/mcp` respectively.

Run the repeatable MCP graph smoke test from the repository root:

```bash
npm run smoke:mcp
```

It cleans up its test nodes by default. Set `SMOKE_KEEP=1` to keep the graph
for inspection.

# Local episode composition

Compose an approved episode manifest into a horizontal MP4 using local video
or image assets:

```bash
node scripts/compose-episode.mjs episode-manifest.json output/episode-01.mp4
```

The command refuses manifests whose `ready` field is false. Remote URLs and
data URLs are intentionally skipped; download or materialize assets through
the configured storage layer before local composition.
