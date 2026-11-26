// ============================================================================
// CONFIG: Live Render Backend API URL
// ============================================================================
const API_BASE_URL = "https://rotor-backend.onrender.com";

let bikesCache = [];
let zonesCache = [];
let selectedBike = null;
let selectedPaymentMethod = "card";

// ============================================================================
// TOAST NOTIFICATIONS & MODAL HELPERS
// ============================================================================
function showToast(message, type = "info") {
  const wrap = document.getElementById("toastWrap");
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 4500);
}

function openModal(id) {
  document.getElementById(id).classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeModal(id) {
  document.getElementById(id).classList.remove("open");
  document.body.style.overflow = "";
}

document.querySelectorAll("[data-close]").forEach((btn) => {
  btn.addEventListener("click", () => closeModal(btn.dataset.close));
});

document.querySelectorAll(".modal-backdrop").forEach((backdrop) => {
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) closeModal(backdrop.id);
  });
});

function formatMoney(amount) {
  return `$${Number(amount).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// ============================================================================
// LOAD BIKES & SHIPPING ZONES
// ============================================================================
async function loadStoreData() {
  const grid = document.getElementById("bikesGrid");
  try {
    const [bikesRes, zonesRes] = await Promise.all([
      fetch(`${API_BASE_URL}/api/bikes`),
      fetch(`${API_BASE_URL}/api/shipping-zones`),
    ]);

    if (!bikesRes.ok || !zonesRes.ok) throw new Error("Failed to load storefront data");

    const bikesData = await bikesRes.json();
    const zonesData = await zonesRes.json();

    bikesCache = bikesData.bikes || [];
    zonesCache = zonesData.zones || [];

    renderBikes();
    populateShippingZones();
  } catch (err) {
    grid.innerHTML = `<div class="empty-state">Could not connect to backend API (${API_BASE_URL}). Make sure FastAPI is running.</div>`;
    showToast("Could not load inventory from server.", "error");
  }
}

function renderBikes() {
  const grid = document.getElementById("bikesGrid");
  if (!bikesCache.length) {
    grid.innerHTML = `<div class="empty-state">No motorcycles listed yet.</div>`;
    return;
  }

  grid.innerHTML = bikesCache
    .map((bike) => {
      const specs = Array.isArray(bike.specs) ? bike.specs : [];
      const isAvailable = bike.status === "available";
      const statusClass = `st-${bike.status}`;

      return `
        <article class="card">
          <div class="card-img-wrap">
            <img src="${bike.image_url}" alt="${bike.name}" loading="lazy" />
            <span class="status-pill ${statusClass}">${bike.status}</span>
          </div>
          <div class="card-body">
            <div class="bike-brand">${bike.brand}</div>
            <h3 class="bike-name">${bike.name}</h3>
            <p class="bike-tagline">${bike.tagline || ""}</p>
            <ul class="specs-list">
              ${specs.slice(0, 4).map((s) => `<li>${s}</li>`).join("")}
            </ul>
            <div class="card-footer">
              <div class="price">${formatMoney(bike.price)}</div>
              <button
                class="btn btn-primary buy-btn"
                data-bike-id="${bike.id}"
                ${isAvailable ? "" : "disabled"}
              >
                ${isAvailable ? "Buy Now →" : bike.status === "reserved" ? "Reserved" : "Sold"}
              </button>
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  document.querySelectorAll(".buy-btn").forEach((btn) => {
    btn.addEventListener("click", () => openCheckout(btn.dataset.bikeId));
  });
}

// ============================================================================
// CUSTOM SHIPPING ZONE DROPDOWN
// ============================================================================
function selectShippingZone(zoneId) {
  const zone = zonesCache.find((z) => z.id === zoneId);
  if (!zone) return;

  document.getElementById("shippingZoneSelect").value = zone.id;
  document.getElementById("zoneTriggerText").textContent =
    `${zone.zone_name} — ${formatMoney(zone.flat_rate)}`;

  document.querySelectorAll(".cs-option").forEach((el) => {
    el.classList.toggle("selected", el.dataset.id === zone.id);
  });

  document.getElementById("zoneDropdown").classList.remove("open");
  updateCheckoutTotals();
}

