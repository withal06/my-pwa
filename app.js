const STORAGE_KEY = "ride-care-data-v1";
const typeNames = { engine: "機油保養", gear: "齒輪油保養", fuel: "加油" };
const typeIcons = { engine: "🛢️", gear: "⚙️", fuel: "⛽" };
const importHeaders = ["機車名稱", "日期", "類型", "里程", "公升", "金額", "保養項目", "備註"];
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
let activeFilter = "all";
let editingBikeId = null;
let editingRecordId = null;
let maintenanceDraft = [];
let validImportRows = [];

const bikeList = document.querySelector("#bike-list");
const bikeContent = document.querySelector("#bike-content");
const reminderCard = document.querySelector("#reminder-card");
const recordList = document.querySelector("#record-list");
const analyticsSummary = document.querySelector("#analytics-summary");
const fuelChart = document.querySelector("#fuel-chart");
const mileageHistory = document.querySelector("#mileage-history");
const bikeDialog = document.querySelector("#bike-dialog");
const recordDialog = document.querySelector("#record-dialog");
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
  renderReminders(bike);
  renderRecords(bike);
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

function renderReminders(bike) {
  const reminders = [
    { type: "engine", title: "機油保養", interval: bike.engineInterval, intervalKm: bike.engineIntervalKm },
    { type: "gear", title: "齒輪油保養", interval: bike.gearInterval, intervalKm: bike.gearIntervalKm },
    ...bike.maintenanceItems.map((item) => ({
      type: "maintenance",
      title: item.name,
      itemId: item.id,
      intervalKm: item.intervalKm,
    })),
  ];
  reminderCard.innerHTML = reminders.map((reminder) => {
    const dateInfo = reminder.type === "maintenance"
      ? null
      : dueInfo(bike, reminder.type, reminder.interval);
    const mileageInfo = reminder.intervalKm
      ? dueMileageInfo(bike, reminder.type, reminder.itemId, reminder.intervalKm)
      : null;
    const hints = [];
    if (dateInfo) hints.push(dateInfo.hint);
    if (mileageInfo) hints.push(mileageInfo.hint);
    if (!dateInfo && !mileageInfo) hints.push("依車主手冊設定里程間隔");
    const due = Boolean(dateInfo?.due || mileageInfo?.due);
    return `<article class="reminder-item ${due ? "due" : ""}">
      <span class="reminder-label">下次${escapeHtml(reminder.title)}</span>
      ${dateInfo ? `<strong class="reminder-date">${dateInfo.date ? formatDate(dateInfo.date) : "尚無紀錄"}</strong>` : ""}
      ${mileageInfo ? `<strong class="reminder-date">${mileageInfo.target ? `${mileageInfo.target.toLocaleString("zh-TW")} 公里` : "尚無里程紀錄"}</strong>` : ""}
      <span class="reminder-hint">${escapeHtml(hints.join("・"))}</span>
    </article>`;
  }).join("");
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
  if (record.type === "maintenance") {
    return bike.maintenanceItems.find((item) => item.id === record.itemId)?.name || record.itemName || "其他保養";
  }
  return typeNames[record.type] || "其他紀錄";
}

