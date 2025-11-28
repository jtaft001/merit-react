import { useState } from "react";
import type { FormEvent } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "./firebase";

export default function LoginPage() {
  const [status, setStatus] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const email = (form.elements.namedItem("email") as HTMLInputElement).value.trim();
    const password = (form.elements.namedItem("password") as HTMLInputElement).value.trim();

    setStatus("Attempting login...");

    try {
      const userCred = await signInWithEmailAndPassword(auth, email, password);
      setStatus("Login successful: " + userCred.user.email);
      // App listens to auth state and will switch to DashboardPage
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setStatus("Login failed: " + message);
    }
  }

  return (
    <div style={{ padding: "2rem", maxWidth: 400 }}>
      <h1>MERIT EMS</h1>
      <p>Welcome. Please log in to access your training scenarios.</p>

      <form
        onSubmit={handleSubmit}
        style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}
      >
        <input name="email" type="email" placeholder="Email" required />
        <input name="password" type="password" placeholder="Password" required />
        <button type="submit">Log In</button>
      </form>

      <p style={{ marginTop: "0.5rem" }}>{status}</p>
    </div>
  );
}
