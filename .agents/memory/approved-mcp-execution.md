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