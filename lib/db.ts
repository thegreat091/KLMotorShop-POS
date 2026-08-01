import mysql, {
  Pool,
  PoolConnection,
  PoolOptions,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";

declare global {
  // eslint-disable-next-line no-var
  var klMotorShopDatabasePool: Pool | undefined;
}

const databaseConfiguration: PoolOptions = {
  host: process.env.DB_HOST ?? "127.0.0.1",
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? "root",
  password: process.env.DB_PASSWORD ?? "",
  database: process.env.DB_NAME ?? "kl_motor_shop",
  charset: "utf8mb4",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  decimalNumbers: true,
  timezone: "+08:00",
};

export const pool =
  global.klMotorShopDatabasePool ??
  mysql.createPool(databaseConfiguration);

if (process.env.NODE_ENV !== "production") {
  global.klMotorShopDatabasePool = pool;
}

export type DatabaseRow = RowDataPacket;
export type DatabaseResult = ResultSetHeader;

export async function getDatabaseConnection(): Promise<PoolConnection> {
  return pool.getConnection();
}

export async function testDatabaseConnection(): Promise<boolean> {
  const connection = await pool.getConnection();

  try {
    await connection.query("SELECT 1");
    return true;
  } finally {
    connection.release();
  }
}