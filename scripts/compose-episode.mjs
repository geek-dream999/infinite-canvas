#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const [manifestFile, outputFile] = process.argv.slice(2);
if (!manifestFile || !outputFile) {
    console.error("Usage: node scripts/compose-episode.mjs <manifest.json> <output.mp4>");
    process.exit(2);
}

const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
if (!manifest.ready) {
    console.error("Episode is not ready for export:");
    for (const issue of manifest.issues || []) console.error(`- ${issue.nodeId || "project"}: ${issue.message}`);
    process.exit(1);
}

const tempDir = await mkdtemp(path.join(os.tmpdir(), "manju-episode-"));
try {
    const clips = [];
    for (const [index, item] of (manifest.timeline || []).entries()) {
        const video = item.assets?.find((asset) => asset.type === "video" && asset.url)?.url;
        const image = item.assets?.find((asset) => asset.type === "image" && asset.url)?.url;
        const audio = item.assets?.find((asset) => asset.type === "audio" && asset.url)?.url;
        if (video && isLocalPath(video)) clips.push({ file: await muxAudio(video, audio, item.durationSeconds, tempDir, index), duration: item.durationSeconds });
        else if (image && isLocalPath(image)) {
            const clip = path.join(tempDir, `shot-${String(index).padStart(4, "0")}.mp4`);
            await run("ffmpeg", ["-y", "-loop", "1", "-i", image, "-t", String(item.durationSeconds), "-vf", "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2", "-r", "25", "-pix_fmt", "yuv420p", clip]);
            clips.push({ file: await muxAudio(clip, audio, item.durationSeconds, tempDir, index), duration: item.durationSeconds });
        } else console.warn(`Skipping shot ${item.shotNumber}: no local video or image asset`);
    }
    if (!clips.length) throw new Error("No local media assets found in the timeline");
    const concatFile = path.join(tempDir, "concat.txt");
    await writeFile(concatFile, clips.map((clip) => `file '${clip.file.replaceAll("'", "'\\''")}'`).join("\n") + "\n");
    await run("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", concatFile, "-c", "copy", outputFile]);
    console.log(`Wrote ${outputFile} (${clips.length} clips)`);
} finally {
    await rm(tempDir, { recursive: true, force: true });
}

function isLocalPath(value) {
    return !/^https?:\/\//i.test(value) && !/^data:/i.test(value);
}

async function muxAudio(video, audio, duration, tempDir, index) {
    if (!audio || !isLocalPath(audio)) return video;
    const output = path.join(tempDir, `muxed-${String(index).padStart(4, "0")}.mp4`);
    await run("ffmpeg", ["-y", "-i", video, "-i", audio, "-t", String(duration), "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-shortest", output]);
    return output;
}

function run(command, args) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, { stdio: "inherit" });
        child.on("error", reject);
        child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`))));
    });
}
