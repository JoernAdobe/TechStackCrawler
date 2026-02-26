export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  bedrock: {
    /** API-Key für Bedrock (Alternative zu AWS IAM) */
    apiKey: process.env.BEDROCK_API_KEY || '',
    /** Custom Endpoint (z.B. https://bedrock-runtime.us-west-2.amazonaws.com) */
    endpoint: process.env.BEDROCK_ENDPOINT || '',
    model: process.env.BEDROCK_MODEL_ID || process.env.BEDROCK_MODEL || 'us.anthropic.claude-sonnet-4-6',
    /** Fallback: AWS IAM Credentials */
    awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    awsRegion: process.env.BEDROCK_REGION || process.env.AWS_REGION || 'us-west-2',
  },
  puppeteer: {
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    timeout: parseInt(process.env.SCRAPE_TIMEOUT || '30000', 10),
  },
  elevenlabs: {
    apiKey: process.env.ELEVENLABS_API_KEY || '',
    voiceId: process.env.ELEVENLABS_VOICE_ID || '',
    modelId: process.env.ELEVENLABS_MODEL || 'eleven_v3',
  },
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'techstack',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'techstack_crawler',
  },
};
