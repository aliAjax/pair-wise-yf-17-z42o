import type { Batch, ConclusionSnapshot, Measurement, Pipe } from "./types";

/** 音分偏差允许范围：|偏差| <= CENT_LIMIT 视为合格 */
export const CENT_LIMIT = 5;

/** 单管阻断原因（整批因此不能交接） */
export interface PipeBlockers {
  missingTemperature: boolean;
  missingHumidity: boolean;
  reedAbnormalWithoutNote: boolean;
}

/** 单管实时判定 */
export interface PipeCheck {
  blockers: PipeBlockers;
  blockerReasons: string[];
  /** |音分偏差| 超限（在可交接前提下退回复核的质量问题） */
  centsOutOfRange: boolean;
  centsMissing: boolean;
  passed: boolean;
  needsReview: boolean;
}

/**
 * 判定规则：
 * 1. 温度或湿度任一缺失 → 阻断交接；
 * 2. 簧片异常但备注为空 → 阻断交接；
 * 3. 音分偏差超出 ±5 cent（或未录入）→ 不能通过，退回复核；
 * 4. 补齐阻断项后再次计算即自动恢复。
 */
export function checkMeasurement(m: Measurement): PipeCheck {
  const blockers: PipeBlockers = {
    missingTemperature: m.temperature === null,
    missingHumidity: m.humidity === null,
    reedAbnormalWithoutNote: m.reed === "abnormal" && m.note.trim() === "",
  };

  const blockerReasons: string[] = [];
  if (blockers.missingTemperature) blockerReasons.push("温度缺失");
  if (blockers.missingHumidity) blockerReasons.push("湿度缺失");
  if (blockers.reedAbnormalWithoutNote) blockerReasons.push("簧片异常但备注为空");

  const centsMissing = m.cents === null;
  const centsOutOfRange =
    m.cents !== null && Math.abs(m.cents) > CENT_LIMIT;

  const blocked = blockerReasons.length > 0;
  return {
    blockers,
    blockerReasons,
    centsOutOfRange,
    centsMissing,
    passed: !blocked && !centsOutOfRange && !centsMissing,
    needsReview: !blocked && (centsOutOfRange || centsMissing),
  };
}

/** 汇总整批所有音管的阻断原因（去重） */
export function collectBatchBlockers(pipes: Pipe[]): string[] {
  const reasons = new Set<string>();
  for (const pipe of pipes) {
    for (const reason of checkMeasurement(pipe.measurement).blockerReasons) {
      reasons.add(`${pipe.code} ${reason}`);
    }
  }
  return [...reasons];
}

/** 整批是否可以交接：无阻断原因，且每根音管实时判定通过 */
export function batchCanHandOver(pipes: Pipe[]): boolean {
  if (pipes.length === 0) return false;
  return pipes.every((p) => checkMeasurement(p.measurement).passed);
}

export type BatchState =
  | "draft" // 维护中：尚无阻断，全部通过，可交接
  | "draft-blocked" // 维护中：存在阻断或待复核，不能交接
  | "handed" // 已交接：全部维持通过
  | "review"; // 已交接：有音管被新测量改动，退回待复核

export interface BatchEvaluation {
  state: BatchState;
  blockerReasons: string[];
  needsReviewPipeIds: string[];
}

/** 批次综合状态（草稿批次按实时测量判定；已交接批次结合固化结论） */
export function evaluateBatch(batch: Batch, pipes: Pipe[]): BatchEvaluation {
  const blockerReasons = collectBatchBlockers(pipes);
  const byId = new Map(pipes.map((p) => [p.id, p]));

  if (batch.handedAt === null) {
    const needsReviewPipeIds = pipes
      .filter((p) => !checkMeasurement(p.measurement).passed)
      .map((p) => p.id);
    return {
      state: blockerReasons.length === 0 && needsReviewPipeIds.length === 0
        ? "draft"
        : "draft-blocked",
      blockerReasons,
      needsReviewPipeIds,
    };
  }

  const needsReviewPipeIds = Object.entries(batch.verdicts)
    .filter(([pipeId]) => byId.has(pipeId))
    .filter(([pipeId]) => {
      const v = batch.verdicts[pipeId];
      return v.status === "review" || !checkMeasurement(byId.get(pipeId)!.measurement).passed;
    })
    .map(([pipeId]) => pipeId);

  return {
    state: needsReviewPipeIds.length > 0 ? "review" : "handed",
    blockerReasons,
    needsReviewPipeIds,
  };
}

/** 由一次测量生成结论标题 / 说明（交接固化与复核确认共用） */
export function describeSnapshot(
  pipe: Pipe,
  at: string,
): ConclusionSnapshot {
  const check = checkMeasurement(pipe.measurement);
  const m = pipe.measurement;
  if (check.passed) {
    return {
      status: "passed",
      title: "调音通过",
      detail: `${m.pitch} · ${formatCents(m.cents)} · ${m.temperature}℃ / ${m.humidity}% · ${
        m.reed === "normal" ? "簧片正常" : "簧片异常（已备注）"
      }`,
      at,
    };
  }
  const reasons = [...check.blockerReasons];
  if (check.centsOutOfRange) reasons.push(`音分偏差 ${formatCents(m.cents)} 超出 ±${CENT_LIMIT} cent`);
  if (check.centsMissing) reasons.push("音分偏差未录入");
  return {
    status: "review",
    title: "退回待复核",
    detail: reasons.length > 0 ? reasons.join("；") : "测量未通过",
    at,
  };
}

export function formatCents(cents: number | null): string {
  if (cents === null) return "未测量";
  return `${cents > 0 ? "+" : ""}${cents} cent`;
}

export const BATCH_STATE_META: Record<
  BatchState,
  { label: string; tone: "ok" | "warn" | "bad" | "idle" }
> = {
  draft: { label: "可交接", tone: "ok" },
  "draft-blocked": { label: "不能交接", tone: "bad" },
  handed: { label: "已交接", tone: "idle" },
  review: { label: "部分退回待复核", tone: "warn" },
};
