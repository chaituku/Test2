// Configuration settings for the application
// Database, authentication, and other environment-specific settings
// loaded from environment variables with sensible defaults

interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
  max_connections: number;
  idle_timeout: number;
  master_schema: string;
  tenant_schema_prefix: string;
}

interface AuthConfig {
  session_secret: string;
  token_expiry: string;
  cookie_secure: boolean;
  cookie_max_age: number;
}

interface WebSocketConfig {
  path: string;
  ping_interval: number;
  ping_timeout: number;
  message_encryption_key: string;
}

interface AppConfig {
  environment: 'development' | 'test' | 'production';
  port: number;
  log_level: 'debug' | 'info' | 'warn' | 'error';
  database: DatabaseConfig;
  auth: AuthConfig;
  websocket: WebSocketConfig;
}

// Default configuration values
const config: AppConfig = {
  environment: (process.env.NODE_ENV as 'development' | 'test' | 'production') || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  log_level: (process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error') || 'info',
  
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'badminton_app',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    ssl: process.env.DB_SSL === 'true',
    max_connections: parseInt(process.env.DB_MAX_CONNECTIONS || '10', 10),
    idle_timeout: parseInt(process.env.DB_IDLE_TIMEOUT || '30000', 10)
  },
  
  auth: {
    session_secret: process.env.SESSION_SECRET || 'badminton-platform-development-session-secret',
    token_expiry: process.env.TOKEN_EXPIRY || '7d',
    cookie_secure: process.env.COOKIE_SECURE === 'true',
    cookie_max_age: parseInt(process.env.COOKIE_MAX_AGE || '604800000', 10) // 7 days in milliseconds
  },
  
  websocket: {
    path: process.env.WS_PATH || '/ws',
    ping_interval: parseInt(process.env.WS_PING_INTERVAL || '30000', 10), // 30 seconds
    ping_timeout: parseInt(process.env.WS_PING_TIMEOUT || '5000', 10), // 5 seconds
    message_encryption_key: process.env.MESSAGE_ENCRYPTION_KEY || 'badminton-platform-secure-communications-key'
  }
};

// Validate required configuration
function validateConfig(appConfig: AppConfig): void {
  const requiredEnvVars = [
    { name: 'SESSION_SECRET', value: appConfig.auth.session_secret, defaultValue: 'badminton-platform-development-session-secret' },
    { name: 'MESSAGE_ENCRYPTION_KEY', value: appConfig.websocket.message_encryption_key, defaultValue: 'badminton-platform-secure-communications-key' }
  ];

  // In production, ensure we're not using default values for sensitive settings
  if (appConfig.environment === 'production') {
    for (const envVar of requiredEnvVars) {
      if (envVar.value === envVar.defaultValue) {
        console.warn(`WARNING: Using default ${envVar.name} in production environment. This is insecure.`);
      }
    }
  }
}

// Validate the configuration
validateConfig(config);

export default config;