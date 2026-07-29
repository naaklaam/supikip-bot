import { executeOpenConnectorAction } from './openconnector_service.js';

/**
 * Append rows of data to a spreadsheet range
 * @param {string} spreadsheetId - Spreadsheet ID or spreadsheet URL
 * @param {string} range - A1 notation range (e.g. "Sheet1!A1")
 * @param {Array<Array<any>>} values - Two-dimensional array/matrix of values to append
 */
export async function appendSpreadsheetValues(spreadsheetId, range, values) {
  return await executeOpenConnectorAction('googlesheets.spreadsheets_values_append', {
    spreadsheetId,
    range,
    values,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS'
  });
}

/**
 * Read values from a spreadsheet range
 * @param {string} spreadsheetId - Spreadsheet ID or spreadsheet URL
 * @param {string} range - A1 notation range (e.g. "Sheet1!A1:C10")
 */
export async function readSpreadsheetValues(spreadsheetId, range) {
  const data = await executeOpenConnectorAction('googlesheets.values_get', {
    spreadsheetId,
    range,
    valueRenderOption: 'FORMATTED_VALUE'
  });
  return data.values || [];
}

/**
 * Update/overwrite values in a spreadsheet range
 * @param {string} spreadsheetId - Spreadsheet ID or spreadsheet URL
 * @param {string} range - A1 notation range (e.g. "Sheet1!A1")
 * @param {Array<Array<any>>} values - Two-dimensional array/matrix of values to write
 */
export async function updateSpreadsheetValues(spreadsheetId, range, values) {
  return await executeOpenConnectorAction('googlesheets.values_update', {
    spreadsheetId,
    range,
    values,
    valueInputOption: 'USER_ENTERED'
  });
}
