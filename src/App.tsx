import { useEffect, useState } from "react";
import {
  HandedReports,
  Header,
  MaintenanceDesk,
  Metrics,
  StopRegister,
} from "./components";
import {
  confirmReview,
  handoverBatch,
  startMaintenance,
  updateMeasurement,
} from "./batches";
import { loadData, resetData, saveData } from "./storage";
import type { AppData, Measurement } from "./types";
import "./styles.css";

function nowIso(): string {
  return new Date().toISOString();
}

function App() {
  const [data, setData] = useState<AppData>(() => loadData());
  const [activeVenueId, setActiveVenueId] = useState(data.venues[0].id);
  const [toast, setToast] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  useEffect(() => {
    saveData(data);
  }, [data]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  const handleEdit = (
    pipeId: string,
    patch: Partial<Omit<Measurement, "updatedAt">>,
  ) => {
    setData((prev) => updateMeasurement(prev, pipeId, patch, nowIso()));
  };

  const handleStart = () => {
    setData((prev) => startMaintenance(prev, activeVenueId, nowIso()));
    setToast({ tone: "ok", text: "已按该场馆的每组音栓生成交接批次" });
  };

  const handleHandover = (batchId: string) => {
    const draft = structuredClone(data);
    const result = handoverBatch(draft, batchId, nowIso());
    if (result.ok) {
      setData(draft);
      setToast({ tone: "ok", text: "批次已交接，判定结论已固化到报告" });
    } else {
      setToast({ tone: "bad", text: result.reason ?? "不能交接" });
    }
  };

  const handleConfirmReview = (batchId: string, pipeId: string) => {
    const draft = structuredClone(data);
    const result = confirmReview(draft, batchId, pipeId, nowIso());
    if (result.ok) {
      setData(draft);
      setToast({ tone: "ok", text: "复核通过，该管结论恢复，旧结论已保留" });
    } else {
      setToast({ tone: "bad", text: result.reason ?? "复核未通过" });
    }
  };

  const handleReset = () => {
    if (window.confirm("确定恢复为演示数据？当前本地修改将被清除。")) {
      setData(resetData());
      setToast({ tone: "ok", text: "已恢复演示数据" });
    }
  };

  return (
    <main className="app">
      <Header
        venues={data.venues}
        activeVenueId={activeVenueId}
        onSelect={setActiveVenueId}
        onReset={handleReset}
      />

      <Metrics data={data} venueId={activeVenueId} />

      <MaintenanceDesk
        data={data}
        venueId={activeVenueId}
        onStart={handleStart}
        onHandover={handleHandover}
        onConfirmReview={handleConfirmReview}
      />

      <StopRegister data={data} venueId={activeVenueId} onEdit={handleEdit} />

      <HandedReports
        data={data}
        venueId={activeVenueId}
        onConfirmReview={handleConfirmReview}
      />

      {toast && (
        <div className={`toast toast--${toast.tone}`} onClick={() => setToast(null)}>
          {toast.text}
        </div>
      )}
    </main>
  );
}

export default App;
