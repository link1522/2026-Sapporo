const STORAGE_KEY = "private-itinerary-passphrase";
const unlock = document.querySelector("#unlock");
const form = document.querySelector("#unlock-form");
const field = document.querySelector("#passphrase");
const message = document.querySelector("#unlock-message");
const app = document.querySelector("#app");

let trip = null;
let selectedDate = null;
let expandedEvent = -1;
let serviceRegistration = null;
let updateRequested = false;
let statusTimeout = null;
let lastRenderedJstKey = "";

function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = String(content);
  return node;
}
function append(parent, ...children) {
  parent.append(...children.filter(Boolean));
  return parent;
}
function icon(name) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg","svg");
  svg.setAttribute("viewBox","0 0 24 24");
  svg.setAttribute("fill","none");
  svg.setAttribute("stroke","currentColor");
  svg.setAttribute("stroke-width","1.8");
  svg.setAttribute("stroke-linecap","round");
  svg.setAttribute("stroke-linejoin","round");
  svg.setAttribute("aria-hidden","true");
  svg.classList.add("ui-icon");
  const paths = {
    chevron:["m6 9 6 6 6-6"],
    external:["M7 17 17 7","M8 7h9v9"],
    walk:["M12 4a1 1 0 1 0 0 .01","m10 21 2-5 2-3","m8 13 4-3 3 2 2 1","m12 10-2 5-3 2","m13 16 3 5"],
    transport:["M5 17V7c0-1.7 1.4-3 3-3h8c1.6 0 3 1.3 3 3v10H5Z","M5 12h14","M8 8h2","M14 8h2","M8 17v2","M16 17v2"]
  };
  for (const d of paths[name] || []) {
    const path = document.createElementNS("http://www.w3.org/2000/svg","path");
    path.setAttribute("d",d);
    svg.append(path);
  }
  return svg;
}
function japaneseNow() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone:"Asia/Tokyo",year:"numeric",month:"2-digit",day:"2-digit",
    hour:"2-digit",minute:"2-digit",hourCycle:"h23"
  }).formatToParts(new Date());
  const value = type => parts.find(part => part.type === type)?.value;
  return {date:`${value("year")}-${value("month")}-${value("day")}`,
    time:`${value("hour")}:${value("minute")}`};
}
function safeUrl(raw) {
  if (typeof raw !== "string") return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}
