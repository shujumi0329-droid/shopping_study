const EVENT_SHEET = "Event_Log";
const PARTICIPANT_SHEET = "Participants";
const BRIDGE_SHEET = "Bridge_Sessions";
const SETUP_SHEET = "Setup";
const STUDY_VERSION = "shopping-v9-survey-return-2026-09-01";

function openStudySpreadsheet_() {
  const spreadsheetId = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
  if (!spreadsheetId) throw new Error("SPREADSHEET_ID script property is not configured");
  return SpreadsheetApp.openById(spreadsheetId);
}

function doGet(e) {
  const action = String((e && e.parameter && e.parameter.action) || "health");
  const callback = String((e && e.parameter && e.parameter.callback) || "");
  let out;

  if (action === "config") {
    const ss = openStudySpreadsheet_();
    out = {
      ok: true,
      survey_url: getSetting_(ss, "survey_url") || "",
      study_version: STUDY_VERSION,
      min_count: 1,
      max_count: 7
    };
  } else {
    out = {ok:true, service:"shopping-study-collector", study_version:STUDY_VERSION};
  }

  if (callback && /^[A-Za-z_$][0-9A-Za-z_$\.]*$/.test(callback)) {
    return ContentService.createTextOutput(callback + "(" + JSON.stringify(out) + ");")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const data = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    const ss = openStudySpreadsheet_();

    if (data.action === "ADMIN_SET_SURVEY") {
      return handleAdminSetSurvey_(ss, data);
    }
    if (data.action === "BRIDGE_START") {
      return handleBridgeStart_(ss, data);
    }

    if (!data.join_id || !data.event_type) throw new Error("Missing join_id/event_type");
    const ev = ss.getSheetByName(EVENT_SHEET);
    const ps = ss.getSheetByName(PARTICIPANT_SHEET);
    if (!ev || !ps) throw new Error("Event_Log or Participants sheet is missing");
    ensureResearchHeaders_(ev, ps);

    if (data.event_id && eventExists_(ev, data.event_id)) {
      return json_({ok:true,duplicate:true});
    }

    const now = new Date();
    ev.appendRow([
      now, data.client_time || "", data.event_id || "", data.join_id || "", data.session_id || "",
      data.assignment_id || "", data.worker_id || "", data.hit_id || "", data.event_type || "",
      data.product_id || "", data.page || "", data.selected_count || 0, data.selected_items || "",
      data.selection_order || "", data.elapsed_ms || 0, data.study_version || "", data.user_agent || "",
      data.referrer || "", data.extra_json || "", Number(data.selected_total_usd || 0),
      data.run_mode || "", data.recruitment_source || ""
    ]);
    upsertParticipant_(ps, data, now);
    return json_({ok:true});
  } catch (err) {
    return json_({ok:false,error:String(err)});
  } finally {
    lock.releaseLock();
  }
}

function ensureResearchHeaders_(eventSheet, participantSheet) {
  eventSheet.getRange(1,21,1,2).setValues([["run_mode","recruitment_source"]]);
  participantSheet.getRange(1,20,1,2).setValues([["run_mode","recruitment_source"]]);
}

function ensureBridgeSheet_(ss) {
  let sheet = ss.getSheetByName(BRIDGE_SHEET);
  if (!sheet) sheet = ss.insertSheet(BRIDGE_SHEET);
  const headers = [["join_id","run_mode","recruitment_source","assignment_id","worker_id","hit_id","created_at","last_seen_at","study_version"]];
  sheet.getRange(1,1,1,9).setValues(headers);
  return sheet;
}

