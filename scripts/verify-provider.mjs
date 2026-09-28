const baseUrl = (process.env.SUPERTOKEN_BASE_URL || "https://api.supertoken.cc/v1").replace(/\/+$/, "");
const slots = [
  ["video", process.env.SUPERTOKEN_VIDEO_API_KEY || process.env.SUPERTOKEN_API_KEY],
  ["image", process.env.SUPERTOKEN_IMAGE_API_KEY],
  ["text", process.env.SUPERTOKEN_TEXT_API_KEY],
];
let failed = false;
for (const [capability, apiKey] of slots) {
  if (!apiKey) {
    console.log(`${capability}: missing key`);
    failed = true;
    continue;
  }
  const response = await fetch(`${baseUrl}/models`, {
    headers: { Authorization: `Bearer ${apiKey}`, "x-api-key": apiKey },
  });
  let payload = {};
  try {
    payload = await response.json();
  } catch {
    // Keep diagnostics limited to status and avoid printing provider response data.
  }
  if (!response.ok) {
    console.log(`${capability}: HTTP ${response.status}`);
    failed = true;
    continue;
  }
  const models = Array.isArray(payload.data) ? payload.data.map((item) => String(item.id || "")).filter(Boolean) : [];
  console.log(`${capability}: HTTP ${response.status}, models=${models.length}`);
  if (!models.length) failed = true;
}
if (failed) process.exitCode = 1;
