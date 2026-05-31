export type PipelineStatus = {
  status: string;
  heritageRows: number;
  developmentRows: number;
  durationSeconds: number;
  refreshedAt: Date;
  warnings: string[];
};

export async function fetchPipelineRefresh(): Promise<PipelineStatus> {
  const res = await fetch("/api/v1/pipeline/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ force: false }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`Pipeline refresh ${res.status}: ${detail}`);
  }

  const data = await res.json();
  return {
    status: data.status,
    heritageRows: data.heritage_rows,
    developmentRows: data.development_rows,
    durationSeconds: data.duration_seconds,
    refreshedAt: new Date(data.refreshed_at),
    warnings: data.warnings ?? [],
  };
}
