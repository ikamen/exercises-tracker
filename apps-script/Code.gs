/**
 * @OnlyCurrentDoc
 *
 * Exercise Tracker - Apps Script backend
 *
 * Deploy this as a Web App (Deploy > New deployment > Web app):
 *   - Execute as: Me
 *   - Who has access: Anyone
 *
 * The sheet must have a tab named exactly "Exercises tracker" with headers
 * in row 1: Date | Legs | Arms | Chest | Core | Notes (columns A-F).
 *
 * The @OnlyCurrentDoc annotation above tells Apps Script to request only the
 * "spreadsheets.currentonly" OAuth scope - access to THIS sheet alone -
 * instead of the broad "spreadsheets" scope, which would grant edit access
 * to every spreadsheet in your Google Drive. It works because every function
 * below only ever touches the sheet this script is bound to (via
 * getActiveSpreadsheet()) and never opens any other file by ID or URL.
 */

var SHEET_NAME = 'Exercises tracker';

function doGet(e) {
  var action = e.parameter.action;
  if (action === 'read') {
    return handleRead();
  }
  return jsonResponse({ success: false, error: 'Unknown action: ' + action });
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.action === 'save') {
      return handleSave(body.rows);
    }
    return jsonResponse({ success: false, error: 'Unknown action: ' + body.action });
  } catch (err) {
    return jsonResponse({ success: false, error: err.message });
  }
}

function getSheet() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) {
    throw new Error('Sheet tab "' + SHEET_NAME + '" not found');
  }
  return sheet;
}

function handleRead() {
  try {
    var sheet = getSheet();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return jsonResponse({ success: true, rows: [] });
    }
    var values = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
    var rows = values
      .filter(function (r) { return r[0] !== '' && r[0] !== null; })
      .map(function (r) {
        return {
          date: formatDateCell(r[0]),
          legs: isChecked(r[1]),
          arms: isChecked(r[2]),
          chest: isChecked(r[3]),
          core: isChecked(r[4]),
          notes: r[5] ? String(r[5]) : ''
        };
      });
    return jsonResponse({ success: true, rows: rows });
  } catch (err) {
    return jsonResponse({ success: false, error: err.message });
  }
}

function handleSave(rowsToSave) {
  try {
    if (!rowsToSave || !rowsToSave.length) {
      return jsonResponse({ success: false, error: 'No rows provided' });
    }
    var sheet = getSheet();
    var lastRow = sheet.getLastRow();
    var existingDates = [];
    if (lastRow >= 2) {
      var dateValues = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      existingDates = dateValues.map(function (r) { return formatDateCell(r[0]); });
    }

    rowsToSave.forEach(function (row) {
      var rowValues = [
        row.date,
        row.legs ? 'V' : '',
        row.arms ? 'V' : '',
        row.chest ? 'V' : '',
        row.core ? 'V' : '',
        row.notes || ''
      ];
      var idx = existingDates.indexOf(row.date);
      if (idx >= 0) {
        sheet.getRange(idx + 2, 1, 1, 6).setValues([rowValues]);
      } else {
        sheet.appendRow(rowValues);
        existingDates.push(row.date);
      }
    });

    return jsonResponse({ success: true });
  } catch (err) {
    return jsonResponse({ success: false, error: err.message });
  }
}

function isChecked(cellValue) {
  return String(cellValue).trim().toUpperCase() === 'V';
}

function formatDateCell(value) {
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'dd-MMM-yyyy');
  }
  return String(value).trim();
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
