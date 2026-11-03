const STORAGE_KEY = "ride-care-data-v1";
const typeNames = { engine: "機油保養", gear: "齒輪油保養", fuel: "加油" };
const typeIcons = { engine: "🛢️", gear: "⚙️", fuel: "⛽" };
const legacyImportHeaders = ["機車名稱", "日期", "類型", "里程", "公升", "金額", "保養項目", "備註"];
const legacySectionImportHeaders = ["日期", "類型", "總里程", "加油公升", "金額", "備註"];
const importHeaders = {
  maintenance: ["日期", "總里程", "保養內容", "花費金額", "備註"],
  fuel: ["日期", "總里程", "加油量", "加油金額", "備註"],
};
const manufacturers = {
  kymco: {
    name: "KYMCO 光陽",
    url: "https://www.kymco.com.tw/manuals",
    label: "KYMCO 官方使用手冊",
    description: "依車款查找官方使用手冊",
    model: (bike) => /gp\s*125/i.test(bike.model || "") ? "https://www.kymco.com.tw/motor/gp-125-eco7" : "",
  },
  sym: {
    name: "SYM 三陽",
    url: "https://tw.sym-global.com/service",
    label: "SYM 官方服務專區",
    description: "前往 SYM 官方服務資訊與車主指南",
  },
  yamaha: {
    name: "Yamaha 山葉",
    url: "https://www.yamaha-motor.com.tw/service",
    label: "Yamaha 官方服務資訊",
    description: "查看 Yamaha 官方服務資訊",
    model: (bike) => /jog\s*125/i.test(bike.model || "") ? "https://www.yamaha-motor.com.tw/motor/motor_JOG" : "",
  },
  honda: {
    name: "Honda",
    url: "https://moto.honda-taiwan.com.tw/",
    label: "Honda 台灣機車官方網站",
    description: "由 Honda 台灣機車官方網站查找車主資訊",
  },
};
const state = loadState();
let editingBikeId = null;
let editingRecordId = null;
let editingRecordType = "maintenance";
let maintenanceDraft = [];
let validImportRows = [];
let currentImportType = "maintenance";
let currentCsvActionType = "maintenance";

const bikeList = document.querySelector("#bike-list");
const bikeContent = document.querySelector("#bike-content");
const maintenanceRecordList = document.querySelector("#maintenance-record-list");
const fuelRecordList = document.querySelector("#fuel-record-list");
const analyticsSummary = document.querySelector("#analytics-summary");
const fuelChart = document.querySelector("#fuel-chart");
const bikeDialog = document.querySelector("#bike-dialog");
const recordDialog = document.querySelector("#record-dialog");
const csvActionsDialog = document.querySelector("#csv-actions-dialog");
const importDialog = document.querySelector("#import-dialog");
const bikeForm = document.querySelector("#bike-form");
const recordForm = document.querySelector("#record-form");
const importForm = document.querySelector("#import-form");
const status = document.querySelector("#app-status");

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    const bikes = Array.isArray(saved.bikes) ? saved.bikes : [];
    const validBikes = bikes.filter((bike) => bike && typeof bike.id === "string" && typeof bike.name === "string")
      .map((bike) => ({
        ...bike,
        records: Array.isArray(bike.records)
          ? bike.records.filter((record) => record
            && typeof record.id === "string"
            && ["engine", "gear", "fuel", "maintenance"].includes(record.type)
            && typeof record.date === "string"
            && /^\d{4}-\d{2}-\d{2}$/.test(record.date))
          : [],
        maintenanceItems: Array.isArray(bike.maintenanceItems)
          ? bike.maintenanceItems.filter((item) => item
            && typeof item.id === "string"
            && typeof item.name === "string"
            && Number(item.intervalKm) > 0)
          : [],
      }));
    const selectedBikeId = validBikes.some((bike) => bike.id === saved.selectedBikeId)
      ? saved.selectedBikeId
      : validBikes[0]?.id || null;
    return {
      bikes: validBikes,
      selectedBikeId,
    };
  } catch (error) {
    console.error("無法讀取已儲存的機車資料。", error);
    return { bikes: [], selectedBikeId: null };
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    status.textContent = "";
    return true;
  } catch (error) {
    console.error("無法儲存機車資料。", error);
    status.textContent = "儲存失敗，請確認裝置儲存空間或瀏覽器設定。";
    return false;
  }
}

function selectedBike() {
  return state.bikes.find((bike) => bike.id === state.selectedBikeId) || null;
}

function makeId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}

function escapeCsvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function formatDate(value, options = { year: "numeric", month: "numeric", day: "numeric" }) {
  if (!value) return "尚無紀錄";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? "日期無效" : new Intl.DateTimeFormat("zh-TW", options).format(date);
}

function dateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function render() {
  renderBikes();
  const bike = selectedBike();
  bikeContent.hidden = !bike;
  if (!bike) return;
  renderRecords(bike, "maintenance");
  renderRecords(bike, "fuel");
  renderAnalytics(bike);
  renderOemReferences(bike);
}

function renderBikes() {
  if (!state.bikes.length) {
    bikeList.innerHTML = '<div class="empty-state">車庫還沒有機車資料。<br>新增一台機車，開始記錄保養和加油。</div>';
    return;
  }
  bikeList.innerHTML = state.bikes.map((bike) => `
    <article class="bike-card ${bike.id === state.selectedBikeId ? "selected" : ""}" data-bike-id="${escapeHtml(bike.id)}">
      <button class="bike-card-select" type="button" data-select-bike="${escapeHtml(bike.id)}" aria-pressed="${bike.id === state.selectedBikeId}">
        <span class="bike-card-name">${escapeHtml(bike.name)}</span>
        <span class="bike-card-model">${escapeHtml(bike.model || "尚未填寫車款")}</span>
        <span class="bike-card-mileage">${bike.odometer ? `${Number(bike.odometer).toLocaleString("zh-TW")} 公里` : "里程尚未設定"}</span>
      </button>
      <button class="bike-card-edit" type="button" data-edit-bike="${escapeHtml(bike.id)}" aria-label="編輯${escapeHtml(bike.name)}">✎</button>
    </article>
  `).join("");
}

