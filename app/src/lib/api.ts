import type { DocumentStatus, ModelConfig, ParagraphPreview, RoundProgress, TestConnectionResult } from "../types/app";

async function req<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null) as { message?: string } | null;
    throw new Error(body?.message || `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

function parseDownloadFilename(contentDisposition: string | null, fallbackName: string): string {
  if (!contentDisposition) return fallbackName;

  const encodedMatch = contentDisposition.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  if (encodedMatch?.[1]) {
    try {
      return decodeURIComponent(encodedMatch[1].trim()).replace(/^["']|["']$/g, "");
    } catch {
      return encodedMatch[1].trim().replace(/^["']|["']$/g, "");
    }
  }

  const quotedMatch = contentDisposition.match(/filename\s*=\s*"([^"]+)"/i);
  if (quotedMatch?.[1]) return quotedMatch[1].trim();

  const plainMatch = contentDisposition.match(/filename\s*=\s*([^;]+)/i);
  if (plainMatch?.[1]) return plainMatch[1].trim().replace(/^["']|["']$/g, "");

  return fallbackName;
}

/* ── Model Config ── */

export async function loadModelConfig(): Promise<ModelConfig> {
  const data = await req<Partial<ModelConfig>>("/api/model-config");
  return {
    baseUrl: data.baseUrl || "",
    apiKey: data.apiKey || "",
    model: data.model || "",
    temperature: data.temperature ?? 0.7,
  };
}

export async function saveModelConfig(config: ModelConfig): Promise<ModelConfig> {
  return req<ModelConfig>("/api/model-config", {
    method: "POST",
    body: JSON.stringify(config),
  });
}

export async function testConnection(config: ModelConfig): Promise<TestConnectionResult> {
  return req<TestConnectionResult>("/api/test-connection", {
    method: "POST",
    body: JSON.stringify(config),
  });
}

/* ── Document ── */

type UploadDocResponse = {
  sourcePath: string;
  filename: string;
  displayName: string;
  conflict?: boolean;
};

export async function uploadDocument(filename: string, content: string, encoding: "text" | "base64" = "text"): Promise<UploadDocResponse> {
  const body: Record<string, unknown> = { filename, encoding };
  if (encoding === "base64") {
    body.contentBase64 = content;
  } else {
    body.content = content;
  }
  return req<UploadDocResponse>("/api/upload-document", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function getDocumentStatus(sourcePath: string): Promise<DocumentStatus> {
  return req<DocumentStatus>(`/api/document-status?sourcePath=${encodeURIComponent(sourcePath)}`);
}

export async function listDocumentHistories(): Promise<{ items: Array<{ docId: string; sourcePath: string; latestOutputPath: string; displayName: string; completedRounds: number[]; lastTimestamp: string }>; total: number }> {
  return req("/api/history-documents");
}

export async function deleteDocumentHistory(docId: string): Promise<{ docId: string; removedDocument: boolean }> {
  return req("/api/document-history", {
    method: "DELETE",
    body: JSON.stringify({ docId }),
  });
}

/* ── Round Execution ── */

export async function startRunRound(sourcePath: string, config: ModelConfig): Promise<string> {
  const { runId } = await req<{ runId: string }>("/api/run-round", {
    method: "POST",
    body: JSON.stringify({ sourcePath, modelConfig: config }),
  });
  return runId;
}

export async function agentProcess(text: string, config: ModelConfig): Promise<string> {
  const { runId } = await req<{ runId: string }>("/api/agent-process", {
    method: "POST",
    body: JSON.stringify({ text, modelConfig: config }),
  });
  return runId;
}

export async function agentFileProcess(sourcePath: string, config: ModelConfig): Promise<string> {
  const { runId } = await req<{ runId: string }>("/api/agent-file-process", {
    method: "POST",
    body: JSON.stringify({ sourcePath, modelConfig: config }),
  });
  return runId;
}

export async function quickProcess(text: string, config: ModelConfig): Promise<string> {
  const { runId } = await req<{ runId: string }>("/api/quick-process", {
    method: "POST",
    body: JSON.stringify({ text, modelConfig: config }),
  });
  return runId;
}

export async function requestStop(sourcePath: string): Promise<DocumentStatus> {
  return req<DocumentStatus>("/api/request-stop", {
    method: "POST",
    body: JSON.stringify({ sourcePath, promptProfile: "cn" }),
  });
}

export function listenRoundProgress(
  runId: string,
  onProgress: (p: RoundProgress) => void,
  onResult: (result: { outputPath: string; manifestPath: string; paragraphs: ParagraphPreview[] }) => void,
  onError: (err: string) => void,
): () => void {
  const es = new EventSource(`/api/run-round-events/${runId}`);

  es.addEventListener("progress", (event) => {
    try {
      onProgress(JSON.parse(event.data) as RoundProgress);
    } catch { /* ignore parse errors */ }
  });

  es.addEventListener("result", (event) => {
    try {
      const data = JSON.parse(event.data);
      onResult(data);
    } catch { /* ignore */ }
  });

  es.addEventListener("error", (event) => {
    try {
      const data = JSON.parse((event as MessageEvent).data) as { message?: string };
      onError(data.message || "未知错误");
    } catch {
      onError("轮次执行失败");
    }
    es.close();
  });

  es.onerror = () => {
    onError("进度推送连接断开");
    es.close();
  };

  return () => es.close();
}

/* ── Preview & Export ── */

export async function readOutputPreview(outputPath: string, manifestPath: string): Promise<{ text: string; paragraphs: ParagraphPreview[] }> {
  return req<{ text: string; paragraphs: ParagraphPreview[] }>(
    `/api/read-output-preview?outputPath=${encodeURIComponent(outputPath)}&manifestPath=${encodeURIComponent(manifestPath)}`,
  );
}

export async function readSourcePreview(inputPath: string, manifestPath: string): Promise<{ text: string; paragraphs: ParagraphPreview[] }> {
  return req<{ text: string; paragraphs: ParagraphPreview[] }>(
    `/api/read-source-preview?inputPath=${encodeURIComponent(inputPath)}&manifestPath=${encodeURIComponent(manifestPath)}`,
  );
}

export async function exportRound(outputPath: string, format: "txt" | "docx"): Promise<void> {
  const res = await fetch(`/api/export-round?outputPath=${encodeURIComponent(outputPath)}&targetFormat=${format}`);
  if (!res.ok) throw new Error(`Export failed: ${res.status}`);
  const blob = await res.blob();
  const name = parseDownloadFilename(res.headers.get("Content-Disposition"), `result.${format}`);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
