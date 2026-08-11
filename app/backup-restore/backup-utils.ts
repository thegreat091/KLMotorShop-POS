import { spawn } from "node:child_process";
import { createWriteStream, existsSync, promises as fs } from "node:fs";
import path from "node:path";

export type BackupMeta = {
  filename: string;
  createdAt: string;
  createdBy: string;
  createdByRole: string;
  size: number;
};

export function getBackupDirectory() {
  if (process.env.KLMOTOR_BACKUP_DIR?.trim()) {
    return process.env.KLMOTOR_BACKUP_DIR.trim();
  }

  if (process.platform === "win32") {
    return "C:\\KLMotorShop\\Backups";
  }

  return path.join(process.cwd(), "backups");
}

export async function ensureBackupDirectory() {
  const dir = getBackupDirectory();
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export function safeBackupFilename(filename: string) {
  const base = path.basename(filename);

  if (
    base !== filename ||
    !/^KLMotorShop_[A-Za-z0-9_-]+\.sql$/i.test(base)
  ) {
    throw new Error("Invalid backup filename.");
  }

  return base;
}

function databaseConfig() {
  return {
    host: process.env.DB_HOST ?? "127.0.0.1",
    port: process.env.DB_PORT ?? "3306",
    user: process.env.DB_USER ?? "root",
    password: process.env.DB_PASSWORD ?? "",
    database: process.env.DB_NAME ?? "kl_motor_shop",
  };
}

function executableCandidates(kind: "dump" | "client") {
  const names =
    kind === "dump"
      ? ["mariadb-dump.exe", "mysqldump.exe", "mariadb-dump", "mysqldump"]
      : ["mariadb.exe", "mysql.exe", "mariadb", "mysql"];

  const explicitDir = process.env.MYSQL_BIN_DIR?.trim();

  const commonDirs =
    process.platform === "win32"
      ? [
          explicitDir,
          "C:\\Program Files\\MariaDB 12.3\\bin",
          "C:\\Program Files\\MariaDB 12.2\\bin",
          "C:\\Program Files\\MariaDB 12.1\\bin",
          "C:\\Program Files\\MariaDB 11.8\\bin",
          "C:\\xampp\\mysql\\bin",
        ].filter(Boolean) as string[]
      : explicitDir
        ? [explicitDir]
        : [];

  const candidates: string[] = [];

  for (const dir of commonDirs) {
    for (const name of names) {
      candidates.push(path.join(dir, name));
    }
  }

  // Bare executable names allow Windows/PATH resolution when MariaDB/MySQL
  // is already available from the command line.
  candidates.push(...names);

  return [...new Set(candidates)];
}

function commandEnv(password: string) {
  return {
    ...process.env,
    MYSQL_PWD: password,
  };
}

async function runDump(executable: string, outputPath: string) {
  const db = databaseConfig();

  const args = [
    `--host=${db.host}`,
    `--port=${db.port}`,
    `--user=${db.user}`,
    "--single-transaction",
    "--quick",
    "--routines",
    "--triggers",
    "--events",
    "--hex-blob",
    "--default-character-set=utf8mb4",
    "--add-drop-table",
    "--databases",
    db.database,
  ];

  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(outputPath, { flags: "w" });
    const child = spawn(executable, args, {
      windowsHide: true,
      env: commandEnv(db.password),
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";

    child.stdout.pipe(output);

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);

    output.on("error", reject);

    child.on("close", (code) => {
      output.end();

      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            stderr.trim() ||
              `Database backup command exited with code ${String(code)}.`,
          ),
        );
      }
    });
  });
}