function latestRecord(bike, type) {
  return bike.records
    .filter((record) => record.type === type)
    .sort((a, b) => b.date.localeCompare(a.date))[0] || null;
}

function dueInfo(bike, type, interval) {
  const last = latestRecord(bike, type);
  if (!last) return { date: null, hint: "尚無保養紀錄", due: false };
  const due = new Date(`${last.date}T00:00:00`);
  due.setDate(due.getDate() + Number(interval || (type === "engine" ? 180 : 365)));
  const dueDate = dateInputValue(due);
  const daysLeft = Math.ceil((due.getTime() - new Date(new Date().toDateString()).getTime()) / 86400000);
  const hint = daysLeft < 0 ? `已逾期 ${Math.abs(daysLeft)} 天` : daysLeft === 0 ? "今天到期" : `${daysLeft} 天後提醒`;
  return { date: dueDate, hint, due: daysLeft <= 14 };
}

function dueMileageInfo(bike, type, itemId, intervalKm) {
  const record = bike.records
    .filter((entry) => entry.type === type && (type !== "maintenance" || entry.itemId === itemId) && Number(entry.odometer) > 0)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!record) return { target: null, hint: "尚無保養里程", due: false };
  const target = Number(record.odometer) + Number(intervalKm);
  const remaining = target - Number(bike.odometer || 0);
  const hint = remaining < 0 ? `已逾期 ${Math.abs(remaining).toLocaleString("zh-TW")} 公里`
    : remaining === 0 ? "目前里程已到期"
      : `還有 ${remaining.toLocaleString("zh-TW")} 公里`;
  return { target, hint, due: remaining <= 500 };
}

function recordTitle(bike, record) {
  if (record.type === "fuel") return "加油";
  if (record.maintenanceContent) return record.maintenanceContent;
  if (record.type === "maintenance") {
    return bike.maintenanceItems.find((item) => item.id === record.itemId)?.name || record.itemName || "其它保養";
  }
  return typeNames[record.type] || "其他紀錄";
}

function maintenanceTypeForContent(content) {
  const normalized = content.toLocaleLowerCase();
  if (normalized.includes("齒輪油")) return "gear";
  if (normalized.includes("機油")) return "engine";
  return "maintenance";
}

function renderRecords(bike, type) {
  const recordList = type === "fuel" ? fuelRecordList : maintenanceRecordList;
  const records = [...bike.records]
    .filter((record) => type === "fuel" ? record.type === "fuel" : record.type !== "fuel")
    .sort((a, b) => b.date.localeCompare(a.date));
  if (!records.length) {
    recordList.innerHTML = type === "fuel"
      ? '<div class="empty-state">還沒有加油紀錄。<br>新增加油量、金額與當時里程，即可分析油耗。</div>'
      : '<div class="empty-state">還沒有保養紀錄。<br>新增保養日期、里程、內容與花費。</div>';
    return;
  }
  recordList.innerHTML = records.map((record) => {
    const detail = type === "fuel"
      ? `${Number(record.liters).toLocaleString("zh-TW")} 公升・$${Number(record.cost || 0).toLocaleString("zh-TW")}`
      : `${Number(record.odometer || 0).toLocaleString("zh-TW")} 公里・$${Number(record.cost || 0).toLocaleString("zh-TW")}`;
    const note = [record.odometer ? `${Number(record.odometer).toLocaleString("zh-TW")} 公里` : "",
      record.note || ""].filter(Boolean).join("・");
    const icon = type === "fuel" ? typeIcons.fuel : "🔧";
    return `<article class="record-item">
      <span class="record-icon" aria-hidden="true">${icon}</span>
      <div class="record-main">
        <strong>${escapeHtml(recordTitle(bike, record))}</strong>
        <span>${formatDate(record.date)}${note ? `・${escapeHtml(note)}` : ""}</span>
      </div>
      <div class="record-trailing">
        <strong>${escapeHtml(detail || "已記錄")}</strong>
        <div class="record-actions">
          <button class="record-edit" type="button" data-edit-record="${escapeHtml(record.id)}">編輯</button>
          <button class="record-delete" type="button" data-delete-record="${escapeHtml(record.id)}">刪除</button>
        </div>
      </div>
    </article>`;
  }).join("");
}

