/** 业务实体类型：场馆 / 音栓 / 音管 / 交接批次 */

export type ReedStatus = "normal" | "abnormal";

/** 单根音管的最新一次测量 */
export interface Measurement {
  /** 音高，如 C4 */
  pitch: string;
  /** 音分偏差（cent），null 表示尚未录入 */
  cents: number | null;
  /** 温度 ℃，null 表示缺失 */
  temperature: number | null;
  /** 相对湿度 %，null 表示缺失 */
  humidity: number | null;
  /** 簧片状态 */
  reed: ReedStatus;
  /** 维修备注 */
  note: string;
  /** 最近测量时间 ISO */
  updatedAt: string;
}

export interface Venue {
  id: string;
  name: string;
  subtitle: string;
}

export type StopKind = "主音栓" | "簧片音栓" | "混合音栓";

export interface StopInfo {
  id: string;
  venueId: string;
  name: string;
  kind: StopKind;
}

export interface Pipe {
  id: string;
  stopId: string;
  /** 音管编号，如 P-01 */
  code: string;
  measurement: Measurement;
}

/** 一条判定结论的快照（退回复核时旧快照仍保留） */
export interface ConclusionSnapshot {
  status: "passed" | "review";
  title: string;
  detail: string;
  at: string;
}

/** 音管在某一交接批次中的判定 */
export interface Verdict {
  status: "passed" | "review";
  current: ConclusionSnapshot;
  /** 历史结论，按时间倒序，旧结论保留于此 */
  history: ConclusionSnapshot[];
}

/** 一次维护按音栓生成的交接批次 */
export interface Batch {
  id: string;
  maintenanceId: string;
  venueId: string;
  stopId: string;
  createdAt: string;
  /** 交接时间；null 表示仍在维护中（草稿批次） */
  handedAt: string | null;
  /** 交接时按音管固化的结论快照 */
  verdicts: Record<string, Verdict>;
}

/** 一次维护（同一场馆） */
export interface Maintenance {
  id: string;
  venueId: string;
  startedAt: string;
}

export interface AppData {
  version: 1;
  venues: Venue[];
  stops: StopInfo[];
  pipes: Pipe[];
  maintenances: Maintenance[];
  batches: Batch[];
  seq: number;
}
