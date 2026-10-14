import type { Alert } from "./alerts";

const triggerTime = (value: string) =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).format(new Date(value));
const percentage = (value: number) => Number(value.toFixed(2));

export function AlertList({ alerts }: { alerts: Alert[] }) {
  const breaches = alerts
    .filter((alert) => alert.breach)
    .sort((a, b) => Date.parse(b.breach!.triggerTime) - Date.parse(a.breach!.triggerTime));
  return (
    <section className="nm-card nm-alerts nm-slo-alerts">
      <div className="nm-card-head"><h3>SLO Breach Alert</h3></div>
      <div className="nm-scroll">
        <table aria-label="SLO Breach Alerts">
          <colgroup><col style={{ width: "22%" }} /><col style={{ width: "36%" }} /><col style={{ width: "42%" }} /></colgroup>
          <thead><tr><th>Trigger Time</th><th>Profile</th><th>Breach Information</th></tr></thead>
          <tbody>
            {breaches.map(({ id, breach }) => (
              <tr key={id}>
                <td><time dateTime={breach!.triggerTime}>{triggerTime(breach!.triggerTime)}</time></td>
                <td>{breach!.profileName}</td>
                <td className="nm-breach-information">
                  <strong>{breach!.metric}</strong> reached <strong>{percentage(breach!.rate)}%</strong>
                  {breach!.windowMinutes !== undefined
                    ? <> in <strong>{breach!.windowMinutes}</strong> minutes,</>
                    : <> in the current snapshot,</>}
                  <br />while the threshold is set to <strong>{breach!.threshold}%</strong>.
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!breaches.length && <p className="nm-empty">No SLO breaches in this snapshot.</p>}
    </section>
  );
}
