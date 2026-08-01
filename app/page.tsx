"use client";

import {
  Eye,
  EyeOff,
  LockKeyhole,
  LogIn,
  ShoppingCart,
  UserRound,
  Wrench,
} from "lucide-react";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./page.module.css";

interface LoginResponse {
  success: boolean;
  message: string;
  redirectTo?: string;
}

export default function LoginPage() {
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setMessage("");
    setIsError(false);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username,
          password,
        }),
      });

      const result = (await response.json()) as LoginResponse;

      if (!response.ok || !result.success) {
        setIsError(true);
        setMessage(result.message || "Login failed.");
        return;
      }

      setMessage(result.message);
      router.push(result.redirectTo ?? "/dashboard");
      router.refresh();
    } catch {
      setIsError(true);
      setMessage(
        "Unable to connect to the server. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.brandPanel}>
        <div className={styles.brandContent}>
          <div className={styles.logoBox}>
            <Wrench size={36} strokeWidth={2.3} />
          </div>

          <p className={styles.eyebrow}>Point of Sale & Inventory</p>

          <h1 className={styles.brandTitle}>
            KL Motor Shop
            <span>and Accessories</span>
          </h1>

          <p className={styles.brandDescription}>
            Manage sales, motorcycle parts, accessories, inventory,
            purchases, suppliers, customers, and reports in one
            system.
          </p>

          <div className={styles.featureGrid}>
            <article className={styles.featureCard}>
              <ShoppingCart size={26} />
              <div>
                <strong>Fast POS</strong>
                <span>Quick and reliable sales processing</span>
              </div>
            </article>

            <article className={styles.featureCard}>
              <Wrench size={26} />
              <div>
                <strong>Stock Control</strong>
                <span>Track parts and accessories inventory</span>
              </div>
            </article>
          </div>
        </div>

        <div className={styles.decorativeCircleOne} />
        <div className={styles.decorativeCircleTwo} />
      </section>

      <section className={styles.loginPanel}>
        <div className={styles.loginCard}>
          <div className={styles.mobileLogo}>
            <Wrench size={28} />
          </div>

          <header className={styles.loginHeader}>
            <p>Welcome back</p>
            <h2>Sign in to your account</h2>
            <span>
              Enter your username and password to continue.
            </span>
          </header>

          <form className={styles.loginForm} onSubmit={handleLogin}>
            <label className={styles.field}>
              <span>Username</span>

              <div className={styles.inputWrapper}>
                <UserRound size={20} />

                <input
                  type="text"
                  value={username}
                  onChange={(event) =>
                    setUsername(event.target.value)
                  }
                  placeholder="Enter your username"
                  autoComplete="username"
                  disabled={isSubmitting}
                  required
                />
              </div>
            </label>

            <label className={styles.field}>
              <span>Password</span>

              <div className={styles.inputWrapper}>
                <LockKeyhole size={20} />

                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) =>
                    setPassword(event.target.value)
                  }
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  disabled={isSubmitting}
                  required
                />

                <button
                  type="button"
                  className={styles.passwordButton}
                  onClick={() =>
                    setShowPassword((currentValue) => !currentValue)
                  }
                  aria-label={
                    showPassword ? "Hide password" : "Show password"
                  }
                  disabled={isSubmitting}
                >
                  {showPassword ? (
                    <EyeOff size={19} />
                  ) : (
                    <Eye size={19} />
                  )}
                </button>
              </div>
            </label>

            {message ? (
              <div
                className={
                  isError
                    ? styles.errorMessage
                    : styles.successMessage
                }
              >
                {message}
              </div>
            ) : null}

            <button
              className={styles.loginButton}
              type="submit"
              disabled={isSubmitting}
            >
              <LogIn size={20} />

              {isSubmitting ? "Signing in..." : "Sign in"}
            </button>
          </form>

          <footer className={styles.loginFooter}>
            <span>KL Motor Shop and Accessories</span>
            <span>POS & Inventory System</span>
          </footer>
        </div>
      </section>
    </main>
  );
}