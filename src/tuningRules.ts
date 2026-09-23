// 业务文件一：判定规则
// 纯逻辑模块：音管判定阈值、批次门禁、复核判定都集中在这里，页面与存储不放在此。

export type ReedState = "normal" | "abnormal";
export type Verdict = "pass" | "warn" | "fail";
export type BatchStatus = "draft" | "blocked" | "review" | "ready" | "handed";

export interface VenueInfo {
  id: string;
  name: string;
}

export interface StopInfo {
  id: string;
  venueId: string;
  name: string;
  kind: string;
}

export interface MeasureDraft {
  cents: number | null;
  temperature: number | null;
  humidity: number | null;
  reed: ReedState;
  note: string;
}

export interface PipeConclusion {
  id: string;
  verdict: Verdict;
  cents: number;
  measuredAt: string;
  technician: string;
  batchId?: string;
}

export interface PipeRecord {
  id: string;
  code: string;
  pitch: string;
  stopId: string;
  base: MeasureDraft;
  history: PipeConclusion[];
}

export interface HandoverBatch {
  id: string;
  stopId: string;
  drafts: Record<string, MeasureDraft>;
  resolvedReviews: string[];
  handedAt: string | null;
}

export interface MaintenanceSession {
  id: string;
  date: string;
  technician: string;
  venueId: string;
  createdAt: string;
  batches: HandoverBatch[];
}

export const VENUES: VenueInfo[] = [
  { id: "v-st-mary", name: "圣玛利亚大教堂" },
  { id: "v-concert-a", name: "A 音乐厅" },
];

export const STOPS: StopInfo[] = [
  { id: "s-trumpet", venueId: "v-st-mary", name: "Trumpet 8'", kind: "簧片音栓" },
  { id: "s-principal", venueId: "v-st-mary", name: "Principal 4'", kind: "主音栓" },
  { id: "s-bourdon", venueId: "v-concert-a", name: "Bourdon 16'", kind: "低音管" },
];

// 音分偏差判定：|偏差| <= 5 通过，6~10 需跟踪，> 10 超限（整批不可交接）
export const CENT_PASS_MAX = 5;
export const CENT_WARN_MAX = 10;

export const VERDICT_TEXT: Record<Verdict, string> = {
  pass: "通过",
  warn: "需跟踪",
  fail: "超限",
};

export const STATUS_TEXT: Record<BatchStatus, string> = {
  draft: "草稿",
  blocked: "门禁未过",
  review: "待复核",
  ready: "可交接",
  handed: "已交接",
};

export const REED_TEXT: Record<ReedState, string> = {
  normal: "正常",
  abnormal: "异常",
};

export function verdictByCents(cents: number): Verdict {
  const abs = Math.abs(cents);
  if (abs > CENT_WARN_MAX) return "fail";
  if (abs > CENT_PASS_MAX) return "warn";
  return "pass";
}

export function isMeasured(m: MeasureDraft): boolean {
  return (
    m.cents !== null &&
    m.temperature !== null &&
    m.humidity !== null &&
    m.reed.trim() !== ""
  );
}

export function getCurrentConclusion(pipe: PipeRecord): PipeConclusion | null {
  return pipe.history.length > 0 ? pipe.history[pipe.history.length - 1] : null;
}

export function formatCents(cents: number | null): string {
  if (cents === null) return "—";
  return cents > 0 ? `+${cents}` : `${cents}`;
}

// 复核指纹：同组内已通过音管，新测量的音分或簧片状态相对上一次通过结论有改动时触发复核
function measureFingerprint(cents: number, reed: ReedState): string {
  return `${cents}|${reed}`;
}

function needsReReview(pipe: PipeRecord, m: MeasureDraft): boolean {
  if (m.cents === null) return false;
  const current = getCurrentConclusion(pipe);
  if (!current || current.verdict !== "pass") return false;
  return measureFingerprint(current.cents, pipe.base.reed) !==
    measureFingerprint(m.cents, m.reed);
}

export interface GateItem {
  type: "env" | "reed" | "verdict" | "unmeasured";
  pipeId: string;
  message: string;
}

export interface BatchCheck {
  status: BatchStatus;
  canHandover: boolean;
  measuredCount: number;
  total: number;
  passCount: number;
  warnCount: number;
  failCount: number;
  blockers: GateItem[];
  reviewPipeIds: string[];
}

export function checkBatch(
  batch: HandoverBatch,
  pipes: PipeRecord[],
): BatchCheck {
  const total = pipes.length;
  let measuredCount = 0;
  let passCount = 0;
  let warnCount = 0;
  let failCount = 0;
  const blockers: GateItem[] = [];
  const reviewPipeIds: string[] = [];

  for (const pipe of pipes) {
    const draft = batch.drafts[pipe.id];
    if (!draft) {
      blockers.push({
        type: "unmeasured",
        pipeId: pipe.id,
        message: `${pipe.code} 测量信息未填完`,
      });
      continue;
    }

    const complete =
      draft.cents !== null &&
      draft.temperature !== null &&
      draft.humidity !== null &&
      draft.reed.trim() !== "";
    if (complete) measuredCount += 1;

    if (draft.cents === null) {
      blockers.push({
        type: "unmeasured",
        pipeId: pipe.id,
        message: `${pipe.code} 未填写音分偏差`,
      });
    }
    if (draft.temperature === null) {
      blockers.push({
        type: "env",
        pipeId: pipe.id,
        message: `${pipe.code} 缺少温度`,
      });
    }
    if (draft.humidity === null) {
      blockers.push({
        type: "env",
        pipeId: pipe.id,
        message: `${pipe.code} 缺少湿度`,
      });
    }
    if (draft.reed === "abnormal" && draft.note.trim() === "") {
      blockers.push({
        type: "reed",
        pipeId: pipe.id,
        message: `${pipe.code} 簧片异常但备注为空`,
      });
    }

    if (draft.cents !== null) {
      const cents = draft.cents;
      const verdict = verdictByCents(cents);
      if (verdict === "pass") passCount += 1;
      if (verdict === "warn") warnCount += 1;
      if (verdict === "fail") {
        failCount += 1;
        blockers.push({
          type: "verdict",
          pipeId: pipe.id,
          message: `${pipe.code} 音分偏差 ${formatCents(cents)} 超过 ±${CENT_WARN_MAX}`,
        });
      }

      if (
        needsReReview(pipe, draft) &&
        !batch.resolvedReviews.includes(pipe.id)
      ) {
        reviewPipeIds.push(pipe.id);
      }
    }
  }

  if (batch.handedAt) {
    return {
      status: "handed",
      canHandover: false,
      measuredCount,
      total,
      passCount,
      warnCount,
      failCount,
      blockers,
      reviewPipeIds,
    };
  }

  let status: BatchStatus = "draft";
  if (reviewPipeIds.length > 0) {
    status = "review";
  } else if (blockers.length > 0 || measuredCount < total) {
    status = "blocked";
  } else if (measuredCount === total) {
    status = "ready";
  }

  return {
    status,
    canHandover:
      measuredCount === total &&
      blockers.length === 0 &&
      reviewPipeIds.length === 0,
    measuredCount,
    total,
    passCount,
    warnCount,
    failCount,
    blockers,
    reviewPipeIds,
  };
}
