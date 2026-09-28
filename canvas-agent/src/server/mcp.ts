import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { toolDescriptions, toolInputSchemas, toolNames, type ToolName } from "../canvas/schemas.js";
import { AGENT_PROMPT, loadConfig, type CanvasAgentConfig, VERSION } from "../config.js";

type CanvasAgentToolResponse = { ok?: boolean; result?: unknown; error?: string };

/** 启动通过标准输入输出通信的 MCP 服务。 */
export async function startMcpServer() {
    const config = loadConfig(true);
    const server = createCanvasMcpServer(config);
    await server.connect(new StdioServerTransport());
}

/** 启动跨 Agent 使用的 Streamable HTTP MCP 服务。默认仅监听本机。 */
export async function startMcpHttpServer() {
    const config = loadConfig(true);
    const port = Number(process.env.MCP_HTTP_PORT) || 8787;
    const token = config.token;
    const httpServer = createServer(async (req, res) => {
        if (req.url !== "/mcp" || !["GET", "POST", "DELETE"].includes(req.method || "")) {
            res.writeHead(404, { "content-type": "application/json" });
            res.end(JSON.stringify({ error: "MCP endpoint is /mcp" }));
            return;
        }
        if (!isAuthorized(req.headers.authorization, req.headers["x-canvas-agent-token"], token)) {
            res.writeHead(401, { "content-type": "application/json" });
            res.end(JSON.stringify({ error: "Invalid canvas agent token" }));
            return;
        }
        try {
            const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
            const server = createCanvasMcpServer(config);
            await server.connect(transport);
            await transport.handleRequest(req, res);
        } catch (error) {
            if (!res.headersSent) res.writeHead(500, { "content-type": "application/json" });
            if (!res.writableEnded) res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
        }
    });
    httpServer.listen(port, "127.0.0.1", () => console.log(`Canvas Agent MCP HTTP: http://127.0.0.1:${port}/mcp`));
}

function createCanvasMcpServer(config: CanvasAgentConfig) {
    const server = new McpServer({ name: "canvas-agent", version: VERSION }, { instructions: AGENT_PROMPT });
    toolNames.forEach((name) => registerCanvasTool(server, config, name));
    return server;
}

function isAuthorized(authorization: string | undefined, headerToken: string | string[] | undefined, expected: string) {
    const supplied = Array.isArray(headerToken) ? headerToken[0] : headerToken;
    return supplied === expected || authorization === `Bearer ${expected}`;
}

/** 向 MCP Server 注册单个 Canvas Agent 工具。 */
function registerCanvasTool(server: McpServer, config: CanvasAgentConfig, name: ToolName) {
    const schema = toolInputSchemas[name];
    server.registerTool(name, { description: toolDescriptions[name], inputSchema: schema.shape }, async (input: unknown) => {
        const result = await postCanvasAgentTool(config, name, schema.parse(input));
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    });
}

/** 将 MCP 工具调用转发到本地 Canvas Agent HTTP 服务。 */
async function postCanvasAgentTool(config: CanvasAgentConfig, name: ToolName, input: unknown) {
    const res = await fetch(`${config.url}/api/tools`, { method: "POST", headers: { "content-type": "application/json", "x-canvas-agent-token": config.token }, body: JSON.stringify({ name, input }) });
    const body = (await res.json()) as CanvasAgentToolResponse;
    if (!body.ok) throw new Error(body.error || "tool call failed");
    return body.result;
}
