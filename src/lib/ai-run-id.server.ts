const RUN_ID_HEADER = "X-Lovable-AIG-Run-ID";

export function createRunIdFetch(initialRunId?: string) {
  let runId = initialRunId?.trim() || undefined;
  let resolveRunId: (value: string | undefined) => void = () => undefined;
  const ready = new Promise<string | undefined>((resolve) => { resolveRunId = resolve; });
  let resolved = Boolean(runId);

  return {
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      if (runId) headers.set(RUN_ID_HEADER, runId);
      const response = await fetch(input, { ...init, headers });
      const received = response.headers.get(RUN_ID_HEADER)?.trim() || undefined;
      if (!runId && received) runId = received;
      if (!resolved) { resolved = true; resolveRunId(runId); }
      return response;
    },
    getRunId: () => runId,
    waitForRunId: () => runId ? Promise.resolve(runId) : ready,
  };
}

export async function attachRunId(response: Response, gateway: ReturnType<typeof createRunIdFetch>) {
  const runId = gateway.getRunId() ?? await gateway.waitForRunId();
  if (!runId) return response;
  const headers = new Headers(response.headers);
  headers.set(RUN_ID_HEADER, runId);
  headers.set("Access-Control-Expose-Headers", RUN_ID_HEADER);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}