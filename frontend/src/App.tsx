import { useState } from "react";
import { AuthResponse } from "./api";
import AuthScreen from "./screens/AuthScreen";
import AccountsScreen from "./screens/AccountsScreen";
import InventoryScreen from "./screens/InventoryScreen";

type Tab = "accounts" | "inventory";

export default function App() {
  const [session, setSession] = useState<AuthResponse | null>(null);
  const [tab, setTab] = useState<Tab>("accounts");

  if (!session) {
    return <AuthScreen onAuth={setSession} />;
  }

  return (
    <div className="shell">
      <div className="topbar">
        <div className="brand">
          CS2<span>Control</span>
        </div>
        <div className="user">
          <span>{session.user.email}</span>
          <span className="tier-badge">{session.user.subscription_tier}</span>
          <button className="btn-ghost" onClick={() => setSession(null)}>
            Выйти
          </button>
        </div>
      </div>

      <div className="tabs">
        <button
          className={tab === "accounts" ? "active" : ""}
          onClick={() => setTab("accounts")}
        >
          Steam-аккаунты
        </button>
        <button
          className={tab === "inventory" ? "active" : ""}
          onClick={() => setTab("inventory")}
        >
          Инвентарь и оценка
        </button>
      </div>

      <div className="content">
        {tab === "accounts" && <AccountsScreen session={session} />}
        {tab === "inventory" && <InventoryScreen />}
      </div>
    </div>
  );
}