function renderAnalytics(bike) {
  const fills = bike.records
    .filter((record) => record.type === "fuel")
    .sort((a, b) => a.date.localeCompare(b.date) || Number(a.odometer) - Number(b.odometer));
  const measuredFills = fills.filter((record) => Number(record.odometer) > 0 && Number(record.liters) > 0);
  const intervals = [];
  for (let index = 1; index < measuredFills.length; index += 1) {
    const previous = measuredFills[index - 1];
    const current = measuredFills[index];
    const kilometers = Number(current.odometer) - Number(previous.odometer);
    if (kilometers <= 0) continue;
    intervals.push({
      fromDate: previous.date,
      date: current.date,
      kilometers,
      liters: Number(current.liters),
      efficiency: kilometers / Number(current.liters),
    });
  }
  const totalKilometers = intervals.reduce((total, interval) => total + interval.kilometers, 0);
  const intervalLiters = intervals.reduce((total, interval) => total + interval.liters, 0);
  const averageEfficiency = intervalLiters ? totalKilometers / intervalLiters : 0;
  const totalFuel = fills.reduce((total, record) => total + (Number(record.liters) || 0), 0);
  const totalCost = fills.reduce((total, record) => total + (Number(record.cost) || 0), 0);
  const odometers = fills
    .filter((record) => Number(record.odometer) > 0)
    .map((record) => ({ date: record.date, odometer: Number(record.odometer) }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const firstOdometer = odometers[0]?.odometer;
  const lastOdometer = odometers[odometers.length - 1]?.odometer;
  const recordedDistance = odometers.length > 1 && lastOdometer >= firstOdometer ? lastOdometer - firstOdometer : null;

  analyticsSummary.innerHTML = [
    { label: "平均油耗", value: averageEfficiency ? `${averageEfficiency.toFixed(1)} km/L` : "資料不足" },
    { label: "加油累計", value: `${totalFuel.toFixed(1)} 公升` },
    { label: "加油總金額", value: `$${Math.round(totalCost).toLocaleString("zh-TW")}` },
    { label: "里程累計", value: recordedDistance === null ? "資料不足" : `${recordedDistance.toLocaleString("zh-TW")} 公里` },
  ].map((stat) => `<article class="analytics-stat"><span>${stat.label}</span><strong>${stat.value}</strong></article>`).join("");

  if (!intervals.length) {
    fuelChart.innerHTML = '<div class="analysis-empty">至少需要兩筆包含里程與公升數的加油紀錄，才能估算油耗。</div>';
  } else {
    const chartIntervals = intervals.slice(-8);
    const maximum = Math.max(...chartIntervals.map((interval) => interval.efficiency));
    fuelChart.innerHTML = `<div class="fuel-chart" role="img" aria-label="每次加油區間的估算油耗長條圖">${chartIntervals.map((interval) => {
      const height = Math.max(8, interval.efficiency / maximum * 100);
      return `<div class="fuel-bar-item" title="${formatDate(interval.date)}：${interval.efficiency.toFixed(1)} 公里／公升">
        <span class="fuel-bar-value">${interval.efficiency.toFixed(1)}</span>
        <span class="fuel-bar-track"><span class="fuel-bar" style="height:${height}%"></span></span>
        <span class="fuel-bar-label">${formatDate(interval.date, { month: "numeric", day: "numeric" })}</span>
      </div>`;
    }).join("")}</div>`;
  }

}

function renderOemReferences(bike) {
  const manufacturer = manufacturers[bike.manufacturer];
  const bikeDetails = [manufacturer?.name, bike.model, bike.modelYear ? `${bike.modelYear} 年式` : ""]
    .filter(Boolean)
    .join("・");
  document.querySelector("#oem-bike-title").textContent = bikeDetails || `${bike.name}｜請補充車廠與車款`;

  const schedules = [
    { name: "機油保養", mileage: bike.engineIntervalKm, days: bike.engineInterval },
    { name: "齒輪油保養", mileage: bike.gearIntervalKm, days: bike.gearInterval },
    ...bike.maintenanceItems.map((item) => ({ name: item.name, mileage: item.intervalKm })),
  ];
  document.querySelector("#oem-schedule").innerHTML = `<div class="oem-schedule-list">${schedules.map((item) => {
    const values = [
      item.mileage ? `每 ${Number(item.mileage).toLocaleString("zh-TW")} 公里` : "",
      item.days ? `每 ${Number(item.days).toLocaleString("zh-TW")} 天` : "",
    ].filter(Boolean);
    return `<div class="oem-schedule-row"><span>${escapeHtml(item.name)}</span><span>${values.join("・") || "尚未設定里程"}</span></div>`;
  }).join("")}</div>`;

  const links = (manufacturer
    ? [[bike.manufacturer, manufacturer]]
    : Object.entries(manufacturers)).flatMap(([key, source]) => [
    ...(source.model?.(bike) ? [[`${key}-model`, {
      label: `${bike.model}｜官方車款資訊`,
      description: "此連結是車款介紹；保養里程仍請核對該年份使用手冊",
      url: source.model(bike),
    }]] : []),
    [key, source],
  ]);
  document.querySelector("#oem-links").innerHTML = links.map(([key, source]) => `
    <a class="oem-link-card ${key === bike.manufacturer ? "current" : ""}" href="${source.url}" target="_blank" rel="noopener noreferrer">
      <span><strong>${source.label}</strong><small>${source.description}</small></span>
      <span class="oem-link-arrow" aria-hidden="true">↗</span>
    </a>
  `).join("");
}

function renderMaintenanceDraft() {
  const container = document.querySelector("#maintenance-item-fields");
  container.innerHTML = maintenanceDraft.map((item, index) => `
    <div class="maintenance-row" data-maintenance-index="${index}">
      <label>項目名稱<input type="text" data-maintenance-name="${index}" maxlength="30" value="${escapeHtml(item.name)}" placeholder="例如：空氣濾芯" required></label>
      <label>間隔（公里）<input type="number" data-maintenance-interval="${index}" min="1" step="1" value="${escapeHtml(item.intervalKm)}" placeholder="例如：6000" required></label>
      <button class="remove-item-button" type="button" data-remove-maintenance="${index}" aria-label="移除保養項目">×</button>
    </div>
  `).join("");
}

function openBikeDialog(bike = null) {
  editingBikeId = bike?.id || null;
  bikeForm.reset();
  document.querySelector("#bike-dialog-title").textContent = bike ? "編輯機車" : "新增機車";
  bikeForm.elements.name.value = bike?.name || "";
  bikeForm.elements.manufacturer.value = bike?.manufacturer || "";
  bikeForm.elements.model.value = bike?.model || "";
  bikeForm.elements.modelYear.value = bike?.modelYear || "";
  bikeForm.elements.odometer.value = bike?.odometer || "";
  bikeForm.elements.engineInterval.value = bike?.engineInterval || 180;
  bikeForm.elements.gearInterval.value = bike?.gearInterval || 365;
  bikeForm.elements.engineIntervalKm.value = bike?.engineIntervalKm || "";
  bikeForm.elements.gearIntervalKm.value = bike?.gearIntervalKm || "";
  document.querySelector("#maintenance-error").hidden = true;
  document.querySelector("#maintenance-error").textContent = "";
  maintenanceDraft = (bike?.maintenanceItems || []).map((item) => ({ ...item }));
  renderMaintenanceDraft();
  bikeDialog.showModal();
  bikeForm.elements.name.focus();
}

function openRecordDialog(record = null, type = "maintenance") {
  const bike = selectedBike();
  if (!bike) return;
  editingRecordId = record?.id || null;
  editingRecordType = record?.type === "fuel" ? "fuel" : type;
  recordForm.reset();
  document.querySelector("#record-dialog-title").textContent = record
    ? editingRecordType === "fuel" ? "編輯加油紀錄" : "編輯保養紀錄"
    : editingRecordType === "fuel" ? "新增加油紀錄" : "新增保養紀錄";
  recordForm.elements.date.value = record?.date || dateInputValue(new Date());
  recordForm.elements.odometer.value = record?.odometer || "";
  recordForm.elements.liters.value = record?.liters || "";
  recordForm.elements.maintenanceContent.value = record?.maintenanceContent || (record && record.type !== "fuel" ? recordTitle(bike, record) : "");
  recordForm.elements.maintenanceCost.value = editingRecordType === "maintenance" ? record?.cost ?? "" : "";
  recordForm.elements.fuelCost.value = editingRecordType === "fuel" ? record?.cost ?? "" : "";
  recordForm.elements.note.value = record?.note || "";
  updateRecordFields();
  recordDialog.showModal();
}

function updateRecordFields() {
  const isFuel = editingRecordType === "fuel";
  const maintenanceFields = document.querySelector("#maintenance-fields");
  const fuelFields = document.querySelector("#fuel-fields");
  maintenanceFields.hidden = isFuel;
  fuelFields.hidden = !isFuel;
  for (const field of maintenanceFields.querySelectorAll("input")) {
    field.disabled = isFuel;
  }
  for (const field of fuelFields.querySelectorAll("input")) {
    field.disabled = !isFuel;
    field.required = isFuel;
  }
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
    } else if (character === '"' && !cell) {
      quoted = true;
    } else if (character === ",") {
      row.push(cell.trim());
      cell = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  if (quoted) throw new Error("CSV 有未結束的雙引號，請修正檔案格式。");
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function normalizeImportDate(value) {
  const match = value.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  if (date.getFullYear() !== Number(year) || date.getMonth() !== Number(month) - 1 || date.getDate() !== Number(day)) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseSectionImport(rows, type) {
  const dataRows = [];
  const errors = [];
  let bikeName = "";
  let sectionFormat = "";
  let expectsHeaders = false;
  rows.forEach((columns, index) => {
    const line = index + 1;
    if (columns.length === 1) {
      bikeName = columns[0];
      sectionFormat = "";
      expectsHeaders = true;
      return;
    }
    if (columns.length === importHeaders[type].length
      && importHeaders[type].every((header, headerIndex) => columns[headerIndex] === header)) {
      if (!bikeName) errors.push(`第 ${line} 列：標題欄前請先填寫機車名稱。`);
      sectionFormat = type;
      expectsHeaders = false;
      return;
    }
    if (columns.length === legacySectionImportHeaders.length
      && legacySectionImportHeaders.every((header, headerIndex) => columns[headerIndex] === header)) {
      if (!bikeName) errors.push(`第 ${line} 列：標題欄前請先填寫機車名稱。`);
      sectionFormat = "legacy";
      expectsHeaders = false;
      return;
    }
    if (expectsHeaders) {
      errors.push(`第 ${line} 列：機車名稱「${bikeName}」後的標題欄不符合${type === "fuel" ? "加油" : "保養"} CSV 格式。`);
      expectsHeaders = false;
      return;
    }
    if (!bikeName || !sectionFormat) {
      errors.push(`第 ${line} 列：請先填寫機車名稱，再加入標題欄與紀錄。`);
      return;
    }
    if (sectionFormat === "legacy") {
      if (columns.length > legacySectionImportHeaders.length) {
        errors.push(`第 ${line} 列：欄位數超過舊格式標題欄。`);
        return;
      }
      dataRows.push({ columns: [bikeName, ...columns.slice(0, 5), "", columns[5] || ""], line });
      return;
    }
    if (columns.length > importHeaders[type].length) {
      errors.push(`第 ${line} 列：欄位數超過標題欄，若內容含逗號請用雙引號括起來。`);
      return;
    }
    const values = [...columns, ...Array(importHeaders[type].length - columns.length).fill("")];
    const [date, odometer, contentOrLiters, cost, note] = values;
    dataRows.push({
      columns: type === "fuel"
        ? [bikeName, date, "加油", odometer, contentOrLiters, cost, "", note]
        : [bikeName, date, "其它項目", odometer, "", cost, contentOrLiters, note],
      line,
    });
  });
  if (expectsHeaders) errors.push(`機車名稱「${bikeName}」後缺少 CSV 標題欄。`);
  if (errors.length) throw new Error(errors.join("\n"));
  return dataRows;
}

function previewImport() {
  const preview = document.querySelector("#import-preview");
  const confirmButton = document.querySelector("#confirm-import");
  validImportRows = [];
  preview.classList.remove("has-errors");
  try {
    const rows = parseCsv(document.querySelector("#import-csv").value.replace(/^\uFEFF/, ""));
    if (!rows.length) throw new Error("請選擇 CSV 檔或貼上資料。");
    const firstRow = rows[0].map((header) => header.trim());
    let dataRows;
    if (firstRow.length === legacyImportHeaders.length
      && legacyImportHeaders.every((header, index) => firstRow[index] === header)) {
      dataRows = rows.slice(1).map((columns, index) => ({ columns, line: index + 2 }));
    } else {
      dataRows = parseSectionImport(rows, currentImportType);
    }
    if (!dataRows.length) throw new Error("CSV 內沒有可匯入的紀錄。");
    if (dataRows.length > 500) throw new Error("單次最多匯入 500 筆紀錄。");
    const errors = [];
    dataRows.forEach(({ columns, line }) => {
      if (columns.length > legacyImportHeaders.length) {
        errors.push(`第 ${line} 列：欄位數超過標題欄，若內容含逗號請用雙引號括起來。`);
        return;
      }
      const values = [...columns, ...Array(Math.max(0, legacyImportHeaders.length - columns.length)).fill("")];
      const [bikeName, rawDate, typeLabel, odometerText, litersText, costText, itemName, note] = values;
      const bike = state.bikes.find((entry) => entry.name.trim().toLocaleLowerCase() === bikeName.toLocaleLowerCase());
      const date = normalizeImportDate(rawDate);
      const type = {
        "機油": "engine", "機油保養": "engine", "齒輪油": "gear", "齒輪油保養": "gear",
        "加油": "fuel", "其他保養": "maintenance", "其它項目": "maintenance",
      }[typeLabel];
      const odometer = odometerText ? Number(odometerText) : 0;
      const liters = litersText ? Number(litersText) : 0;
      const cost = costText ? Number(costText) : 0;
      if (!bike) errors.push(`第 ${line} 列：找不到機車「${bikeName}」。請確認名稱與車庫中的名稱相同。`);
      if (!date) errors.push(`第 ${line} 列：日期格式錯誤，請使用 YYYY-MM-DD。`);
      if (!type) errors.push(`第 ${line} 列：類型請填機油、齒輪油、加油或其它項目。`);
      if (type && (currentImportType === "fuel") !== (type === "fuel")) {
        errors.push(`第 ${line} 列：這是${type === "fuel" ? "加油" : "保養"}紀錄，請使用對應的 CSV 匯入頁面。`);
      }
      if (!odometerText || !Number.isFinite(odometer) || odometer < 0) errors.push(`第 ${line} 列：總里程必須是大於或等於 0 的數字。`);
      if (type === "fuel" && (!Number.isFinite(liters) || liters <= 0)) errors.push(`第 ${line} 列：加油紀錄的公升數必須大於 0。`);
      if (litersText && (!Number.isFinite(liters) || liters < 0)) errors.push(`第 ${line} 列：公升數格式錯誤。`);
      if (!costText || !Number.isFinite(cost) || cost < 0) errors.push(`第 ${line} 列：金額必須是大於或等於 0 的數字。`);
      if (type === "maintenance" && !itemName) errors.push(`第 ${line} 列：請填寫保養內容。`);
      let maintenanceItem = null;
      if (bike && type === "maintenance" && itemName) {
        maintenanceItem = bike.maintenanceItems.find((item) => item.name.trim().toLocaleLowerCase() === itemName.toLocaleLowerCase());
      }
      if (bike && date && type && itemName !== undefined && odometerText && costText) {
        validImportRows.push({
          bike,
          record: {
            id: makeId(),
            type: type === "maintenance" && maintenanceItem ? "maintenance"
              : type === "maintenance" ? maintenanceTypeForContent(itemName) : type,
            itemId: maintenanceItem?.id || "",
            itemName: maintenanceItem?.name || "",
            maintenanceContent: ["maintenance", "engine", "gear"].includes(type) ? itemName : "",
            date,
            odometer,
            liters,
            cost,
            note,
          },
        });
      }
    });
    if (errors.length) {
      preview.classList.add("has-errors");
      preview.textContent = `檢查到 ${errors.length} 個問題，請修正後再匯入：\n${errors.slice(0, 8).join("\n")}${errors.length > 8 ? `\n另有 ${errors.length - 8} 個問題` : ""}`;
      confirmButton.disabled = true;
      return;
    }
    const replacementSummary = [...new Set(validImportRows.map(({ bike }) => bike))].map((bike) => {
      const oldCount = bike.records.filter((record) => currentImportType === "fuel"
        ? record.type === "fuel"
        : record.type !== "fuel").length;
      const recordTypeName = currentImportType === "fuel" ? "加油" : "保養";
      return `${bike.name}（原有 ${oldCount} 筆${recordTypeName}紀錄）`;
    }).join("、");
    const recordTypeName = currentImportType === "fuel" ? "加油" : "保養";
    const preservedTypeName = currentImportType === "fuel" ? "保養" : "加油";
    preview.textContent = `檢查完成：${validImportRows.length} 筆有效紀錄。\n按下匯入後，將取代以下機車的舊${recordTypeName}紀錄（${preservedTypeName}紀錄會保留）：${replacementSummary}。`;
    confirmButton.disabled = false;
  } catch (error) {
    preview.classList.add("has-errors");
    preview.textContent = error.message;
    confirmButton.disabled = true;
  }
}

function checkDueNotifications() {
  if (!window.isSecureContext || !("Notification" in window) || Notification.permission !== "granted") return;
  for (const bike of state.bikes) {
    const reminders = [
      { type: "engine", title: typeNames.engine, interval: bike.engineInterval, intervalKm: bike.engineIntervalKm },
      { type: "gear", title: typeNames.gear, interval: bike.gearInterval, intervalKm: bike.gearIntervalKm },
      ...bike.maintenanceItems.map((item) => ({
        type: "maintenance",
        title: item.name,
        itemId: item.id,
        intervalKm: item.intervalKm,
      })),
    ];
    for (const reminder of reminders) {
      const dateInfo = reminder.type === "maintenance" ? null : dueInfo(bike, reminder.type, reminder.interval);
      const mileageInfo = reminder.intervalKm
        ? dueMileageInfo(bike, reminder.type, reminder.itemId, reminder.intervalKm)
        : null;
      if (dateInfo?.due || mileageInfo?.due) {
        const key = `notified:${bike.id}:${reminder.type}:${reminder.itemId || ""}:${dateInfo?.date || ""}:${mileageInfo?.target || ""}`;
        if (localStorage.getItem(key)) continue;
        const reasons = [dateInfo?.due && dateInfo.date ? `${formatDate(dateInfo.date)} ${dateInfo.hint}` : "",
          mileageInfo?.due ? `${mileageInfo.target.toLocaleString("zh-TW")} 公里 ${mileageInfo.hint}` : ""].filter(Boolean);
        const notification = new Notification(`${bike.name}｜${reminder.title}`, {
          body: reasons.join("；"),
          icon: "icon.svg",
          tag: key,
        });
        notification.onclick = () => window.focus();
        localStorage.setItem(key, "sent");
      }
    }
  }
}

document.querySelector("#add-bike-button").addEventListener("click", () => openBikeDialog());
document.querySelector("#add-maintenance-button").addEventListener("click", () => openRecordDialog(null, "maintenance"));
document.querySelector("#add-fuel-button").addEventListener("click", () => openRecordDialog(null, "fuel"));
document.querySelector("#add-maintenance-item").addEventListener("click", () => {
  maintenanceDraft.push({ id: makeId(), name: "", intervalKm: "" });
  renderMaintenanceDraft();
});

document.querySelector("#edit-bike-schedule").addEventListener("click", () => {
  const bike = selectedBike();
  if (bike) openBikeDialog(bike);
});

document.querySelector("#maintenance-item-fields").addEventListener("input", (event) => {
  document.querySelector("#maintenance-error").hidden = true;
  const nameIndex = event.target.dataset.maintenanceName;
  const intervalIndex = event.target.dataset.maintenanceInterval;
  if (nameIndex !== undefined) maintenanceDraft[Number(nameIndex)].name = event.target.value;
  if (intervalIndex !== undefined) maintenanceDraft[Number(intervalIndex)].intervalKm = event.target.value;
});

document.querySelector("#maintenance-item-fields").addEventListener("click", (event) => {
  const removeButton = event.target.closest("[data-remove-maintenance]");
  if (!removeButton) return;
  maintenanceDraft.splice(Number(removeButton.dataset.removeMaintenance), 1);
  renderMaintenanceDraft();
});

document.querySelectorAll(".bike-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".bike-tab").forEach((button) => {
      const active = button === tab;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    document.querySelectorAll(".bike-page").forEach((page) => {
      page.hidden = page.id !== tab.dataset.page;
    });
  });
});

bikeList.addEventListener("click", (event) => {
  const selectButton = event.target.closest("[data-select-bike]");
  const editButton = event.target.closest("[data-edit-bike]");
  if (editButton) {
    const bike = state.bikes.find((item) => item.id === editButton.dataset.editBike);
    if (bike) openBikeDialog(bike);
  } else if (selectButton) {
    state.selectedBikeId = selectButton.dataset.selectBike;
    saveState();
    render();
  }
});

function handleRecordListClick(event) {
  const editButton = event.target.closest("[data-edit-record]");
  const deleteButton = event.target.closest("[data-delete-record]");
  const bike = selectedBike();
  if (!bike) return;
  if (editButton) {
    const record = bike.records.find((item) => item.id === editButton.dataset.editRecord);
    if (record) openRecordDialog(record, record.type === "fuel" ? "fuel" : "maintenance");
    return;
  }
  if (!deleteButton) return;
  bike.records = bike.records.filter((record) => record.id !== deleteButton.dataset.deleteRecord);
  saveState();
  render();
}

maintenanceRecordList.addEventListener("click", handleRecordListClick);
fuelRecordList.addEventListener("click", handleRecordListClick);

bikeForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(bikeForm);
  const maintenanceNames = [...document.querySelectorAll("#maintenance-item-fields [data-maintenance-name]")]
    .map((input) => input.value.trim().toLocaleLowerCase());
  if (new Set(maintenanceNames).size !== maintenanceNames.length) {
    const error = document.querySelector("#maintenance-error");
    error.textContent = "保養項目名稱不可重複，請修改後再儲存。";
    error.hidden = false;
    return;
  }
  document.querySelector("#maintenance-error").hidden = true;
  const bike = editingBikeId
    ? state.bikes.find((item) => item.id === editingBikeId)
    : { id: makeId(), records: [] };
  if (!bike) return;
  bike.name = String(formData.get("name")).trim();
  bike.manufacturer = String(formData.get("manufacturer") || "");
  bike.model = String(formData.get("model")).trim();
  bike.modelYear = Number(formData.get("modelYear")) || "";
  bike.odometer = Number(formData.get("odometer")) || 0;
  bike.engineInterval = Math.max(1, Number(formData.get("engineInterval")) || 180);
  bike.gearInterval = Math.max(1, Number(formData.get("gearInterval")) || 365);
  bike.engineIntervalKm = Number(formData.get("engineIntervalKm")) || 0;
  bike.gearIntervalKm = Number(formData.get("gearIntervalKm")) || 0;
  const existingItems = bike.maintenanceItems || [];
  bike.maintenanceItems = [...document.querySelectorAll("#maintenance-item-fields .maintenance-row")].map((row, index) => {
    const name = row.querySelector("[data-maintenance-name]").value.trim();
    const intervalKm = Number(row.querySelector("[data-maintenance-interval]").value);
    const previous = existingItems.find((item) => item.id === maintenanceDraft[index].id)
      || existingItems.find((item) => item.name.toLocaleLowerCase() === name.toLocaleLowerCase());
    return { id: previous?.id || maintenanceDraft[index].id || makeId(), name, intervalKm };
  });
  if (!editingBikeId) {
    state.bikes.push(bike);
    state.selectedBikeId = bike.id;
  }
  saveState();
  bikeDialog.close();
  render();
});

recordForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const bike = selectedBike();
  if (!bike) return;
  const formData = new FormData(recordForm);
  const maintenanceContent = String(formData.get("maintenanceContent") || "").trim();
  const normalizedContent = maintenanceContent.toLocaleLowerCase();
  const maintenanceItem = bike.maintenanceItems.find((item) => item.name.trim().toLocaleLowerCase() === normalizedContent);
  const maintenanceType = maintenanceItem ? "maintenance" : maintenanceTypeForContent(maintenanceContent);
  const record = {
    id: editingRecordId || makeId(),
    type: editingRecordType === "fuel" ? "fuel" : maintenanceType,
    itemId: maintenanceItem?.id || "",
    itemName: maintenanceItem?.name || "",
    maintenanceContent: editingRecordType === "fuel" ? "" : maintenanceContent,
    date: String(formData.get("date")),
    odometer: Number(formData.get("odometer")) || 0,
    liters: Number(formData.get("liters")) || 0,
    cost: Number(formData.get(editingRecordType === "fuel" ? "fuelCost" : "maintenanceCost")) || 0,
    note: String(formData.get("note")).trim(),
  };
  if (!["engine", "gear", "fuel", "maintenance"].includes(record.type) || !record.date
    || !Number.isFinite(record.odometer) || record.odometer < 0
    || (record.type === "fuel" && (record.liters <= 0 || !Number.isFinite(record.liters)))
    || (record.type !== "fuel" && !maintenanceContent)) return;
  if (editingRecordId) {
    const recordIndex = bike.records.findIndex((item) => item.id === editingRecordId);
    if (recordIndex === -1) return;
    bike.records[recordIndex] = record;
  } else {
    bike.records.push(record);
  }
  bike.odometer = Math.max(Number(bike.odometer) || 0, ...bike.records.map((entry) => Number(entry.odometer) || 0));
  saveState();
  recordDialog.close();
  render();
});

