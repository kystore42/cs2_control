import { useEffect, useState } from "react";
import { api, DetectedAccount, InventoryValuation } from "../api";

const SAMPLE = [
  "AK-47 | Redline (Field-Tested)",
  "AWP | Asiimov (Field-Tested)",
  "Glock-18 | Fade (Factory New)",
  "USP-S | Kill Confirmed (Minimal Wear)",
].join("\n");

function money(v: number | null): string {
  return v == null ? "—" : "$" + v.toFixed(2);
}

function pct(v: number | null): string {
  return v == null ? "—" : (v * 100).toFixed(1) + "%";
}

export default function InventoryScreen() {
  const [accounts, setAccounts] = useState<DetectedAccount[]>([]);
  const [names, setNames] = useState(SAMPLE);
  const [result, setResult] = useState<InventoryValuation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .detectSteamAccounts()
      .then((r) => r.success && setAccounts(r.accounts.filter((a) => a.is_installed_cs2)))
      .catch(() => {});
  }, []);

  async function valuateManual() {
    const list = names
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (list.length === 0) {
      setError("Введите хотя бы одно название предмета");
      return;
    }
    run(() => api.valuateHashNames(list));
  }

  async function valuateAccount(accountId: number) {
    run(() => api.valuateAccountInventory(accountId));
  }

  async function run(fn: () => Promise<InventoryValuation>) {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await fn());
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="section-head">
        <h2>Оценка инвентаря</h2>
      </div>

      <div className="card">
        <p style={{ color: "var(--text-dim)", marginBottom: 10 }}>
          Названия предметов (market hash name), по одному в строке. Цены берутся
          с Steam Community Market.
        </p>
        <textarea
          value={names}
          onChange={(e) => setNames(e.target.value)}
          rows={5}
          style={{
            width: "100%",
            background: "var(--bg)",
            color: "var(--text)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: 10,
            fontFamily: "inherit",
            fontSize: 13,
            resize: "vertical",
          }}
        />
        <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn-primary" onClick={valuateManual} disabled={busy}>
            {busy ? "Запрос цен..." : "Оценить список"}
          </button>
          {accounts.map((a) => (
            <button
              key={a.account_id}
              className="btn-ghost"
              disabled={busy}
              onClick={() => valuateAccount(a.account_id)}
            >
              Инвентарь: {a.persona_name || a.account_name}
            </button>
          ))}
        </div>
        {busy && (
          <p className="spinner-note">
            Steam Market ограничивает частоту запросов — на каждый предмет ~1.5 с.
          </p>
        )}
      </div>

      {error && <div className="error-box">{error}</div>}

      {result && (
        <>
          <div className="stats">
            <div className="stat">
              <div className="label">Предметов</div>
              <div className="value">{result.item_count}</div>
            </div>
            <div className="stat">
              <div className="label">С ценой</div>
              <div className="value">{result.priced_count}</div>
            </div>
            <div className="stat">
              <div className="label">Суммарная стоимость</div>
              <div className="value green">{money(result.total_value)}</div>
            </div>
            <div className="stat">
              <div className="label">Выгодных к покупке</div>
              <div className="value">{result.profitable.length}</div>
            </div>
          </div>

          {result.profitable.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: 16, marginBottom: 10 }}>
                Выгодные для покупки (медиана выше lowest ≥ 15%)
              </h2>
              <table>
                <thead>
                  <tr>
                    <th>Предмет</th>
                    <th className="num">Lowest</th>
                    <th className="num">Median</th>
                    <th className="num">Объём</th>
                    <th className="num">Маржа</th>
                  </tr>
                </thead>
                <tbody>
                  {result.profitable.map((it) => (
                    <tr key={it.hash_name}>
                      <td>{it.hash_name}</td>
                      <td className="num">{money(it.lowest_price)}</td>
                      <td className="num">{money(it.median_price)}</td>
                      <td className="num">{it.volume ?? "—"}</td>
                      <td className="num margin-pos">{pct(it.profit_margin)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h2 style={{ fontSize: 16, marginBottom: 10 }}>Все предметы</h2>
          <table>
            <thead>
              <tr>
                <th>Предмет</th>
                <th className="num">Lowest</th>
                <th className="num">Median</th>
                <th className="num">Объём</th>
                <th className="num">Маржа</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((it) => (
                <tr key={it.hash_name}>
                  <td>
                    {it.hash_name}
                    {it.error && (
                      <span style={{ color: "var(--red)", fontSize: 12 }}>
                        {" "}
                        · {it.error}
                      </span>
                    )}
                  </td>
                  <td className="num">{money(it.lowest_price)}</td>
                  <td className="num">{money(it.median_price)}</td>
                  <td className="num">{it.volume ?? "—"}</td>
                  <td className="num">{pct(it.profit_margin)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
