#!/usr/bin/env node
import { startHttpServer } from "./server/http.js";
import { startMcpHttpServer, startMcpServer } from "./server/mcp.js";

if (process.argv[2] === "mcp") await startMcpServer();
else if (process.argv[2] === "mcp-http") await startMcpHttpServer();
else startHttpServer();