function link(raw, label) {
  const url = safeUrl(raw);
  if (!url) return null;
  const anchor = element("a","text-link",label);
  append(anchor,icon("external"));
  anchor.href = url;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  anchor.addEventListener("click", event => {
    if (!navigator.onLine) {
      event.preventDefault();
      showStatus("外部連結需要網路連線。",true);
    }
  });
  return anchor;
}
function showStatus(value,alert=false) {
  const status = document.querySelector("#app-status");
  if (!status) return;
  clearTimeout(statusTimeout);
  status.textContent = value;
  status.classList.toggle("status-alert",alert);
  if (alert) statusTimeout = setTimeout(() => status.classList.remove("status-alert"),5000);
}
function decodeBase64(value) {
  if (typeof value !== "string" || value.length > 3_000_000) throw new Error("Invalid encrypted data");
  return Uint8Array.from(atob(value), char => char.charCodeAt(0));
}
function validateTrip(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.days) ||
      value.days.length < 1 || value.days.length > 10 ||
      value.days.some(day => typeof day.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(day.date) ||
        !Array.isArray(day.events) || day.events.length > 100 ||
        day.events.some(event => typeof event.title !== "string" ||
          !/^\d{2}:\d{2}$/.test(event.start) || !/^\d{2}:\d{2}$/.test(event.end)))) {
    throw new Error("Invalid itinerary");
  }
  if (value.days.some((day,index) =>
    index > 0 && value.days[index-1].date >= day.date ||
    day.events.some((event,eventIndex) =>
      event.start > event.end ||
      eventIndex > 0 && day.events[eventIndex-1].start > event.start))) {
    throw new Error("Unordered itinerary");
  }
  return value;
}
async function decrypt(passphrase) {
  const blob = window.ENCRYPTED_TRIP;
  if (blob?.format !== "trip-v2" || blob.iterations !== 600_000 || !crypto?.subtle) {
    throw new Error("Unavailable encrypted data");
  }
  const salt = decodeBase64(blob.salt);
  const iv = decodeBase64(blob.iv);
  const ciphertext = decodeBase64(blob.ciphertext);
  if (salt.length !== 16 || iv.length !== 12 || ciphertext.length < 17) {
    throw new Error("Invalid encrypted data");
  }
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase),
    "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    {name:"PBKDF2",salt,iterations:blob.iterations,hash:"SHA-512"},
    material,{name:"AES-GCM",length:256},false,["decrypt"]);
  const plaintext = await crypto.subtle.decrypt({name:"AES-GCM",iv},key,ciphertext);
  return validateTrip(JSON.parse(new TextDecoder().decode(plaintext)));
}
async function openTrip(passphrase, remember) {
  message.textContent = "正在解鎖…";
  try {
    const value = await decrypt(passphrase);
    trip = value;
    if (remember) {
      try { localStorage.setItem(STORAGE_KEY,passphrase); }
      catch { message.textContent = "此瀏覽器無法記住密語；本次仍可閱讀。"; }
    }
    const now = japaneseNow();
    selectedDate = value.days.some(day => day.date === now.date) ? now.date : value.days[0].date;
    expandedEvent = -1;
    field.value = "";
    unlock.hidden = true;
    app.hidden = false;
    render();
    updateOfflineStatus();
  } catch {
    trip = null;
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    message.textContent = "無法解鎖，請檢查密語或重新載入。";
    field.focus();
  }
}
function forgetDevice() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
  trip = null;
  selectedDate = null;
  expandedEvent = -1;
  app.replaceChildren();
  app.hidden = true;
  clearTimeout(statusTimeout);
  unlock.hidden = false;
  message.textContent = "已忘記此裝置，請重新輸入密語。";
  field.value = "";
  field.focus();
}
function statusFor(day,event,index,now) {
  if (day.date !== now.date) return "";
  const current = day.events.findIndex(item =>
    item.kind !== "arrival" && item.start <= now.time && now.time < item.end);
  if (current === index) return "目前行程";
  const next = day.events.findIndex(item => item.start > now.time);
  if (current < 0 && next === index) return "下一步";
  return "";
}
function focusEvent(day,now) {
  if (day.date !== now.date) return {event:day.events[0],label:"行程預覽",index:0};
  const current = day.events.findIndex(item =>
    item.kind !== "arrival" && item.start <= now.time && now.time < item.end);
  if (current >= 0) return {event:day.events[current],label:"目前行程",index:current};
  const next = day.events.findIndex(item => item.start > now.time);
  if (next >= 0) return {event:day.events[next],label:"接下來",index:next};
  return {event:null,label:"今日已過預計時間",index:-1};
}
function hasEventDetail(event) {
  return Boolean(
    (typeof event.note === "string" && event.note.trim()) ||
    (typeof event.fallback === "string" && event.fallback.trim()) ||
    (Array.isArray(event.details) && event.details.some(item => typeof item === "string" && item.trim())) ||
    safeUrl(event.mapUrl) || safeUrl(event.sourceUrl)
  );
}
function renderEvent(day,event,index,now) {
  const row = element("li","event");
  const hasDetail = hasEventDetail(event);
  if (event.transferFromPrevious) row.classList.add("has-transfer");
  const marker = element("span","event-marker");
  if (event.kind === "transport" || event.kind === "walk") {
    marker.classList.add("event-marker-muted");
    append(marker,icon(event.kind === "transport" ? "transport" : "walk"));
  } else {
    const count = day.events.slice(0,index+1).filter(item =>
      item.kind !== "transport" && item.kind !== "walk").length;
    marker.textContent = count;
  }
  marker.setAttribute("aria-hidden","true");
  const content = element("div","event-content");
  const meta = element("div","event-meta");
  const time = element("time","event-time",event.displayTime || `${event.start}–${event.end}`);
  time.dateTime = event.startDateTime || `${day.date}T${event.start}+09:00`;
  append(meta,time);
  const state = statusFor(day,event,index,now);
  if (state) append(meta,element("span","event-state",state));
  append(content,meta);
  if (hasDetail) {
    const button = element("button","event-toggle");
    button.type = "button";
    button.id = `event-${index}`;
    button.setAttribute("aria-expanded",String(expandedEvent === index));
    button.setAttribute("aria-controls",`detail-${index}`);
    append(button,element("strong","event-title",event.title),icon("chevron"));
    button.addEventListener("click", () => {
      expandedEvent = expandedEvent === index ? -2 : index;
      for (const toggle of app.querySelectorAll(".event-toggle")) {
        const panel = toggle.closest(".event").querySelector(".event-detail");
        const open = toggle === button && expandedEvent === index;
        toggle.setAttribute("aria-expanded",String(open));
        panel.dataset.open = String(open);
        panel.setAttribute("aria-hidden",String(!open));
        panel.inert = !open;
      }
    });
    append(content,button);
  } else {
    append(content,append(element("div","event-title-static"),
      element("strong","event-title",event.title)));
  }
  append(content,element("p","event-place",event.place || ""));
  if (event.transferFromPrevious) {
    const transfer = element("div","transfer",event.transferFromPrevious);
    append(row,transfer);
  }
  if (hasDetail) {
    const detail = element("div","event-detail");
    detail.id = `detail-${index}`;
    detail.dataset.open = String(expandedEvent === index);
    detail.setAttribute("aria-hidden",String(expandedEvent !== index));
    detail.inert = expandedEvent !== index;
    const detailInner = element("div","event-detail-inner");
    if (typeof event.note === "string" && event.note.trim())
      append(detailInner,element("p","",event.note));
    if (Array.isArray(event.details)) {
      const facts = element("ul","event-facts");
      for (const fact of event.details) {
        if (typeof fact === "string" && fact.trim())
          append(facts,element("li","",fact));
      }
      if (facts.childElementCount) append(detailInner,facts);
    }
    if (typeof event.fallback === "string" && event.fallback.trim())
      append(detailInner,element("p","fallback",event.fallback));
    const links = element("div","detail-links");
    append(links,link(event.mapUrl,"開啟地圖"),link(event.sourceUrl,"官方資訊"));
    if (links.childElementCount) append(detailInner,links);
    append(detail,detailInner);
    append(content,detail);
  }
  append(row,marker,content);
  return row;
}
function infoPair(label,value) {
  if (typeof value !== "string" || !value.trim()) return null;
  return append(element("div","info-pair"),element("dt","",label),element("dd","",value));
}
function renderQuickInfo() {
  const section = element("section","quick-info");
  section.id = "quick-info";
  append(section,element("h2","","旅程資訊"));
  if (Array.isArray(trip.flights) && trip.flights.length) {
    const flights = element("div","info-group");
    append(flights,element("h3","","航班"));
    for (const flight of trip.flights) {
      const entry = element("div","info-entry");
      append(entry,element("strong","info-entry-title",flight.number || "航班"),
        element("p","info-route",flight.route || ""));
      const values = element("dl","info-values");
      append(values,infoPair("起飛",flight.depart),infoPair("抵達",flight.arrive));
      append(entry,values);
      if (flight.note) append(entry,element("p","info-note",flight.note));
      append(entry,link(flight.sourceUrl,"官方資訊"));
      append(flights,entry);
    }
    append(section,flights);
  }
  if (trip.hotel) {
    const hotel = trip.hotel;
    const group = element("div","info-group");
    append(group,element("h3","","住宿"),element("strong","info-entry-title",hotel.name || "飯店"));
    const values = element("dl","info-values");
    append(values,infoPair("日文名稱",hotel.japaneseName),infoPair("地址",hotel.address),
      infoPair("入住期間",hotel.stay),infoPair("訂單",hotel.bookingStatus),infoPair("入住",hotel.checkin),
      infoPair("退房",hotel.checkout),infoPair("電話",hotel.phone));
    append(group,values);
    if (hotel.note) append(group,element("p","info-note",hotel.note));
    const actions = element("div","info-actions");
    append(actions,link(hotel.mapUrl,"開啟地圖"),link(hotel.sourceUrl,"飯店官方資訊"));
    append(group,actions);
    append(section,group);
  }
  if (Array.isArray(trip.quickLinks) && trip.quickLinks.length) {
    const group = element("div","info-group");
    append(group,element("h3","","常用官方連結"));
    const links = element("ul","info-link-list");
    for (const item of trip.quickLinks) {
      const anchor = link(item.url,item.label);
      if (anchor) append(links,append(element("li",""),anchor));
    }
    append(group,links);
    append(section,group);
  }
  return section;
}
function renderNext(day,now,focus=focusEvent(day,now)) {
  const next = element("section","next");
  next.id = "next-step";
  append(next,element("span","next-dot",""));
  const nextContent = element("div","next-content");
  append(nextContent,element("span","next-label",
    focus.event ? `${focus.label} · ${focus.event.startLabel || focus.event.start}` : focus.label));
  append(nextContent,element("h2","",focus.event?.title || "請查看完整行程"));
  if (focus.event) {
    append(nextContent,element("p","",focus.event.note || focus.event.place));
    if (focus.event.fallback) append(nextContent,element("p","next-fallback",focus.event.fallback));
    append(nextContent,link(focus.event.mapUrl,"開啟地圖"));
  }
  append(next,nextContent);
  return next;
}
function showUpdateBanner() {
  const banner = app.querySelector("#update-banner");
  if (banner) banner.hidden = !serviceRegistration?.waiting;
}
function render() {
  if (!trip) return;
  const day = trip.days.find(item => item.date === selectedDate) || trip.days[0];
  const now = japaneseNow();
  const focus = focusEvent(day,now);
  if (expandedEvent === -1 && focus.index >= 0)
    expandedEvent = hasEventDetail(focus.event) ? focus.index : -2;
  app.replaceChildren();

  const header = element("header","site-header");
  const headerInner = element("div","header-inner");
  append(headerInner,element("span","header-spacer"),
    element("strong","site-name",typeof trip.title === "string" ? trip.title : "私人行程"));
  const forget = element("button","forget","忘記此裝置");
  forget.type = "button";
  forget.addEventListener("click",forgetDevice);
  append(headerInner,forget);
  const nav = element("nav","section-nav");
  nav.setAttribute("aria-label","頁面區段");
  for (const [label,target] of [
    ["下一步","#next-step"],["提醒","#important"],["行程","#day-plan"],["資訊","#quick-info"]]) {
    const anchor = element("a","",label);
    anchor.href = target;
    anchor.addEventListener("click",event => {
      event.preventDefault();
      app.querySelector(target)?.scrollIntoView({behavior:matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",block:"start"});
      history.replaceState(null,"",target);
      setActiveSection(target);
    });
    append(nav,anchor);
  }
  append(header,headerInner,nav);
  const updateBanner = element("div","update-banner");
  updateBanner.id = "update-banner";
  updateBanner.hidden = true;
  append(updateBanner,element("span","","行程有新版可用"));
  const updateButton = element("button","","更新行程");
  updateButton.type = "button";
  updateButton.addEventListener("click",() => {
    if (!serviceRegistration?.waiting) return;
    updateRequested = true;
    serviceRegistration.waiting.postMessage({type:"SKIP_WAITING"});
  });
  append(updateBanner,updateButton);

  const shell = element("main","shell");
  const main = element("div","main-column");
  const dates = element("nav","date-list");
  dates.setAttribute("aria-label","選擇日期");
  for (const item of trip.days) {
    const button = element("button",item.date === day.date ? "date selected" : "date",
      new Intl.DateTimeFormat("zh-TW",{timeZone:"UTC",weekday:"short",month:"numeric",day:"numeric"})
        .format(new Date(item.date + "T00:00:00Z")));
    button.type = "button";
    button.setAttribute("aria-current",item.date === day.date ? "date" : "false");
    button.addEventListener("click",() => {
      selectedDate = item.date;
      expandedEvent = -1;
      render();
      window.scrollTo(0,0);
    });
    append(dates,button);
  }
  const dayHead = element("div","day-head");
  const heading = element("div","");
  append(heading,element("p","day-kicker",`${day.place} · 日本時間 ${now.time}`),
    element("h1","",day.title));
  append(dayHead,heading,element("span","day-count",`${day.events.length} 個行程`));
  const next = renderNext(day,now,focus);
  const plan = element("section","plan");
  plan.id = "day-plan";
  const planHead = element("div","plan-head");
  append(planHead,element("h2","","今日行程"),element("span","", "時間僅供參考"));
  const list = element("ol","timeline");
  day.events.forEach((event,index) => append(list,renderEvent(day,event,index,now)));
  append(plan,planHead,list);
  const important = element("section","important");
  important.id = "important";
  append(important,element("h2","","現場提醒"));
  const notices = Array.isArray(day.notices) ? day.notices : [day.notice];
  const noticeList = element("ul","important-list");
  for (const notice of notices) {
    if (typeof notice === "string" && notice.trim())
      append(noticeList,element("li","",notice));
  }
  if (noticeList.childElementCount) append(important,noticeList);
  const noticeActions = element("div","important-actions");
  const sources = Array.isArray(day.noticeLinks) ? day.noticeLinks :
    [{label:"查看官方資訊",url:day.noticeUrl}];
  for (const source of sources) append(noticeActions,link(source.url,source.label));
  if (noticeActions.childElementCount) append(important,noticeActions);
  const footer = element("p","data-note",`資料更新：${trip.updated} · 日本時間（JST）`);
  const status = element("p","app-status","檢查離線資料中…");
  status.id = "app-status";
  status.setAttribute("role","status");
  status.setAttribute("aria-live","polite");
  append(main,dates,dayHead,next,important,plan,renderQuickInfo(),footer,status);
  const side = element("aside","side");
  append(side,element("span","side-kicker","TRIP AT A GLANCE"),
    element("h2","",day.title),element("p","",day.subtitle),
    element("hr",""),element("strong","side-clock",`日本時間 ${now.time}`),
    element("span","",day.date === now.date ? "今日行程" : "手動查看行程"),
    element("hr",""),element("p","", "班次及營運狀態以現場與官方資訊為準。"));
  append(shell,main,side);
  append(app,header,updateBanner,shell);
  const selectedButton = dates.querySelector(".selected");
  if (selectedButton) dates.scrollLeft = selectedButton.offsetLeft - dates.offsetLeft -
    (dates.clientWidth - selectedButton.offsetWidth) / 2;
  lastRenderedJstKey = `${now.date}T${now.time}`;
  showUpdateBanner();
  setActiveSection("#next-step");
}
function refreshClock() {
  if (!trip || app.hidden) return;
  const now = japaneseNow();
  const key = `${now.date}T${now.time}`;
  if (key === lastRenderedJstKey) return;
  lastRenderedJstKey = key;
  const day = trip.days.find(item => item.date === selectedDate) || trip.days[0];
  const currentNext = app.querySelector("#next-step");
  if (currentNext && !currentNext.contains(document.activeElement))
    currentNext.replaceWith(renderNext(day,now));
  const kicker = app.querySelector(".day-kicker");
  if (kicker) kicker.textContent = `${day.place} · 日本時間 ${now.time}`;
  const sideClock = app.querySelector(".side-clock");
  if (sideClock) sideClock.textContent = `日本時間 ${now.time}`;
  const metas = app.querySelectorAll(".event-meta");
  day.events.forEach((event,index) => {
    const meta = metas[index];
    if (!meta) return;
    meta.querySelector(".event-state")?.remove();
    const state = statusFor(day,event,index,now);
    if (state) append(meta,element("span","event-state",state));
  });
}
setInterval(refreshClock,15_000);
document.addEventListener("visibilitychange",() => {
  if (document.visibilityState === "visible") refreshClock();
});
function setActiveSection(target) {
  for (const anchor of app.querySelectorAll(".section-nav a")) {
    const active = anchor.getAttribute("href") === target;
    anchor.classList.toggle("active",active);
    if (active) anchor.setAttribute("aria-current","location");
    else anchor.removeAttribute("aria-current");
  }
}
let scrollScheduled = false;
window.addEventListener("scroll",() => {
  if (scrollScheduled || !trip) return;
  scrollScheduled = true;
  requestAnimationFrame(() => {
    scrollScheduled = false;
    const threshold = matchMedia("(max-width: 760px)").matches ? 70 : 124;
    let current = "#next-step";
    for (const target of ["#next-step","#important","#day-plan","#quick-info"]) {
      if ((app.querySelector(target)?.getBoundingClientRect().top ?? Infinity) <= threshold) current = target;
    }
    setActiveSection(current);
  });
},{passive:true});
async function updateOfflineStatus() {
  if (location.protocol === "file:") {
    showStatus("本機預覽；離線安裝需經 HTTPS 或 localhost。");
    return;
  }
  if (!("serviceWorker" in navigator)) {
    showStatus("此瀏覽器不支援離線安裝。");
    return;
  }
  try {
    await navigator.serviceWorker.ready;
    const cached = await caches.match(new URL("data.enc.js",location.href));
    showStatus(cached ? "行程已儲存，可離線開啟。" : "正在準備離線內容…");
  } catch {
    showStatus("離線狀態尚未確認。");
  }
}
form.addEventListener("submit",event => {
  event.preventDefault();
  openTrip(field.value,true);
});
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.addEventListener("controllerchange",() => {
    if (updateRequested) location.reload();
  });
  navigator.serviceWorker.register("sw.js").then(registration => {
    serviceRegistration = registration;
    showUpdateBanner();
    registration.addEventListener("updatefound",() => {
      const worker = registration.installing;
      worker?.addEventListener("statechange",() => {
        if (worker.state === "installed" && navigator.serviceWorker.controller)
          showUpdateBanner();
      });
    });
    updateOfflineStatus();
  })
    .catch(() => showStatus("離線資料暫時無法準備。"));
}
try {
  const remembered = localStorage.getItem(STORAGE_KEY);
  if (remembered) openTrip(remembered,false);
} catch {}
