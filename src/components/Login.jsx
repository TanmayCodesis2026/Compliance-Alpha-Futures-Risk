import { useState } from "react";
const baseURL = import.meta.env.VITE_BASE_URL;

export default function Login({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");


  const handleSubmit = async (e) => {
    e?.preventDefault(); // keep the SPA from doing a full-page form post
    const URL = `${baseURL}adm/email/signin/`

    try {
      setLoading(true);
      setError("");
      // Email Sign In Api
       const res = await fetch(URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            email: username,
            password: password,
        }),
        credentials: 'include',
        })
        const data = await res.json().catch(() => ({}));
        if (data.idToken) {
          // Hand the whole payload up — App persists idToken + refreshToken +
          // expiry via auth.js, then swaps to the Compliance2 screen.
          onLogin?.(data, remember);
        } else {
          setError(data.detail || data.message || "Invalid credentials.");
        }

    } catch(err) {
      setError(err?.message || "Unable to login.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg)",
        padding: 24,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 460,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 20,
          padding: 36,
          boxShadow: "var(--shadow)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 32 }}>

          <h1
            style={{
              margin: 0,
              fontSize: 28,
              color: "var(--text)",
            }}
          >
            Compliance Portal
          </h1>

          <p
            style={{
              marginTop: 10,
              color: "var(--text-2)",
              lineHeight: 1.6,
            }}
          >
            Sign in to review suspicious account activity and compliance alerts.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 18 }}>
            <label
              style={{
                display: "block",
                marginBottom: 8,
                color: "var(--text)",
                fontWeight: 600,
              }}
            >
              Username
            </label>

            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
              style={{
                width: "100%",
                padding: "14px 16px",
                borderRadius: 12,
                border: "1px solid var(--border)",
                background: "var(--surface-2)",
                color: "var(--text)",
                outline: "none",
                fontSize: 15,
              }}
            />
          </div>

          <div style={{ marginBottom: 18 }}>
            <label
              style={{
                display: "block",
                marginBottom: 8,
                color: "var(--text)",
                fontWeight: 600,
              }}
            >
              Password
            </label>

            <div
              style={{
                display: "flex",
                border: "1px solid var(--border)",
                borderRadius: 12,
                overflow: "hidden",
                background: "var(--surface-2)",
              }}
            >
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                style={{
                  flex: 1,
                  padding: "14px 16px",
                  border: 0,
                  outline: 0,
                  background: "transparent",
                  color: "var(--text)",
                  fontSize: 15,
                }}
              />

              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  border: 0,
                  background: "transparent",
                  padding: "0 18px",
                  cursor: "pointer",
                  color: "var(--text-2)",
                }}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 24,
            }}
          >
            <label
              style={{
                display: "flex",
                gap: 8,
                color: "var(--text-2)",
                alignItems: "center",
              }}
            >
              <input
                type="checkbox"
                checked={remember}
                onChange={() => setRemember(!remember)}
              />

              Remember me
            </label>

            <button
              type="button"
              style={{
                background: "none",
                border: 0,
                cursor: "pointer",
                color: "var(--accent)",
                fontWeight: 600,
              }}
            >
              Forgot Password?
            </button>
          </div>

          {error && (
            <div
              style={{
                marginBottom: 18,
                background: "var(--crit-soft)",
                border: "1px solid var(--crit)",
                color: "var(--crit)",
                padding: 12,
                borderRadius: 10,
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "15px",
              border: 0,
              borderRadius: 12,
              cursor: "pointer",
              fontWeight: 700,
              fontSize: 16,
              background: "var(--accent)",
              color: "black",
              hover:{
                background: "var(--accent-dark)",
              },
              active:{
                background: "var(--accent-darker)",
              }
            }}
          >
            {loading ? "Signing In..." : "Sign In"}
          </button>
        </form>

        <div
          style={{
            marginTop: 26,
            paddingTop: 18,
            borderTop: "1px solid var(--border)",
            textAlign: "center",
            color: "var(--text-3)",
            fontSize: 13,
          }}
        >
          Compliance Monitoring Platform
          <br />
          Secure Authentication • Audit Logging • Role Based Access
        </div>
      </div>
    </section>
  );
}