function handleBridgeStart_(ss, data) {
  const joinId = String(data.join_id || "").trim();
  const runMode = String(data.run_mode || "").trim();
  const source = String(data.recruitment_source || "").trim();
  if (!joinId) throw new Error("Missing bridge join_id");
  if (["production","internal","preview"].indexOf(runMode) < 0) throw new Error("Invalid run_mode");
  if (["mturk","internal_test","mturk_preview"].indexOf(source) < 0) throw new Error("Invalid recruitment_source");

  const sheet = ensureBridgeSheet_(ss);
  const now = new Date();
  let row = 0;
  const last = sheet.getLastRow();
  if (last >= 2) {
    const found = sheet.getRange(2,1,last-1,1).createTextFinder(joinId).matchEntireCell(true).findNext();
    if (found) row = found.getRow();
  }
  if (!row) {
    row = Math.max(2,last+1);
    sheet.getRange(row,1,1,9).setValues([[
      joinId, runMode, source, data.assignment_id || "", data.worker_id || "", data.hit_id || "",
      now, now, data.study_version || STUDY_VERSION
    ]]);
  } else {
    const createdAt = sheet.getRange(row,7).getValue() || now;
    sheet.getRange(row,1,1,9).setValues([[
      joinId, runMode, source, data.assignment_id || "", data.worker_id || "", data.hit_id || "",
      createdAt, now, data.study_version || STUDY_VERSION
    ]]);
  }
  return json_({ok:true,join_id:joinId,run_mode:runMode});
}

function eventExists_(sheet, eventId) {
  const last = sheet.getLastRow();
  if (last < 2) return false;
  const found = sheet.getRange(2, 3, last - 1, 1)
    .createTextFinder(String(eventId))
    .matchEntireCell(true)
    .findNext();
  return !!found;
}

function handleAdminSetSurvey_(ss, data) {
  const adminPassword = PropertiesService.getScriptProperties().getProperty("ADMIN_PASSWORD") || "";
  if (!adminPassword || String(data.password || "") !== adminPassword) {
    return json_({ok:false,error:"Invalid admin password"});
  }
  let url = String(data.survey_url || "").trim();
  if (url && !/^https:\/\//i.test(url)) {
    return json_({ok:false,error:"Questionnaire URL must begin with https://"});
  }
  setSetting_(ss, "survey_url", url);
  setSetting_(ss, "survey_updated_at", new Date().toISOString());
  return json_({ok:true,survey_url:url});
}

function getSetting_(ss, key) {
  const sh = ss.getSheetByName(SETUP_SHEET);
  if (!sh) return "";
  const last = Math.max(1, sh.getLastRow());
  const values = sh.getRange(1, 4, last, 2).getDisplayValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]).trim() === key) return String(values[i][1] || "").trim();
  }
  return "";
}

function setSetting_(ss, key, value) {
  const sh = ss.getSheetByName(SETUP_SHEET);
  if (!sh) throw new Error("Setup sheet is missing");
  const last = Math.max(1, sh.getLastRow());
  const values = sh.getRange(1, 4, last, 1).getDisplayValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]).trim() === key) {
      sh.getRange(i + 1, 5).setValue(value);
      return;
    }
  }
  const row = Math.max(2, last + 1);
  sh.getRange(row, 4, 1, 2).setValues([[key, value]]);
}

function upsertParticipant_(sheet, d, now) {
  let row = 0;
  const last = sheet.getLastRow();
  if (last >= 2) {
    const found = sheet.getRange(2,1,last-1,1).createTextFinder(String(d.join_id)).matchEntireCell(true).findNext();
    if (found) row = found.getRow();
  }
  if (!row) {
    row = Math.max(2,last+1);
    sheet.getRange(row,1,1,21).setValues([[
      d.join_id||"", d.assignment_id||"", d.worker_id||"", d.hit_id||"", d.session_id||"", now, now,
      "OPENED", "", "", "", "", "", "", d.study_version||"", "", "", "", "",
      d.run_mode||"", d.recruitment_source||""
    ]]);
  } else {
    sheet.getRange(row,7).setValue(now);
    sheet.getRange(row,20,1,2).setValues([[d.run_mode||"", d.recruitment_source||""]]);
  }

  const type = String(d.event_type||"");
  if (type === "CONTINUE") {
    sheet.getRange(row,8,1,5).setValues([["SHOPPING_SUBMITTED", now, d.selected_items||"", d.selection_order||"", d.elapsed_ms||0]]);
    sheet.getRange(row,18,1,2).setValues([[Number(d.selected_count||0), Number(d.selected_total_usd||0)]]);
  } else if (type === "SURVEY_COMPLETE") {
    sheet.getRange(row,8).setValue("SURVEY_COMPLETED");
    if (d.survey_response_id) sheet.getRange(row,13).setValue(d.survey_response_id);
    sheet.getRange(row,14).setValue(now);
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
