export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  aws: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    region: process.env.AWS_REGION || 'us-west-2',
    bedrockModel: process.env.BEDROCK_MODEL || 'us.anthropic.claude-sonnet-4-6',
  },
  puppeteer: {
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    timeout: parseInt(process.env.SCRAPE_TIMEOUT || '30000', 10),
  },
};
