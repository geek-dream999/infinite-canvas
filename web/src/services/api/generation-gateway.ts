import type { ReferenceImage } from "@/types/image";

export type GenerationKind = "text" | "image" | "video" | "audio";
export type GenerationRequest = {
    kind: GenerationKind;
    model?: string;
    provider?: string;
    prompt: string;
    references?: string[];
    parameters: Record<string, unknown>;
    projectId?: string;
    nodeId?: string;
    audit?: { userId?: string; source?: string; traceId?: string };
    signal?: AbortSignal;
};
export type GenerationTask = {
    id: string;
    status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
    provider?: string;
    usage?: { inputTokens?: number; outputTokens?: number; credits?: number; currency?: string };
    result?: { url?: string; storageKey?: string; metadata?: Record<string, unknown> };
    error?: string;
};

export type LocalGenerationAdapter = { submit: (request: GenerationRequest, references?: ReferenceImage[]) => Promise<GenerationTask> };
export type GenerationProvider = LocalGenerationAdapter & { id: string; canHandle: (request: GenerationRequest) => boolean };
export type GenerationProviderConfig = { id: string; kind: GenerationKind[]; baseUrl: string; apiKeyEnv: string; models: Partial<Record<GenerationKind, string>>; priority?: number; enabled?: boolean };
export type OpenAICompatibleProviderOptions = {
    id: string;
    baseUrl: string;
    apiKey: string;
    models?: Partial<Record<GenerationKind, string>>;
    fetchImpl?: typeof fetch;
    pollIntervalMs?: number;
    pollTimeoutMs?: number;
};

export function validateGenerationProviderConfig(config: GenerationProviderConfig): string[] {
    const errors: string[] = [];
    if (!config.id.trim()) errors.push("provider id is required");
    if (!config.kind.length) errors.push("provider kind is required");
    try {
        const url = new URL(config.baseUrl);
        if (!["http:", "https:"].includes(url.protocol)) errors.push("provider baseUrl must use http or https");
    } catch {
        errors.push("provider baseUrl is invalid");
    }
    if (!config.apiKeyEnv.trim()) errors.push("provider apiKeyEnv is required");
    config.kind.forEach((kind) => {
        if (!config.models[kind]?.trim()) errors.push(`provider model is required for ${kind}`);
    });
    return errors;
}

export type GenerationTaskListener = (task: GenerationTask) => void;
export type GenerationQueue = {
    submit: (request: GenerationRequest, references?: ReferenceImage[]) => GenerationTask;
    get: (id: string) => GenerationTask | undefined;
    list: () => GenerationTask[];
    cancel: (id: string) => boolean;
    retry: (id: string) => GenerationTask | undefined;
    subscribe: (listener: GenerationTaskListener) => () => void;
};

/** Routes a request to a configured provider without leaking provider names into canvas nodes. */
export function createGenerationProviderRouter(providers: GenerationProvider[]): LocalGenerationAdapter {
    return {
        async submit(request, references) {
            const provider = providers.find((candidate) => candidate.canHandle(request));
            if (!provider) return { id: `generation-${crypto.randomUUID()}`, status: "failed", error: `No generation provider supports ${request.kind}${request.model ? `:${request.model}` : ""}` };
            const result = await provider.submit(request, references);
            return { ...result, provider: result.provider || provider.id };
        },
    };
}

function providerUrl(baseUrl: string, path: string) {
    return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

async function readProviderResponse(response: Response) {
    const text = await response.text();
    let body: unknown = text;
    try {
        body = text ? JSON.parse(text) : undefined;
    } catch {
        // Preserve non-JSON provider diagnostics as plain text.
    }
    if (!response.ok) {
        const message = typeof body === "object" && body && "error" in body ? String((body as { error?: { message?: string } }).error?.message || "provider request failed") : String(body || response.statusText);
        throw new Error(`Generation provider ${response.status}: ${message}`);
    }
    return body as Record<string, unknown>;
}

async function waitForProviderVideo(fetchImpl: typeof fetch, url: string, headers: HeadersInit, taskId: string, intervalMs: number, timeoutMs: number, signal?: AbortSignal) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
        const state = await readProviderResponse(await fetchImpl(`${url}/${encodeURIComponent(taskId)}`, { headers, signal }));
        const status = String(state.status || "").toLowerCase();
        if (["failed", "cancelled", "canceled"].includes(status)) throw new Error(String((state.error as { message?: string } | undefined)?.message || "video generation failed"));
        const directUrl = state.video_url || state.url;
        if (typeof directUrl === "string" && directUrl) return { url: directUrl, metadata: { taskId, status: "succeeded" } };
        if (["completed", "succeeded", "success"].includes(status)) {
            const content = await fetchImpl(`${url}/${encodeURIComponent(taskId)}/content`, { headers });
            if (!content.ok) throw new Error(`Generation provider ${content.status}: video content download failed`);
            return { url: URL.createObjectURL(await content.blob()), metadata: { taskId, status: "succeeded" } };
        }
        await new Promise((resolve, reject) => {
            const timer = setTimeout(resolve, intervalMs);
            signal?.addEventListener("abort", () => {
                clearTimeout(timer);
                reject(new DOMException("Aborted", "AbortError"));
            }, { once: true });
        });
    }
    throw new Error("video generation polling timed out");
}

