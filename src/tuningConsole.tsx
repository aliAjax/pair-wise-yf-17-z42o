// 业务文件三：页面组件
// 只负责展示与交互；判定来自 tuningRules，批次动作与本地数据来自 tuningBatches。

import { useMemo, useState } from "react";
import {
  type BatchCheck,
  type HandoverBatch,
  type MaintenanceSession,
  type MeasureDraft,
  type PipeRecord,
  type StopInfo,
  type VenueInfo,
  REED_TEXT,
  STATUS_TEXT,
  VERDICT_TEXT,
  checkBatch,
  formatCents,
  getCurrentConclusion,
} from "./tuningRules";
import type { DraftField } from "./tuningBatches";

function today(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function verdictClass(v: string): string {
  return `badge verdict-${v}`;
}

function statusClass(s: string): string {
  return `badge status-${s}`;
}

/* ---------------- 开始一次维护 ---------------- */

export function StartCard(props: {
  venues: VenueInfo[];
  stops: StopInfo[];
  pipes: PipeRecord[];
  onStart: (venueId: string, technician: string, date: string) => void;
}) {
  const [venueId, setVenueId] = useState(props.venues[0]?.id ?? "");
  const [technician, setTechnician] = useState("");
  const [date, setDate] = useState(today());

  const venueStops = props.stops.filter((s) => s.venueId === venueId);

  return (
    <section className="panel start-card">
      <div className="heading">
        <div>
          <p>交接台</p>
          <h2>开始一次维护</h2>
        </div>
      </div>
      <div className="field-grid">
        <label>
          <span>场馆</span>
          <select value={venueId} onChange={(e) => setVenueId(e.target.value)}>
            {props.venues.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>维护日期</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label className="wide">
          <span>调音师</span>
          <input
            placeholder="请签名，如：周调音师"
            value={technician}
            onChange={(e) => setTechnician(e.target.value)}
          />
        </label>
      </div>
      <div className="start-preview">
        <span>将按音栓生成 {venueStops.length} 个交接批次：</span>
        {venueStops.map((s) => {
          const count = props.pipes.filter((p) => p.stopId === s.id).length;
          return (
            <b key={s.id}>
              {s.name}（{s.kind} · {count} 管）
            </b>
          );
        })}
      </div>
      <button
        className="primary big"
        disabled={!venueId || !date}
        onClick={() => props.onStart(venueId, technician, date)}
      >
        生成交接批次
      </button>
    </section>
  );
}

/* ---------------- 场馆 / 音栓 / 音管总览 ---------------- */

export function VenueOverview(props: {
  venues: VenueInfo[];
  stops: StopInfo[];
  pipes: PipeRecord[];
  activeVenueId?: string;
}) {
  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>预置台账</p>
          <h2>场馆 · 音栓 · 音管</h2>
        </div>
      </div>
      <div className="venue-grid">
        {props.venues.map((v) => {
          const stopList = props.stops.filter((s) => s.venueId === v.id);
          return (
            <article
              key={v.id}
              className={props.activeVenueId === v.id ? "venue active" : "venue"}
            >
              <h3>{v.name}</h3>
              {stopList.map((s) => {
                const list = props.pipes.filter((p) => p.stopId === s.id);
                return (
                  <div key={s.id} className="stop-line">
                    <div className="stop-title">
                      <b>{s.name}</b>
                      <span>{s.kind}</span>
                    </div>
                    <div className="pipe-chips">
                      {list.map((p) => {
                        const c = getCurrentConclusion(p);
                        return (
                          <span
                            key={p.id}
                            className={verdictClass(c?.verdict ?? "none")}
                            title={`${p.code} ${p.pitch} · 上次：${
                              c ? VERDICT_TEXT[c.verdict] : "无记录"
                            } ${c ? formatCents(c.cents) : ""}`}
                          >
                            {p.code}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </article>
          );
        })}
      </div>
    </section>
  );
}

/* ---------------- 单根音管测量行 ---------------- */

function NumberField(props: {
  value: number | null;
  placeholder: string;
  step?: string;
  invalid?: boolean;
  disabled?: boolean;
  onCommit: (v: string) => void;
}) {
  return (
    <input
      className={props.invalid ? "invalid" : ""}
      type="number"
      step={props.step ?? "1"}
      value={props.value ?? ""}
      placeholder={props.placeholder}
      disabled={props.disabled}
      onChange={(e) => props.onCommit(e.target.value)}
    />
  );
}

function PipeRow(props: {
  pipe: PipeRecord;
  draft: MeasureDraft;
  inReview: boolean;
  disabled: boolean;
  blockers: string[];
  onUpdate: (field: DraftField, value: string) => void;
  onReset: () => void;
  onResolve: () => void;
}) {
  const { pipe, draft } = props;
  const [showHistory, setShowHistory] = useState(false);
  const current = getCurrentConclusion(pipe);
  const tempMissing = draft.temperature === null;
  const humMissing = draft.humidity === null;
  const reedBlock = draft.reed === "abnormal" && draft.note.trim() === "";

  return (
    <article className="pipe-row">
      <div className="pipe-head">
        <div className="pipe-id">
          <b>{pipe.code}</b>
          <span>{pipe.pitch}</span>
          {current && (
            <span className={verdictClass(current.verdict)}>
              旧结论：{VERDICT_TEXT[current.verdict]} {formatCents(current.cents)}¢
            </span>
          )}
          <button
            className="link"
            onClick={() => setShowHistory((v) => !v)}
            type="button"
          >
            {showHistory ? "收起历史" : `历史 ${pipe.history.length}`}
          </button>
        </div>
        {props.inReview && (
          <div className="review-banner">
            <span>
              该管旧结论为「通过」，新测量改动了音分/簧片，已退回待复核；旧结论保留
            </span>
            <button
              type="button"
              className="warn-btn"
              disabled={props.disabled}
              onClick={props.onResolve}
            >
              确认复核
            </button>
          </div>
        )}
      </div>

      {showHistory && (
        <ol className="history-list">
          {[...pipe.history].reverse().map((h) => (
            <li key={h.id}>
              <span className={verdictClass(h.verdict)}>
                {VERDICT_TEXT[h.verdict]}
              </span>
              <span>{formatCents(h.cents)}¢</span>
              <span>{h.measuredAt}</span>
              <span>{h.technician}</span>
            </li>
          ))}
        </ol>
      )}

      <div className="measure-grid">
        <label>
          <span>音分偏差(¢)</span>
          <NumberField
            value={draft.cents}
            placeholder="如 -3"
            disabled={props.disabled}
            onCommit={(v) => props.onUpdate("cents", v)}
          />
        </label>
        <label>
          <span>温度(℃)</span>
          <NumberField
            value={draft.temperature}
            step="0.1"
            placeholder="必填"
            invalid={tempMissing}
            disabled={props.disabled}
            onCommit={(v) => props.onUpdate("temperature", v)}
          />
        </label>
        <label>
          <span>湿度(%)</span>
          <NumberField
            value={draft.humidity}
            step="1"
            placeholder="必填"
            invalid={humMissing}
            disabled={props.disabled}
            onCommit={(v) => props.onUpdate("humidity", v)}
          />
        </label>
        <label>
          <span>簧片状态</span>
          <select
            value={draft.reed}
            disabled={props.disabled}
            onChange={(e) => props.onUpdate("reed", e.target.value)}
          >
            <option value="normal">{REED_TEXT.normal}</option>
            <option value="abnormal">{REED_TEXT.abnormal}</option>
          </select>
        </label>
        <label className="wide">
          <span>
            备注
            {reedBlock && <em className="hint">簧片异常时备注必填</em>}
          </span>
          <input
            className={reedBlock ? "invalid" : ""}
            value={draft.note}
            placeholder="异常情况、处理方式等"
            disabled={props.disabled}
            onChange={(e) => props.onUpdate("note", e.target.value)}
          />
        </label>
      </div>

      {props.blockers.length > 0 && (
        <ul className="row-blockers">
          {props.blockers.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      )}

      <div className="row-actions">
        <button
          type="button"
          disabled={props.disabled}
          onClick={props.onReset}
        >
          恢复为上次测量
        </button>
      </div>
    </article>
  );
}

/* ---------------- 交接批次面板 ---------------- */

export function BatchPanel(props: {
  stop: StopInfo;
  batch: HandoverBatch;
  pipes: PipeRecord[];
  onUpdate: (pipeId: string, field: DraftField, value: string) => void;
  onReset: (pipeId: string) => void;
  onResolve: (pipeId: string) => void;
  onHandover: () => void;
}) {
  const check: BatchCheck = useMemo(
    () => checkBatch(props.batch, props.pipes),
    [props.batch, props.pipes],
  );
  const handed = props.batch.handedAt !== null;
  const blockersFor = (pipeId: string) =>
    check.blockers
      .filter((g) => g.pipeId === pipeId && g.type !== "verdict")
      .map((g) => g.message);
  const verdictBlockers = check.blockers.filter((g) => g.type === "verdict");

  return (
    <section className="panel batch-panel">
      <div className="heading">
        <div>
          <p>{props.stop.kind}</p>
          <h2>
            {props.stop.name}
            <span className={statusClass(check.status)}>
              {STATUS_TEXT[check.status]}
            </span>
          </h2>
        </div>
        <div className="batch-counts">
          <span className="count pass">通过 {check.passCount}</span>
          <span className="count warn">跟踪 {check.warnCount}</span>
          <span className="count fail">超限 {check.failCount}</span>
          <span className="count">
            测量 {check.measuredCount}/{check.total}
          </span>
        </div>
      </div>

      <div className="pipe-list">
        {props.pipes.map((p) => (
          <PipeRow
            key={p.id}
            pipe={p}
            draft={props.batch.drafts[p.id]}
            inReview={check.reviewPipeIds.includes(p.id)}
            disabled={handed}
            blockers={blockersFor(p.id)}
            onUpdate={(field, v) => props.onUpdate(p.id, field, v)}
            onReset={() => props.onReset(p.id)}
            onResolve={() => props.onResolve(p.id)}
          />
        ))}
      </div>

      {verdictBlockers.length > 0 && (
        <div className="gate-box">
          <h4>音分超限，整批不可交接：</h4>
          <ul>
            {verdictBlockers.map((b) => (
              <li key={b.pipeId}>{b.message}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="batch-footer">
        <p>
          {check.canHandover
            ? "门禁全部通过，可交接本音栓批次。"
            : handed
              ? `本批已于 ${new Date(props.batch.handedAt!).toLocaleString("zh-CN")} 交接，旧结论均已留存。`
              : "温湿度缺失或簧片异常无备注、有待复核项时，整批不能交接；补齐后自动恢复。"}
        </p>
        <button
          type="button"
          className="primary"
          disabled={!check.canHandover}
          onClick={props.onHandover}
        >
          {handed ? "已交接" : "交接本批"}
        </button>
      </div>
    </section>
  );
}

/* ---------------- 单次维护报告 ---------------- */

export function SessionReport(props: {
  session: MaintenanceSession;
  venue: VenueInfo;
  stops: StopInfo[];
  pipes: PipeRecord[];
}) {
  const rows = props.session.batches.map((b) => {
    const stop = props.stops.find((s) => s.id === b.stopId)!;
    const check = checkBatch(b, props.pipes);
    return { b, stop, check };
  });
  const allDone = rows.every((r) => r.b.handedAt !== null);

  return (
    <section className="panel report">
      <div className="heading">
        <div>
          <p>单次维护报告</p>
          <h2>
            {props.venue.name} · {props.session.date} ·{" "}
            {props.session.technician}
          </h2>
        </div>
        <span className={allDone ? "badge status-handed" : "badge status-review"}>
          {allDone ? "全部批次已交接" : "维护进行中"}
        </span>
      </div>
      <table className="report-table">
        <thead>
          <tr>
            <th>音栓</th>
            <th>状态</th>
            <th>测量进度</th>
            <th>通过/跟踪/超限</th>
            <th>待复核</th>
            <th>交接时间</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ b, stop, check }) => (
            <tr key={b.id}>
              <td>
                {stop.name}
                <small>{stop.kind}</small>
              </td>
              <td>
                <span className={statusClass(check.status)}>
                  {STATUS_TEXT[check.status]}
                </span>
              </td>
              <td>
                {check.measuredCount}/{check.total}
              </td>
              <td>
                {check.passCount}/{check.warnCount}/{check.failCount}
              </td>
              <td>{check.reviewPipeIds.length}</td>
              <td>
                {b.handedAt
                  ? new Date(b.handedAt).toLocaleString("zh-CN")
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
