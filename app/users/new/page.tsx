import { ArrowLeft, UserPlus } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createUserAction } from "../actions";
import styles from "../users.module.css";

type Params = { error?: string };

export default async function NewUserPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const currentUser = await getCurrentUser();

  if (!currentUser) redirect("/");

  if (!["ADMIN", "OWNER"].includes(currentUser.role)) {
    redirect("/dashboard");
  }

  const params = await searchParams;

  return (
    <main className={styles.page}>
      <div className={styles.topbar}>
        <Link href="/users" className={styles.back}>
          <ArrowLeft size={17} />
          Users
        </Link>
      </div>

      <section className={styles.formCard}>
        <header className={styles.formHeader}>
          <span className={styles.formIcon}>
            <UserPlus size={22} />
          </span>
          <div>
            <div className={styles.eyebrow}>User Management</div>
            <h1>Add User</h1>
            <p>Create an Owner, Cashier, or Inventory account.</p>
          </div>
        </header>

        {params.error ? (
          <div className={styles.error}>{params.error}</div>
        ) : null}

        <form action={createUserAction} className={styles.userForm}>
          <label>
            Full Name *
            <input
              name="full_name"
              maxLength={150}
              required
              autoFocus
              placeholder="e.g. Maria Santos"
            />
          </label>

          <label>
            Username *
            <input
              name="username"
              maxLength={100}
              required
              autoComplete="off"
              placeholder="e.g. maria"
            />
          </label>

          <label>
            Role *
            <select name="role" defaultValue="CASHIER" required>
              <option value="OWNER">Owner</option>
              <option value="CASHIER">Cashier</option>
              <option value="INVENTORY">Inventory</option>
            </select>
          </label>

          <div />

          <label>
            Password *
            <input
              type="password"
              name="password"
              minLength={8}
              required
              autoComplete="new-password"
            />
            <small>Minimum 8 characters.</small>
          </label>

          <label>
            Confirm Password *
            <input
              type="password"
              name="confirm_password"
              minLength={8}
              required
              autoComplete="new-password"
            />
          </label>

          <div className={styles.formActions}>
            <Link href="/users">Cancel</Link>
            <button type="submit">Create User</button>
          </div>
        </form>
      </section>
    </main>
  );
}
