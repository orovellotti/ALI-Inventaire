---
name: Approved MCP execution
description: Security and traceability rules for allowing ALi agents to invoke managed MCP tools.
---

MCP capabilities must be discovered from the live managed server, filtered through a server-owned allowlist, and intersected with the tools explicitly granted to the calling agent before invocation. Policy refusals and connection/tool failures are distinct trace statuses.

**Why:** A browser-owned catalog or a parallel local dispatcher can drift from the real MCP server, admit arbitrary endpoints, or misreport an outage as an authorization refusal.

**How to apply:** When adding an MCP server or tool, keep connection details server-side, derive displayed capabilities through MCP discovery, update the server policy, require per-agent grants, bound calls with timeouts, and retain result/error traces.

Administrable MCP URLs require HTTPS, public DNS, an outbound connection pinned to the validated public IP, manual redirect handling, and response/time limits. A discovered tool is selectable only when its required input schema matches parameters ALi can actually supply.

**Why:** Resolve-then-fetch is vulnerable to DNS rebinding, and displaying an incompatible tool as usable creates persisted approvals that can only fail at runtime. In Replit, public `*.replit.app` hosts may resolve locally to the platform proxy; verify their public DNS separately before pinning the public destination rather than weakening private-network checks.

**How to apply:** Revalidate and pin on discovery and every execution, reject credentials/local/private/reserved targets and unsupported schema shapes, never auto-enable new tools, and keep authentication headers or OAuth outside the URL.

The Harness configuration is the authoritative execution policy for both HTTP routes and the public MCP endpoint. Native direct-service paths must require the exact native agent/MCP/tool grant; a custom tool with the same name must never activate a managed native source.

**Why:** UI-only switches and hidden fallbacks let disabled agents continue changing scientific results, while homonymous custom tools can cause false source attribution.

**How to apply:** Build runtime capability checks server-side, gate every direct and MCP entry point, expose only the operational projection to the public UI, and derive process messages and report sources from what was actually scheduled.

Alternative required inputs must be verified against the actual `tools/list` response, not only against the server-side parser.

**Why:** Runtime parsing can succeed while Claude or ChatGPT rejects the call from an incomplete published contract.

**How to apply:** Add contract tests that inspect discovery and exercise every accepted call shape plus the missing-identifier refusal.