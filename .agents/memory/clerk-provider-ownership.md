---
name: Clerk provider ownership
description: Why ALi must keep a single Clerk provider inside its client-side router.
---

Keep exactly one Clerk provider in the application tree. It belongs inside the Wouter context, where the ALi appearance, localized sign-in copy, proxy settings, and router callbacks can be configured together.

**Why:** Wrapping the root a second time causes a fatal Clerk runtime error. Moving the configured provider outside Wouter would also prevent its navigation callbacks from using the router correctly.

**How to apply:** When changing authentication bootstrap code or reconciling auth-related merges, extend the existing configured provider rather than adding another one in the entry point.