function openImportDialog(type) {
  currentImportType = type;
  document.querySelector("#import-csv").value = "";
  document.querySelector("#import-file").value = "";
  document.querySelector("#import-dialog-title").textContent = type === "fuel" ? "匯入加油紀錄" : "匯入保養紀錄";
  const recordTypeName = type === "fuel" ? "加油" : "保養";
  const preservedTypeName = type === "fuel" ? "保養" : "加油";
  document.querySelector("#import-help").textContent = `每台機車先填名稱，下一列填「${importHeaders[type].join("、")}」標題，再逐列填寫資料。日期使用 YYYY-MM-DD。確認匯入後，會取代 CSV 所列機車的舊${recordTypeName}紀錄，${preservedTypeName}紀錄會保留。`;
  document.querySelector("#import-csv").placeholder = `我的小白\n${importHeaders[type].join(",")}`;
  document.querySelector("#import-preview").textContent = "貼上或選擇 CSV 檔後，會先檢查資料。";
  document.querySelector("#import-preview").classList.remove("has-errors");
  document.querySelector("#confirm-import").disabled = true;
  validImportRows = [];
  importDialog.showModal();
}

function openCsvActionsDialog(type) {
  currentCsvActionType = type;
  document.querySelector("#csv-actions-title").textContent = `${type === "fuel" ? "加油" : "保養"} CSV`;
  csvActionsDialog.showModal();
}

