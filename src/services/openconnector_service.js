import dotenv from 'dotenv';
dotenv.config();

const OC_URL = process.env.OC_URL || 'http://localhost:3000';
const OC_API_KEY = process.env.OC_API_KEY || '';
const OC_CONNECTION_NAME = process.env.OC_CONNECTION_NAME || 'default';

/**
 * Mengeksekusi aksi/tool pada OpenConnector
 * @param {string} actionId - ID aksi penuh (contoh: 'gmail.fetch_emails')
 * @param {object} input - Argumen input untuk aksi
 * @returns {Promise<any>}
 */
export async function executeOpenConnectorAction(actionId, input = {}, connectionName = null) {
  const url = `${OC_URL.replace(/\/$/, '')}/v1/actions/${actionId}`;
  const headers = {
    'Content-Type': 'application/json',
  };
  
  if (OC_API_KEY) {
    headers['Authorization'] = `Bearer ${OC_API_KEY}`;
  }
  
  const body = {
    input,
    connectionName: connectionName || OC_CONNECTION_NAME,
  };
  
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  
  const result = await response.json();
  
  if (!response.ok || result.success === false) {
    const errorMsg = result.message || `HTTP ${response.status}`;
    const errorCode = result.errorCode || 'unknown_error';
    throw new Error(`[OpenConnector Error] ${actionId} failed: ${errorMsg} (${errorCode})`);
  }
  
  return result.data;
}
