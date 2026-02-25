interface MediaDiagnostic {
  id: string;
  groupId: string;
  level: 'error' | 'warning';
  code: string;
  component: string | null;
  message: string;
  raw: string;
  timestamp: number;
}

interface MediaFatal {
  id: string;
  groupId: string;
  exitCode: number | null;
  internal: boolean;
  message: string;
  details: string | null;
  /** 可选诊断码，用于 i18n 与引导（如 ytDlpNotFound → 重新下载辅助程序） */
  code?: string;
  timestamp: number;
}