function renderRecords(bike) {
  const records = [...bike.records]
    .filter((record) => activeFilter === "all" || record.type === activeFilter)
    .sort((a, b) => b.date.localeCompare(a.date));
  if (!records.length) {
    recordList.innerHTML = '<div class="empty-state">還沒有這類紀錄。<br>按「記一筆」新增保養或加油資料。</div>';
    return;
  }
  recordList.innerHTML = records.map((record) => {
    const detail = record.type === "fuel"
      ? [record.liters ? `${Number(record.liters).toLocaleString("zh-TW")} 公升` : "", record.cost ? `$${Number(record.cost).toLocaleString("zh-TW")}` : ""].filter(Boolean).join("・")
      : record.odometer ? `${Number(record.odometer).toLocaleString("zh-TW")} 公里` : "";
    const icon = record.type === "maintenance" ? "🔧" : typeIcons[record.type] || "📝";
    return `<article class="record-item">
      <span class="record-icon" aria-hidden="true">${icon}</span>
      <div class="record-main">
        <strong>${escapeHtml(recordTitle(bike, record))}</strong>
        <span>${formatDate(record.date)}${record.note ? `・${escapeHtml(record.note)}` : ""}</span>
      </div>
      <div class="record-trailing">
        <strong>${escapeHtml(detail || "已記錄")}</strong>
        ${record.odometer && record.type === "fuel" ? `<span>${Number(record.odometer).toLocaleString("zh-TW")} 公里</span>` : ""}
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
  const odometers = bike.records
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

  if (!odometers.length) {
    mileageHistory.innerHTML = '<div class="analysis-empty">新增含里程的保養或加油紀錄，即可查看里程變化。</div>';
    return;
  }
  mileageHistory.innerHTML = `<div class="analysis-list">${odometers.slice(-8).reverse().map((entry) => `
    <div class="analysis-row"><span>${formatDate(entry.date)}</span><span>${entry.odometer.toLocaleString("zh-TW")} 公里</span></div>
  `).join("")}</div>`;
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

function updateRecordTypeOptions(bike, record = null) {
  const select = recordForm.elements.type;
  select.innerHTML = `
    <option value="engine">機油保養</option>
    <option value="gear">齒輪油保養</option>
    <option value="fuel">加油</option>
    ${(bike.maintenanceItems || []).map((item) => `<option value="maintenance:${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join("")}
  `;
  if (record?.type === "maintenance" && !bike.maintenanceItems.some((item) => item.id === record.itemId)) {
    const option = document.createElement("option");
    option.value = `maintenance:${record.itemId}`;
    option.textContent = record.itemName || "已移除的保養項目";
    select.append(option);
  }
  select.value = record?.type === "maintenance" ? `maintenance:${record.itemId}` : record?.type || "engine";
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

function openRecordDialog(record = null) {
  const bike = selectedBike();
  if (!bike) return;
  editingRecordId = record?.id || null;
  recordForm.reset();
  document.querySelector("#record-dialog-title").textContent = record ? "編輯紀錄" : "新增紀錄";
  updateRecordTypeOptions(bike, record);
  recordForm.elements.date.value = record?.date || dateInputValue(new Date());
  recordForm.elements.odometer.value = record?.odometer || "";
  recordForm.elements.liters.value = record?.liters || "";
  recordForm.elements.cost.value = record?.cost || "";
  recordForm.elements.note.value = record?.note || "";
  updateFuelFields();
  recordDialog.showModal();
}

function updateFuelFields() {
  const isFuel = recordForm.elements.type.value === "fuel";
  document.querySelector("#fuel-fields").hidden = !isFuel;
  recordForm.elements.liters.required = isFuel;
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

function previewImport() {
  const preview = document.querySelector("#import-preview");
  const confirmButton = document.querySelector("#confirm-import");
  validImportRows = [];
  preview.classList.remove("has-errors");
  try {
    const rows = parseCsv(document.querySelector("#import-csv").value.replace(/^\uFEFF/, ""));
    if (!rows.length) throw new Error("請選擇 CSV 檔或貼上資料。");
    const headers = rows.shift().map((header) => header.trim());
    if (headers.length !== importHeaders.length || importHeaders.some((header, index) => headers[index] !== header)) {
      throw new Error(`CSV 標題欄需依序為：${importHeaders.join("、")}`);
    }
    if (!rows.length) throw new Error("CSV 內沒有可匯入的紀錄。");
    if (rows.length > 500) throw new Error("單次最多匯入 500 筆紀錄。");
    const errors = [];
    rows.forEach((columns, index) => {
      const line = index + 2;
      if (columns.length > importHeaders.length) {
        errors.push(`第 ${line} 列：欄位數超過標題欄，若內容含逗號請用雙引號括起來。`);
        return;
      }
      const values = [...columns, ...Array(Math.max(0, importHeaders.length - columns.length)).fill("")];
      const [bikeName, rawDate, typeLabel, odometerText, litersText, costText, itemName, note] = values;
      const bike = state.bikes.find((entry) => entry.name.trim().toLocaleLowerCase() === bikeName.toLocaleLowerCase());
      const date = normalizeImportDate(rawDate);
      const type = { "機油": "engine", "機油保養": "engine", "齒輪油": "gear", "齒輪油保養": "gear", "加油": "fuel", "其他保養": "maintenance", "其它項目": "maintenance" }[typeLabel];
      const odometer = odometerText ? Number(odometerText) : 0;
      const liters = litersText ? Number(litersText) : 0;
      const cost = costText ? Number(costText) : 0;
      if (!bike) errors.push(`第 ${line} 列：找不到機車「${bikeName}」。請確認名稱與車庫中的名稱相同。`);
      if (!date) errors.push(`第 ${line} 列：日期格式錯誤，請使用 YYYY-MM-DD。`);
      if (!type) errors.push(`第 ${line} 列：類型請填機油、齒輪油、加油或其它項目。`);
      if (odometerText && (!Number.isFinite(odometer) || odometer < 0)) errors.push(`第 ${line} 列：里程必須是大於或等於 0 的數字。`);
      if (type === "fuel" && (!Number.isFinite(liters) || liters <= 0)) errors.push(`第 ${line} 列：加油紀錄的公升數必須大於 0。`);
      if (litersText && (!Number.isFinite(liters) || liters < 0)) errors.push(`第 ${line} 列：公升數格式錯誤。`);
      if (costText && (!Number.isFinite(cost) || cost < 0)) errors.push(`第 ${line} 列：金額必須是大於或等於 0 的數字。`);
      let maintenanceItem = null;
      if (bike && type === "maintenance") {
        maintenanceItem = bike.maintenanceItems.find((item) => item.name.trim().toLocaleLowerCase() === itemName.toLocaleLowerCase());
        if (!maintenanceItem) errors.push(`第 ${line} 列：機車「${bike.name}」尚未設定保養項目「${itemName}」。`);
      }
      if (bike && date && type && !(type === "maintenance" && !maintenanceItem)) {
        validImportRows.push({
          bike,
          record: {
            id: makeId(),
            type,
            itemId: maintenanceItem?.id || "",
            itemName: maintenanceItem?.name || "",
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
    preview.textContent = `檢查完成：${validImportRows.length} 筆有效紀錄。確認後會一次匯入。`;
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
document.querySelector("#add-record-button").addEventListener("click", () => openRecordDialog());
document.querySelector("#record-type").addEventListener("change", updateFuelFields);
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

recordList.addEventListener("click", (event) => {
  const editButton = event.target.closest("[data-edit-record]");
  const deleteButton = event.target.closest("[data-delete-record]");
  const bike = selectedBike();
  if (!bike) return;
  if (editButton) {
    const record = bike.records.find((item) => item.id === editButton.dataset.editRecord);
    if (record) openRecordDialog(record);
    return;
  }
  if (!deleteButton) return;
  bike.records = bike.records.filter((record) => record.id !== deleteButton.dataset.deleteRecord);
  saveState();
  render();
});

document.querySelectorAll(".filter-chip").forEach((button) => {
  button.addEventListener("click", () => {
    activeFilter = button.dataset.filter;
    document.querySelectorAll(".filter-chip").forEach((chip) => chip.classList.toggle("active", chip === button));
    renderRecords(selectedBike());
  });
});

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
  const selectedType = String(formData.get("type"));
  const itemId = selectedType.startsWith("maintenance:") ? selectedType.slice("maintenance:".length) : "";
  const maintenanceItem = bike.maintenanceItems.find((item) => item.id === itemId);
  const record = {
    id: editingRecordId || makeId(),
    type: itemId ? "maintenance" : selectedType,
    itemId,
    itemName: maintenanceItem?.name || (itemId ? String(recordForm.elements.type.selectedOptions[0]?.textContent || "") : ""),
    date: String(formData.get("date")),
    odometer: Number(formData.get("odometer")) || 0,
    liters: Number(formData.get("liters")) || 0,
    cost: Number(formData.get("cost")) || 0,
    note: String(formData.get("note")).trim(),
  };
  if (!["engine", "gear", "fuel", "maintenance"].includes(record.type) || !record.date) return;
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

document.querySelector("#import-records-button").addEventListener("click", () => {
  document.querySelector("#import-csv").value = "";
  document.querySelector("#import-file").value = "";
  document.querySelector("#import-preview").textContent = "貼上或選擇 CSV 檔後，會先檢查資料。";
  document.querySelector("#import-preview").classList.remove("has-errors");
  document.querySelector("#confirm-import").disabled = true;
  validImportRows = [];
  importDialog.showModal();
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

document.querySelector("#download-csv-template").addEventListener("click", () => {
  const csv = `\uFEFF${importHeaders.join(",")}\r\n${[selectedBike()?.name || "我的機車", "2026-01-15", "加油", "12500", "5.2", "120", "", "範例紀錄"].map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")}\r\n`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "騎車日記-批次匯入範例.csv";
  link.click();
  URL.revokeObjectURL(url);
});

importForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!validImportRows.length) return;
  let added = 0;
  let duplicates = 0;
  for (const { bike, record } of validImportRows) {
    const duplicate = bike.records.some((entry) =>
      entry.type === record.type
      && entry.date === record.date
      && Number(entry.odometer || 0) === record.odometer
      && Number(entry.liters || 0) === record.liters
      && Number(entry.cost || 0) === record.cost
      && (entry.itemId || "") === record.itemId
      && (entry.note || "") === record.note);
    if (duplicate) {
      duplicates += 1;
      continue;
    }
    bike.records.push(record);
    bike.odometer = Math.max(Number(bike.odometer) || 0, Number(record.odometer) || 0);
    added += 1;
  }
  if (!saveState()) return;
  importDialog.close();
  render();
  status.textContent = `已匯入 ${added} 筆${duplicates ? `，略過 ${duplicates} 筆重複紀錄` : ""}。`;
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
