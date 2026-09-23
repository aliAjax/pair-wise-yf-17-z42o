import { useEffect, useMemo, useState } from "react";
import {
  BATCH_STATE_META,
  CENT_LIMIT,
  checkMeasurement,
  collectBatchBlockers,
  evaluateBatch,
  formatCents,
} from "./rules";
import type {
  AppData,
  Batch,
  Maintenance,
  Measurement,
  Pipe,
  ReedStatus,
  StopInfo,
  Venue,
  Verdict,
} from "./types";

/* ------------------------------- 通用小组件 ------------------------------- */

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Badge({
  tone,
  children,
}: {
  tone: "ok" | "warn" | "bad" | "idle";
  children: React.ReactNode;
}) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

function NumberField({
  label,
  unit,
  value,
  onCommit,
}: {
  label: string;
  unit: string;
  value: number | null;
  onCommit: (n: number | null) => void;
}) {
  const [text, setText] = useState(value === null ? "" : String(value));

  useEffect(() => {
    setText(value === null ? "" : String(value));
  }, [value]);

  return (
    <label className="field">
      <span>
        {label}
        <em>{unit}</em>
      </span>
      <input
        inputMode="decimal"
        value={text}
        placeholder="待录入"
        onChange={(e) => {
          const raw = e.target.value;
          setText(raw);
          if (raw.trim() === "") {
            onCommit(null);
            return;
          }
          const n = Number(raw);
          if (Number.isFinite(n)) onCommit(n);
        }}
      />
    </label>
  );
}

/* -------------------------------- 顶部导航 -------------------------------- */

export function Header({
  venues,
  activeVenueId,
  onSelect,
  onReset,
}: {
  venues: Venue[];
  activeVenueId: string;
  onSelect: (id: string) => void;
  onReset: () => void;
}) {
  return (
    <header className="hero">
      <p className="eyebrow">管风琴维护 · 交接台</p>
      <h1>音管调音交接台</h1>
      <span className="lede">
        一次维护按音栓生成交接批次；温湿度缺失或簧片异常未备注时整批不能交接，补齐自动恢复。
        已通过音管被新测量改动时，仅该管及其报告退回待复核，旧结论保留。
      </span>
      <div className="venue-tabs">
        {venues.map((v) => (
          <button
            key={v.id}
            className={v.id === activeVenueId ? "active" : ""}
            onClick={() => onSelect(v.id)}
          >
            <b>{v.name}</b>
            <small>{v.subtitle}</small>
          </button>
        ))}
        <button className="ghost reset-btn" onClick={onReset}>
          恢复演示数据
        </button>
      </div>
    </header>
  );
}

/* -------------------------------- 指标卡片 -------------------------------- */

export function Metrics({ data, venueId }: { data: AppData; venueId: string }) {
  const stopIds = new Set(
    data.stops.filter((s) => s.venueId === venueId).map((s) => s.id),
  );
  const pipes = data.pipes.filter((p) => stopIds.has(p.stopId));
  let blocked = 0;
  let outOfRange = 0;
  for (const p of pipes) {
    const c = checkMeasurement(p.measurement);
    if (c.blockerReasons.length > 0) blocked += 1;
    if (c.centsOutOfRange) outOfRange += 1;
  }
  const reviewCount = data.batches
    .filter((b) => b.venueId === venueId && b.handedAt !== null)
    .reduce(
      (n, b) => n + Object.values(b.verdicts).filter((v) => v.status === "review").length,
      0,
    );

  const items = [
    { label: "音栓数量", value: stopIds.size, tone: "idle" as const },
    { label: "阻断音管", value: blocked, tone: blocked > 0 ? ("bad" as const) : ("ok" as const) },
    { label: `偏差超限（±${CENT_LIMIT} cent）`, value: outOfRange, tone: outOfRange > 0 ? ("warn" as const) : ("ok" as const) },
    { label: "报告待复核音管", value: reviewCount, tone: reviewCount > 0 ? ("warn" as const) : ("ok" as const) },
  ];

  return (
    <section className="metrics">
      {items.map((it) => (
        <article key={it.label} className={`metric metric--${it.tone}`}>
          <small>{it.label}</small>
          <strong>{it.value}</strong>
        </article>
      ))}
    </section>
  );
}

