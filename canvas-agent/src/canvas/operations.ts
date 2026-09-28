import crypto from "node:crypto";

import type { ToolName } from "./schemas.js";
import { nextCanvasX } from "./tools.js";
import type { CanvasNode, CanvasNodeType, CanvasSnapshot } from "./types.js";

export type CanvasToolRequest = { name: "canvas_apply_ops"; input: Record<string, unknown> };

/** 将上层画布工具调用转换为前端可执行的批量操作。 */
export function buildCanvasToolRequest(name: ToolName, input: Record<string, unknown>, state: CanvasSnapshot | null): CanvasToolRequest {
    if (name === "canvas_apply_ops") return { name, input };
    if (name === "canvas_create_node") {
        const data = input as { nodeType: CanvasNodeType; title?: string; x?: number; y?: number; width?: number; height?: number; metadata?: Record<string, unknown> };
        return applyOps([{ type: "add_node", nodeType: data.nodeType, title: data.title, position: { x: data.x ?? nextCanvasX(state), y: data.y ?? 0 }, width: data.width, height: data.height, metadata: data.metadata }]);
    }
    if (name === "canvas_create_text_node") {
        const data = input as { text?: string; x?: number; y?: number; title?: string; width?: number; height?: number };
        return applyOps([textNodeOp(data, data.x ?? nextCanvasX(state), data.y ?? 0)]);
    }
    if (name === "canvas_create_text_nodes") {
        const data = input as { items: Array<{ text: string; title?: string; x?: number; y?: number; width?: number; height?: number }>; x?: number; y?: number; gap?: number; direction?: "row" | "column" };
        const x = Number(data.x ?? nextCanvasX(state));
        const y = Number(data.y ?? 0);
        const gap = Number(data.gap ?? 40);
        return applyOps(data.items.map((item, index) => textNodeOp(item, item.x ?? (data.direction === "row" ? x + index * (340 + gap) : x), item.y ?? (data.direction === "row" ? y : y + index * (240 + gap)))));
    }
    if (name === "canvas_create_image_prompt_flow") return applyOps(generationFlowOps({ ...input, mode: "image" }, state));
    if (name === "canvas_create_config_node") {
        const x = Number(input.x ?? nextCanvasX(state));
        const y = Number(input.y ?? 0);
        const configId = `config-${crypto.randomUUID()}`;
        const mode = generationMode(input.mode);
        const prompt = String(input.prompt || "");
        return applyOps([configNodeOp(configId, input, x, y), ...(input.autoRun ? [runGenerationOp(configId, mode, prompt)] : [])]);
    }
    if (name === "canvas_create_generation_flow") return applyOps(generationFlowOps(input, state));
    if (name === "canvas_generate_text" || name === "canvas_generate_image" || name === "canvas_generate_video" || name === "canvas_generate_audio") {
        return applyOps(generationFlowOps({ ...input, mode: name.replace("canvas_generate_", ""), autoRun: true }, state));
    }
    if (name === "canvas_update_node") {
        const data = input as { id: string; patch?: Record<string, unknown>; metadata?: Record<string, unknown> };
        return applyOps([{ type: "update_node", id: data.id, patch: data.patch, metadata: data.metadata }]);
    }
    if (name === "canvas_update_node_text") {
        const data = input as { id: string; text: string; title?: string };
        return applyOps([{ type: "update_node", id: data.id, patch: { ...(data.title ? { title: data.title } : {}) }, metadata: { content: data.text, status: "success" } }]);
    }
    if (name === "canvas_move_nodes") {
        const data = input as { items: Array<{ id: string; x?: number; y?: number; dx?: number; dy?: number }> };
        return applyOps(data.items.map((item) => {
            const current = findNode(state, item.id);
            return { type: "update_node", id: item.id, patch: { position: { x: item.x ?? ((current?.position.x || 0) + (item.dx || 0)), y: item.y ?? ((current?.position.y || 0) + (item.dy || 0)) } } };
        }));
    }
    if (name === "canvas_resize_node") {
        const data = input as { id: string; width: number; height: number; freeResize?: boolean };
        return applyOps([{ type: "update_node", id: data.id, patch: { width: data.width, height: data.height }, metadata: data.freeResize === undefined ? undefined : { freeResize: data.freeResize } }]);
    }
    if (name === "canvas_delete_nodes") return applyOps([{ type: "delete_node", ids: (input as { ids: string[] }).ids }]);
    if (name === "canvas_connect_nodes") {
        const data = input as { connections: Array<{ fromNodeId: string; toNodeId: string }> };
        return applyOps(data.connections.map((connection) => ({ type: "connect_nodes", ...connection })));
    }
    if (name === "canvas_select_nodes") return applyOps([{ type: "select_nodes", ids: (input as { ids: string[] }).ids }]);
    if (name === "canvas_set_viewport") return applyOps([{ type: "set_viewport", viewport: (input as { viewport: unknown }).viewport }]);
    if (name === "canvas_run_generation") {
        const data = input as { nodeId: string; mode?: string; prompt?: string };
        return applyOps([runGenerationOp(data.nodeId, generationMode(data.mode), data.prompt)]);
    }
    if (name === "story_create_episode") return applyOps(storyCreateEpisodeOps(input));
    if (name === "story_parse_script") return applyOps(storyParseScriptOps(input, state));
    if (name === "story_create_characters") return applyOps(storyCreateCharactersOps(input));
    if (name === "story_create_scenes") return applyOps(storyCreateScenesOps(input));
    if (name === "story_create_storyboard") return applyOps(storyCreateStoryboardOps(input));
    if (name === "story_update_shot") return applyOps([{ type: "update_node", id: String(input.id), metadata: { ...(input.patch as Record<string, unknown>), version: Date.now() } }]);
    if (name === "story_review_shot") return applyOps([{ type: "update_node", id: String(input.id), metadata: { reviewStatus: input.status, reviewNotes: input.notes || [], version: Date.now() } }]);
    if (name === "story_generate_shot_assets") return applyOps(storyGenerateShotAssetsOps(input, state));
    throw new Error(`未知工具：${name}`);
}

