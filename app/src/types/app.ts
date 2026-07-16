export type ModelConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
};

export type DocumentStatus = {
  docId: string;
  sourcePath: string;
  displayName: string;
  sourceKind: string;
  completedRounds: number[];
  nextRound: number | null;
  hasNextRound: boolean;
  canResume: boolean;
  completedChunkCount: number;
  totalChunkCount: number;
  progressStatus: string;
  lastError: string;
  stopReason: string;
  currentInputPath: string;
  currentOutputPath: string;
  manifestPath: string;
  status: string;
};

export type RoundProgress = {
  phase: string;
  round: number;
  currentChunk?: number;
  totalChunks?: number;
  completedChunks?: number;
  chunkId?: string;
  error?: string;
  message?: string;
  inputPreview?: string;
  outputPreview?: string;
  streamText?: string;
  /* Agent tracing */
  step?: string;
  details?: Record<string, unknown>;
};

export type AgentStepEvent = {
  phase: string;
  step?: string;
  status?: string;
  message?: string;
  content?: string;
  thoughtType?: string;
  details?: Record<string, unknown>;
  original_text?: string;
  rewritten_text?: string;
  streamText?: string;
  score?: number;
  iteration?: number;
  maxIterations?: number;
};

export type ParagraphPreview = {
  paragraphIndex: number;
  text: string;
  originalText: string;
  chunkIds: string[];
  chunkCount: number;
};

export type RoundResult = {
  round: number;
  outputPath: string;
  manifestPath: string;
  paragraphs: ParagraphPreview[];
};

export type TestConnectionResult = {
  ok: boolean;
  message: string;
  endpoint: string;
  model: string;
  apiType?: string;
  status?: number;
};
