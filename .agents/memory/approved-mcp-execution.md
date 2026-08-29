---
name: Approved MCP execution
description: Security and traceability rules for allowing ALi agents to invoke managed MCP tools.
---

MCP capabilities must be discovered from the live managed server, filtered through a server-owned allowlist, and intersected with the tools explicitly granted to the calling agent before invocation. Policy refusals and connection/tool failures are distinct trace statuses.

**Why:** A browser-owned catalog or a parallel local dispatcher can drift from the real MCP server, admit arbitrary endpoints, or misreport an outage as an authorization refusal.

**How to apply:** When adding an MCP server or tool, keep connection details server-side, derive displayed capabilities through MCP discovery, update the server policy, require per-agent grants, bound calls with timeouts, and retain result/error traces.