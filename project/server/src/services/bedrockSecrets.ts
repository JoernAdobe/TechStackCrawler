import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';

const REGION = process.env.BEDROCK_REGION || process.env.AWS_REGION || 'us-west-2';

export async function fetchBedrockApiKey(
  secretName = process.env.BEDROCK_SECRET_NAME || 'bedrock/AWS4457/DEV/api-key',
): Promise<string | null> {
  try {
    const client = new SecretsManagerClient({ region: REGION });
    const response = await client.send(
      new GetSecretValueCommand({
        SecretId: secretName,
        VersionStage: 'AWSCURRENT',
      }),
    );

    const secretString = response.SecretString;
    if (!secretString) return null;

    const parsed = JSON.parse(secretString) as Record<string, string>;
    return parsed.api_key || parsed.apiKey || null;
  } catch (err) {
    console.error('Secrets Manager fetch error:', err);
    return null;
  }
}
