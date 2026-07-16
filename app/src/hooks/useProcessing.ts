import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "../lib/api";
import type { DocumentStatus, ModelConfig, ParagraphPreview, RoundProgress } from "../types/app";

const CONFIG_KEY = "zhipu-cleartrace-config";
const LAST_DOC_KEY = "zhipu-cleartrace-last-doc";

function humanizeErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const message = raw.replace(/^Error:\s*/i, "").trim();
  const normalized = message.toLowerCase();

  if (
    normalized.includes("status 401") ||
    normalized.includes('"code":"401"') ||
    normalized.includes("token expired or incorrect")
  ) {
    return "智谱 API Key 无效或已过期，请检查后重新填写。修改配置后，请重新点击一次“测试连通性”。";
  }

  if (normalized.includes("model configuration is incomplete")) {
    return "模型配置不完整，请检查 API Key、Base URL 和模型名称。";
  }

  if (
    normalized.includes("tls certificate") ||
    normalized.includes("certificate bundle") ||
    normalized.includes("cacert.pem")
  ) {
    return "本机 TLS 证书配置异常，已切换为应用内置证书链。请重试一次；如果仍失败，再继续排查本地 Python 环境。";
  }

  if (normalized.includes("status 429")) {
    return "请求过于频繁，或当前账号额度不足，请稍后再试。";
  }

  if (
    normalized.includes("status 500") ||
    normalized.includes("status 502") ||
    normalized.includes("status 503")
  ) {
    return "模型服务暂时不可用，请稍后重试。";
  }

  return message;
}

function loadSavedConfig(): ModelConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) return JSON.parse(raw) as ModelConfig;
  } catch { /* ignore */ }
  return {
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    apiKey: "",
    model: "glm-4.5-flash",
    temperature: 0.7,
  };
}

function saveConfig(config: ModelConfig) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

export type HistoryDocItem = {
  docId: string;
  sourcePath: string;
  displayName: string;
  completedRounds: number[];
  lastTimestamp: string;
  latestOutputPath: string;
};

export type ProcessingState = {
  config: ModelConfig;
  setConfig: (c: ModelConfig) => void;
  testResult: string;
  testBusy: boolean;
  testConnection: () => Promise<void>;
  doc: DocumentStatus | null;
  uploadBusy: boolean;
  selectedFile: string;
  pickFile: () => Promise<void>;
  progress: RoundProgress | null;
  setProgress: (value: RoundProgress | null) => void;
  execBusy: boolean;
  setExecBusy: (value: boolean) => void;
  runRound: () => Promise<void>;
  quickProcess: (text: string) => Promise<void>;
  stopRound: () => Promise<void>;
  resultText: string;
  resultParagraphs: ParagraphPreview[];
  resultOutputPath: string;
  resultManifestPath: string;
  exportBusy: boolean;
  doExport: (fmt: "txt" | "docx") => Promise<void>;
  notice: string;
  error: string;
  clearNotice: () => void;
  clearError: () => void;
  historyItems: HistoryDocItem[];
  refreshHistory: () => Promise<void>;
  refreshDocumentStatus: (sourcePath?: string) => Promise<void>;
  restoreDocument: (item: HistoryDocItem) => Promise<void>;
  deleteHistory: (docId: string) => Promise<void>;
  resultViewToken: number;
  setResultText: (t: string) => void;
  setResultParagraphs: (p: ParagraphPreview[]) => void;
  setResultOutputPath: (p: string) => void;
  setResultManifestPath: (p: string) => void;
  setResultViewToken: (fn: (v: number) => number) => void;
  setError: (e: string) => void;
  setNotice: (n: string) => void;
};

