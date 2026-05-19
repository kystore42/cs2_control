import { useState } from "react";
import { api, AuthResponse } from "../api";

export default function AuthScreen({
  onAuth,
}: {
  onAuth: (s: AuthResponse) => void;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const res =
        mode === "login"
          ? await api.login(email, password)
          : await api.register(email, password, fullName);
      onAuth(res);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <h1>
          {mode === "login" ? "Вход" : "Регистрация"}
        </h1>
        <p className="sub">CS2 Control — облачная платформа</p>

        {error && <div className="error-box">{error}</div>}

        {mode === "register" && (
          <div className="field">
            <label>Имя</label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Иван Петров"
            />
          </div>
        )}
        <div className="field">
          <label>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>
        <div className="field">
          <label>Пароль</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="минимум 8 символов"
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </div>

        <button
          className="btn-primary"
          style={{ width: "100%", marginTop: 8 }}
          disabled={busy}
          onClick={submit}
        >
          {busy ? "..." : mode === "login" ? "Войти" : "Создать аккаунт"}
        </button>

        <div className="auth-toggle">
          {mode === "login" ? (
            <>
              Нет аккаунта?{" "}
              <span onClick={() => setMode("register")}>Регистрация</span>
            </>
          ) : (
            <>
              Уже есть аккаунт?{" "}
              <span onClick={() => setMode("login")}>Войти</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