function storyCreateEpisodeOps(input: Record<string, unknown>) {
    const id = `episode-${crypto.randomUUID()}`;
    const title = String(input.title || "未命名剧集");
    return [{ type: "add_node", id, nodeType: "manju:episode", title, position: { x: Number(input.x || 0), y: Number(input.y || 0) }, metadata: { content: input.script || "", episodeNumber: input.episodeNumber || 1, aspectRatio: input.aspectRatio || "16:9", status: "idle", version: 1 } }];
}

function storyParseScriptOps(input: Record<string, unknown>, state: CanvasSnapshot | null) {
    const script = String(input.script || "");
    const lines = script.split(/\n+/).map((line) => line.trim()).filter(Boolean);
    const x = nextCanvasX(state);
    const aspectRatio = String((state?.nodes || []).find((node) => node.id === input.episodeNodeId)?.metadata?.aspectRatio || "16:9");
    const ops: unknown[] = [];
    let sceneId = "";
    let shotNumber = 0;
    // A short script often has no explicit SCENE heading. Keep the graph
    // connected by materializing one inferred scene instead of leaving shots
    // orphaned outside the selected episode.
    if (input.episodeNodeId && !lines.some((line) => /^(?:场景|SCENE)\s*[:：-]?\s*.+$/i.test(line))) {
        sceneId = `scene-${crypto.randomUUID()}`;
        ops.push({ type: "add_node", id: sceneId, nodeType: "manju:scene", title: "默认场景", position: { x, y: -360 }, metadata: { content: "从剧本自动推断的场景", location: "待确认", aspectRatio, version: 1, status: "idle" } });
        ops.push({ type: "connect_nodes", fromNodeId: String(input.episodeNodeId), toNodeId: sceneId });
    }
    lines.forEach((line, index) => {
        const sceneMatch = line.match(/^(?:场景|SCENE)\s*[:：-]?\s*(.+)$/i);
        if (sceneMatch) {
            sceneId = `scene-${crypto.randomUUID()}`;
            ops.push({ type: "add_node", id: sceneId, nodeType: "manju:scene", title: sceneMatch[1], position: { x, y: index * 360 }, metadata: { content: sceneMatch[1], location: sceneMatch[1], aspectRatio, version: 1, status: "idle" } });
            if (input.episodeNodeId) ops.push({ type: "connect_nodes", fromNodeId: String(input.episodeNodeId), toNodeId: sceneId });
            return;
        }
        shotNumber += 1;
        const shotId = `shot-${crypto.randomUUID()}`;
        ops.push({ type: "add_node", id: shotId, nodeType: "manju:shot", title: `镜头 ${shotNumber}`, position: { x: x + 420, y: index * 360 }, metadata: { content: line, shotNumber, durationSeconds: 4, aspectRatio, version: 1, status: "idle" } });
        if (sceneId) ops.push({ type: "connect_nodes", fromNodeId: sceneId, toNodeId: shotId });
        else if (input.episodeNodeId) ops.push({ type: "connect_nodes", fromNodeId: String(input.episodeNodeId), toNodeId: shotId });
    });
    return ops;
}

