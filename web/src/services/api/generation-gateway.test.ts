import { describe, expect, test } from "bun:test";

import { createGenerationQueue } from "./generation-gateway";

const request = { kind: "text" as const, prompt: "test", parameters: {} };

describe("generation queue", () => {
    test("publishes running and succeeded states", async () => {
        const states: string[] = [];
        const queue = createGenerationQueue({
            submit: async () => ({ id: "provider-task", status: "succeeded" as const, result: { metadata: { text: "ok" } } }),
        });
        queue.subscribe((task) => states.push(task.status));
        const task = queue.submit(request);
        await Bun.sleep(0);
        expect(queue.get(task.id)?.status).toBe("succeeded");
        expect(states).toEqual(["queued", "running", "succeeded"]);
    });

    test("turns adapter exceptions into failed tasks and retries them", async () => {
        let attempts = 0;
        const queue = createGenerationQueue({
            submit: async () => {
                attempts += 1;
                if (attempts === 1) throw new Error("temporary failure");
                return { id: "provider-task", status: "succeeded" as const };
            },
        });
        const first = queue.submit(request);
        await Bun.sleep(0);
        expect(queue.get(first.id)?.status).toBe("failed");
        const retried = queue.retry(first.id);
        expect(retried).toBeDefined();
        await Bun.sleep(0);
        expect(queue.get(retried!.id)?.status).toBe("succeeded");
    });

    test("cancels an in-flight task and does not publish a later result", async () => {
        let resolveSubmit!: (value: { id: string; status: "succeeded" }) => void;
        const queue = createGenerationQueue({
            submit: () => new Promise((resolve) => {
                resolveSubmit = resolve;
            }),
        });
        const task = queue.submit(request);
        await Bun.sleep(0);
        expect(queue.cancel(task.id)).toBe(true);
        resolveSubmit({ id: "provider-task", status: "succeeded" });
        await Bun.sleep(0);
        expect(queue.get(task.id)?.status).toBe("cancelled");
    });
});
