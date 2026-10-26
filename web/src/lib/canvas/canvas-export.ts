import { saveAs } from "file-saver";

import i18n from "@/i18n";
import { createZip } from "@/lib/zip";
import { getMediaBlob } from "@/services/file-storage";
import { getImageBlob } from "@/services/image-storage";
import type { CanvasExportAsset, CanvasExportFile } from "@/types/canvas-export";
import type { CanvasProject } from "@/stores/canvas/use-canvas-store";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "@/types/canvas";

export function prepareCanvasImageDownloads(nodes: CanvasNodeData[], connections: CanvasConnection[]) {
    const nodesById = new Map(nodes.map((node) => [node.id, node]));
    const configByOutput = new Map<string, CanvasNodeData>();
    connections.forEach((connection) => {
        const source = nodesById.get(connection.fromNodeId);
        const target = nodesById.get(connection.toNodeId);
        if (source?.type === CanvasNodeType.Config && target?.type === CanvasNodeType.Image) configByOutput.set(target.id, source);
    });
    const entries = nodes
        .filter((node) => node.type === CanvasNodeType.Image && node.metadata?.status === "success" && Boolean(node.metadata.storageKey || node.metadata.content))
        .map((node, sourceIndex) => {
            const config = configByOutput.get(node.id);
            const title = config?.title || "";
            const shot = title.match(/镜头\s*0*(\d+).*关键帧/i);
            return { node, sourceIndex, shotNumber: shot ? Number(shot[1]) : null, isOverview: /分镜板|分镜总览/.test(title) };
        })
        .sort((a, b) => {
            const aRank = a.shotNumber !== null ? 2 : a.isOverview ? 1 : 0;
            const bRank = b.shotNumber !== null ? 2 : b.isOverview ? 1 : 0;
            return aRank - bRank || (a.shotNumber ?? 0) - (b.shotNumber ?? 0) || a.sourceIndex - b.sourceIndex;
        });
    let assetIndex = 0;
    return entries.map(({ node, shotNumber, isOverview }) => {
        if (shotNumber !== null) return { ...node, title: `镜头${String(shotNumber).padStart(2, "0")}` };
        if (isOverview) return { ...node, title: "分镜总览" };
        assetIndex += 1;
        return { ...node, title: `素材${String(assetIndex).padStart(2, "0")}` };
    });
}

export async function exportCanvasProjects(projects: CanvasProject[], fileName = i18n.t("canvas.export.defaultProjectName")) {
    const zipFiles: { name: string; data: BlobPart }[] = [];
    const exportedProjects = await Promise.all(
        projects.map(async (project) => {
            const files: CanvasExportAsset[] = [];
            await Promise.all(
                collectStorageKeys(project).map(async (storageKey) => {
                    const blob = storageKey.startsWith("image:") ? await getImageBlob(storageKey) : await getMediaBlob(storageKey);
                    if (!blob) return;
                    const path = `projects/${project.id}/files/${safeFileName(storageKey)}.${fileExtension(blob.type, storageKey)}`;
                    files.push({ storageKey, path, mimeType: blob.type || "application/octet-stream", bytes: blob.size });
                    zipFiles.push({ name: path, data: blob });
                }),
            );
            return { project, files };
        }),
    );

    const data: CanvasExportFile = { app: "infinite-canvas", version: 3, exportedAt: new Date().toISOString(), projects: exportedProjects };
    const zip = await createZip([{ name: "projects.json", data: JSON.stringify(data, null, 2) }, ...zipFiles]);
    saveAs(zip, `${safeFileName(fileName)}.zip`);
}

export async function exportCanvasNodes(nodes: CanvasNodeData[], fileName = i18n.t("canvas.export.defaultNodesName")) {
    const zipFiles: { name: string; data: BlobPart }[] = [];
    const used = new Set<string>();
    const uniqueName = (base: string, ext: string) => {
        const safe = safeFileName(base) || i18n.t("canvas.export.item");
        let name = `${safe}.${ext}`;
        for (let i = 1; used.has(name); i += 1) name = `${safe}-${i}.${ext}`;
        used.add(name);
        return name;
    };

    const files = await Promise.all(
        nodes.map(async (node) => {
            const title = node.title || node.type;
            const storageKey = node.metadata?.storageKey || "";
            if (storageKey) {
                const blob = storageKey.startsWith("image:") ? await getImageBlob(storageKey) : await getMediaBlob(storageKey);
                if (blob) return { name: uniqueName(title, fileExtension(blob.type, storageKey)), data: blob };
            }
            if (node.type === CanvasNodeType.Text) return { name: uniqueName(title, "txt"), data: node.metadata?.content || node.metadata?.prompt || "" };
            const content = node.metadata?.content;
            if (content && content.startsWith("data:")) {
                const blob = await (await fetch(content)).blob();
                return { name: uniqueName(title, fileExtension(blob.type, storageKey)), data: blob };
            }
            return { name: uniqueName(title, "json"), data: JSON.stringify(node, null, 2) };
        }),
    );
    zipFiles.push(...files);

    const zip = await createZip(zipFiles);
    saveAs(zip, `${safeFileName(fileName)}.zip`);
}

function collectStorageKeys(value: unknown, keys = new Set<string>()) {
    if (!value || typeof value !== "object") return [...keys];
    if ("storageKey" in value && typeof value.storageKey === "string" && value.storageKey.includes(":")) keys.add(value.storageKey);
    Object.values(value).forEach((item) => (Array.isArray(item) ? item.forEach((child) => collectStorageKeys(child, keys)) : collectStorageKeys(item, keys)));
    return [...keys];
}

function safeFileName(value: string) {
    return value.replace(/[\\/:*?"<>|]/g, "_");
}

function fileExtension(mimeType: string, storageKey: string) {
    if (mimeType.includes("png")) return "png";
    if (mimeType.includes("jpeg")) return "jpg";
    if (mimeType.includes("webp")) return "webp";
    if (mimeType.includes("gif")) return "gif";
    if (mimeType.includes("mp4")) return "mp4";
    if (mimeType.includes("webm")) return "webm";
    if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
    if (mimeType.includes("wav")) return "wav";
    if (mimeType.includes("ogg")) return "ogg";
    return storageKey.startsWith("image:") ? "png" : "bin";
}
