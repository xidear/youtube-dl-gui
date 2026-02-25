export interface BinaryCheckPayload {
  /** 需要下载的工具名 */
  tools: string[];
  /** 当前平台全部工具名（用于安装页展示） */
  allTools: string[];
}

export interface BinaryDownloadStartPayload {
  tool: string;
  version: string;
}

export interface BinaryDownloadProgressPayload {
  tool: string;
  received: number;
  total: number;
}

export interface BinaryDownloadCompletePayload {
  tool: string;
}

export interface BinaryDownloadErrorPayload {
  tool: string;
  version: string;
  stage: string;
  error: string;
}

export interface BinaryUpdateCompletePayload {
  successes: string[];
  failures: BinaryDownloadErrorPayload[];
  error?: string;
}

export interface BinaryProgress {
  received: number;
  total: number;
  percent: number;
  error?: string;
  version?: string;
  /** 当前下载速度（字节/秒），由前端根据进度事件计算 */
  speed?: number;
}

/** 辅助软件页列表项（来自 binaries_list_for_helpers） */
export interface HelperToolStatus {
  name: string;
  version: string;
  installed: boolean;
}

/** 手动下载说明（来自 binaries_tool_manual_info） */
export interface ManualToolInfo {
  url: string;
  binDir: string;
}