function populateShippingZones() {
  const menu = document.getElementById("zoneMenu");
  if (!zonesCache.length) {
    document.getElementById("shippingZoneSelect").value = "";
    document.getElementById("zoneTriggerText").textContent = "No shipping zones available";
    menu.innerHTML = `<div class="cs-option" style="pointer-events:none;opacity:.6;">No active shipping zones</div>`;
    return;
  }

  menu.innerHTML = zonesCache
    .map(
      (z) => `
      <div class="cs-option" data-id="${z.id}">
        <div class="cs-opt-info">
          <span class="cs-opt-name">${z.zone_name}</span>
          <span class="cs-opt-days">${z.estimated_days}</span>
        </div>
        <span class="cs-opt-price">${formatMoney(z.flat_rate)}</span>
      </div>
    `
    )
    .join("");

  menu.querySelectorAll(".cs-option").forEach((opt) => {
    opt.addEventListener("click", () => selectShippingZone(opt.dataset.id));
  });

  // Select the first zone by default
  selectShippingZone(zonesCache[0].id);
}

// Toggle dropdown open/close
document.getElementById("zoneTrigger").addEventListener("click", (e) => {
  e.stopPropagation();
  document.getElementById("zoneDropdown").classList.toggle("open");
});

// Close dropdown when clicking anywhere else
document.addEventListener("click", (e) => {
  const dd = document.getElementById("zoneDropdown");
  if (dd && !dd.contains(e.target)) dd.classList.remove("open");
});

// ============================================================================
// PAYMENT METHOD TOGGLE (CARD / CRYPTO)
// ============================================================================
document.querySelectorAll(".pay-option[data-method]").forEach((opt) => {
  opt.addEventListener("click", () => {
    selectedPaymentMethod = opt.dataset.method;
    document.querySelectorAll(".pay-option[data-method]").forEach((el) => {
      el.classList.toggle("active", el.dataset.method === selectedPaymentMethod);
    });
    const btn = document.getElementById("proceedPayBtn");
    btn.innerHTML =
      selectedPaymentMethod === "card"
        ? "&#128274; Proceed to Card Payment &rarr;"
        : "&#128274; Proceed to Crypto Payment &rarr;";
  });
});

// ============================================================================
// GUEST CHECKOUT MODAL LOGIC
// ============================================================================
function openCheckout(bikeId) {
  selectedBike = bikesCache.find((b) => b.id === bikeId);
  if (!selectedBike) return;

  document.getElementById("coBikeImg").src = selectedBike.image_url;
  document.getElementById("coBikeName").textContent = selectedBike.name;
  document.getElementById("coBikeTagline").textContent = selectedBike.tagline || "";

  const specs = Array.isArray(selectedBike.specs) ? selectedBike.specs : [];
  document.getElementById("coBikeSpecs").innerHTML = specs
    .slice(0, 4)
    .map((s) => `<li>${s}</li>`)
    .join("");

  updateCheckoutTotals();
  openModal("checkoutModal");
}

function updateCheckoutTotals() {
  if (!selectedBike) return;
  const zoneId = document.getElementById("shippingZoneSelect").value;
  const zone = zonesCache.find((z) => z.id === zoneId);
  const shippingFee = zone ? Number(zone.flat_rate) : 0;
  const bikePrice = Number(selectedBike.price);

  document.getElementById("coBikePrice").textContent = formatMoney(bikePrice);
  document.getElementById("coShippingFee").textContent = formatMoney(shippingFee);
  document.getElementById("coTotalAmount").textContent = formatMoney(bikePrice + shippingFee);
}

