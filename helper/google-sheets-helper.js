const { google } = require('googleapis');
const credentials = require('./key.json'); // Your service account key
const spreadsheetId = '1EwS3kOb5CwLZTG8so-NHIALapgLZse2zKfsRMsI7ycc'; // Replace with your actual sheet ID

const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
});

const sheets = google.sheets({ version: 'v4', auth });

async function readSheet(sheetName) {
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheetName}`
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) return [];

    const headers = rows[0];
    return rows.slice(1).map(row => {
        const obj = {};
        headers.forEach((h, i) => {
            obj[h] = row[i] || '';
        });
        return obj;
    });
}

async function writeSheet(sheetName, dataArray) {
    if (!dataArray || dataArray.length === 0) return;

    const headers = Object.keys(dataArray[0]);
    const values = [headers, ...dataArray.map(obj => headers.map(h => obj[h]))];

    await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}`,
        valueInputOption: 'RAW',
        resource: {
            values
        }
    });
}

module.exports = {
    readUsers: () => readSheet('users'),
    writeUsers: (data) => writeSheet('users', data),
    readWorkData: () => readSheet('work_data'),
    writeWorkData: (data) => writeSheet('work_data', data)
};
