import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  Bike,
  Boxes,
  Gauge,
  Building2,
  DatabaseBackup,
  Check,
  CircleDollarSign,
  ClipboardPenLine,
  Clock3,
  PackageSearch,
  PackagePlus,
  PackageX,
  ReceiptText,
  PiggyBank,
  Landmark,
  Settings2,
  ShoppingCart,
  Tags,
  TrendingUp,
  UserCog,
  UsersRound,
  Wrench,
  WalletCards,
  HandCoins,
  X,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import {
  dismissNotificationAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "./actions";
import styles from "./dashboard.module.css";

interface SummaryRow extends RowDataPacket {
  today_sales: number;
  today_transactions: number;
  today_jobs: number;
  ready_for_payment: number;
  active_products: number;
  low_stock: number;
  out_of_stock: number;
  inventory_value: number;
  days_in_month: number;
  current_day: number;
}

interface DailySalesRow extends RowDataPacket {
  sale_day: number;
  total: number;
}

interface RecentSaleRow extends RowDataPacket {
  id: number;
  sale_number: string;
  total_amount: number;
  sale_date: Date | string;
  client_name: string | null;
}

interface RecentJobRow extends RowDataPacket {
  id: number;
  job_order_number: string;
  status: string;
  date_received: Date | string;
  client_name: string | null;
  plate_number: string | null;
}

interface TopProductRow extends RowDataPacket {
  product_name: string;
  quantity: number;
  amount: number;
}

interface TopServiceRow extends RowDataPacket {
  service_name: string;
  jobs: number;
  amount: number;
}

interface MechanicEarningRow extends RowDataPacket {
  full_name: string;
  jobs: number;
  earnings: number;
}

interface LowStockRow extends RowDataPacket {
  id: number;
  product_name: string;
  product_code: string;
  quantity_on_hand: number;
  reorder_level: number;
  updated_at: Date | string;
}

interface ReadyJobRow extends RowDataPacket {
  id: number;
  job_order_number: string;
  client_name: string | null;
  updated_at: Date | string;
}

interface StockEventRow extends RowDataPacket {
  id: number;
  reference_number: string;
  transaction_type: string;
  transaction_date: Date | string;
}

interface NotificationStateRow extends RowDataPacket {
  notification_key: string;
  is_read: number;
  is_dismissed: number;
}

type NotificationTone = "danger" | "warning" | "info" | "success";

type DashboardNotification = {
  key: string;
  tone: NotificationTone;
  title: string;
  message: string;
  href: string;
  createdAt: Date;
  isRead: boolean;
  isDismissed: boolean;
};

function money(value: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(Number(value || 0));
}

function shortDateTime(value: Date | string) {
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function relativeTime(value: Date) {
  const seconds = Math.max(0, Math.floor((Date.now() - value.getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}

function NotificationIcon({ tone }: { tone: NotificationTone }) {
  if (tone === "danger") return <PackageX size={18} />;
  if (tone === "warning") return <AlertTriangle size={18} />;
  if (tone === "success") return <Check size={18} />;
  return <Bell size={18} />;
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const canManageInventory = user.role === "ADMIN" || user.role === "INVENTORY";
  const canManageServices = user.role === "ADMIN" || user.role === "OWNER";
  const canManageClients = ["ADMIN", "OWNER", "CASHIER"].includes(user.role);
  const canViewSuppliers = ["ADMIN", "INVENTORY", "OWNER", "CASHIER"].includes(user.role);
  const canViewActivityLogs = user.role === "ADMIN" || user.role === "OWNER";
  const canManageUsers = user.role === "ADMIN" || user.role === "OWNER";
  const canManageSettings = user.role === "ADMIN" || user.role === "OWNER";
  const canManageBackups = user.role === "ADMIN" || user.role === "OWNER";
  const canViewFinance = ["ADMIN", "OWNER", "CASHIER"].includes(user.role);
  const canUsePos = ["ADMIN", "CASHIER"].includes(user.role);
  const canViewSalesService = ["ADMIN", "OWNER", "CASHIER"].includes(user.role);
  const canViewInventoryDashboard = ["ADMIN", "OWNER", "INVENTORY"].includes(user.role);
  const canViewPurchasing = ["ADMIN", "OWNER", "INVENTORY"].includes(user.role);
  const canManageCapital = ["ADMIN", "OWNER"].includes(user.role);
  const canViewReports = ["ADMIN", "OWNER", "CASHIER", "INVENTORY"].includes(user.role);
  const isOwnerView = user.role === "ADMIN" || user.role === "OWNER";
  const isCashierView = user.role === "ADMIN" || user.role === "CASHIER" || user.role === "OWNER";
  const isInventoryView = user.role === "ADMIN" || user.role === "INVENTORY" || user.role === "OWNER";

  const [[summaryRows], [dailySales], [recentSales], [recentJobs], [topProducts], [topServices], [mechanicEarnings], [lowStocks], [readyJobs], [stockEvents]] =
    await Promise.all([
      pool.query<SummaryRow[]>(`
        SELECT
          (SELECT COALESCE(SUM(total_amount), 0) FROM sales WHERE status='COMPLETED' AND DATE(sale_date)=CURDATE()) AS today_sales,
          (SELECT COUNT(*) FROM sales WHERE status='COMPLETED' AND DATE(sale_date)=CURDATE()) AS today_transactions,
          (SELECT COUNT(*) FROM job_orders WHERE DATE(date_received)=CURDATE()) AS today_jobs,
          (SELECT COUNT(*) FROM job_orders WHERE status='READY_FOR_PAYMENT') AS ready_for_payment,
          (SELECT COUNT(*) FROM products WHERE is_active=1) AS active_products,
          (SELECT COUNT(*) FROM products WHERE is_active=1 AND quantity_on_hand > 0 AND quantity_on_hand <= reorder_level) AS low_stock,
          (SELECT COUNT(*) FROM products WHERE is_active=1 AND quantity_on_hand <= 0) AS out_of_stock,
          (SELECT COALESCE(SUM(quantity_on_hand * cost_price), 0) FROM products WHERE is_active=1) AS inventory_value,
          DAY(LAST_DAY(CURDATE())) AS days_in_month,
          DAY(CURDATE()) AS current_day
      `),
      pool.query<DailySalesRow[]>(`
        SELECT DAY(sale_date) AS sale_day, COALESCE(SUM(total_amount),0) AS total
        FROM sales
        WHERE status='COMPLETED'
          AND YEAR(sale_date)=YEAR(CURDATE())
          AND MONTH(sale_date)=MONTH(CURDATE())
        GROUP BY DAY(sale_date)
        ORDER BY sale_day
      `),
      pool.query<RecentSaleRow[]>(`
        SELECT s.id, s.sale_number, s.total_amount, s.sale_date, c.client_name
        FROM sales s
        LEFT JOIN clients c ON c.id=s.client_id
        WHERE s.status='COMPLETED'
        ORDER BY s.sale_date DESC
        LIMIT 6
      `),
      pool.query<RecentJobRow[]>(`
        SELECT jo.id, jo.job_order_number, jo.status, jo.date_received,
               c.client_name, m.plate_number
        FROM job_orders jo
        LEFT JOIN clients c ON c.id=jo.client_id
        LEFT JOIN motorcycles m ON m.id=jo.motorcycle_id
        ORDER BY jo.updated_at DESC
        LIMIT 6
      `),
      pool.query<TopProductRow[]>(`
        SELECT si.product_name,
               COALESCE(SUM(si.quantity),0) AS quantity,
               COALESCE(SUM(si.line_total),0) AS amount
        FROM sale_items si
        INNER JOIN sales s ON s.id=si.sale_id AND s.status='COMPLETED'
        WHERE YEAR(s.sale_date)=YEAR(CURDATE())
          AND MONTH(s.sale_date)=MONTH(CURDATE())
        GROUP BY si.product_id, si.product_name
        ORDER BY quantity DESC, amount DESC
        LIMIT 5
      `),
      pool.query<TopServiceRow[]>(`
        SELECT js.service_name,
               COUNT(*) AS jobs,
               COALESCE(SUM(js.service_charge),0) AS amount
        FROM job_order_services js
        INNER JOIN job_orders jo ON jo.id=js.job_order_id
        WHERE js.status='COMPLETED'
          AND jo.status IN ('PAID','COMPLETED','RELEASED')
          AND YEAR(COALESCE(js.completed_at, jo.paid_at, jo.updated_at))=YEAR(CURDATE())
          AND MONTH(COALESCE(js.completed_at, jo.paid_at, jo.updated_at))=MONTH(CURDATE())
        GROUP BY js.service_id, js.service_name
        ORDER BY jobs DESC, amount DESC
        LIMIT 5
      `),
      pool.query<MechanicEarningRow[]>(`
        SELECT m.full_name,
               COUNT(DISTINCT me.job_order_id) AS jobs,
               COALESCE(SUM(me.mechanic_share),0) AS earnings
        FROM mechanic_earnings me
        INNER JOIN mechanics m ON m.id=me.mechanic_id
        WHERE YEAR(me.earning_date)=YEAR(CURDATE())
          AND MONTH(me.earning_date)=MONTH(CURDATE())
        GROUP BY me.mechanic_id, m.full_name
        ORDER BY earnings DESC
        LIMIT 5
      `),
      pool.query<LowStockRow[]>(`
        SELECT id, product_name, product_code, quantity_on_hand, reorder_level, updated_at
        FROM products
        WHERE is_active=1 AND quantity_on_hand <= reorder_level
        ORDER BY (quantity_on_hand <= 0) DESC, quantity_on_hand ASC, product_name ASC
        LIMIT 8
      `),
      pool.query<ReadyJobRow[]>(`
        SELECT jo.id, jo.job_order_number, c.client_name, jo.updated_at
        FROM job_orders jo
        LEFT JOIN clients c ON c.id=jo.client_id
        WHERE jo.status='READY_FOR_PAYMENT'
        ORDER BY jo.updated_at ASC
        LIMIT 8
      `),
      pool.query<StockEventRow[]>(`
        SELECT id, reference_number, transaction_type, transaction_date
        FROM stock_transactions
        WHERE transaction_date >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
          AND transaction_type IN ('STOCK_IN','STOCK_OUT','ADJUSTMENT_IN','ADJUSTMENT_OUT')
        ORDER BY transaction_date DESC
        LIMIT 6
      `),
    ]);

  const summary = summaryRows[0] ?? {
    today_sales: 0,
    today_transactions: 0,
    today_jobs: 0,
    ready_for_payment: 0,
    active_products: 0,
    low_stock: 0,
    out_of_stock: 0,
    inventory_value: 0,
    days_in_month: 31,
    current_day: 1,
  };

  const chartMap = new Map<number, number>(dailySales.map((row) => [Number(row.sale_day), Number(row.total)]));
  const chartDays = Array.from({ length: Number(summary.days_in_month) }, (_, index) => index + 1);
  const maxDailySale = Math.max(1, ...dailySales.map((row) => Number(row.total)));

  const rawNotifications: DashboardNotification[] = [];

  if (isInventoryView) {
    for (const product of lowStocks) {
      const quantity = Number(product.quantity_on_hand);
      const out = quantity <= 0;
      rawNotifications.push({
        key: `${out ? "out" : "low"}-stock:${product.id}:${quantity}`,
        tone: out ? "danger" : "warning",
        title: out ? "Out of stock" : "Low stock",
        message: `${product.product_name} has ${quantity} ${quantity === 1 ? "unit" : "units"} remaining. Reorder level: ${Number(product.reorder_level)}.`,
        href: `/products/${product.id}`,
        createdAt: new Date(product.updated_at),
        isRead: false,
        isDismissed: false,
      });
    }
  }

  if (isCashierView) {
    for (const job of readyJobs) {
      rawNotifications.push({
        key: `ready-payment:${job.id}:${new Date(job.updated_at).getTime()}`,
        tone: "warning",
        title: "Ready for payment",
        message: `${job.job_order_number}${job.client_name ? ` · ${job.client_name}` : ""} is waiting for cashier payment.`,
        href: `/job-orders/${job.id}`,
        createdAt: new Date(job.updated_at),
        isRead: false,
        isDismissed: false,
      });
    }
  }

  if (user.role === "CASHIER" || user.role === "ADMIN") {
    for (const sale of recentSales.filter((sale) => Date.now() - new Date(sale.sale_date).getTime() <= 24 * 60 * 60 * 1000).slice(0, 3)) {
      rawNotifications.push({
        key: `sale-completed:${sale.id}`,
        tone: "success",
        title: "Sale completed",
        message: `${sale.sale_number} was completed for ${money(Number(sale.total_amount))}.`,
        href: `/pos/receipt/${sale.id}`,
        createdAt: new Date(sale.sale_date),
        isRead: false,
        isDismissed: false,
      });
    }
  }

  if (user.role === "INVENTORY" || user.role === "OWNER" || user.role === "ADMIN") {
    for (const event of stockEvents.slice(0, 4)) {
      const stockIn = event.transaction_type === "STOCK_IN";
      const adjusted = event.transaction_type.startsWith("ADJUSTMENT");
      rawNotifications.push({
        key: `stock-event:${event.id}`,
        tone: stockIn ? "success" : adjusted ? "info" : "warning",
        title: stockIn ? "New stock received" : adjusted ? "Inventory adjusted" : "Stock moved out",
        message: `${event.reference_number} · ${statusLabel(event.transaction_type)}`,
        href: event.transaction_type === "STOCK_IN" ? `/inventory/stock-in/${event.id}` : "/inventory/ledger",
        createdAt: new Date(event.transaction_date),
        isRead: false,
        isDismissed: false,
      });
    }
  }

  const notificationKeys = rawNotifications.map((notification) => notification.key);
  let notificationStateRows: NotificationStateRow[] = [];

  if (notificationKeys.length > 0) {
    const placeholders = notificationKeys.map(() => "?").join(",");
    const [stateRows] = await pool.query<NotificationStateRow[]>(
      `
        SELECT notification_key, is_read, is_dismissed
        FROM dashboard_notification_states
        WHERE user_id=? AND notification_key IN (${placeholders})
      `,
      [user.id, ...notificationKeys],
    );
    notificationStateRows = stateRows;
  }

  const stateMap = new Map(notificationStateRows.map((state) => [state.notification_key, state]));
  const notifications = rawNotifications
    .map((notification) => {
      const state = stateMap.get(notification.key);
      return {
        ...notification,
        isRead: Boolean(state?.is_read),
        isDismissed: Boolean(state?.is_dismissed),
      };
    })
    .filter((notification) => !notification.isDismissed)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 12);

  const unreadNotifications = notifications.filter((notification) => !notification.isRead);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <div className={styles.logo}><Wrench size={24} /></div>
          <div><strong>KL Motor Shop</strong><span>POS & Inventory System</span></div>
        </div>
        <div className={styles.userArea}>
          <div><strong>{user.fullName}</strong><span>{user.role}</span></div>
          <form action="/api/auth/logout" method="post"><button type="submit">Log out</button></form>
        </div>
      </header>

      <div className={styles.body}>
        <aside className={styles.sidebar}>
          <nav>
            <div className={styles.navSection}>
              <span className={styles.navSectionLabel}>Overview</span>
              <Link className={styles.activeLink} href="/dashboard"><Boxes size={20} />Dashboard</Link>
            </div>

            {canViewSalesService ? (
              <div className={styles.navSection}>
                <span className={styles.navSectionLabel}>Sales & Service</span>
                {canUsePos ? <Link href="/pos"><ShoppingCart size={20} />Point of Sale</Link> : null}
                <Link href="/job-orders"><ReceiptText size={20} />Job Orders</Link>
                <Link href="/sales"><ReceiptText size={20} />Sales</Link>
              </div>
            ) : null}

            {canManageClients ? (
              <div className={styles.navSection}>
                <span className={styles.navSectionLabel}>Customers</span>
                <Link href="/clients"><UsersRound size={20} />Clients</Link>
                <Link href="/motorcycles"><Bike size={20} />Motorcycles</Link>
              </div>
            ) : null}

            {canManageServices ? (
              <div className={styles.navSection}>
                <span className={styles.navSectionLabel}>Workshop</span>
                <Link href="/motorcycle-models"><Bike size={20} />Motorcycle Models</Link>
                <Link href="/mechanics"><UserCog size={20} />Mechanics</Link>
                <Link href="/services"><Settings2 size={20} />Service List</Link>
              </div>
            ) : null}

            <div className={styles.navSection}>
              <span className={styles.navSectionLabel}>Inventory</span>
              <Link href="/products"><PackageSearch size={20} />Products</Link>
              {canManageInventory ? <Link href="/inventory/stock-in"><PackagePlus size={20} />Stock In</Link> : null}
              {canManageInventory ? <Link href="/inventory/stock-adjustments"><ClipboardPenLine size={20} />Stock Out / Adjustments</Link> : null}
              {(canManageInventory || user.role === "OWNER") ? <Link href="/inventory/ledger"><Activity size={20} />Inventory Ledger</Link> : null}
              {canViewInventoryDashboard ? <Link href="/inventory-dashboard"><Gauge size={20} />Inventory Dashboard</Link> : null}
                <Link href="/inventory/stock-inquiry"><PackageSearch size={20} />Stock Inquiry</Link>
              {canManageInventory ? (
                <>
                  <Link href="/categories"><Tags size={20} />Categories</Link>
                  <Link href="/brands"><Tags size={20} />Brands</Link>
                </>
              ) : null}
              {canViewSuppliers ? <Link href="/suppliers"><Building2 size={20} />Suppliers</Link> : null}
              {canViewPurchasing ? <Link href="/purchasing"><ShoppingCart size={20} />Purchasing</Link> : null}
            </div>

            {canViewFinance ? (
              <div className={styles.navSection}>
                <span className={styles.navSectionLabel}>Finance</span>
                <Link href="/money-ledger">
                  <WalletCards size={20} />
                  Money Ledger
                </Link>
                <Link href="/mechanic-payouts">
                  <HandCoins size={20} />
                  Mechanic Payouts
                </Link>
                <Link href="/expenses">
                  <ReceiptText size={20} />
                  Expenses
                </Link>
                {canManageCapital ? (
                  <Link href="/capital-injections">
                    <PiggyBank size={20} />
                    Capital Injection
                  </Link>
                ) : null}
                <Link href="/bank-transfers">
                  <Landmark size={20} />
                  Bank Deposit / Transfer
                </Link>
                <Link href="/mechanic-cash-advances">
                  <HandCoins size={20} />
                  Cash Advances
                </Link>
              </div>
            ) : null}

            {(canViewReports || canManageUsers || canManageSettings || canManageBackups || canViewActivityLogs) ? (
              <div className={styles.navSection}>
                <span className={styles.navSectionLabel}>Administration</span>
                {canViewReports ? <Link href="/reports"><BarChart3 size={20} />Reports</Link> : null}
                {canManageUsers ? <Link href="/users"><UserCog size={20} />Users</Link> : null}
                {canManageSettings ? <Link href="/settings"><Settings2 size={20} />Settings</Link> : null}
{canManageBackups ? <Link href="/backup-restore"><DatabaseBackup size={20} />Backup & Restore</Link> : null}
                {canViewActivityLogs ? <Link href="/activity-logs"><Activity size={20} />Activity Logs</Link> : null}
              </div>
            ) : null}
          </nav>
        </aside>

        <section className={styles.content}>
          <div className={styles.welcome}>
            <div>
              <p>
                {user.role === "INVENTORY"
                  ? "Inventory Control Center"
                  : user.role === "CASHIER"
                    ? "Cashier Control Center"
                    : "Dashboard"}
              </p>
              <h1>
                {user.role === "INVENTORY"
                  ? "Inventory Dashboard"
                  : user.role === "CASHIER"
                    ? "Cashier Dashboard"
                    : `Welcome, ${user.fullName}`}
              </h1>
              <span>
                {user.role === "INVENTORY"
                  ? `Welcome, ${user.fullName}. Monitor stock levels, replenishment, and recent inventory movement.`
                  : user.role === "CASHIER"
                    ? `Welcome, ${user.fullName}. Monitor today's sales, customer payments, and ready job orders.`
                    : "Live overview of today&apos;s sales, workshop, and inventory."}
              </span>
            </div>
            {user.role !== "INVENTORY" ? <Link href="/pos" className={styles.newSaleButton}><ShoppingCart size={20} />New Sale</Link> : <Link href="/inventory/stock-in" className={styles.newSaleButton}><PackagePlus size={20} />Stock In</Link>}
          </div>

          <div className={styles.metrics}>
            {isCashierView ? (
              <>
                <article><div className={styles.metricIcon}><CircleDollarSign size={25} /></div><div><span>Today&apos;s Sales</span><strong>{money(Number(summary.today_sales))}</strong><small>Total completed sales today</small></div></article>
                {user.role === "CASHIER" ? (
                  <>
                    <article><div className={styles.metricIcon}><ShoppingCart size={25} /></div><div><span>Transactions</span><strong>{Number(summary.today_transactions)}</strong><small>Completed POS transactions today</small></div></article>
                    <article><div className={styles.metricIcon}><ReceiptText size={25} /></div><div><span>Job Orders Today</span><strong>{Number(summary.today_jobs)}</strong><small>Workshop jobs received today</small></div></article>
                    <article><div className={styles.metricIcon}><WalletCards size={25} /></div><div><span>Ready for Payment</span><strong>{Number(summary.ready_for_payment)}</strong><small>Job orders waiting for cashier</small></div></article>
                  </>
                ) : (
                  <article><div className={styles.metricIcon}><ReceiptText size={25} /></div><div><span>Job Orders Today</span><strong>{Number(summary.today_jobs)}</strong><small>{Number(summary.ready_for_payment)} ready for payment</small></div></article>
                )}
              </>
            ) : null}
            {isInventoryView ? (
              <>
                {user.role === "INVENTORY" ? (
                  <article><div className={styles.metricIcon}><Boxes size={25} /></div><div><span>Active Products</span><strong>{Number(summary.active_products)}</strong><small>Products currently tracked in inventory</small></div></article>
                ) : null}
                <article><div className={styles.metricIcon}><PackageSearch size={25} /></div><div><span>Low Stock</span><strong>{Number(summary.low_stock)}</strong><small>Products at or below reorder level</small></div></article>
                <article><div className={styles.metricIcon}><PackageX size={25} /></div><div><span>Out of Stock</span><strong>{Number(summary.out_of_stock)}</strong><small>Products requiring replenishment</small></div></article>
                {user.role === "INVENTORY" ? (
                  <article><div className={styles.metricIcon}><CircleDollarSign size={25} /></div><div><span>Inventory Value</span><strong>{money(Number(summary.inventory_value))}</strong><small>Current cost × on-hand quantity</small></div></article>
                ) : null}
              </>
            ) : null}
            {isOwnerView ? <article><div className={styles.metricIcon}><Boxes size={25} /></div><div><span>Inventory Value</span><strong>{money(Number(summary.inventory_value))}</strong><small>Based on current cost × on-hand quantity</small></div></article> : null}
          </div>

          {user.role === "CASHIER" ? (
            <div className={styles.cashierQuickActions}>
              <Link href="/pos"><ShoppingCart size={22} /><div><strong>New Sale</strong><span>Start a new POS transaction</span></div></Link>
              <Link href="/job-orders"><ReceiptText size={22} /><div><strong>Job Orders</strong><span>Open workshop orders and payments</span></div></Link>
              <Link href="/sales"><CircleDollarSign size={22} /><div><strong>Sales History</strong><span>Review completed transactions</span></div></Link>
              <Link href="/money-ledger"><WalletCards size={22} /><div><strong>Money Ledger</strong><span>Review shop cash movement</span></div></Link>
            </div>
          ) : null}

          <div className={styles.dashboardGrid}>
            <div className={styles.mainColumn}>
              {isOwnerView ? (
                <article className={styles.analyticsPanel}>
                  <header className={styles.panelHeader}>
                    <div><p>Sales Analytics</p><h2>Daily sales this month</h2></div>
                    <div className={styles.panelHeaderIcon}><BarChart3 size={20} /></div>
                  </header>
                  <div className={styles.chart}>
                    {chartDays.map((day) => {
                      const value = chartMap.get(day) ?? 0;
                      const height = Math.max(value > 0 ? 8 : 2, (value / maxDailySale) * 100);
                      return (
                        <div className={styles.chartColumn} key={day} title={`Day ${day}: ${money(value)}`}>
                          <div className={styles.chartBarTrack}><div className={styles.chartBar} style={{ height: `${height}%` }} /></div>
                          <span className={day === Number(summary.current_day) ? styles.currentDay : undefined}>{day}</span>
                        </div>
                      );
                    })}
                  </div>
                </article>
              ) : null}

              {user.role === "CASHIER" ? (
                <article className={styles.cashierPriorityPanel}>
                  <header className={styles.panelHeader}>
                    <div><p>Payment Queue</p><h2>Job orders ready for payment</h2></div>
                    <Link href="/job-orders">View all</Link>
                  </header>
                  <div className={styles.list}>
                    {readyJobs.length === 0 ? (
                      <div className={styles.compactEmpty}>No job orders are waiting for payment.</div>
                    ) : (
                      readyJobs.map((job) => (
                        <Link href={`/job-orders/${job.id}`} className={styles.listRow} key={job.id}>
                          <div>
                            <strong>{job.job_order_number}</strong>
                            <span>{job.client_name || "No client"} · {shortDateTime(job.updated_at)}</span>
                          </div>
                          <span className={`${styles.statusPill} ${styles.statusWarning}`}>READY FOR PAYMENT</span>
                        </Link>
                      ))
                    )}
                  </div>
                </article>
              ) : null}

              <div className={styles.twoPanels}>
                {isCashierView ? (
                  <article className={styles.analyticsPanel}>
                    <header className={styles.panelHeader}><div><p>Recent Activity</p><h2>Latest sales</h2></div><Link href="/sales">View all</Link></header>
                    <div className={styles.list}>
                      {recentSales.length === 0 ? <div className={styles.compactEmpty}>No completed sales yet.</div> : recentSales.map((sale) => (
                        <Link href={`/pos/receipt/${sale.id}`} className={styles.listRow} key={sale.id}>
                          <div><strong>{sale.sale_number}</strong><span>{sale.client_name || "Walk-in Customer"} · {shortDateTime(sale.sale_date)}</span></div>
                          <b>{money(Number(sale.total_amount))}</b>
                        </Link>
                      ))}
                    </div>
                  </article>
                ) : null}

                {user.role !== "INVENTORY" ? (
                  <article className={styles.analyticsPanel}>
                    <header className={styles.panelHeader}><div><p>{user.role === "CASHIER" ? "Workshop Queue" : "Workshop"}</p><h2>{user.role === "CASHIER" ? "Recent Job Orders" : "Recent Job Orders"}</h2></div><Link href="/job-orders">View all</Link></header>
                    <div className={styles.list}>
                      {recentJobs.length === 0 ? <div className={styles.compactEmpty}>No Job Orders yet.</div> : recentJobs.map((job) => (
                        <Link href={`/job-orders/${job.id}`} className={styles.listRow} key={job.id}>
                          <div><strong>{job.job_order_number}</strong><span>{job.client_name || "No client"}{job.plate_number ? ` · ${job.plate_number}` : ""}</span></div>
                          <span className={`${styles.statusPill} ${job.status === "READY_FOR_PAYMENT" ? styles.statusWarning : ""}`}>{statusLabel(job.status)}</span>
                        </Link>
                      ))}
                    </div>
                  </article>
                ) : null}
              </div>

              {isOwnerView ? (
                <div className={styles.threePanels}>
                  <article className={styles.analyticsPanel}>
                    <header className={styles.panelHeader}><div><p>Products</p><h2>Top sellers</h2></div><TrendingUp size={19} /></header>
                    <div className={styles.rankedList}>{topProducts.length === 0 ? <div className={styles.compactEmpty}>No product sales this month.</div> : topProducts.map((item, index) => <div className={styles.rankRow} key={item.product_name}><span>{index + 1}</span><div><strong>{item.product_name}</strong><small>{Number(item.quantity)} sold</small></div><b>{money(Number(item.amount))}</b></div>)}</div>
                  </article>
                  <article className={styles.analyticsPanel}>
                    <header className={styles.panelHeader}><div><p>Services</p><h2>Top services</h2></div><Wrench size={19} /></header>
                    <div className={styles.rankedList}>{topServices.length === 0 ? <div className={styles.compactEmpty}>No completed services this month.</div> : topServices.map((item, index) => <div className={styles.rankRow} key={item.service_name}><span>{index + 1}</span><div><strong>{item.service_name}</strong><small>{Number(item.jobs)} jobs</small></div><b>{money(Number(item.amount))}</b></div>)}</div>
                  </article>
                  <article className={styles.analyticsPanel}>
                    <header className={styles.panelHeader}><div><p>Workshop</p><h2>Mechanic earnings</h2></div><UserCog size={19} /></header>
                    <div className={styles.rankedList}>{mechanicEarnings.length === 0 ? <div className={styles.compactEmpty}>No mechanic earnings this month.</div> : mechanicEarnings.map((item, index) => <div className={styles.rankRow} key={item.full_name}><span>{index + 1}</span><div><strong>{item.full_name}</strong><small>{Number(item.jobs)} jobs</small></div><b>{money(Number(item.earnings))}</b></div>)}</div>
                  </article>
                </div>
              ) : null}

              {user.role === "INVENTORY" ? (
                <>
                  <div className={styles.inventoryQuickActions}>
                    <Link href="/inventory/stock-in"><PackagePlus size={22} /><div><strong>Receive Stock</strong><span>Record incoming products and batches</span></div></Link>
                    <Link href="/inventory/stock-adjustments"><ClipboardPenLine size={22} /><div><strong>Stock Adjustment</strong><span>Record stock out and corrections</span></div></Link>
                    <Link href="/inventory/stock-inquiry"><PackageSearch size={22} /><div><strong>Stock Inquiry</strong><span>Check current product availability</span></div></Link>
                    <Link href="/inventory/ledger"><Activity size={22} /><div><strong>Inventory Ledger</strong><span>Review complete stock movement</span></div></Link>
                  </div>

                  <article className={styles.analyticsPanel}>
                    <header className={styles.panelHeader}><div><p>Stock Movement</p><h2>Recent inventory activity</h2></div><Link href="/inventory/ledger">View ledger</Link></header>
                    <div className={styles.list}>
                      {stockEvents.length === 0 ? <div className={styles.compactEmpty}>No recent inventory movement.</div> : stockEvents.map((event) => (
                        <Link href={event.transaction_type === "STOCK_IN" ? `/inventory/stock-in/${event.id}` : "/inventory/ledger"} className={styles.listRow} key={event.id}>
                          <div><strong>{event.reference_number}</strong><span>{shortDateTime(event.transaction_date)}</span></div>
                          <span className={styles.statusPill}>{statusLabel(event.transaction_type)}</span>
                        </Link>
                      ))}
                    </div>
                  </article>
                </>
              ) : null}

              {isInventoryView ? (
                <article className={styles.analyticsPanel}>
                  <header className={styles.panelHeader}><div><p>Inventory Alert</p><h2>Products needing attention</h2></div><Link href="/inventory/stock-inquiry">Stock inquiry</Link></header>
                  <div className={styles.stockTable}>
                    {lowStocks.length === 0 ? <div className={styles.compactEmpty}>All active products are above their reorder level.</div> : lowStocks.map((product) => (
                      <Link href={`/products/${product.id}`} className={styles.stockRow} key={product.id}>
                        <div><strong>{product.product_name}</strong><span>{product.product_code}</span></div>
                        <div><b>{Number(product.quantity_on_hand)}</b><span>Reorder {Number(product.reorder_level)}</span></div>
                        <span className={Number(product.quantity_on_hand) <= 0 ? styles.outBadge : styles.lowBadge}>{Number(product.quantity_on_hand) <= 0 ? "OUT" : "LOW"}</span>
                      </Link>
                    ))}
                  </div>
                </article>
              ) : null}
            </div>

            <aside className={styles.notificationPanel}>
              <header className={styles.notificationHeader}>
                <div className={styles.notificationTitle}><div className={styles.bellIcon}><Bell size={19} /></div><div><span>Notifications</span><strong>{unreadNotifications.length} unread</strong></div></div>
                {unreadNotifications.length > 0 ? (
                  <form action={markAllNotificationsReadAction}>
                    <input type="hidden" name="notificationKeys" value={unreadNotifications.map((notification) => notification.key).join("|")} />
                    <button className={styles.textButton} type="submit">Mark all read</button>
                  </form>
                ) : null}
              </header>

              <div className={styles.notificationList}>
                {notifications.length === 0 ? (
                  <div className={styles.notificationEmpty}><Bell size={30} /><strong>You&apos;re all caught up</strong><span>No current alerts for your role.</span></div>
                ) : notifications.map((notification) => (
                  <article className={`${styles.notificationItem} ${notification.isRead ? styles.notificationRead : styles.notificationUnread}`} key={notification.key}>
                    <div className={`${styles.notificationTone} ${styles[`tone_${notification.tone}`]}`}><NotificationIcon tone={notification.tone} /></div>
                    <div className={styles.notificationBody}>
                      <Link href={notification.href}><strong>{notification.title}</strong><span>{notification.message}</span></Link>
                      <small><Clock3 size={12} />{relativeTime(notification.createdAt)}</small>
                    </div>
                    <div className={styles.notificationActions}>
                      {!notification.isRead ? (
                        <form action={markNotificationReadAction}>
                          <input type="hidden" name="notificationKey" value={notification.key} />
                          <button type="submit" title="Mark as read"><Check size={15} /></button>
                        </form>
                      ) : null}
                      <form action={dismissNotificationAction}>
                        <input type="hidden" name="notificationKey" value={notification.key} />
                        <button type="submit" title="Dismiss"><X size={15} /></button>
                      </form>
                    </div>
                  </article>
                ))}
              </div>
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}