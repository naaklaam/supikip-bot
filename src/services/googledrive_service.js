import { executeOpenConnectorAction } from './openconnector_service.js';
import dotenv from 'dotenv';
dotenv.config();

const OC_URL = process.env.OC_URL || 'http://localhost:3000';
const OC_CONNECTION_NAME = process.env.OC_CONNECTION_NAME || 'default';

/**
 * List files in Google Drive
 * @param {string} query - Google Drive search query (e.g. "name contains 'manhwa'")
 * @param {number} pageSize - Maximum results to return
 */
export async function listDriveFiles(query = '', pageSize = 10) {
  const input = {
    pageSize
  };
  if (query) {
    input.q = query;
  }
  const data = await executeOpenConnectorAction('googledrive.files.list', input);
  return data.files || [];
}

/**
 * Get file metadata details
 * @param {string} fileId - The Google Drive file ID
 */
export async function getDriveFileMetadata(fileId) {
  return await executeOpenConnectorAction('googledrive.files.get', {
    fileId
  });
}

/**
 * Read text content of a file from Google Drive via OpenConnector Proxy
 * @param {string} fileId - The Google Drive file ID
 */
export async function readDriveFileContent(fileId) {
  const url = `${OC_URL.replace(/\/$/, '')}/v1/proxy/googledrive`;
  
  const body = {
    endpoint: `/files/${fileId}`,
    method: 'GET',
    query: {
      alt: 'media'
    },
    connectionName: OC_CONNECTION_NAME
  };
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  
  const result = await response.json();
  
  if (!response.ok || result.success === false) {
    const errorMsg = result.message || `HTTP ${response.status}`;
    throw new Error(`Gagal membaca konten file Drive: ${errorMsg}`);
  }
  
  const proxyResponse = result.data;
  let fileContent = proxyResponse.data;
  if (proxyResponse.bodyEncoding === 'base64' && typeof fileContent === 'string') {
    fileContent = Buffer.from(fileContent, 'base64').toString('utf-8');
  }
  
  return fileContent;
}

/**
 * Delete a file from Google Drive
 * @param {string} fileId - The Google Drive file ID
 */
export async function deleteDriveFile(fileId) {
  return await executeOpenConnectorAction('googledrive.files.delete', {
    fileId
  });
}