document.getElementById("checkoutForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!selectedBike) return;

  const zoneId = document.getElementById("shippingZoneSelect").value;
  if (!zoneId) {
    showToast("Please select a shipping zone first.", "error");
    return;
  }

  const btn = document.getElementById("proceedPayBtn");
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.textContent =
    selectedPaymentMethod === "card"
      ? "Creating Secure Card Checkout..."
      : "Creating Secure Crypto Invoice...";

  const payload = {
    bike_id: selectedBike.id,
    shipping_zone_id: zoneId,
    customer_name: document.getElementById("custName").value.trim(),
    customer_email: document.getElementById("custEmail").value.trim(),
    customer_phone: document.getElementById("custPhone").value.trim(),
    delivery_address: document.getElementById("custAddress").value.trim(),
    payment_method: selectedPaymentMethod,
  };

  try {
    const res = await fetch(`${API_BASE_URL}/api/checkout/init`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Checkout initialization failed");

    const providerLabel = data.provider === "intasend" ? "IntaSend" : "NOWPayments";
    showToast(`Order ${data.order_ref} created! Redirecting to ${providerLabel}...`, "success");
    setTimeout(() => {
      window.location.href = data.checkout_url;
    }, 900);
  } catch (err) {
    showToast(err.message, "error");
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
});

// ============================================================================
// TRACK ORDER MODAL LOGIC
// ============================================================================
["openTrackBtn", "openTrackNav"].forEach((id) => {
  document.getElementById(id).addEventListener("click", (e) => {
    e.preventDefault();
    openModal("trackModal");
  });
});

document.getElementById("trackForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const ref = document.getElementById("trackRef").value.trim();
  const email = document.getElementById("trackEmail").value.trim();
  const resultBox = document.getElementById("trackResult");
  const btn = document.getElementById("trackSubmitBtn");

  btn.disabled = true;
  btn.textContent = "Searching...";

  try {
    const res = await fetch(
      `${API_BASE_URL}/api/orders/track?order_ref=${encodeURIComponent(ref)}&email=${encodeURIComponent(email)}`
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Order not found");

    const o = data.order;
    resultBox.innerHTML = `
      <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
        <strong>${o.order_ref}</strong>
        <span style="color:var(--accent);text-transform:uppercase;font-weight:700;font-size:.82rem;">${o.payment_status}</span>
      </div>
      <div style="font-size:.88rem;color:var(--muted);display:grid;gap:4px;">
        <div><strong style="color:#fff;">Motorcycle:</strong> ${o.motorcycles?.name || "N/A"}</div>
        <div><strong style="color:#fff;">Total:</strong> ${formatMoney(o.total_amount)} (${o.currency})</div>
        <div><strong style="color:#fff;">Delivery Status:</strong> <span style="text-transform:capitalize;">${o.delivery_status}</span></div>
        <div><strong style="color:#fff;">Address:</strong> ${o.delivery_address}</div>
      </div>
    `;
    resultBox.classList.add("show");
  } catch (err) {
    resultBox.classList.remove("show");
    showToast(err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Check Order Status";
  }
});

// ============================================================================
// HANDLE RETURN REDIRECT FROM PAYMENT GATEWAY + INIT
// ============================================================================
function checkReturnParams() {
  const params = new URLSearchParams(window.location.search);
  const orderRef = params.get("order_ref");
  const status = params.get("status");

  if (orderRef && status === "paid") {
    showToast(`Payment submitted for ${orderRef}! You can track your order anytime.`, "success");
    document.getElementById("trackRef").value = orderRef;
    openModal("trackModal");
  } else if (orderRef && status === "cancelled") {
    showToast(`Payment for ${orderRef} was cancelled. You can try again anytime.`, "error");
  }
}

document.getElementById("refreshBikesBtn").addEventListener("click", loadStoreData);
loadStoreData();
checkReturnParams();
