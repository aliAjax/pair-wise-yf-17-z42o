// 业务文件二：交接批次与本地存储
// 维护会话按音栓生成批次；批次的判定结果由 tuningRules 给出；数据持久化在 localStorage。

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type HandoverBatch,
  type MaintenanceSession,
  type MeasureDraft,
  type PipeConclusion,
  type PipeRecord,
  type ReedState,
  type Verdict,
  STOPS,
  verdictByCents,
} from "./tuningRules";

const STORAGE_KEY = "organ-tuning-console:v1";

interface StoredState {
  pipes: PipeRecord[];
  session: MaintenanceSession | null;
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}

function conclusion(
  verdict: Verdict,
  cents: number,
  measuredAt: string,
  technician: string,
  batchId?: string,
): PipeConclusion {
  return { id: uid("c"), verdict, cents, measuredAt, technician, batchId };
}

function pipe(
  id: string,
  code: string,
  pitch: string,
  stopId: string,
  base: MeasureDraft,
  prior: PipeConclusion,
): PipeRecord {
  return { id, code, pitch, stopId, base, history: [prior] };
}

const SEED_DATE = "2026-09-12";

export function createSeedPipes(): PipeRecord[] {
  return [
    // Trumpet 8' —— 圣玛利亚大教堂（簧片音栓）
    pipe("p-t-c4", "T-C4", "C4", "s-trumpet", {
      cents: 2, temperature: 21.4, humidity: 46, reed: "normal", note: "状态稳定",
    }, conclusion("pass", 2, SEED_DATE, "周调音师")),
    pipe("p-t-cs4", "T-C#4", "C#4", "s-trumpet", {
      cents: 9, temperature: 21.6, humidity: 45, reed: "abnormal", note: "簧片需微调，已记录",
    }, conclusion("warn", 9, SEED_DATE, "周调音师")),
    pipe("p-t-e4", "T-E4", "E4", "s-trumpet", {
      cents: -4, temperature: 21.5, humidity: 46, reed: "normal", note: "",
    }, conclusion("pass", -4, SEED_DATE, "周调音师")),
    // Principal 4' —— 圣玛利亚大教堂（主音栓）
    pipe("p-p-g3", "P-G3", "G3", "s-principal", {
      cents: -3, temperature: 21.2, humidity: 44, reed: "normal", note: "",
    }, conclusion("pass", -3, SEED_DATE, "周调音师")),
    pipe("p-p-a3", "P-A3", "A3", "s-principal", {
      cents: 1, temperature: 21.3, humidity: 44, reed: "normal", note: "",
    }, conclusion("pass", 1, SEED_DATE, "周调音师")),
    pipe("p-p-b3", "P-B3", "B3", "s-principal", {
      cents: 6, temperature: 21.1, humidity: 45, reed: "normal", note: "季节性轻微偏移",
    }, conclusion("warn", 6, SEED_DATE, "周调音师")),
    // Bourdon 16' —— A 音乐厅（低音管）
    pipe("p-b-f2", "B-F2", "F2", "s-bourdon", {
      cents: -12, temperature: 20.1, humidity: 52, reed: "normal", note: "标记复检",
    }, conclusion("fail", -12, SEED_DATE, "林技师")),
    pipe("p-b-c3", "B-C3", "C3", "s-bourdon", {
      cents: -2, temperature: 20.4, humidity: 51, reed: "normal", note: "",
    }, conclusion("pass", -2, SEED_DATE, "林技师")),
    pipe("p-b-d3", "B-D3", "D3", "s-bourdon", {
      cents: 4, temperature: 20.3, humidity: 51, reed: "normal", note: "",
    }, conclusion("pass", 4, SEED_DATE, "林技师")),
  ];
}

function seedState(): StoredState {
  return { pipes: createSeedPipes(), session: null };
}

function loadState(): StoredState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StoredState;
      if (Array.isArray(parsed.pipes) && parsed.pipes.length > 0) {
        return parsed;
      }
    }
  } catch {
    // 本地数据损坏时回落到预置数据
  }
  return seedState();
}

export type DraftField = "cents" | "temperature" | "humidity" | "reed" | "note";

function emptyDraft(base: MeasureDraft): MeasureDraft {
  return {
    cents: base.cents,
    temperature: base.temperature,
    humidity: base.humidity,
    reed: base.reed,
    note: base.note,
  };
}