function storyCreateCharactersOps(input: Record<string, unknown>) {
    const ops: unknown[] = [];
    ((input.characters || []) as Array<Record<string, unknown>>).forEach((item, index) => {
        const id = `character-${crypto.randomUUID()}`;
        ops.push({ type: "add_node", id, nodeType: "manju:character", title: String(item.name), position: { x: Number(input.x || 0), y: Number(input.y || 0) + index * 280 }, metadata: { content: item.description || "", references: item.references || [], version: 1, status: "idle" } });
        if (input.episodeNodeId) ops.push({ type: "connect_nodes", fromNodeId: String(input.episodeNodeId), toNodeId: id });
    });
    return ops;
}

function storyCreateScenesOps(input: Record<string, unknown>) {
    const ops: unknown[] = [];
    ((input.scenes || []) as Array<Record<string, unknown>>).forEach((item, index) => {
        const id = `scene-${crypto.randomUUID()}`;
        ops.push({ type: "add_node", id, nodeType: "manju:scene", title: String(item.name), position: { x: Number(input.x || 0), y: Number(input.y || 0) + index * 260 }, metadata: { content: item.location || "", location: item.location, timeOfDay: item.timeOfDay, mood: item.mood, continuity: item.continuity || [], version: 1, status: "idle" } });
        if (input.episodeNodeId) ops.push({ type: "connect_nodes", fromNodeId: String(input.episodeNodeId), toNodeId: id });
    });
    return ops;
}

function storyCreateStoryboardOps(input: Record<string, unknown>) {
    const ops: unknown[] = [];
    ((input.shots || []) as Array<Record<string, unknown>>).forEach((item, index) => {
        const id = `shot-${crypto.randomUUID()}`;
        ops.push({ type: "add_node", id, nodeType: "manju:shot", title: `镜头 ${item.shotNumber || index + 1}`, position: { x: Number(input.x || 0), y: Number(input.y || 0) + index * 320 }, metadata: { content: item.description, shotNumber: item.shotNumber, shotSize: item.shotSize, camera: item.camera, movement: item.movement, durationSeconds: item.durationSeconds || 4, dialogue: item.dialogue, aspectRatio: "16:9", version: 1, status: "idle" } });
        if (input.sceneNodeId) ops.push({ type: "connect_nodes", fromNodeId: String(input.sceneNodeId), toNodeId: id });
    });
    return ops;
}