/**
 * Concrete OpenAI-compatible adapter used by the company gateway.
 * Secrets are supplied at runtime and are never stored in canvas nodes.
 */
export function createOpenAICompatibleGenerationProvider(options: OpenAICompatibleProviderOptions): GenerationProvider {
    const fetchImpl = options.fetchImpl || fetch;
    const models = options.models || {};
    // SuperToken accepts x-api-key; Authorization keeps compatibility with
    // standard OpenAI-compatible gateways.
    const headers = { Authorization: `Bearer ${options.apiKey}`, "x-api-key": options.apiKey };
    const videoUrl = providerUrl(options.baseUrl, "videos");
    return {
        id: options.id,
        canHandle: (request) => Boolean(request.kind && (!request.provider || request.provider === options.id) && (!request.model || request.model === models[request.kind] || request.kind === "text")),
        async submit(request, references) {
            const id = `generation-${crypto.randomUUID()}`;
            try {
                const model = request.model || models[request.kind];
                if (!model) throw new Error(`No model configured for ${request.kind}`);
                if (request.kind === "text") {
                    const systemPrompt = typeof request.parameters.systemPrompt === "string" ? request.parameters.systemPrompt : "";
                    const messages = [...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []), { role: "user", content: request.prompt }];
                    const response = await readProviderResponse(await fetchImpl(providerUrl(options.baseUrl, "chat/completions"), { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ model, messages, ...request.parameters }), signal: request.signal }));
                    const choice = (response.choices as Array<{ message?: { content?: string } }> | undefined)?.[0];
                    return { id, status: "succeeded", result: { metadata: { text: choice?.message?.content || "" } } };
                }
                if (request.kind === "image") {
                    const response = await readProviderResponse(await fetchImpl(providerUrl(options.baseUrl, "images/generations"), { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ model, prompt: request.prompt, n: Number(request.parameters.count || 1), size: request.parameters.size || "1024x1024", ...request.parameters }), signal: request.signal }));
                    const images = ((response.data as Array<{ url?: string; b64_json?: string }> | undefined) || []).map((item) => item.url || (item.b64_json ? `data:image/png;base64,${item.b64_json}` : "")).filter(Boolean);
                    return { id, status: "succeeded", result: { metadata: { images } } };
                }
                if (request.kind === "video") {
                    const form = new FormData();
                    form.set("model", model);
                    form.set("prompt", request.prompt);
                    Object.entries(request.parameters).forEach(([key, value]) => form.set(key, String(value)));
                    for (const reference of references || []) {
                        if (reference.dataUrl) form.append("image[]", await (await fetchImpl(reference.dataUrl, { signal: request.signal })).blob(), "reference.png");
                    }
                    const task = await readProviderResponse(await fetchImpl(videoUrl, { method: "POST", headers, body: form, signal: request.signal }));
                    const taskId = String(task.id || "");
                    if (!taskId) throw new Error("Video provider did not return a task id");
                    const result = await waitForProviderVideo(fetchImpl, videoUrl, headers, taskId, options.pollIntervalMs || 2500, options.pollTimeoutMs || 300000, request.signal);
                    return { id, status: "succeeded", result };
                }
                const audioResponse = await fetchImpl(providerUrl(options.baseUrl, "audio/speech"), { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ model, input: request.prompt, voice: request.parameters.voice || "alloy", response_format: request.parameters.format || "mp3" }), signal: request.signal });
                if (!audioResponse.ok) await readProviderResponse(audioResponse);
                return { id, status: "succeeded", result: { url: URL.createObjectURL(await audioResponse.blob()), metadata: { mimeType: audioResponse.headers.get("content-type") || "audio/mpeg" } } };
            } catch (error) {
                return { id, status: "failed", error: error instanceof Error ? error.message : String(error) };
            }
        },
    };
}

