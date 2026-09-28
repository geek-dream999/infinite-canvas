import { Clapperboard, Film, MapPin, Palette, PlaySquare, ScrollText, Star, UserRound } from "lucide-react";
import type { CanvasNodeDefinition, CanvasPlugin } from "@/types/canvas-plugin";

const prefix = "manju";

const specs = [
    ["episode", "剧集", ScrollText, 360, 220, "#f97316"],
    ["scene", "场景", MapPin, 340, 220, "#14b8a6"],
    ["character", "角色", UserRound, 340, 240, "#8b5cf6"],
    ["shot", "镜头", Clapperboard, 380, 280, "#2563eb"],
    ["storyboard", "分镜", Film, 420, 280, "#ec4899"],
    ["style-bible", "风格设定", Palette, 340, 220, "#eab308"],
    ["review", "审核", Star, 340, 220, "#22c55e"],
    ["export", "导出", PlaySquare, 340, 220, "#64748b"],
] as const;

function createContent(label: string, color: string) {
    return ({ ctx }: { ctx: { node: { metadata?: Record<string, unknown> }; theme: { node: { text: string } } } }) => {
        const metadata = ctx.node.metadata || {};
        const content = typeof metadata.content === "string" ? metadata.content : "";
        return (
            <div style={{ color: ctx.theme.node.text, height: "100%", padding: 16, fontSize: 13 }}>
                <div style={{ color, fontWeight: 700, marginBottom: 8 }}>{label}</div>
                <div style={{ whiteSpace: "pre-wrap", opacity: 0.82 }}>{content || "点击节点后由 Agent 或检查器补充生产信息"}</div>
            </div>
        );
    };
}

const nodes: CanvasNodeDefinition[] = specs.map(([name, title, Icon, width, height, color]) => ({
    type: `${prefix}:${name}`,
    title,
    icon: <Icon className="size-4" />,
    description: `漫剧生产${title}节点`,
    defaultSize: { width, height },
    defaultMetadata: { status: "idle", version: 1, aspectRatio: "16:9", references: [] },
    minimapColor: color,
    Content: createContent(title, color),
}));

export const manjuPlugin: CanvasPlugin = {
    id: prefix,
    name: "漫剧生产节点",
    version: "0.1.0",
    description: "为漫剧单集生产提供剧集、场景、角色、镜头、分镜、审核和导出节点。",
    nodes,
};

export default manjuPlugin;
