import { executeOpenConnectorAction } from './openconnector_service.js';

// Nama koneksi OpenRouter yang dikonfigurasi di OpenConnector console adalah "Supikip"
const OC_CONNECTION_NAME = 'Supikip';

/**
 * Mendapatkan ringkasan kredit OpenRouter
 * @returns {Promise<object>} credit overview
 */
export async function getOpenRouterCredits() {
  const result = await executeOpenConnectorAction('openrouter.get_credits', {}, OC_CONNECTION_NAME);
  // data berisi { total_credits, total_usage }
  return result.data || {};
}

/**
 * Mendapatkan detail kunci API OpenRouter aktif
 * @returns {Promise<object>} key details
 */
export async function getOpenRouterKeyDetails() {
  const result = await executeOpenConnectorAction('openrouter.get_current_key', {}, OC_CONNECTION_NAME);
  // data berisi metadata detail seperti { label, limit, usage, is_active }
  return result.data || {};
}