function storyGenerateShotAssetsOps(input: Record<string, unknown>, state: CanvasSnapshot | null) {
    const kinds = (input.kinds as string[] | undefined) || ["image", "video", "audio"];
    const shots = new Set((input.shotNodeIds as string[]) || []);
    const ops: unknown[] = [];
    for (const shot of (state?.nodes || []).filter((node) => shots.has(node.id))) {
        const inherited = collectShotConstraints(shot.id, state);
        const taskIds: string[] = [];
        const prompt = [String(shot.metadata?.content || shot.title), ...inherited.constraints].filter(Boolean).join("\n");
        kinds.forEach((kind, index) => {
            const id = `${kind}-${crypto.randomUUID()}`;
            const generationTaskId = `generation-${crypto.randomUUID()}`;
            taskIds.push(generationTaskId);
            ops.push({ type: "add_node", id, nodeType: kind, title: `${shot.title}·${kind}`, position: { x: shot.position.x + 460, y: shot.position.y + index * 260 }, metadata: { prompt, generationMode: kind, sourceShotId: shot.id, inheritedNodeIds: inherited.nodeIds, aspectRatio: shot.metadata?.aspectRatio || "16:9", status: "queued", generationStatus: "queued", generationTaskId, generationVersion: 1, provider: "local" } });
            ops.push({ type: "connect_nodes", fromNodeId: shot.id, toNodeId: id });
            ops.push({ type: "run_generation", nodeId: id, mode: kind, prompt });
        });
        ops.push({ type: "update_node", id: shot.id, metadata: { assetTaskIds: taskIds, generationStatus: "queued", generationVersion: Number(shot.metadata?.version || 1) + 1 } });
    }
    return ops;
}

function collectShotConstraints(shotId: string, state: CanvasSnapshot | null) {
    const nodes = state?.nodes || [];
    const connections = state?.connections || [];
    const incoming = connections.filter((connection) => connection.toNodeId === shotId).map((connection) => nodes.find((node) => node.id === connection.fromNodeId)).filter((node): node is CanvasNode => Boolean(node));
    const nodeIds: string[] = [];
    const constraints: string[] = [];
    incoming.forEach((node) => {
        const metadata = node.metadata || {};
        const content = String(metadata.content || "").trim();
        const continuity = Array.isArray(metadata.continuity) ? metadata.continuity.map(String) : [];
        const label = node.type === "manju:character" ? "角色设定" : node.type === "manju:scene" ? "场景设定" : node.type === "manju:style-bible" ? "风格设定" : "上游设定";
        if (content || metadata.location || continuity.length) {
            nodeIds.push(node.id);
            constraints.push(`${label}：${[content, metadata.location, metadata.timeOfDay, metadata.mood, ...continuity].filter(Boolean).join("；")}`);
        }
    });
    return { nodeIds, constraints };
}

/** 按最大边限制计算附件图片节点尺寸，并保持原始比例。 */
export function fitAttachmentNodeSize(width: number, height: number) {
    const scale = Math.min(1, 640 / width, 640 / height);
    return { width: width * scale, height: height * scale };
}

/** 创建统一的批量画布操作请求。 */
function applyOps(ops: unknown[]): CanvasToolRequest {
    return { name: "canvas_apply_ops", input: { ops } };
}

/** 创建文本节点操作。 */
function textNodeOp(input: { id?: string; text?: string; title?: string; width?: number; height?: number }, x: number, y: number) {
    return { type: "add_node", id: input.id, nodeType: "text", title: input.title, position: { x, y }, width: input.width, height: input.height, metadata: { content: input.text || "", status: "success", fontSize: 14 } };
}

