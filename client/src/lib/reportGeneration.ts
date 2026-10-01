export interface ReportRequest {
  scope: object;
  controller: AbortController;
}

/** Guards every async completion, including servers/mocks that ignore abort. */
export class ReportGenerationGate {
  private scope: object | null = null;
  private request: ReportRequest | null = null;

  setScope(scope: object): void {
    if (this.scope === scope) return;
    this.invalidate();
    this.scope = scope;
  }

  begin(scope: object): ReportRequest | null {
    this.setScope(scope);
    if (this.request) return null;
    const request = { scope, controller: new AbortController() };
    this.request = request;
    return request;
  }

  isCurrent(request: ReportRequest): boolean {
    return this.request === request && this.scope === request.scope && !request.controller.signal.aborted;
  }

  finish(request: ReportRequest): void {
    if (this.request === request) this.request = null;
  }

  invalidate(): void {
    this.request?.controller.abort();
    this.request = null;
    this.scope = null;
  }
}