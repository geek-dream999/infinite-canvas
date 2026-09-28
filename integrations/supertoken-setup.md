# SuperToken setup

Use one model channel per capability when the provider account issues separate
permissions. Never commit the values of these variables.

| Capability | Environment variable | Suggested model |
| --- | --- | --- |
| Image | `SUPERTOKEN_IMAGE_API_KEY` | `gpt-image-2` |
| Video | `SUPERTOKEN_VIDEO_API_KEY` | `adobe-seedance-2.0-fast-720p` |
| Text | `SUPERTOKEN_TEXT_API_KEY` | `gpt-5.5` |

Use this gateway URL for all three channels:

```text
https://api.supertoken.cc/v1
```

The gateway sends both `x-api-key` and `Authorization: Bearer` so it works
with SuperToken and standard OpenAI-compatible providers. The provider
preflight never prints a key. Put one capability key in the clipboard at a
time and run the matching command:

```bash
SUPERTOKEN_IMAGE_API_KEY="$(pbpaste)" npm run verify:provider
SUPERTOKEN_VIDEO_API_KEY="$(pbpaste)" npm run verify:provider
SUPERTOKEN_TEXT_API_KEY="$(pbpaste)" npm run verify:provider
```

For interactive browser setup, open the canvas **配置** panel, create or edit
three OpenAI channels, click **使用 SuperToken**, enter the corresponding Key,
and assign the capability-specific model. Save each channel before running a
generation task.

For DeepSeek Harness or another MCP client, provider credentials remain in the
web canvas configuration; the MCP gateway only receives canvas operations and
never receives provider keys.
