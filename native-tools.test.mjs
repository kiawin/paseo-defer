import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
async function tools(stubs = {}, read) {
  const bundle = await build({ entryPoints: ["server/native-tools.ts"], bundle: true, write: false, platform: "node", format: "cjs", packages: "external", plugins: [{ name: "fixture-services", setup(build) { build.onResolve({ filter: /^\./ }, args => Object.hasOwn(stubs, args.path) ? { path: "fixture:" + args.path, external: true } : undefined); } }] });
  const module = { exports: {} };
  new Function("require", "module", "exports", bundle.outputFiles[0].text)(id => id.startsWith("fixture:") ? stubs[id.slice(8)] : require(id), module, module.exports);
  let open;
  module.exports.contributeAgentTools({ before(name, handler) { assert.equal(name, "agent.session_open"); open = handler; return () => {}; } }, read);
  const request = { purpose: "interactive", provider: "claude", labels: {}, workspaceId: "w1", tools: [] };
  return { definitions: open({ request }).tools, module: module.exports };
}
const context = () => ({ agent: { id: "caller", workspaceId: "w1", provider: "claude", cwd: "/fixture", title: "Fixture" }, paseo: {}, signal: new AbortController().signal });
async function call(tool, input, ctx = context()) { return tool.execute(tool.input.parse(input), ctx); }
test("deferred reads and scheduling are bound to the authenticated caller", async () => {
  let created, changed = false;
  const { definitions } = await tools({ "./store": { store: { list: async () => [{ id: "own", agentId: "caller", state: "pending" }, { id: "foreign", agentId: "other", state: "pending" }, { id: "done", agentId: "caller", state: "sent" }] } }, "./queue": { createDeferredItem: async input => { created = input; return { item: { id: "new", state: "pending", dueAt: "fixture" } }; } } }, async () => { changed = true; });
  assert.deepEqual((await call(definitions[0], {})).structuredContent.items.map(item => item.id), ["own"]);
  const input = { text: "requested follow-up", trigger: { kind: "after", ms: 60000 } };
  assert.throws(() => definitions[1].input.parse({ ...input, agentId: "other" }));
  await call(definitions[1], input); assert.equal(created.agentId, "caller"); assert.equal(changed, true);
  const controller = new AbortController(); controller.abort(); created = null;
  await assert.rejects(call(definitions[1], input, { ...context(), signal: controller.signal }), /cancelled/); assert.equal(created, null);
});