/* ------------------------------ 音管测量编辑器 ------------------------------ */

function PipeEditor({
  pipe,
  verdict,
  onEdit,
}: {
  pipe: Pipe;
  verdict?: Verdict;
  onEdit: (pipeId: string, patch: Partial<Omit<Measurement, "updatedAt">>) => void;
}) {
  const m = pipe.measurement;
  const underReview = verdict?.status === "review";

  return (
    <article className={`pipe-card${underReview ? " pipe-card--review" : ""}`}>
      <div className="pipe-head">
        <div>
          <b className="pipe-code">{pipe.code}</b>
          {underReview && <Badge tone="warn">已交接报告中 · 待复核</Badge>}
        </div>
        <small className="saved-at">最近测量 {formatTime(m.updatedAt)}</small>
      </div>

      {underReview && (
        <p className="review-banner">
          该管在已交接批次中被新测量改动，仅本管退回待复核，旧结论保留在报告历史中。
        </p>
      )}

      <div className="pipe-fields">
        <label className="field">
          <span>音高</span>
          <input
            value={m.pitch}
            onChange={(e) => onEdit(pipe.id, { pitch: e.target.value })}
          />
        </label>
        <NumberField
          label="音分偏差"
          unit="cent"
          value={m.cents}
          onCommit={(n) => onEdit(pipe.id, { cents: n })}
        />
        <NumberField
          label="温度"
          unit="℃"
          value={m.temperature}
          onCommit={(n) => onEdit(pipe.id, { temperature: n })}
        />
        <NumberField
          label="相对湿度"
          unit="%"
          value={m.humidity}
          onCommit={(n) => onEdit(pipe.id, { humidity: n })}
        />
        <label className="field">
          <span>簧片状态</span>
          <select
            value={m.reed}
            onChange={(e) => onEdit(pipe.id, { reed: e.target.value as ReedStatus })}
          >
            <option value="normal">正常</option>
            <option value="abnormal">异常（必须填写备注）</option>
          </select>
        </label>
        <label className="field field--wide">
          <span>
            维修备注
            {m.reed === "abnormal" && <em className="required">必填</em>}
          </span>
          <input
            value={m.note}
            placeholder={m.reed === "abnormal" ? "请描述簧片异常与处理方式" : "选填"}
            onChange={(e) => onEdit(pipe.id, { note: e.target.value })}
          />
        </label>
      </div>
    </article>
  );
}