/**
 * Provider-neutral task orchestration. Providers only implement the adapter;
 * canvas nodes observe stable task transitions and never depend on a vendor API.
 */
export function createGenerationQueue(adapter: LocalGenerationAdapter): GenerationQueue {
    const tasks = new Map<string, GenerationTask>();
    const requests = new Map<string, { request: GenerationRequest; references?: ReferenceImage[] }>();
    const controllers = new Map<string, AbortController>();
    const listeners = new Set<GenerationTaskListener>();
    const publish = (task: GenerationTask) => {
        tasks.set(task.id, task);
        if (["succeeded", "failed", "cancelled"].includes(task.status)) controllers.delete(task.id);
        listeners.forEach((listener) => listener(task));
    };
    const run = async (id: string) => {
        const item = requests.get(id);
        if (!item || tasks.get(id)?.status === "cancelled") return;
        publish({ id, status: "running" });
        try {
            const result = await adapter.submit(item.request, item.references);
            if (tasks.get(id)?.status === "cancelled") return;
            publish({ ...result, id });
        } catch (error) {
            if (tasks.get(id)?.status === "cancelled") return;
            publish({ id, status: "failed", error: error instanceof Error ? error.message : String(error) });
        }
    };
    return {
        submit(request, references) {
            const id = `generation-${crypto.randomUUID()}`;
            const controller = new AbortController();
            controllers.set(id, controller);
            requests.set(id, { request: { ...request, signal: controller.signal }, references });
            const task = { id, status: "queued" as const };
            publish(task);
            void run(id);
            return task;
        },
        get: (id) => tasks.get(id),
        list: () => Array.from(tasks.values()),
        cancel(id) {
            const current = tasks.get(id);
            if (!current || ["succeeded", "failed", "cancelled"].includes(current.status)) return false;
            controllers.get(id)?.abort();
            publish({ id, status: "cancelled" });
            return true;
        },
        retry(id) {
            const current = tasks.get(id);
            if (!current || !["failed", "cancelled"].includes(current.status) || !requests.has(id)) return undefined;
            const next = { id: `generation-${crypto.randomUUID()}`, status: "queued" as const };
            const controller = new AbortController();
            controllers.set(next.id, controller);
            requests.set(next.id, { ...requests.get(id)!, request: { ...requests.get(id)!.request, signal: controller.signal } });
            publish(next);
            void run(next.id);
            return next;
        },
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
    };
}

export function createLocalGenerationAdapter(dependencies: {
    generateText: (prompt: string, model?: string) => Promise<string>;
    generateImage: (prompt: string, model?: string, count?: number, size?: string, references?: ReferenceImage[]) => Promise<string[]>;
    generateVideo: (prompt: string, model?: string, size?: string, seconds?: string, references?: ReferenceImage[]) => Promise<{ url: string; mimeType: string }>;
    generateAudio?: (prompt: string, model?: string, voice?: string) => Promise<{ url: string; mimeType: string }>;
}): LocalGenerationAdapter {
    return {
        async submit(request, references) {
            const id = `generation-${crypto.randomUUID()}`;
            try {
                if (request.kind === "text") return { id, status: "succeeded", result: { metadata: { text: await dependencies.generateText(request.prompt, request.model) } } };
                if (request.kind === "image")
                    return { id, status: "succeeded", result: { metadata: { images: await dependencies.generateImage(request.prompt, request.model, Number(request.parameters.count || 1), String(request.parameters.size || "16:9"), references) } } };
                if (request.kind === "video") return { id, status: "succeeded", result: await dependencies.generateVideo(request.prompt, request.model, String(request.parameters.size || "16:9"), String(request.parameters.seconds || "4"), references) };
                if (!dependencies.generateAudio) throw new Error("No local audio generation adapter is configured");
                return { id, status: "succeeded", result: await dependencies.generateAudio(request.prompt, request.model, String(request.parameters.voice || "default")) };
            } catch (error) {
                return { id, status: "failed", error: error instanceof Error ? error.message : String(error) };
            }
        },
    };
}
