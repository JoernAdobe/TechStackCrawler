#!/usr/bin/env npx tsx
/**
 * Rotiert den Bedrock API-Key:
 * 1. Erstellt neuen Key via IAM CreateServiceSpecificCredential
 * 2. Aktualisiert das Secret in AWS Secrets Manager
 *
 * Voraussetzung: AWS-Credentials (aws configure) mit IAM + Secrets Manager Rechten
 * Ausführen: npm run rotate-bedrock-key (im project-Verzeichnis)
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { IAMClient, CreateServiceSpecificCredentialCommand } from '@aws-sdk/client-iam';
import {
  SecretsManagerClient,
  GetSecretValueCommand,
  PutSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const REGION = process.env.BEDROCK_REGION || process.env.AWS_REGION || 'us-west-2';
const SECRET_NAME = process.env.BEDROCK_SECRET_NAME || 'bedrock/AWS4457/DEV/api-key';
const IAM_USER = process.env.BEDROCK_IAM_USER || 'bedrock-api-user-AWS4457-DEV';
const EXPIRATION_DAYS = parseInt(process.env.BEDROCK_KEY_EXPIRATION_DAYS || '365', 10);

async function main() {
  console.log('Bedrock API-Key Rotation');
  console.log('------------------------');
  console.log('Region:', REGION);
  console.log('Secret:', SECRET_NAME);
  console.log('IAM User:', IAM_USER);
  console.log('Expiration:', EXPIRATION_DAYS, 'days');
  console.log('');

  const iam = new IAMClient({ region: REGION });
  const sm = new SecretsManagerClient({ region: REGION });

  // 1. Neuen API-Key erstellen
  console.log('1. Erstelle neuen Bedrock API-Key via IAM...');
  const createRes = await iam.send(
    new CreateServiceSpecificCredentialCommand({
      UserName: IAM_USER,
      ServiceName: 'bedrock.amazonaws.com',
      CredentialAgeDays: EXPIRATION_DAYS,
    }),
  );

  const newKey = createRes.ServiceSpecificCredential?.ServicePassword;
  const credentialId = createRes.ServiceSpecificCredential?.ServiceSpecificCredentialId;

  if (!newKey) {
    throw new Error('Kein API-Key in IAM-Antwort erhalten');
  }
  console.log('   OK – neuer Key erstellt (CredentialId:', credentialId, ')');

  // 2. Aktuelles Secret lesen
  console.log('2. Lese aktuelles Secret aus Secrets Manager...');
  const getRes = await sm.send(
    new GetSecretValueCommand({
      SecretId: SECRET_NAME,
      VersionStage: 'AWSCURRENT',
    }),
  );

  const currentSecret = getRes.SecretString;
  if (!currentSecret) {
    throw new Error('Secret ist leer');
  }

  const parsed = JSON.parse(currentSecret) as Record<string, unknown>;
  parsed.api_key = newKey;
  parsed.updated_at = new Date().toISOString();

  // 3. Secret aktualisieren
  console.log('3. Aktualisiere Secret in Secrets Manager...');
  await sm.send(
    new PutSecretValueCommand({
      SecretId: SECRET_NAME,
      SecretString: JSON.stringify(parsed, null, 0),
    }),
  );
  console.log('   OK – Secret aktualisiert');

  console.log('');
  console.log('Fertig. Der neue Key ist im Secret gespeichert.');
  console.log('Server neu starten (make stop && make start)');
}

main().catch((err) => {
  console.error('Fehler:', err.message);
  process.exit(1);
});
