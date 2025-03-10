// Configuration settings for the application
import dotenv from 'dotenv';

// Load environment variables from .env file if it exists
dotenv.config();

interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl: boolean;
}

interface AppConfig {
  port: number;
  sessionSecret: string;
  messageEncryptionKey: string;
  nodeEnv: string;
  database: DatabaseConfig;
  corsOrigins: string[];
  wsHeartbeatInterval: number; // in ms
}

const config: AppConfig = {
  port: parseInt(process.env.PORT || '3000', 10),
  sessionSecret: process.env.SESSION_SECRET || 'badminton-platform-session-secret',
  messageEncryptionKey: process.env.MESSAGE_ENCRYPTION_KEY || 'badminton-platform-secure-communications-key',
  nodeEnv: process.env.NODE_ENV || 'development',
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'badminton_platform',
    ssl: process.env.DB_SSL === 'true'
  },
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:3000').split(','),
  wsHeartbeatInterval: parseInt(process.env.WS_HEARTBEAT_INTERVAL || '30000', 10)
};

// Helper functions for checking environments
export const isDevelopment = (): boolean => config.nodeEnv === 'development';
export const isProduction = (): boolean => config.nodeEnv === 'production';
export const isTest = (): boolean => config.nodeEnv === 'test';

export default config;