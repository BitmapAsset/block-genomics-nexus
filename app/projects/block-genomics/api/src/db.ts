import { Pool } from 'pg';
import { config } from './config.js';

export const pool = new Pool({
  connectionString: config.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test connection on startup
export async function connectDb(): Promise<void> {
  try {
    const client = await pool.connect();
    console.log('✅ Database connected');
    client.release();
  } catch (err) {
    console.error('❌ Database connection failed:', err);
    // Don't exit - allow server to start for health checks
    // Real connection will be attempted on first query
  }
}

// Graceful shutdown
export async function disconnectDb(): Promise<void> {
  await pool.end();
  console.log('Database pool closed');
}
