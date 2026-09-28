import { spawn } from "node:child_process";
import net from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const isPortOpen = (port, host) => new Promise((resolvePort) => {
  const socket = net.createConnection({ port, host });
  socket.once("connect", () => { socket.destroy(); resolvePort(true); });
  socket.once("error", () => resolvePort(false));
});

const services = [
  ["canvas", "web", ["run", "dev"], 3000, "127.0.0.1"],
  ["browser-agent", "canvas-agent", ["run", "dev"], 17371, "127.0.0.1"],
  ["agent", "canvas-agent", ["run", "dev", "--", "mcp-http"], 8787, "127.0.0.1"],
];
const processes = [];
for (const [name, cwd, args, port, host] of services) {
  if (await isPortOpen(port, host)) {
    console.log(`[${name}] already listening on ${host}:${port}`);
    continue;
  }
  const child = spawn("npm", args, {
    cwd: resolve(root, cwd),
    env: process.env,
    stdio: "inherit",
  });
  child.on("exit", (code, signal) => console.log(`[${name}] exited code=${code ?? "-"} signal=${signal ?? "-"}`));
  processes.push(child);
}

const stop = () => {
  for (const child of processes) child.kill("SIGTERM");
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