/** 创建生成配置节点操作。 */
function configNodeOp(id: string, input: Record<string, unknown>, x: number, y: number) {
    const mode = generationMode(input.mode);
    const prompt = String(input.prompt || "");
    return {
        type: "add_node",
        id,
        nodeType: "config",
        title: String(input.title || generationTitle(mode)),
        position: { x, y },
        width: typeof input.width === "number" ? input.width : undefined,
        height: typeof input.height === "number" ? input.height : undefined,
        metadata: cleanRecord({
            generationMode: mode,
            composerContent: prompt,
            prompt,
            status: "idle",
            model: input.model,
            size: input.size,
            quality: input.quality,
            count: input.count,
            seconds: input.seconds,
            vquality: input.vquality,
            generateAudio: input.generateAudio,
            watermark: input.watermark,
            videoMode: input.videoMode,
            audioVoice: input.audioVoice,
            audioFormat: input.audioFormat,
            audioSpeed: input.audioSpeed,
            audioInstructions: input.audioInstructions,
        }),
    };
}

/** 创建包含提示词、配置节点和引用连线的生成流程。 */
function generationFlowOps(input: Record<string, unknown>, state: CanvasSnapshot | null) {
    const mode = generationMode(input.mode);
    const prompt = String(input.prompt || "");
    const x = Number(input.x ?? nextCanvasX(state));
    const y = Number(input.y ?? 0);
    const textId = `text-${crypto.randomUUID()}`;
    const configId = `config-${crypto.randomUUID()}`;
    const referenceNodeIds = Array.isArray(input.referenceNodeIds) ? input.referenceNodeIds.filter((id): id is string => typeof id === "string") : [];
    // When the prompt only @-mentions nodes already passed as references, reuse them instead of minting a duplicate text node.
    const mentionedIds = [...prompt.matchAll(/@\[node:([\w-]+)\]/g)].map((match) => match[1]);
    const reuseReferences = referenceNodeIds.length > 0 && mentionedIds.length > 0
        && mentionedIds.every((id) => referenceNodeIds.includes(id))
        && prompt.replace(/@\[node:[\w-]+\]/g, "").trim() === "";
    const tokens = reuseReferences ? referenceNodeIds.map((id) => `@[node:${id}]`) : [`@[node:${textId}]`, ...referenceNodeIds.map((id) => `@[node:${id}]`)];
    return [
        ...(reuseReferences ? [] : [textNodeOp({ id: textId, text: prompt, title: String(input.title || "提示词") }, x, y)]),
        configNodeOp(configId, { ...input, prompt: tokens.join("\n") }, x + 420, y),
        ...(reuseReferences ? [] : [{ type: "connect_nodes", fromNodeId: textId, toNodeId: configId }]),
        ...referenceNodeIds.map((fromNodeId) => ({ type: "connect_nodes", fromNodeId, toNodeId: configId })),
        { type: "select_nodes", ids: [configId] },
        ...(input.autoRun ? [runGenerationOp(configId, mode, tokens.join("\n"))] : []),
    ];
}

/** 创建触发节点生成的画布操作。 */
function runGenerationOp(nodeId: string, mode: "text" | "image" | "video" | "audio", prompt?: string) {
    return { type: "run_generation", nodeId, mode, prompt };
}

/** 将未知生成模式归一为画布支持的模式。 */
function generationMode(value: unknown): "text" | "image" | "video" | "audio" {
    return value === "text" || value === "video" || value === "audio" ? value : "image";
}

/** 获取生成模式对应的默认节点标题。 */
function generationTitle(mode: "text" | "image" | "video" | "audio") {
    if (mode === "text") return "文本生成";
    if (mode === "video") return "视频生成";
    if (mode === "audio") return "音频生成";
    return "图片生成";
}

/** 按节点 ID 查找当前画布节点。 */
function findNode(state: CanvasSnapshot | null, id: string): CanvasNode | undefined {
    return (state?.nodes || []).find((node) => node.id === id);
}

/** 移除对象中未设置的生成参数。 */
function cleanRecord(value: Record<string, unknown>) {
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== ""));
}
