import {
  Activity,
  Bike,
  Boxes,
  Building2,
  CircleDollarSign,
  PackageSearch,
  ReceiptText,
  Settings2,
  ShoppingCart,
  Tags,
  UserCog,
  UsersRound,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import styles from "./dashboard.module.css";

export default async function DashboardPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/");
  }

  const canManageInventory =
    user.role === "ADMIN" || user.role === "INVENTORY";

  const canManageServices =
    user.role === "ADMIN" || user.role === "OWNER";

  const canManageClients =
    user.role === "ADMIN" ||
    user.role === "OWNER" ||
    user.role === "CASHIER";

    const canViewSuppliers =
  user.role === "ADMIN" ||
  user.role === "INVENTORY" ||
  user.role === "OWNER" ||
  user.role === "CASHIER";

  const canViewActivityLogs =
    user.role === "ADMIN" || user.role === "OWNER";

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <div className={styles.logo}>
            <Wrench size={24} />
          </div>

          <div>
            <strong>KL Motor Shop</strong>
            <span>POS & Inventory System</span>
          </div>
        </div>

        <div className={styles.userArea}>
          <div>
            <strong>{user.fullName}</strong>
            <span>{user.role}</span>
          </div>

          <form
            action="/api/auth/logout"
            method="post"
          >
            <button type="submit">Log out</button>
          </form>
        </div>
      </header>

      <div className={styles.body}>
        <aside className={styles.sidebar}>
          <nav>
            <Link
              className={styles.activeLink}
              href="/dashboard"
            >
              <Boxes size={20} />
              Dashboard
            </Link>

            <Link href="#">
              <ShoppingCart size={20} />
              Point of Sale
            </Link>

            <Link href="#">
              <ReceiptText size={20} />
              Job Orders
            </Link>

            {canManageClients ? (
              <>
                <Link href="/clients">
                  <UsersRound size={20} />
                  Clients
                </Link>

                <Link href="/motorcycles">
                  <Bike size={20} />
                  Motorcycles
                </Link>
              </>
            ) : null}

            {canManageServices ? (
              <>
                <Link href="/motorcycle-models">
                  <Bike size={20} />
                  Motorcycle Models
                </Link>

                <Link href="/mechanics">
                  <UserCog size={20} />
                  Mechanics
                </Link>

                <Link href="/services">
                  <Settings2 size={20} />
                  Service List
                </Link>
              </>
            ) : null}

            <Link href="#">
              <PackageSearch size={20} />
              Products
            </Link>

            {canManageInventory ? (
              <>
                <Link href="/categories">
                  <Tags size={20} />
                  Categories
                </Link>

                <Link href="/brands">
                  <Tags size={20} />
                  Brands
                </Link>
                {canViewSuppliers ? (
  <Link href="/suppliers">
    <Building2 size={20} />
    Suppliers
  </Link>
) : null}
              </>
            ) : null}

            <Link href="#">
              <ReceiptText size={20} />
              Sales
            </Link>

            {canViewActivityLogs ? (
              <Link href="/activity-logs">
                <Activity size={20} />
                Activity Logs
              </Link>
            ) : null}
          </nav>
        </aside>

        <section className={styles.content}>
          <div className={styles.welcome}>
            <div>
              <p>Dashboard</p>
              <h1>Welcome, {user.fullName}</h1>
              <span>
                Here is an overview of your motor shop.
              </span>
            </div>

            <button type="button">
              <ShoppingCart size={20} />
              New Sale
            </button>
          </div>

          <div className={styles.metrics}>
            <article>
              <div className={styles.metricIcon}>
                <CircleDollarSign size={25} />
              </div>

              <div>
                <span>Today&apos;s Sales</span>
                <strong>₱0.00</strong>
                <small>No transactions yet</small>
              </div>
            </article>

            <article>
              <div className={styles.metricIcon}>
                <ReceiptText size={25} />
              </div>

              <div>
                <span>Transactions</span>
                <strong>0</strong>
                <small>Sales made today</small>
              </div>
            </article>

            <article>
              <div className={styles.metricIcon}>
                <Boxes size={25} />
              </div>

              <div>
                <span>Total Products</span>
                <strong>0</strong>
                <small>Active inventory items</small>
              </div>
            </article>

            <article>
              <div className={styles.metricIcon}>
                <PackageSearch size={25} />
              </div>

              <div>
                <span>Low Stock</span>
                <strong>0</strong>
                <small>Items needing attention</small>
              </div>
            </article>
          </div>

          <div className={styles.panels}>
            <article className={styles.panel}>
              <header>
                <div>
                  <p>Recent Activity</p>
                  <h2>Latest transactions</h2>
                </div>
              </header>

              <div className={styles.emptyState}>
                <ReceiptText size={42} />
                <strong>No sales transactions yet</strong>
                <span>
                  Completed sales will appear in this section.
                </span>
              </div>
            </article>

            <article className={styles.panel}>
              <header>
                <div>
                  <p>Inventory</p>
                  <h2>Low-stock products</h2>
                </div>
              </header>

              <div className={styles.emptyState}>
                <Boxes size={42} />
                <strong>No low-stock products</strong>
                <span>
                  Products requiring restock will appear here.
                </span>
              </div>
            </article>
          </div>
        </section>
      </div>
    </main>
  );
}