export async function createDatabaseBackup(
  createdBy: string,
  createdByRole: string,
  prefix = "KLMotorShop",
) {
  const dir = await ensureBackupDirectory();
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  const timestamp =
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_` +
    `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;

  const filename = `${prefix}_${timestamp}.sql`;
  const outputPath = path.join(dir, filename);

  let lastError: unknown = null;

  for (const executable of executableCandidates("dump")) {
    if (
      path.isAbsolute(executable) &&
      !existsSync(executable)
    ) {
      continue;
    }

    try {
      await runDump(executable, outputPath);

      const stat = await fs.stat(outputPath);

      if (stat.size <= 0) {
        throw new Error("The generated SQL backup is empty.");
      }

      const meta: BackupMeta = {
        filename,
        createdAt: now.toISOString(),
        createdBy,
        createdByRole,
        size: stat.size,
      };

      await fs.writeFile(
        path.join(dir, `${filename}.json`),
        JSON.stringify(meta, null, 2),
        "utf8",
      );

      return meta;
    } catch (error) {
      lastError = error;
      await fs.rm(outputPath, { force: true }).catch(() => undefined);
    }
  }

  const detail =
    lastError instanceof Error ? lastError.message : "Unknown backup error.";

  throw new Error(
    `Unable to run MariaDB/MySQL backup tool. ${detail} ` +
      `If MariaDB is not in PATH, set MYSQL_BIN_DIR in .env.local, for example ` +
      `MYSQL_BIN_DIR=C:\\Program Files\\MariaDB 12.3\\bin`,
  );
}

async function runRestore(executable: string, sqlPath: string) {
  const db = databaseConfig();

  const args = [
    `--host=${db.host}`,
    `--port=${db.port}`,
    `--user=${db.user}`,
    "--default-character-set=utf8mb4",
    db.database,
  ];

  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, args, {
      windowsHide: true,
      env: commandEnv(db.password),
      stdio: ["pipe", "ignore", "pipe"],
    });

    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            stderr.trim() ||
              `Database restore command exited with code ${String(code)}.`,
          ),
        );
      }
    });

    fs.readFile(sqlPath)
      .then((buffer) => {
        child.stdin.write(buffer);
        child.stdin.end();
      })
      .catch((error) => {
        child.stdin.destroy();
        reject(error);
      });
  });
}

export async function restoreDatabaseFromFile(sqlPath: string) {
  let lastError: unknown = null;

  for (const executable of executableCandidates("client")) {
    if (
      path.isAbsolute(executable) &&
      !existsSync(executable)
    ) {
      continue;
    }

    try {
      await runRestore(executable, sqlPath);
      return;
    } catch (error) {
      lastError = error;
    }
  }

  const detail =
    lastError instanceof Error ? lastError.message : "Unknown restore error.";

  throw new Error(
    `Unable to run MariaDB/MySQL restore tool. ${detail} ` +
      `If MariaDB is not in PATH, set MYSQL_BIN_DIR in .env.local.`,
  );
}

export async function listBackups(): Promise<BackupMeta[]> {
  const dir = await ensureBackupDirectory();
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const sqlFiles = entries
    .filter(
      (entry) =>
        entry.isFile() &&
        /^KLMotorShop_[A-Za-z0-9_-]+\.sql$/i.test(entry.name),
    )
    .map((entry) => entry.name);

  const rows: BackupMeta[] = [];

  for (const filename of sqlFiles) {
    const sqlPath = path.join(dir, filename);
    const stat = await fs.stat(sqlPath);
    const metaPath = path.join(dir, `${filename}.json`);

    let meta: Partial<BackupMeta> = {};

    try {
      meta = JSON.parse(await fs.readFile(metaPath, "utf8"));
    } catch {
      // Old/manual SQL backups may not have metadata.
    }

    rows.push({
      filename,
      createdAt: meta.createdAt ?? stat.mtime.toISOString(),
      createdBy: meta.createdBy ?? "Manual / External",
      createdByRole: meta.createdByRole ?? "—",
      size: stat.size,
    });
  }

  rows.sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return rows;
}

export async function deleteBackupFile(filename: string) {
  const safe = safeBackupFilename(filename);
  const dir = await ensureBackupDirectory();

  await fs.rm(path.join(dir, safe), { force: true });
  await fs.rm(path.join(dir, `${safe}.json`), { force: true });
}

export async function backupFilePath(filename: string) {
  const safe = safeBackupFilename(filename);
  const dir = await ensureBackupDirectory();
  const fullPath = path.join(dir, safe);

  const stat = await fs.stat(fullPath);

  if (!stat.isFile()) {
    throw new Error("Backup file not found.");
  }

  return fullPath;
}