export function useProcessing(): ProcessingState {
  const [config, setConfigRaw] = useState<ModelConfig>(loadSavedConfig);
  const [testResult, setTestResult] = useState("");
  const [testBusy, setTestBusy] = useState(false);
  const [doc, setDoc] = useState<DocumentStatus | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [selectedFile, setSelectedFile] = useState("");
  const [progress, setProgress] = useState<RoundProgress | null>(null);
  const [execBusy, setExecBusy] = useState(false);
  const [resultText, setResultText] = useState("");
  const [resultParagraphs, setResultParagraphs] = useState<ParagraphPreview[]>([]);
  const [resultOutputPath, setResultOutputPath] = useState("");
  const [resultManifestPath, setResultManifestPath] = useState("");
  const [exportBusy, setExportBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [historyItems, setHistoryItems] = useState<HistoryDocItem[]>([]);
  const [resultViewToken, setResultViewToken] = useState(0);
  const unlistenRef = useRef<(() => void) | null>(null);

  const clearNotice = useCallback(() => setNotice(""), []);
  const clearError = useCallback(() => setError(""), []);

  const setConfig = useCallback((c: ModelConfig) => {
    setConfigRaw(c);
    saveConfig(c);
    setTestResult("");
    setError("");
    setNotice("");
  }, []);

  // Load history list on mount — don't auto-restore any document
  useEffect(() => {
    (async () => {
      try {
        const { items } = await api.listDocumentHistories();
        setHistoryItems(items as HistoryDocItem[]);
      } catch { /* first visit */ }
    })();
  }, []);

  const refreshHistory = useCallback(async () => {
    try {
      const { items } = await api.listDocumentHistories();
      setHistoryItems(items as HistoryDocItem[]);
    } catch { /* ignore */ }
  }, []);

  const refreshDocumentStatus = useCallback(async (sourcePath?: string) => {
    const targetPath = sourcePath || doc?.sourcePath;
    if (!targetPath) return;
    try {
      const status = await api.getDocumentStatus(targetPath);
      setDoc(status);
      setSelectedFile(status.displayName);
    } catch { /* ignore */ }
  }, [doc?.sourcePath]);

  const restoreDocument = useCallback(async (item: HistoryDocItem) => {
    setError("");
    setNotice("");
    setProgress(null);
    setResultText("");
    setResultParagraphs([]);
    try {
      const status = await api.getDocumentStatus(item.sourcePath);
      setDoc(status);
      setSelectedFile(item.displayName);
      localStorage.setItem(LAST_DOC_KEY, item.docId);

      const outputPath = item.latestOutputPath || status.currentOutputPath;
      const manifestPath = status.manifestPath;
      if (outputPath && manifestPath && outputPath !== status.currentOutputPath) {
        try {
          const preview = await api.readOutputPreview(outputPath, manifestPath);
          setResultText(preview.text);
          setResultParagraphs(preview.paragraphs);
          setResultOutputPath(outputPath);
          setResultManifestPath(manifestPath);
          setResultViewToken((v) => v + 1);
        } catch { /* no preview */ }
      }
      setNotice(`已切换到「${item.displayName}」`);
    } catch (e) {
      setError(humanizeErrorMessage(e));
    }
  }, []);

  const quickProcess = useCallback(async (text: string) => {
    if (!config.apiKey || !config.baseUrl || !config.model) {
      setError("请先填写模型配置");
      return;
    }
    setExecBusy(true);
    setError("");
    setNotice("");
    setProgress(null);
    setResultText("");
    setResultParagraphs([]);

    try {
      const runId = await api.quickProcess(text, config);
      const result = await new Promise<{ outputPath: string; manifestPath: string; paragraphs: ParagraphPreview[] }>((resolve, reject) => {
        const unsub = api.listenRoundProgress(
          runId, (p) => setProgress(p), (r) => { resolve(r); }, (err) => reject(new Error(err)),
        );
        unlistenRef.current = unsub;
      });
      unlistenRef.current?.();
      unlistenRef.current = null;
      setProgress(null);

      setResultOutputPath(result.outputPath);
      setResultManifestPath(result.manifestPath);
      const preview = await api.readOutputPreview(result.outputPath, result.manifestPath);
      setResultText(preview.text);
      setResultParagraphs(preview.paragraphs);

      // Don't set doc/selectedFile — quick paste doesn't pollute workspace
      setResultViewToken((v) => v + 1);
      await refreshHistory();
      setNotice("✅ 处理完成");
    } catch (e) {
      unlistenRef.current?.();
      unlistenRef.current = null;
      setProgress(null);
      setError(humanizeErrorMessage(e));
    } finally {
      setExecBusy(false);
    }
  }, [config, refreshHistory]);

  const testConnection = useCallback(async () => {
    if (!config.apiKey || !config.baseUrl || !config.model) {
      setError("请先填写完整的模型配置");
      return;
    }
    setTestBusy(true);
    setError("");
    setTestResult("");
    try {
      const r = await api.testConnection(config);
      setTestResult(r.ok ? `✅ 连通成功 (${r.model})` : `❌ 失败: ${r.message}`);
    } catch (e) {
      setError(humanizeErrorMessage(e));
    } finally {
      setTestBusy(false);
    }
  }, [config]);

  const pickFile = useCallback(async () => {
    setUploadBusy(true);
    setError("");
    setNotice("");
    try {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".txt,.docx";
      const file = await new Promise<File | null>((resolve) => {
        let resolved = false;
        input.onchange = () => { resolved = true; resolve(input.files?.[0] ?? null); };
        const onFocus = () => {
          setTimeout(() => { if (!resolved) resolve(null); }, 200);
        };
        window.addEventListener("focus", onFocus, { once: true });
        input.click();
      });
      if (!file) { setUploadBusy(false); return; }

      let payload: { filename: string; content: string; encoding: "text" | "base64" };
      let fileContent: string;
      if (file.name.toLowerCase().endsWith(".docx")) {
        fileContent = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => {
            const s = r.result as string;
            resolve(s.slice(s.indexOf(",") + 1));
          };
          r.onerror = () => reject(new Error("读取文件失败"));
          r.readAsDataURL(file);
        });
        payload = { filename: file.name, content: fileContent, encoding: "base64" };
      } else {
        fileContent = await file.text();
        if (!fileContent.trim()) {
          setError("文件内容为空，请重新选择");
          setUploadBusy(false);
          return;
        }
        payload = { filename: file.name, content: fileContent, encoding: "text" };
      }

      const uploaded = await api.uploadDocument(payload.filename, payload.content, payload.encoding);
      setSelectedFile(uploaded.displayName);
      const status = await api.getDocumentStatus(uploaded.sourcePath);
      setDoc(status);
      localStorage.setItem(LAST_DOC_KEY, status.docId);
      await refreshHistory();
      setNotice(`已导入「${uploaded.displayName}」`);
    } catch (e) {
      setError(humanizeErrorMessage(e));
    } finally {
      setUploadBusy(false);
    }
  }, [refreshHistory]);

  const runRound = useCallback(async () => {
    if (!doc) { setError("请先导入文档"); return; }
    if (!config.apiKey || !config.baseUrl || !config.model) {
      setError("请先填写模型配置");
      return;
    }
    setExecBusy(true);
    setError("");
    setNotice("");
    setProgress(null);
    setResultText("");
    setResultParagraphs([]);

    try {
      const runId = await api.startRunRound(doc.sourcePath, config);

      const result = await new Promise<{ outputPath: string; manifestPath: string; paragraphs: ParagraphPreview[] }>((resolve, reject) => {
        const unsub = api.listenRoundProgress(
          runId,
          (p) => setProgress(p),
          (r) => { resolve(r); },
          (err) => reject(new Error(err)),
        );
        unlistenRef.current = unsub;
      });

      unlistenRef.current?.();
      unlistenRef.current = null;
      setProgress(null);

      setResultOutputPath(result.outputPath);
      setResultManifestPath(result.manifestPath);
      const preview = await api.readOutputPreview(result.outputPath, result.manifestPath);
      setResultText(preview.text);
      setResultParagraphs(preview.paragraphs);
      setResultViewToken((v) => v + 1);

      const updated = await api.getDocumentStatus(doc.sourcePath);
      setDoc(updated);
      localStorage.setItem(LAST_DOC_KEY, updated.docId);
      await refreshHistory();
      setNotice("✅ 处理完成");
    } catch (e) {
      unlistenRef.current?.();
      unlistenRef.current = null;
      setProgress(null);
      setError(humanizeErrorMessage(e));
    } finally {
      setExecBusy(false);
    }
  }, [doc, config, refreshHistory]);

  const stopRound = useCallback(async () => {
    if (!doc) return;
    try {
      const updated = await api.requestStop(doc.sourcePath);
      setDoc(updated);
      setNotice("已发送停止请求");
    } catch (e) {
      setError(humanizeErrorMessage(e));
    }
  }, [doc]);

  const deleteHistory = useCallback(async (docId: string) => {
    try {
      await api.deleteDocumentHistory(docId);
      // Clear UI if active doc was deleted
      if (doc?.docId === docId) {
        setDoc(null);
        setSelectedFile("");
        setResultText("");
        setResultParagraphs([]);
        setResultOutputPath("");
        setResultManifestPath("");
        localStorage.removeItem(LAST_DOC_KEY);
      }
      await refreshHistory();
      setNotice("历史已删除");
    } catch (e) {
      setError(humanizeErrorMessage(e));
    }
  }, [doc, refreshHistory]);

  const doExport = useCallback(async (fmt: "txt" | "docx") => {
    if (!resultOutputPath) { setError("没有可导出的结果"); return; }
    setExportBusy(true);
    try {
      await api.exportRound(resultOutputPath, fmt);
      setNotice(`✅ 已导出 ${fmt.toUpperCase()}`);
    } catch (e) {
      setError(humanizeErrorMessage(e));
    } finally {
      setExportBusy(false);
    }
  }, [resultOutputPath]);

  return {
    config, setConfig,
    testResult, testBusy, testConnection,
    doc, uploadBusy, selectedFile, pickFile,
    progress, execBusy, runRound, quickProcess, stopRound,
    setProgress,
    setExecBusy,
    resultText, resultParagraphs, resultOutputPath, resultManifestPath,
    exportBusy, doExport,
    notice, error, clearNotice, clearError,
    historyItems, refreshHistory, refreshDocumentStatus, restoreDocument, deleteHistory,
    resultViewToken,
    setResultText, setResultParagraphs, setResultOutputPath, setResultManifestPath,
    setResultViewToken, setError, setNotice,
  };
}
