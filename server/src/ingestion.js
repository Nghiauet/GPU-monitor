import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { existsSync } from 'fs';
import { join } from 'path';

/**
 * Maps JSONL filenames to their SQLite table names and column lists.
 */
const FILE_TABLE_MAP = {
  'gpu_device.jsonl': {
    table: 'gpu_devices',
    columns: ['ts_utc', 'server', 'hostname', 'gpu_index', 'gpu_name', 'gpu_util_pct', 'mem_util_pct', 'mem_used_mb', 'mem_total_mb', 'temp_c'],
  },
  'gpu_process.jsonl': {
    table: 'gpu_processes',
    columns: ['ts_utc', 'server', 'hostname', 'gpu_index', 'gpu_uuid', 'pid', 'user', 'process_name', 'cmd', 'gpu_mem_mb', 'cpu_pct', 'mem_pct', 'elapsed_sec', 'state'],
  },
  'user_rollup.jsonl': {
    table: 'user_rollups',
    columns: ['ts_utc', 'server', 'hostname', 'user', 'process_count', 'gpu_count', 'total_gpu_mem_mb', 'avg_cpu_pct', 'max_cpu_pct'],
  },
  'host_summary.jsonl': {
    table: 'host_summaries',
    columns: ['ts_utc', 'server', 'hostname', 'load_1', 'load_5', 'load_15', 'cpu_user_pct', 'cpu_system_pct', 'cpu_idle_pct', 'mem_total_mb', 'mem_used_mb', 'mem_free_mb', 'swap_total_mb', 'swap_used_mb', 'task_total', 'task_running', 'task_sleeping'],
  },
};

/**
 * Reads a JSONL file and returns an array of parsed JSON objects.
 * @param {string} filePath
 * @returns {Promise<object[]>}
 */
async function readJsonlFile(filePath) {
  const rows = [];
  const fileStream = createReadStream(filePath);
  const rl = createInterface({ input: fileStream, crlfDelay: Infinity });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (trimmed) {
      try {
        rows.push(JSON.parse(trimmed));
      } catch {
        // skip malformed lines
      }
    }
  }
  return rows;
}

/**
 * Ingests all JSONL files from a directory into the database.
 * Skips missing files. Deduplicates by ts_utc + server.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} dirPath - Directory containing the JSONL files
 * @returns {Promise<{ gpu_devices: number, gpu_processes: number, user_rollups: number, host_summaries: number }>}
 */
export async function ingestDirectory(db, dirPath) {
  const counts = {
    gpu_devices: 0,
    gpu_processes: 0,
    user_rollups: 0,
    host_summaries: 0,
  };

  for (const [filename, { table, columns }] of Object.entries(FILE_TABLE_MAP)) {
    const filePath = join(dirPath, filename);

    // Skip missing files without error
    if (!existsSync(filePath)) {
      continue;
    }

    const rows = await readJsonlFile(filePath);
    if (rows.length === 0) continue;

    // Dedup check: if any row with ts_utc + server already exists, skip the entire file
    const firstRow = rows[0];
    const dedupStmt = db.prepare(
      `SELECT 1 FROM ${table} WHERE ts_utc = ? AND server = ? LIMIT 1`
    );
    const alreadyExists = dedupStmt.get(firstRow.ts_utc, firstRow.server);
    if (alreadyExists) continue;

    // Prepare insert statement
    const placeholders = columns.map(() => '?').join(', ');
    const insertStmt = db.prepare(
      `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`
    );

    // Batch insert all rows in a transaction
    const insertMany = db.transaction((rows) => {
      let inserted = 0;
      for (const row of rows) {
        const values = columns.map((col) => {
          const val = row[col];
          return val === undefined ? null : val;
        });
        insertStmt.run(values);
        inserted++;
      }
      return inserted;
    });

    const inserted = insertMany(rows);
    counts[table] += inserted;
  }

  return counts;
}
