import {
  batchCanHandOver,
  checkMeasurement,
  describeSnapshot,
} from "./rules";
import type { AppData, Batch, ConclusionSnapshot, Measurement } from "./types";

export function nextId(data: AppData, prefix: string): string {
  data.seq += 1;
  return `${prefix}-${String(data.seq).padStart(3, "0")}`;
}

export interface ActionResult {
  ok: boolean;
  reason?: string;
}

/**
 * 开始一次维护：为该场馆的每组音栓各生成一个交接批次。
 */
export function startMaintenance(
  data: AppData,
  venueId: string,
  now: string,
): AppData {
  const next = structuredClone(data);
  const maintenance = {
    id: nextId(next, "m"),
    venueId,
    startedAt: now,
  };
  next.maintenances.push(maintenance);

  const stopIds = next.stops.filter((s) => s.venueId === venueId).map((s) => s.id);
  for (const stopId of stopIds) {
    const batch: Batch = {
      id: nextId(next, "b"),
      maintenanceId: maintenance.id,
      venueId,
      stopId,
      createdAt: now,
      handedAt: null,
      verdicts: {},
    };
    next.batches.push(batch);
  }
  return next;
}

/** 交接批次：无阻断且每管实时判定通过时，按音管固化结论。 */
export function handoverBatch(
  data: AppData,
  batchId: string,
  now: string,
): ActionResult {
  const batch = data.batches.find((b) => b.id === batchId);
  if (!batch) return { ok: false, reason: "批次不存在" };

  const pipes = data.pipes.filter((p) => p.stopId === batch.stopId);
  if (!batchCanHandOver(pipes)) {
    return { ok: false, reason: "批次内仍有阻断或待复核音管，不能交接" };
  }

  for (const pipe of pipes) {
    const snapshot = describeSnapshot(pipe, now);
    const existing = batch.verdicts[pipe.id];
    batch.verdicts[pipe.id] = {
      status: snapshot.status,
      current: snapshot,
      // 再次交接时，旧结论继续保留在历史中
      history: existing ? [existing.current, ...existing.history] : [],
    };
  }
  batch.handedAt = now;
  return { ok: true };
}

function newMeasurementSnapshot(m: Measurement, at: string): ConclusionSnapshot {
  const check = checkMeasurement(m);
  const reasons = [...check.blockerReasons];
  if (check.centsOutOfRange) reasons.push("音分偏差超限");
  if (check.centsMissing) reasons.push("音分偏差未录入");
  return {
    status: "review",
    title: "新测量待复核",
    detail:
      reasons.length > 0
        ? `新测量存在问题：${reasons.join("；")}`
        : "新测量合格，等待复核确认",
    at,
  };
}

/**
 * 写入一根音管的新测量。
 * 关键规则：同一音栓内、已交接批次中该管结论为「通过」时，
 * 只把该管（及其所在批次报告）退回待复核，旧结论压入历史保留；
 * 同组其他音管不受影响。已处于待复核的音管不再重复退回。
 */
export function updateMeasurement(
  data: AppData,
  pipeId: string,
  patch: Partial<Omit<Measurement, "updatedAt">>,
  now: string,
): AppData {
  const next = structuredClone(data);
  const pipe = next.pipes.find((p) => p.id === pipeId);
  if (!pipe) return next;

  pipe.measurement = { ...pipe.measurement, ...patch, updatedAt: now };

  for (const batch of next.batches) {
    if (batch.handedAt === null) continue;
    if (!batch.verdicts[pipeId]) continue;
    const verdict = batch.verdicts[pipeId];
    if (verdict.status !== "passed") continue;

    verdict.history = [verdict.current, ...verdict.history];
    verdict.current = newMeasurementSnapshot(pipe.measurement, now);
    verdict.status = "review";
  }
  return next;
}

/**
 * 复核确认：已交接批次中退回待复核的音管，
 * 新测量实时通过后恢复为「通过」结论；待复核快照同样压入历史。
 */
export function confirmReview(
  data: AppData,
  batchId: string,
  pipeId: string,
  now: string,
): ActionResult {
  const batch = data.batches.find((b) => b.id === batchId);
  if (!batch || batch.handedAt === null) {
    return { ok: false, reason: "批次未交接" };
  }
  const verdict = batch.verdicts[pipeId];
  if (!verdict || verdict.status !== "review") {
    return { ok: false, reason: "该音管不在待复核状态" };
  }
  const pipe = data.pipes.find((p) => p.id === pipeId);
  if (!pipe) return { ok: false, reason: "音管不存在" };

  const check = checkMeasurement(pipe.measurement);
  if (!check.passed) {
    return {
      ok: false,
      reason:
        check.blockerReasons.length > 0
          ? `仍不能复核：${check.blockerReasons.join("；")}`
          : "音分偏差仍超限，调音未通过",
    };
  }

  verdict.history = [verdict.current, ...verdict.history];
  verdict.current = describeSnapshot(pipe, now);
  verdict.status = "passed";
  return { ok: true };
}
