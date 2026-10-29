import { defineAgentTool, type PluginHandlerContext, type PluginServerContext } from "@getpaseo/plugin/server";
import { z } from "zod";
import { TriggerSchema } from "../shared/defer";
import { store } from "./store";
import { createDeferredItem } from "./queue";
import { registerAgentTools } from "./agent-tools";
export function contributeAgentTools(server: PluginServerContext, changed: (paseo: PluginHandlerContext["paseo"]) => Promise<void>) {
  return registerAgentTools(server, [
    defineAgentTool({
      name: "defer_list_messages", description: "Read this agent's pending, sending and failed deferred messages. Other agents' queues are excluded.",
      input: z.object({}).strict(),
      async execute(_, { agent, signal }) {
        if (signal.aborted) throw new Error("Tool call cancelled.");
        const items = (await store.list()).filter(item => item.agentId === agent.id && ["pending", "sending", "failed"].includes(item.state));
        return { text: JSON.stringify({ items }), structuredContent: { items } };
      },
    }),
    defineAgentTool({
      name: "defer_schedule_message", description: "Schedule one message to this agent after a delay, at an absolute ISO time, or at its provider's quota reset. Use only for requested follow-up work; delivery waits for an idle session.",
      input: z.object({ text: z.string().trim().min(1).max(100000), trigger: TriggerSchema }).strict(),
      async execute(input, { agent, paseo, signal }) {
        if (signal.aborted) throw new Error("Tool call cancelled.");
        const { item } = await createDeferredItem({ ...input, agentId: agent.id });
        await changed(paseo);
        const result = { id: item.id, dueAt: item.dueAt, state: item.state };
        return { text: JSON.stringify(result), structuredContent: result };
      },
    }),
  ]);
}
