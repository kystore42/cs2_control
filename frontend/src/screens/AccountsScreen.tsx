import { useEffect, useState } from "react";
import { api, AuthResponse, CloudAccount } from "../api";

export default function AccountsScreen({
  session,
}: {
  session: AuthResponse;
}) {
  const [accounts, setAccounts] = useState<CloudAccount[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [steamId, setSteamId] = useState("");
  const [accountName, setAccountName] = useState("");
  const [personaName, setPersonaName] = useState("");

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      setAccounts(await api.listCloudAccounts(session.access_token));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function addAccount() {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await api.addSteamAccount(
        session.access_token,
        steamId,
        accountName,
        personaName
      );
      if (res.created === 0) {
        setNotice("Аккаунт уже существует — не добавлен повторно");
      } else {
        setNotice("Аккаунт добавлен");
        setSteamId("");
        setAccountName("");
        setPersonaName("");
      }
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const canSubmit = steamId.trim() !== "" && accountName.trim() !== "";

  return (
    <div>
      <div className="section-head">
        <h2>Мои Steam-аккаунты</h2>
        <button className="btn-ghost" onClick={refresh} disabled={loading}>
          {loading ? "Загрузка..." : "Обновить"}
        </button>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 12, fontSize: 15 }}>Добавить аккаунт</h3>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div className="field" style={{ flex: "1 1 220px", marginBottom: 0 }}>
            <label>SteamID64 (17 цифр)</label>
            <input
              value={steamId}
              onChange={(e) => setSteamId(e.target.value.replace(/\D/g, ""))}
              placeholder="76561198000000000"
            />
          </div>
          <div className="field" style={{ flex: "1 1 160px", marginBottom: 0 }}>
            <label>Логин аккаунта</label>
            <input
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              placeholder="my_steam_login"
            />
          </div>
          <div className="field" style={{ flex: "1 1 160px", marginBottom: 0 }}>
            <label>Ник (необязательно)</label>
            <input
              value={personaName}
              onChange={(e) => setPersonaName(e.target.value)}
              placeholder="Игровой ник"
            />
          </div>
        </div>
        <button
          className="btn-primary"
          style={{ marginTop: 14 }}
          disabled={!canSubmit || saving}
          onClick={addAccount}
        >
          {saving ? "Сохранение..." : "Добавить аккаунт"}
        </button>
      </div>

      {error && <div className="error-box">{error}</div>}
      {notice && <div className="card">{notice}</div>}

      {accounts.length === 0 && !loading ? (
        <div className="empty">
          Аккаунтов пока нет. Добавьте первый через форму выше.
        </div>
      ) : (
        accounts.map((a) => (
          <div className="card" key={a.id}>
            <div className="account-row">
              <div>
                <strong>{a.persona_name || a.account_name}</strong>
                {a.is_primary && (
                  <span className="pill cs2" style={{ marginLeft: 8 }}>
                    основной
                  </span>
                )}
                <div className="meta">SteamID64 {a.steam_id}</div>
                <div className="meta">логин: {a.account_name}</div>
              </div>
              <span className="pill nocs2">{a.sync_status}</span>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
