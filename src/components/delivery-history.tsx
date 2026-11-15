"use client";
import { useDemo } from "./demo-provider";
import { formatTime } from "@/lib/mockData";
export function DeliveryHistory() {
  const { state } = useDemo();
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>Outreach history</h2>
          <p>
            Request, provider acceptance, answer, and completion are separate
            outcomes.
          </p>
        </div>
        <span className="subtle-tag">SIMULATION</span>
      </div>
      {state.deliveries.length ? (
        <div className="activity-list">
          {state.deliveries.map((d) => (
            <div className="activity-row" key={d.id}>
              <div>
                <strong>
                  {d.channel} · {d.status} · {d.stage}
                </strong>
                <p>{d.reason}</p>
              </div>
              <time>{formatTime(d.time, state.preferences.timeZone)}</time>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty">
          No outreach attempts. Use a reminder’s Manage menu to preview the
          policy.
        </div>
      )}
    </section>
  );
}
