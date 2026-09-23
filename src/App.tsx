import "./styles.css";
import { useConsole } from "./tuningBatches";
import {
  BatchPanel,
  SessionReport,
  StartCard,
  VenueOverview,
} from "./tuningConsole";
import { STOPS, VENUES } from "./tuningRules";

function App() {
  const console = useConsole();
  const { session } = console;

  const venue = session
    ? VENUES.find((v) => v.id === session.venueId) ?? VENUES[0]
    : null;
  const venueStops = session
    ? STOPS.filter((s) => s.venueId === session.venueId)
    : [];

  return (
    <main className="app">
      <header className="hero">
        <p>管风琴维护 · 调音交接台</p>
        <h1>音管调音交接台</h1>
        <span>
          一次维护按音栓生成交接批次；温湿度任一缺失，或簧片异常但备注为空，整批不能交接，补齐后自动恢复。
          同组内已通过音管被新测量改动时，仅该管及其报告退回待复核，旧结论保留。
        </span>
      </header>

      <VenueOverview
        venues={VENUES}
        stops={STOPS}
        pipes={console.pipes}
        activeVenueId={session?.venueId}
      />

      {!session && (
        <StartCard
          venues={VENUES}
          stops={STOPS}
          pipes={console.pipes}
          onStart={console.createSession}
        />
      )}

      {session && venue && (
        <>
          <SessionReport
            session={session}
            venue={venue}
            stops={STOPS}
            pipes={console.pipes}
          />

          {session.batches.map((batch) => {
            const stop = venueStops.find((s) => s.id === batch.stopId);
            if (!stop) return null;
            return (
              <BatchPanel
                key={batch.id}
                stop={stop}
                batch={batch}
                pipes={console.pipesByStop(stop.id)}
                onUpdate={(pipeId, field, value) =>
                  console.updateDraft(batch.id, pipeId, field, value)
                }
                onReset={(pipeId) => console.resetDraft(batch.id, pipeId, "base")}
                onResolve={(pipeId) => console.resolveReview(batch.id, pipeId)}
                onHandover={() => console.handover(batch.id)}
              />
            );
          })}
        </>
      )}

      <footer className="data-bar">
        <span>数据保存在浏览器本地（localStorage）</span>
        <button type="button" onClick={console.resetAll}>
          清空并恢复预置数据
        </button>
      </footer>
    </main>
  );
}

export default App;
