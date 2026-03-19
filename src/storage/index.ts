import type { AutoClawConfig } from '../types.js';
import type { StorageAdapter } from './adapter.js';
import { SQLiteAdapter } from './sqlite-adapter.js';
import { FileAdapter } from './file-adapter.js';
import { SupabaseAdapter } from './supabase-adapter.js';

export type { StorageAdapter } from './adapter.js';
export { SQLiteAdapter } from './sqlite-adapter.js';
export { FileAdapter } from './file-adapter.js';
export { SupabaseAdapter } from './supabase-adapter.js';

/**
 * Factory function — creates the appropriate StorageAdapter from config.
 * Defaults to FileAdapter if storage type is unrecognized.
 */
export function createStorage(config: AutoClawConfig): StorageAdapter {
  switch (config.storage) {
    case 'sqlite':
      return new SQLiteAdapter();
    case 'file':
      return new FileAdapter();
    case 'supabase':
      if (!config.supabaseUrl || !config.supabaseKey) {
        throw new Error('Supabase storage requires supabaseUrl and supabaseKey in config');
      }
      return new SupabaseAdapter(config.supabaseUrl, config.supabaseKey);
    default:
      return new FileAdapter();
  }
}