document.querySelector("#maintenance-csv-button").addEventListener("click", () => openCsvActionsDialog("maintenance"));
document.querySelector("#fuel-csv-button").addEventListener("click", () => openCsvActionsDialog("fuel"));
document.querySelector("#csv-actions-cancel").addEventListener("click", () => csvActionsDialog.close());
document.querySelector("#csv-actions-import").addEventListener("click", () => {
  csvActionsDialog.close();
  openImportDialog(currentCsvActionType);
});
document.querySelector("#csv-actions-export").addEventListener("click", () => {
  csvActionsDialog.close();
  downloadCsvExport(currentCsvActionType);
});
document.querySelector("#csv-actions-template").addEventListener("click", () => {
  csvActionsDialog.close();
  downloadCsvTemplate(currentCsvActionType);
});

document.querySelector("#import-csv").addEventListener("input", previewImport);
document.querySelector("#import-file").addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file) return;
  try {
    document.querySelector("#import-csv").value = await file.text();
    previewImport();
  } catch (error) {
    console.error("無法讀取 CSV 檔案。", error);
    const preview = document.querySelector("#import-preview");
    preview.classList.add("has-errors");
    preview.textContent = "無法讀取這個檔案，請確認檔案格式後重試。";
  }
});

function downloadCsvTemplate(type) {
  const bike = selectedBike();
  if (!bike) {
    status.textContent = "請先選擇機車，再下載 CSV 範例。";
    return;
  }
  const example = type === "fuel"
    ? ["2026-10-15", "12500", "5.2", "120", "範例加油紀錄"]
    : ["2026-10-15", "12500", "更換機油", "350", "範例保養紀錄"];
  const csv = `\uFEFF${[
    escapeCsvCell(bike.name),
    importHeaders[type].join(","),
    example.map(escapeCsvCell).join(","),
  ].join("\r\n")}\r\n`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = csvFileName(bike, type);
  link.click();
  URL.revokeObjectURL(url);
}

