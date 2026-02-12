let currentEvent = null;
let unavailable = new Set();

function parseISOToLocalDate(iso) {
  // Avoids mobile UTC parsing bug of new Date("YYYY-MM-DD")
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function goHome() {
  currentEvent = null;
  unavailable = new Set();
  document.getElementById("home").classList.remove("hidden");
  document.getElementById("event").classList.add("hidden");
  document.getElementById("joinErr").textContent = "";
  document.getElementById("saveMsg").textContent = "";
}

async function createEvent() {
  const title = document.getElementById("title").value.trim() || "Hangout";
  const startDate = document.getElementById("start").value;
  const endDate = document.getElementById("end").value;

  if (!startDate || !endDate) {
    document.getElementById("created").textContent = "Pick a start and end date.";
    return;
  }
  if (startDate > endDate) {
    document.getElementById("created").textContent = "Start date must be before end date.";
    return;
  }

  const r = await fetch("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, startDate, endDate })
  });

  const d = await r.json();
  if (!r.ok) {
    document.getElementById("created").textContent = d.error || "Failed to create event.";
    return;
  }

  document.getElementById("created").innerHTML =
    `<b>Event ID:</b> ${d.id}<br><span class="muted small">Share this with friends.</span>`;
  document.getElementById("eventId").value = d.id;
}

async function loadEvent() {
  const id = document.getElementById("eventId").value.trim();
  if (!id) return;

  document.getElementById("joinErr").textContent = "";

  const r = await fetch("/api/events/" + encodeURIComponent(id));
  const d = await r.json();

  if (!r.ok) {
    document.getElementById("joinErr").textContent = d.error || "Event not found.";
    return;
  }

  currentEvent = d.event;
  unavailable = new Set(); // per device/user until saved

  document.getElementById("home").classList.add("hidden");
  document.getElementById("event").classList.remove("hidden");
  document.getElementById("eventTitle").textContent = currentEvent.title || "Event";
  document.getElementById("eventMeta").textContent =
    `ID: ${currentEvent.id} • ${currentEvent.start_date} → ${currentEvent.end_date}`;

  drawCalendar();
}

function drawCalendar() {
  const cal = document.getElementById("calendar");
  cal.innerHTML = "";

  const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  for (const h of days) {
    const head = document.createElement("div");
    head.className = "dayHead";
    head.textContent = h;
    cal.appendChild(head);
  }

  let start = parseISOToLocalDate(currentEvent.start_date);
  const end = parseISOToLocalDate(currentEvent.end_date);

  // pad first week
  const pad = start.getDay();
  for (let i = 0; i < pad; i++) {
    const p = document.createElement("div");
    p.className = "day pad";
    cal.appendChild(p);
  }

  while (start <= end) {
    const iso = toISO(start);

    const div = document.createElement("div");
    div.className = "day";
    if (unavailable.has(iso)) div.classList.add("off");

    div.innerHTML = `
      <div class="num">${start.getDate()}</div>
      <div class="iso">${iso}</div>
    `;

    div.addEventListener("click", () => {
      if (unavailable.has(iso)) unavailable.delete(iso);
      else unavailable.add(iso);
      drawCalendar();
    });

    cal.appendChild(div);
    start.setDate(start.getDate() + 1);
  }
}

function markWeekday() {
  if (!currentEvent) return;
  const target = Number(document.getElementById("weekday").value);

  let d = parseISOToLocalDate(currentEvent.start_date);
  const end = parseISOToLocalDate(currentEvent.end_date);

  while (d <= end) {
    if (d.getDay() === target) unavailable.add(toISO(d));
    d.setDate(d.getDate() + 1);
  }
  drawCalendar();
}

async function save() {
  if (!currentEvent) return;
  const name = document.getElementById("username").value.trim();
  if (!name) {
    document.getElementById("saveMsg").textContent = "Enter your name first.";
    return;
  }

  document.getElementById("saveMsg").textContent = "Saving…";

  const r = await fetch(`/api/events/${encodeURIComponent(currentEvent.id)}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      unavailableDates: Array.from(unavailable)
    })
  });

  const d = await r.json().catch(() => ({}));
  document.getElementById("saveMsg").textContent = r.ok ? "Saved!" : (d.error || "Save failed.");
  setTimeout(() => (document.getElementById("saveMsg").textContent = ""), 2000);
}
