export interface Db {
  exec(sql: string): Promise<void>;
  run(sql: string, p?: unknown[]): Promise<void>;
  all<T>(sql: string, p?: unknown[]): Promise<T[]>;
  first<T>(sql: string, p?: unknown[]): Promise<T | null>;
  tx(fn: () => Promise<void>): Promise<void>;
}