export function useConsole() {
  const [state, setState] = useState<StoredState>(loadState);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // 存储不可用时仅保留内存态
    }
  }, [state]);

  const pipeMap = useMemo(() => {
    const map = new Map<string, PipeRecord>();
    state.pipes.forEach((p) => map.set(p.id, p));
    return map;
  }, [state.pipes]);

  const pipesByStop = useCallback(
    (stopId: string) => state.pipes.filter((p) => p.stopId === stopId),
    [state.pipes],
  );

  // 一次维护：为该场馆下的每个音栓各生成一个交接批次，测量草稿预填上一次结论
  const createSession = useCallback(
    (venueId: string, technician: string, date: string) => {
      const stopIds = STOPS.filter((s) => s.venueId === venueId).map((s) => s.id);
      const batches: HandoverBatch[] = stopIds.map((stopId) => {
        const drafts: Record<string, MeasureDraft> = {};
        state.pipes
          .filter((p) => p.stopId === stopId)
          .forEach((p) => {
            drafts[p.id] = emptyDraft(p.base);
          });
        return {
          id: uid("b"),
          stopId,
          drafts,
          resolvedReviews: [],
          handedAt: null,
        };
      });
      const session: MaintenanceSession = {
        id: uid("m"),
        date,
        technician: technician.trim() || "未署名",
        venueId,
        createdAt: new Date().toISOString(),
        batches,
      };
      setState((prev) => ({ ...prev, session }));
    },
    [state.pipes],
  );

  const updateDraft = useCallback(
    (batchId: string, pipeId: string, field: DraftField, value: string) => {
      setState((prev) => ({
        ...prev,
        session: prev.session
          ? {
              ...prev.session,
              batches: prev.session.batches.map((b) => {
                if (b.id !== batchId) return b;
                const current = b.drafts[pipeId];
                if (!current) return b;
                let next: MeasureDraft;
                if (field === "reed") {
                  next = { ...current, reed: value as ReedState };
                } else if (field === "note") {
                  next = { ...current, note: value };
                } else {
                  next = {
                    ...current,
                    [field]: value.trim() === "" ? null : Number(value),
                  };
                }
                return {
                  ...b,
                  drafts: { ...b.drafts, [pipeId]: next },
                  // 复核确认后再次改动音分/簧片，自动重新退回待复核
                  resolvedReviews:
                    field === "cents" || field === "reed"
                      ? b.resolvedReviews.filter((id) => id !== pipeId)
                      : b.resolvedReviews,
                };
              }),
            }
          : null,
      }));
    },
    [],
  );

  const resetDraft = useCallback(
    (batchId: string, pipeId: string, mode: "base" | "clear") => {
      setState((prev) => ({
        ...prev,
        session: prev.session
          ? {
              ...prev.session,
              batches: prev.session.batches.map((b) =>
                b.id !== batchId
                  ? b
                  : {
                      ...b,
                      drafts: {
                        ...b.drafts,
                        [pipeId]:
                          mode === "base"
                            ? emptyDraft(prev.pipes.find((p) => p.id === pipeId)!.base)
                            : {
                                cents: null,
                                temperature: null,
                                humidity: null,
                                reed: "normal",
                                note: "",
                              },
                      },
                      resolvedReviews: b.resolvedReviews.filter(
                        (id) => id !== pipeId,
                      ),
                    },
              ),
            }
          : null,
      }));
    },
    [],
  );

  // 复核处理：只把该管标记为已复核，旧结论保留在该管历史中
  const resolveReview = useCallback((batchId: string, pipeId: string) => {
    setState((prev) => ({
      ...prev,
      session: prev.session
        ? {
            ...prev.session,
            batches: prev.session.batches.map((b) =>
              b.id === batchId && !b.resolvedReviews.includes(pipeId)
                ? { ...b, resolvedReviews: [...b.resolvedReviews, pipeId] }
                : b,
            ),
          }
        : null,
    }));
  }, []);

  // 交接：以本批测量生成每管新结论；此前旧结论仍保留在 history 中
  const handover = useCallback((batchId: string) => {
    setState((prev) => {
      if (!prev.session) return prev;
      const batch = prev.session.batches.find((b) => b.id === batchId);
      if (!batch || batch.handedAt) return prev;

      const pipes = prev.pipes.map((p) => {
        const draft = batch.drafts[p.id];
        if (!draft || draft.cents === null) return p;
        const record: PipeConclusion = {
          id: uid("c"),
          verdict: verdictByCents(draft.cents),
          cents: draft.cents,
          measuredAt: prev.session!.date,
          technician: prev.session!.technician,
          batchId,
        };
        return { ...p, base: { ...draft }, history: [...p.history, record] };
      });

      const session: MaintenanceSession = {
        ...prev.session,
        batches: prev.session.batches.map((b) =>
          b.id === batchId
            ? { ...b, handedAt: new Date().toISOString() }
            : b,
        ),
      };
      return { pipes, session };
    });
  }, []);

  const resetAll = useCallback(() => setState(seedState()), []);

  return {
    pipes: state.pipes,
    session: state.session,
    pipeMap,
    pipesByStop,
    createSession,
    updateDraft,
    resetDraft,
    resolveReview,
    handover,
    resetAll,
  };
}