export function StopRegister({
  data,
  venueId,
  onEdit,
}: {
  data: AppData;
  venueId: string;
  onEdit: (pipeId: string, patch: Partial<Omit<Measurement, "updatedAt">>) => void;
}) {
  const stops = data.stops.filter((s) => s.venueId === venueId);

  // 已交接批次中每根音管是否处于待复核（同组内仅该管受影响）
  const reviewVerdicts = useMemo(() => {
    const map = new Map<string, Verdict>();
    for (const b of data.batches) {
      if (b.venueId !== venueId || b.handedAt === null) continue;
      for (const [pipeId, v] of Object.entries(b.verdicts)) {
        if (v.status === "review") map.set(pipeId, v);
      }
    }
    return map;
  }, [data.batches, venueId]);

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>测量台账</p>
          <h2>音栓与音管</h2>
        </div>
        <span className="hint">所有修改自动保存到浏览器本地，并即时重新判定</span>
      </div>
      <div className="stop-list">
        {stops.map((stop: StopInfo) => {
          const pipes = data.pipes.filter((p) => p.stopId === stop.id);
          return (
            <div key={stop.id} className="stop-block">
              <div className="stop-title">
                <h3>{stop.name}</h3>
                <Badge tone="idle">{stop.kind}</Badge>
                <small>{pipes.length} 根音管</small>
              </div>
              <div className="pipe-grid">
                {pipes.map((pipe) => (
                  <PipeEditor
                    key={pipe.id}
                    pipe={pipe}
                    verdict={reviewVerdicts.get(pipe.id)}
                    onEdit={onEdit}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* -------------------------------- 批次卡片 -------------------------------- */

function VerdictHistory({ verdict }: { verdict: Verdict }) {
  if (verdict.history.length === 0) return null;
  return (
    <details className="history">
      <summary>旧结论保留（{verdict.history.length} 条）</summary>
      <ol>
        {verdict.history.map((s, i) => (
          <li key={`${s.at}-${i}`}>
            <Badge tone={s.status === "passed" ? "ok" : "warn"}>{s.title}</Badge>
            <span className="history-detail">{s.detail}</span>
            <small>{formatTime(s.at)}</small>
          </li>
        ))}
      </ol>
    </details>
  );
}

function BatchCard({
  batch,
  stop,
  pipes,
  onHandover,
  onConfirmReview,
}: {
  batch: Batch;
  stop: StopInfo;
  pipes: Pipe[];
  onHandover: (batchId: string) => void;
  onConfirmReview: (batchId: string, pipeId: string) => void;
}) {
  const evaluation = evaluateBatch(batch, pipes);
  const meta = BATCH_STATE_META[evaluation.state];
  const isDraft = batch.handedAt === null;
  const blockerReasons = collectBatchBlockers(pipes);

  return (
    <article className={`batch-card batch-card--${evaluation.state}`}>
      <div className="batch-head">
        <div>
          <h3>
            {stop.name}
            <Badge tone="idle">{stop.kind}</Badge>
          </h3>
          <small>
            批次 {batch.id.toUpperCase()} · 生成于 {formatTime(batch.createdAt)}
            {batch.handedAt && ` · 交接于 ${formatTime(batch.handedAt)}`}
          </small>
        </div>
        <Badge tone={meta.tone}>{meta.label}</Badge>
      </div>

      {isDraft && blockerReasons.length > 0 && (
        <div className="blocker-box">
          <p>整批不能交接：</p>
          <ul>
            {blockerReasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <p className="auto-recover">补齐温湿度或簧片备注后自动恢复，无需重建批次。</p>
        </div>
      )}

      <ul className="batch-pipes">
        {pipes.map((pipe) => {
          const check = checkMeasurement(pipe.measurement);
          const verdict = batch.verdicts[pipe.id];
          const inReview = evaluation.needsReviewPipeIds.includes(pipe.id) && !isDraft;

          return (
            <li
              key={pipe.id}
              className={`batch-pipe${
                isDraft
                  ? check.passed
                    ? " is-ok"
                    : check.blockerReasons.length > 0
                      ? " is-bad"
                      : " is-warn"
                  : inReview
                    ? " is-warn"
                    : " is-ok"
              }`}
            >
              <div className="batch-pipe-row">
                <b>{pipe.code}</b>
                <span className="pipe-pitch">{pipe.measurement.pitch}</span>
                <span className="pipe-cents">{formatCents(pipe.measurement.cents)}</span>

                {isDraft ? (
                  check.passed ? (
                    <Badge tone="ok">合格</Badge>
                  ) : (
                    <div className="pipe-reasons">
                      {check.blockerReasons.map((r) => (
                        <Badge key={r} tone="bad">
                          {r}
                        </Badge>
                      ))}
                      {check.centsOutOfRange && (
                        <Badge tone="warn">偏差超 ±{CENT_LIMIT} cent</Badge>
                      )}
                      {check.centsMissing && <Badge tone="warn">偏差未录入</Badge>}
                    </div>
                  )
                ) : verdict ? (
                  <div className="verdict">
                    <Badge tone={verdict.status === "passed" ? "ok" : "warn"}>
                      {verdict.current.title}
                    </Badge>
                    <span className="verdict-detail">{verdict.current.detail}</span>
                    {verdict.status === "review" && (
                      <button
                        className="primary small"
                        disabled={!check.passed}
                        title={
                          check.passed
                            ? "新测量已合格，确认恢复通过"
                            : "测量仍有阻断或偏差超限，先在台账中处理"
                        }
                        onClick={() => onConfirmReview(batch.id, pipe.id)}
                      >
                        复核确认
                      </button>
                    )}
                  </div>
                ) : null}
              </div>
              {!isDraft && verdict && <VerdictHistory verdict={verdict} />}
            </li>
          );
        })}
      </ul>

      {isDraft && (
        <div className="batch-foot">
          {evaluation.state === "draft" ? (
            <>
              <span className="hint">全部音管合格，可整批交接。</span>
              <button className="primary" onClick={() => onHandover(batch.id)}>
                交接本批
              </button>
            </>
          ) : (
            <>
              <span className="hint">
                处理阻断项并将偏差调回 ±{CENT_LIMIT} cent 内后，交接自动恢复可用。
              </span>
              <button className="primary" disabled>
                交接本批
              </button>
            </>
          )}
        </div>
      )}
    </article>
  );
}

/* ------------------------------ 本次维护交接区 ------------------------------ */

export function MaintenanceDesk({
  data,
  venueId,
  onStart,
  onHandover,
  onConfirmReview,
}: {
  data: AppData;
  venueId: string;
  onStart: () => void;
  onHandover: (batchId: string) => void;
  onConfirmReview: (batchId: string, pipeId: string) => void;
}) {
  const draftBatches = data.batches.filter(
    (b) => b.venueId === venueId && b.handedAt === null,
  );
  const stopById = new Map(data.stops.map((s) => [s.id, s]));

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>单次维护</p>
          <h2>本次维护交接</h2>
        </div>
        <button className="primary" onClick={onStart}>
          开始一次维护（按音栓生成批次）
        </button>
      </div>

      {draftBatches.length === 0 ? (
        <p className="empty">
          当前场馆没有进行中的维护。开始一次维护后，每组音栓生成一个交接批次。
        </p>
      ) : (
        <div className="batch-list">
          {draftBatches.map((batch) => {
            const stop = stopById.get(batch.stopId)!;
            const pipes = data.pipes.filter((p) => p.stopId === batch.stopId);
            return (
              <BatchCard
                key={batch.id}
                batch={batch}
                stop={stop}
                pipes={pipes}
                onHandover={onHandover}
                onConfirmReview={onConfirmReview}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

/* ------------------------------ 已交接维护报告 ------------------------------ */

export function HandedReports({
  data,
  venueId,
  onConfirmReview,
}: {
  data: AppData;
  venueId: string;
  onConfirmReview: (batchId: string, pipeId: string) => void;
}) {
  const stopById = new Map(data.stops.map((s) => [s.id, s]));
  const maintenances = data.maintenances
    .filter((m) => m.venueId === venueId)
    .filter((m) => data.batches.some((b) => b.maintenanceId === m.id && b.handedAt !== null))
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>单次维护报告</p>
          <h2>已交接维护报告</h2>
        </div>
        <span className="hint">
          退回待复核的音管只影响其自身，旧结论可在「旧结论保留」中查看
        </span>
      </div>

      {maintenances.length === 0 ? (
        <p className="empty">尚无已交接的维护报告。</p>
      ) : (
        <div className="report-list">
          {maintenances.map((m: Maintenance) => {
            const batches = data.batches
              .filter((b) => b.maintenanceId === m.id && b.handedAt !== null)
              .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
            const reviewTotal = batches.reduce(
              (n, b) =>
                n + Object.values(b.verdicts).filter((v) => v.status === "review").length,
              0,
            );
            return (
              <article key={m.id} className="report">
                <div className="report-head">
                  <h3>维护 {m.id.toUpperCase()}</h3>
                  <small>{formatTime(m.startedAt)}</small>
                  {reviewTotal > 0 ? (
                    <Badge tone="warn">{reviewTotal} 根音管待复核</Badge>
                  ) : (
                    <Badge tone="ok">结论全部有效</Badge>
                  )}
                </div>
                <div className="batch-list">
                  {batches.map((batch) => (
                    <BatchCard
                      key={batch.id}
                      batch={batch}
                      stop={stopById.get(batch.stopId)!}
                      pipes={data.pipes.filter((p) => p.stopId === batch.stopId)}
                      onHandover={() => undefined}
                      onConfirmReview={onConfirmReview}
                    />
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