function csvFileName(bike, type) {
  const safeBikeName = bike.name.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").trim() || "機車";
  return `${safeBikeName}_${type === "fuel" ? "加油記錄" : "保養記錄"}.csv`;
}

function downloadCsvExport(type) {
  const bike = selectedBike();
  if (!bike) {
    status.textContent = "請先選擇機車，再匯出 CSV 紀錄。";
    return;
  }
  const records = bike.records
    .filter((record) => type === "fuel" ? record.type === "fuel" : record.type !== "fuel")
    .sort((a, b) => a.date.localeCompare(b.date) || Number(a.odometer) - Number(b.odometer));
  const rows = [
    escapeCsvCell(bike.name),
    importHeaders[type].join(","),
    ...records.map((record) => {
      const values = type === "fuel"
        ? [record.date, record.odometer, record.liters, record.cost, record.note]
        : [
          record.date,
          record.odometer,
          record.maintenanceContent || record.itemName
            || bike.maintenanceItems.find((item) => item.id === record.itemId)?.name
            || typeNames[record.type]
            || "其他保養",
          record.cost,
          record.note,
        ];
      return values.map(escapeCsvCell).join(",");
    }),
  ];
  const csv = `\uFEFF${rows.join("\r\n")}\r\n`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = csvFileName(bike, type);
  link.click();
  URL.revokeObjectURL(url);
  status.textContent = `已匯出 ${records.length} 筆${type === "fuel" ? "加油" : "保養"}紀錄。`;
}

importForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!validImportRows.length) return;
  let added = 0;
  let duplicates = 0;
  let removed = 0;
  const affectedBikes = [...new Set(validImportRows.map(({ bike }) => bike))];
  const previousData = affectedBikes.map((bike) => ({
    bike,
    records: bike.records,
    odometer: bike.odometer,
  }));
  for (const bike of affectedBikes) {
    const previousCount = bike.records.length;
    bike.records = bike.records.filter((record) => currentImportType === "fuel"
      ? record.type !== "fuel"
      : record.type === "fuel");
    removed += previousCount - bike.records.length;
  }
  for (const { bike, record } of validImportRows) {
    const duplicate = bike.records.some((entry) =>
      entry.type === record.type
      && entry.date === record.date
      && Number(entry.odometer || 0) === record.odometer
      && Number(entry.liters || 0) === record.liters
      && Number(entry.cost || 0) === record.cost
      && (entry.itemId || "") === record.itemId
      && (entry.maintenanceContent || "") === (record.maintenanceContent || "")
      && (entry.note || "") === record.note);
    if (duplicate) {
      duplicates += 1;
      continue;
    }
    bike.records.push(record);
    bike.odometer = Math.max(Number(bike.odometer) || 0, Number(record.odometer) || 0);
    added += 1;
  }
  if (!saveState()) {
    for (const { bike, records, odometer } of previousData) {
      bike.records = records;
      bike.odometer = odometer;
    }
    return;
  }
  importDialog.close();
  render();
  const recordTypeName = currentImportType === "fuel" ? "加油" : "保養";
  status.textContent = `已匯入 ${added} 筆，取代 ${removed} 筆舊${recordTypeName}紀錄${duplicates ? `，略過 ${duplicates} 筆重複紀錄` : ""}。`;
});

document.querySelectorAll("[data-close]").forEach((button) => {
  button.addEventListener("click", () => document.getElementById(button.dataset.close).close());
});

document.querySelector("#reminder-button").addEventListener("click", async () => {
  if (!("Notification" in window)) {
    status.textContent = "此瀏覽器不支援通知；下次保養日期仍會顯示在首頁。";
    return;
  }
  if (!window.isSecureContext) {
    status.textContent = "通知功能需使用 HTTPS 網址，或從已安裝的主畫面 App 開啟。";
    return;
  }
  if (Notification.permission === "denied") {
    status.textContent = "通知權限已關閉，請到 iPhone「設定」中允許此 App 發送通知。";
    return;
  }
  const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  status.textContent = permission === "granted" ? "保養提醒已開啟（開啟 App 時檢查到期項目）。" : "尚未允許通知；下次保養日期仍會顯示在首頁。";
  if (permission === "granted") checkDueNotifications();
});

document.querySelectorAll(".modal").forEach((dialog) => {
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
});

window.addEventListener("focus", checkDueNotifications);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) checkDueNotifications();
});

if ("serviceWorker" in navigator && window.isSecureContext) {
  navigator.serviceWorker.register("./sw.js").catch((error) => {
    console.error("無法啟用離線功能。", error);
    status.textContent = "離線快取啟用失敗；請確認網站使用 HTTPS。";
  });
}

render();
checkDueNotifications();
