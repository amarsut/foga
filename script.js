import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc, getDocs, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { renderCalendarView } from './calendar.js';
import { renderAvailabilityView, initAvailabilityModule } from './availability.js';
import { renderTVDashboard } from './tv.js'; // Importera den nya filen
import { increment } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let tvRefreshInterval = null;

let currentCarItems = [];
let currentCartItems = [];

let currentCarChecklists = {};
let currentCartChecklists = {};
let packingTemplates = null;

window.unitChecklists = {};
window.activeUnitId = null;
window.listSectionsExpanded = { base: true, refill: true };

window.carListVisible = true;
window.cartListVisible = true;
window.isPackingPhase = false;

// Funktion för att hämta mallar från Firebase vid start
const loadTemplatesFromDb = async () => {
    try {
        const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
        const docSnap = await getDoc(doc(window.db, "settings", "packing_templates"));
        if (docSnap.exists()) {
            packingTemplates = docSnap.data();
            console.log("Mallar synkade med databasen");
            // Om vi redan står på 'create' vyn, rita om den nu när datan finns
            if (currentView === 'create') window.render();
        }
    } catch (err) {
        console.error("Fel vid laddning av mallar:", err);
    }
};

// Kör hämtningen
loadTemplatesFromDb();

window.goToPacking = () => {
    const eventName = document.getElementById('event-name').value;
    const startDate = document.getElementById('start-date').value;

    if (!eventName || !startDate) {
        alert("Fyll i namn och datum först.");
        return;
    }

    // SPARA ALLA VAL i ett objekt
    window.pendingAssignmentData = {
        event: eventName,
        businessArea: document.getElementById('sel-area').value,
        startDate: startDate,
        endDate: document.getElementById('end-date').value,
        carId: document.getElementById('sel-car').value, // Vi sparar detta som carId
        trailerId: document.getElementById('sel-trailer').value,
        carTemplate: document.getElementById('sel-car-template').value,
        cartTemplate: document.getElementById('sel-cart-template').value,
        numDays: document.getElementById('num-days').value,
        selectedCarts: Array.from(document.querySelectorAll('input[name="selected-carts"]:checked')).map(cb => cb.value)
    };

    window.updateTemplateItems(); // Kör generering av listor
    window.isPackingPhase = true; // Byt till steg 2
    window.render();
};

window.saveAndClose = () => {
    window.saveAssignment(); // Din befintliga spara-funktion
    window.isPackingPhase = false; // Återställ till steg 1 för nästa gång
};

// Hjälpfunktion för att skala upp mängder (t.ex. 5kg -> 10kg)
function scaleItemQuantity(itemName, multiplier) {
    if (multiplier <= 1) return itemName;
    return itemName.replace(/(\d+)(kg|st|pack|l)/gi, (match, num, unit) => {
        return (parseInt(num) * multiplier) + unit;
    });
}

// 1. DIN FIREBASE CONFIG
const firebaseConfig = {
    apiKey: "AIzaSyBO-a2qBiyXvqyyChzUtMhaEChyiW75u68",
    authDomain: "fogarolli-logistics.firebaseapp.com",
    projectId: "fogarolli-logistics",
    storageBucket: "fogarolli-logistics.firebasestorage.app.appspot.com",
    messagingSenderId: "274221920124",
    appId: "G-ZTPXPNDFT0"
};

window.render = () => {
    const area = document.getElementById('content-area');
    area.innerHTML = '';

    if (currentView === 'dashboard') renderDashboard(area);
    if (currentView === 'map') renderMap(area);
    if (currentView === 'create') renderCreate(area);
    if (currentView === 'availability') renderAvailabilityView(area, cars, trailers, carts, db, assignments);

    if (currentView === 'calendar') {
        renderCalendarView(assignments, db, cars, trailers, carts, selectedStartDate);
    }
};

// Gör funktionen tillgänglig globalt för andra moduler
window.render = render;

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
window.db = db;
initAvailabilityModule(db); // Detta gör att buggrapporten fungerar direkt!

let assignments = [];
let cars = [];
let trailers = []; // FIX: Ändrat till plural för att matcha resten av koden
let carts = [];
let editingAssignmentId = null; // LÄGG TILL DENNA RAD HÄR!
let currentView = 'calendar';
let map = null;
let selectedStartDate = null;

// 1. Funktion för att starta redigering
window.editAssignment = (id) => {
    const ass = assignments.find(a => a.id === id);
    if (!ass) return;

    editingAssignmentId = id;

    // 1. Återställ Steg 1-data
    window.pendingAssignmentData = {
        event: ass.event,
        businessArea: ass.businessArea,
        startDate: ass.startDate,
        endDate: ass.endDate,
        carId: ass.car,
        trailerId: ass.trailer,
        carTemplate: ass.carTemplate || "",
        cartTemplate: ass.cartTemplate || "",
        numDays: ass.numDays || 1,
        selectedCarts: ass.carts || []
    };

    // 2. Återställ Steg 2-data
    window.unitChecklists = {};

    if (ass.car && ass.car !== "Ej kopplad") {
        window.unitChecklists[ass.car] = ass.carItems || [];
    }

    if (ass.carts && ass.cartItems) {
        ass.carts.forEach(cartId => {
            let itemsForThisCart = ass.cartItems.filter(i => i.unitId === cartId);
            if (itemsForThisCart.length === 0 && ass.carts[0] === cartId) {
                itemsForThisCart = ass.cartItems;
            }
            window.unitChecklists[cartId] = itemsForThisCart;
        });
    }

    // FIX: Sätt den aktiva fliken till bilen (eller första vagnen om bil saknas)
    const keys = Object.keys(window.unitChecklists);
    if (keys.length > 0) {
        window.activeUnitId = keys[0];
    }

    window.isPackingPhase = true; 
    window.showView('create');
};

// 2. Uppdatera navigations-lyssnaren så att den nollställer redigering när man klickar på "Skapa Uppdrag"
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
        const view = item.getAttribute('data-view');
        
        // Om vi klickar på Skapa Uppdrag, gör en "Total Reset"
        if (view === 'create') {
            editingAssignmentId = null;
            window.isPackingPhase = false;
            window.pendingAssignmentData = null; // Detta rensar "minnet" från tidigare besök
            window.unitChecklists = {};          // Detta rensar packlistorna helt
            selectedStartDate = null;
        }
        
        showView(view);
    });
});

window.showView = (view, preDate = null) => {
    currentView = view;
    selectedStartDate = preDate;

    // 1. ÅTERSTÄLL ALLTID HEADERN (Fixar försvunnen titel)
    toggleMainHeader(true);

    // 2. STÄNG SIDEBAR PÅ MOBIL
    if (window.innerWidth <= 768) {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        if (sidebar) sidebar.classList.remove('mobile-active');
        if (overlay) {
            overlay.classList.remove('active');
            overlay.style.display = 'none';
        }
    }

    // 3. KORREKTA TITLAR (Fixar "Fleet" -> "Statistik")
    const title = document.getElementById('view-title');
    const titles = {
        'dashboard': 'Dashboard',
        'calendar': 'Kalender',
        'create': 'Skapa Nytt Uppdrag',
        'availability': 'Fleet & Fordon',
        'stats': 'Statistik & Analys', // Korrekt titel
        'tv': 'Lager-TV',
        'settings': 'Inställningar'
    };
    title.innerText = titles[view] || "Fogarolli";

    // 4. HANTERA AKTIV NAVIGERING
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const activeNav = document.querySelector(`[data-view="${view}"]`);
    if (activeNav) activeNav.classList.add('active');

    render();
};

const getWeatherData = () => ({ temp: 14, desc: 'Växlande molnighet', icon: 'cloud-sun' });

function renderDashboard(area) {
    const today = new Date();
    const thirtyDaysAhead = new Date();
    thirtyDaysAhead.setDate(today.getDate() + 30);

    // 1. Beräkna data för korten
    const upcoming30Days = assignments.filter(a => {
        const d = new Date(a.startDate);
        return d >= today && d <= thirtyDaysAhead;
    });

    const packingNow = assignments.filter(a => a.step === 'Packar'); //
    
    // AI Val 1: Fleet Health (Fordon som behöver kärlek)
    const fleetAlerts = [...cars, ...trailers, ...carts].filter(u => u.healthStatus === 'danger' || u.healthStatus === 'warn');
    
    // AI Val 2: Tillgängliga resurser just nu
    const freeCarts = carts.filter(c => c.status === 'Ledig').length;

    const weather = getWeatherData();

    area.innerHTML = `
        <div class="dashboard-root">
            <div class="kpi-row">
                <div class="kpi-card">
                    <i class="fas fa-calendar-alt kpi-icon"></i>
                    <span class="label">Kommande 30 dagar</span>
                    <span class="value">${upcoming30Days.length}</span>
                    <span class="sub">Totalt ${assignments.length} uppdrag</span>
                </div>
                <div class="kpi-card">
                    <i class="fas fa-box-open kpi-icon"></i>
                    <span class="label">Packas just nu</span>
                    <span class="value">${packingNow.length}</span>
                    <span class="sub">Uppdrag ej klara</span>
                </div>
                <div class="kpi-card">
                    <i class="fas fa-tools kpi-icon"></i>
                    <span class="label">Fleet Attention</span>
                    <span class="value">${fleetAlerts.length}</span>
                    <span class="sub">Fordon behöver åtgärd</span>
                </div>
                <div class="kpi-card">
                    <i class="fas fa-coffee kpi-icon"></i>
                    <span class="label">Lediga Vagnar</span>
                    <span class="value">${freeCarts}</span>
                    <span class="sub">Klara för bokning</span>
                </div>
            </div>

            <div class="dashboard-main">
                <div class="side-section-title"><i class="fas fa-list-ul"></i> Kommande Schema</div>
                <div class="mission-list" style="grid-template-columns: 1fr;">
                    ${upcoming30Days.length > 0 
                        ? upcoming30Days.sort((a,b) => a.startDate.localeCompare(b.startDate)).map(a => renderMissionCard(a)).join('') 
                        : '<div class="m-empty-day">Inga uppdrag närmsta 30 dagarna.</div>'}
                </div>
            </div>

            <div class="dashboard-sidebar">
                <div class="side-section-title"><i class="fas fa-cloud-sun"></i> Lokalt Väder</div>
                
                <div class="weather-widget">
                    <div class="weather-info">
                        <h4>Eslöv, SE</h4>
                        <span>${weather.desc}</span>
                    </div>
                    <div class="weather-temp">
                        <i class="fas fa-${weather.icon}"></i> ${weather.temp}°
                    </div>
                </div>

                <div class="side-section-title"><i class="fas fa-exclamation-triangle"></i> Fleet To-Do</div>
                <div class="fleet-attention-list">
                    ${fleetAlerts.length > 0 ? fleetAlerts.slice(0, 4).map(u => `
                        <div class="mo-card" style="margin-bottom:8px; background:white;">
                            <div class="mo-unit">
                                <strong>${u.id}</strong>
                                <span>${u.healthStatus === 'danger' ? 'KRITISK ÅTGÄRD' : 'Service behövs'}</span>
                            </div>
                            <div class="mo-alerts">
                                <span class="mo-tag ${u.healthStatus === 'danger' ? 'danger' : 'warn'}">
                                    <i class="fas fa-tools"></i>
                                </span>
                            </div>
                        </div>
                    `).join('') : '<p style="font-size:0.8rem; color:#999;">Alla fordon är OK!</p>'}
                </div>

                <div class="dashboard-actions">
                    <button class="btn-dash-primary" onclick="showView('create')">
                        <i class="fas fa-plus-circle"></i> Nytt Uppdrag
                    </button>
                    <button class="btn-dash-outline" onclick="showView('availability')">
                        <i class="fas fa-truck-moving"></i> Fleet Management
                    </button>
                </div>
        </div>
    `;
}

function renderMissionCard(a) {
    const startDate = new Date(a.startDate);
    const day = startDate.getDate();
    const month = startDate.toLocaleDateString('sv-SE', { month: 'short' }).toUpperCase().replace('.', '');

    const totalItems = (a.carItems || []).concat(a.cartItems || []).filter(i => i.type === 'item');
    const doneItems = totalItems.filter(i => i.done).length;
    const progressPercent = totalItems.length > 0 ? Math.round((doneItems / totalItems.length) * 100) : 0;

    return `
        <div class="mission-card-vision" onclick="window.editAssignment('${a.id}')">
            <div class="date-badge">
                <span class="month">${month}</span>
                <span class="day">${day}</span>
            </div>
            <div class="mission-content">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span class="mission-title">${a.event}</span>
                    <i class="fas fa-chevron-right" style="color:#eee; font-size:0.7rem;"></i>
                </div>
                
                <div class="resource-row" style="display:flex; gap:5px; flex-wrap:nowrap; overflow:hidden;">
                    ${a.car && a.car !== 'Ej kopplad' ? `<div class="res-pill" style="font-size:0.6rem; background:#f5f5f5; padding:2px 6px; border-radius:4px;"><i class="fas fa-truck"></i> ${a.car}</div>` : ''}
                    ${(a.carts || []).slice(0,2).map(c => `<div class="res-pill" style="font-size:0.6rem; background:#f5f5f5; padding:2px 6px; border-radius:4px;"><i class="fas fa-coffee"></i> ${c}</div>`).join('')}
                    ${(a.carts || []).length > 2 ? `<div style="font-size:0.6rem; color:#999;">+${a.carts.length - 2}</div>` : ''}
                </div>

                <div class="pack-progress-container">
                    <div style="display:flex; justify-content:space-between; font-size:0.55rem; font-weight:800; color:#bbb; text-transform:uppercase;">
                        <span>Packning</span>
                        <span>${doneItems}/${totalItems.length}</span>
                    </div>
                    <div style="height:4px; background:#f0f0f0; border-radius:10px; margin-top:2px; overflow:hidden;">
                        <div style="height:100%; width:${progressPercent}%; background:${progressPercent === 100 ? '#2ecc71' : 'var(--fog-red)'}; transition:width 0.4s;"></div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderAvailability(area) {
    area.innerHTML = `
        <div class="section-title" style="margin-bottom:20px; font-weight:bold; color:var(--fog-brown);">Företagsbilar</div>
        <div class="fleet-grid">
            ${cars.filter(c => c.isVisible !== false).map(c => `
                <div class="unit-card">
                    <i class="fas fa-truck-pickup"></i>
                    <h4>${c.id}</h4>
                    <span class="status-tag ${c.status === 'Ledig' ? 'bg-ledig' : 'bg-upptagen'}">${c.status}</span>
                </div>
            `).join('')}
        </div>
        
        <div class="section-title" style="margin:40px 0 20px; font-weight:bold; color:var(--fog-brown);">Släpvagnar</div>
        <div class="fleet-grid">
            ${trailers.filter(t => t.isVisible !== false).map(t => `
                <div class="unit-card">
                    <i class="fas fa-trailer"></i>
                    <h4>${t.id}</h4>
                    <span class="status-tag ${t.status === 'Ledig' ? 'bg-ledig' : 'bg-upptagen'}">${t.status}</span>
                </div>
            `).join('')}
        </div>
        
        <div class="section-title" style="margin:40px 0 20px; font-weight:bold; color:var(--fog-brown);">Kaffevagnar</div>
        <div class="fleet-grid">
            ${carts.filter(c => c.isVisible !== false).map(c => `
                <div class="unit-card">
                    <i class="fas fa-coffee"></i>
                    <h4>${c.id}</h4>
                    <span class="status-tag ${c.status === 'Ledig' ? 'bg-ledig' : 'bg-upptagen'}">${c.status}</span>
                </div>
            `).join('')}
        </div>
    `;
}

// Uppdaterar vagnens lista när man byter mall i dropdown-menyn
window.updateTemplateItems = () => {
    const data = window.pendingAssignmentData;
    if (!data || !packingTemplates) return; // Vänta tills mallarna är laddade

    const carTemplateName = data.carTemplate;
    const cartTemplateName = data.cartTemplate;
    const numDays = parseInt(data.numDays) || 1;
    const selectedCar = data.carId;
    const selectedCarts = data.selectedCarts || [];

    window.unitChecklists = {};

    // 1. FÖRETAGSBILEN
    if (selectedCar) {
        let carList = [];
        const carTmpl = packingTemplates.car.find(t => t.name === carTemplateName);
        
        if (carTmpl) {
            carList.push({ type: 'header', sectionId: 'base', name: `Basutrustning: ${carTemplateName}`, unitId: selectedCar });
            carTmpl.items.forEach(item => {
                const displayName = typeof item === 'string' ? item : `${item.q}x ${item.n}`;
                carList.push({ name: displayName, done: false, type: 'item', sectionId: 'base', unitId: selectedCar });
            });
        }
        window.unitChecklists[selectedCar] = carList;
    }

    // 2. VAGNARNA
    const cartTmpl = packingTemplates.cart.find(t => t.name === cartTemplateName);
    if (cartTmpl) {
        selectedCarts.forEach(id => {
            window.unitChecklists[id] = [
                { type: 'header', sectionId: 'base', name: `Dag 1 - Lager i vagn`, unitId: id },
                ...cartTmpl.items.map(item => ({
                    name: `${item.q.toLocaleString('sv-SE')}x ${item.n}`,
                    done: false, type: 'item', sectionId: 'base', unitId: id 
                }))
            ];
        });
    }

    const keys = Object.keys(window.unitChecklists);
    if (keys.length > 0) window.activeUnitId = keys[0];
};

// --- HJÄLPFUNKTIONER ---
window.setActiveUnit = (id) => {
    window.activeUnitId = id;
    renderChecklist();
};

window.toggleSection = (sectionId) => {
    window.listSectionsExpanded[sectionId] = !window.listSectionsExpanded[sectionId];
    renderChecklist();
};

window.toggleFormCheck = (unitId, index) => {
    window.unitChecklists[unitId][index].done = !window.unitChecklists[unitId][index].done;
    renderChecklist();
};

function renderChecklist() {
    const container = document.getElementById('checklist-render-area');
    if (!container) return;

    const unitIds = Object.keys(window.unitChecklists);
    if (unitIds.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:40px; color:#aaa;"><p>Välj resurser och mallar.</p></div>`;
        return;
    }

    const currentList = window.unitChecklists[window.activeUnitId];
    const allDone = currentList.filter(i => i.type === 'item').every(i => i.done);
    // Hämta den generella noten (vi sparar den på själva checklist-objektet)
    const generalNote = window.unitChecklists[window.activeUnitId + "_note"] || "";

    container.innerHTML = `
        <div class="unit-tabs">
            ${unitIds.map(id => {
                const isDone = window.unitChecklists[id].filter(i => i.type === 'item').every(i => i.done);
                return `<button class="unit-tab ${window.activeUnitId === id ? 'active' : ''} ${isDone ? 'done' : ''}" 
                                onclick="window.setActiveUnit('${id}')">
                                    ${isDone ? '<i class="fas fa-check-circle"></i>' : ''}
                                    ${id}
                                </button>`;
            }).join('')}
        </div>

        <div class="checklist-header-flex">
            <h4>${window.activeUnitId}</h4>
            <button class="btn-select-all" onclick="window.toggleAllItems('${window.activeUnitId}')">
                <i class="fas ${allDone ? 'fa-undo' : 'fa-check-double'}"></i> 
                ${allDone ? 'Avmarkera alla' : 'Välj alla'}
            </button>
        </div>

        <div class="inner-list-container">
            ${currentList.map((item, i) => {
                if (item.type === 'header') {
                    const expanded = window.listSectionsExpanded[item.sectionId];
                    return `<div class="list-group-header" onclick="window.toggleSection('${item.sectionId}')">
                                <span>${item.name}</span>
                                <i class="fas fa-chevron-${expanded ? 'up' : 'down'}"></i>
                            </div>`;
                }
                if (!window.listSectionsExpanded[item.sectionId]) return '';
                
                // RENSAD RAD: Bara namn och checkbox
                return `
                    <div class="form-check-item ${item.done ? 'checked' : ''}" onclick="window.toggleFormCheck('${window.activeUnitId}', ${i})">
                        <span class="item-text-content">${item.name}</span>
                        <i class="${item.done ? 'fas fa-check-square' : 'far fa-square'} item-check-icon"></i>
                    </div>`;
            }).join('')}

            <div class="general-note-section">
                <label class="note-label"><i class="fas fa-sticky-note"></i> Noteringar för ${window.activeUnitId}</label>
                <textarea 
                    placeholder="Skriv om du t.ex. plockat extra av något..." 
                    onchange="window.updateGeneralUnitNote('${window.activeUnitId}', this.value)"
                    class="general-note-textarea">${generalNote}</textarea>
            </div>
        </div>
    `;
}

// Ny funktion för att spara den generella noten
window.updateGeneralUnitNote = (unitId, val) => {
    window.unitChecklists[unitId + "_note"] = val;
    console.log(`Generell notering sparad för ${unitId}: ${val}`);
};

function renderCreate(area) {
    const editData = editingAssignmentId ? assignments.find(a => a.id === editingAssignmentId) : null;
    const saved = window.pendingAssignmentData || {};

    const today = new Date().toLocaleDateString('sv-SE'); 
    let defaultStart = editData?.startDate || selectedStartDate || saved.startDate || today;
    let defaultEnd = editData?.endDate || selectedStartDate || saved.endDate || today;

    if (!window.isPackingPhase) {
        area.innerHTML = `
            <div class="create-view-container single-column">
                <div class="form-container compact-form">
                    <div class="panel-header">
                        <h3 class="section-title"><i class="fas fa-edit"></i> Steg 1: Eventdetaljer</h3>
                    </div>
                    <div class="inner-scroll-area">
                        <div class="form-grid">
                            <div class="form-group">
                                <label>Namn på event</label>
                                <input type="text" id="event-name" value="${saved.event || editData?.event || ''}" class="modern-input" placeholder="Ex: Företagsevent Malmö">
                            </div>
                            <div class="form-group">
                                <label>Affärsområde</label>
                                <select id="sel-area" class="modern-select">
                                    ${['Event', 'Catering', 'Street', 'FPJ'].map(area => `
                                        <option value="${area}" ${(saved.businessArea || editData?.businessArea || 'Event') === area ? 'selected' : ''}>${area}</option>
                                    `).join('')}
                                </select>
                            </div>
                        </div>
                        <div class="form-grid">
                            <div class="form-group">
                                <label>Startdatum</label>
                                <input type="date" id="start-date" value="${defaultStart}" class="modern-input" onclick="this.showPicker()">
                            </div>
                            <div class="form-group">
                                <label>Slutdatum</label>
                                <input type="date" id="end-date" value="${defaultEnd}" class="modern-input" onclick="this.showPicker()">
                            </div>
                        </div>

                        <h3 class="section-title" style="margin-top:20px;"><i class="fas fa-truck-loading"></i> Resurser & Mallar</h3>
                        <div class="form-grid">
                            <div class="form-group">
                                <label>Transportbil</label>
                                <select id="sel-car" class="modern-select">
                                    <option value="">Välj Transportbil</option>
                                    ${cars.filter(c => c.isVisible !== false).map(c => `
                                        <option value="${c.id}" ${(saved.carId || editData?.car) === c.id ? 'selected' : ''}>${c.id}</option>
                                    `).join('')}
                                </select>
                            </div>
                            <div class="form-group">
                                <label>Släpvagn</label>
                                <select id="sel-trailer" class="modern-select">
                                    <option value="">Välj Släp</option>
                                    ${trailers.filter(t => t.isVisible !== false).map(t => `
                                        <option value="${t.id}" ${(saved.trailerId || editData?.trailer) === t.id ? 'selected' : ''}>${t.id}</option>
                                    `).join('')}
                                </select>
                            </div>
                        </div>
                        
                        <div class="form-grid">
                            <div class="form-group">
                                <label>Packmall Transportbil</label>
                                <select id="sel-car-template" class="modern-select">
                                    <option value="">Välj mall</option>
                                    ${packingTemplates ? packingTemplates.car.map(t => `
                                        <option value="${t.name}" ${(saved.carTemplate || editData?.carTemplate) === t.name ? 'selected' : ''}>${t.name}</option>
                                    `).join('') : '<option disabled>Laddar mallar...</option>'}
                                </select>
                            </div>
                             <div class="form-group">
                                <label>Antal försäljningsdagar</label>
                                <input type="number" id="num-days" value="${saved.numDays || 1}" min="1" class="modern-input">
                            </div>
                        </div>

                        <div class="form-grid">
                            <div class="form-group">
                                <label>Packmall Fogarollibil (Tkr)</label>
                                <select id="sel-cart-template" class="modern-select">
                                    <option value="">Välj mall</option>
                                    ${packingTemplates ? packingTemplates.cart.map(t => `
                                        <option value="${t.name}" ${(saved.cartTemplate || editData?.cartTemplate) === t.name ? 'selected' : ''}>${t.name}</option>
                                    `).join('') : '<option disabled>Laddar mallar...</option>'}
                                </select>
                            </div>
                        </div>

                        <div class="form-group">
                            <label>Välj Fogarollibilar</label>
                            <div class="cart-chip-container">
                                ${carts.filter(c => c.isVisible !== false).map(c => {
                                    const isChecked = (saved.selectedCarts || editData?.carts || []).includes(c.id);
                                    return `
                                        <label class="cart-chip">
                                            <input type="checkbox" name="selected-carts" value="${c.id}" hidden ${isChecked ? 'checked' : ''}>
                                            <div class="chip-content"><i class="fas fa-coffee"></i> <span>${c.id}</span></div>
                                        </label>`;
                                }).join('')}
                            </div>
                        </div>
                    </div>
                    <div class="form-footer">
                        <button class="btn-primary-modern" onclick="window.goToPacking()">
                            Fortsätt till Packlistor <i class="fas fa-arrow-right"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    } else {
        // STEG 2: PACKLISTOR
        area.innerHTML = `
            <div class="create-view-container single-column">
                <div class="form-container compact-form">
                    <div class="panel-header" style="display:flex; justify-content:space-between; align-items:center;">
                        <h3 class="section-title" style="margin:0;"><i class="fas fa-clipboard-check"></i> Steg 2: Packa Enheter</h3>
                        <button class="btn-edit-details" onclick="window.isPackingPhase = false; window.render();">
                            <i class="fas fa-edit"></i> Ändra eventdetaljer
                        </button>
                    </div>
                    
                    <div class="inner-scroll-area" id="checklist-render-area">
                        </div>

                    <div class="form-footer" style="display:flex; justify-content: space-between; align-items:center; padding: 15px 35px; border-top: 1px solid #eee;">
                        <div>
                            ${editingAssignmentId ? `
                                <button class="btn-delete-main" onclick="window.deleteAssignment('${editingAssignmentId}')" style="color:#e30613; border:none; background:none; cursor:pointer; font-weight:bold; display:flex; align-items:center; gap:8px;">
                                    <i class="fas fa-trash-alt"></i> RADERA UPPDRAG
                                </button>
                            ` : ''}
                        </div>

                        <div style="display:flex; gap:10px;">
                            <button class="btn-secondary-modern" onclick="window.cancelCreate()">Avbryt</button>
                            <button class="btn-primary-modern" onclick="window.saveAssignment()" style="background:var(--fog-brown);">
                                <i class="fas fa-check-double"></i> SLUTFÖR & SPARA UPPDRAG
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        renderChecklist();
    }
}

function renderMap(area) {
    area.innerHTML = `<div id="map"></div>`;
    setTimeout(() => {
        map = L.map('map').setView([55.6050, 13.0038], 7);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

        assignments.forEach(a => {
            // FIX: Kontrollera om a.location finns innan toLowerCase() körs
            const locationStr = a.location || "";
            const coords = locationStr.toLowerCase().includes('malmö') ? [55.6050, 13.0038] : [56.0465, 12.6945];

            L.marker(coords).addTo(map).bindPopup(`<b>${a.event}</b><br>Bil: ${a.car}<br>Släp: ${a.trailer}<br>Vagn: ${a.carts}`);
        });
    }, 100);
}

// --- FIREBASE LISTENERS ---
onSnapshot(collection(db, "assignments"), (snap) => {
    assignments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    render();
});
onSnapshot(collection(db, "cars"), (snap) => {
    cars = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    render();
});
onSnapshot(collection(db, "trailers"), (snap) => {
    trailers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    render();
});
onSnapshot(collection(db, "carts"), (snap) => {
    carts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    render();
});

// --- ACTIONS ---
window.saveAssignment = async () => {
    try {
        const data = window.pendingAssignmentData;

        if (!data) {
            alert("Kunde inte hitta uppdragsdata. Gå tillbaka till steg 1 och försök igen.");
            return;
        }

        const carId = data.carId || "Ej kopplad";
        const trailerId = data.trailerId || "Ej kopplad";
        const selectedCarts = data.selectedCarts || []; 
        const start = data.startDate || "";
        const end = data.endDate || "";
        const eventName = data.event || "Namnlöst event";
        const businessArea = data.businessArea || "Event";

        // 1. Konfliktkontroll
        let conflicts = [];
        assignments.forEach(a => {
            if (a.id !== editingAssignmentId) {
                const overlap = (start <= a.endDate && end >= a.startDate);
                if (overlap) {
                    if (carId !== "Ej kopplad" && a.car === carId) conflicts.push(`Bil: ${carId}`);
                    if (trailerId !== "Ej kopplad" && a.trailer === trailerId) conflicts.push(`Släp: ${trailerId}`);
                    selectedCarts.forEach(c => {
                        if (a.carts && a.carts.includes(c)) conflicts.push(`Vagn: ${c}`);
                    });
                }
            }
        });

        if (conflicts.length > 0) {
            const proceed = confirm(`VARNING: Följande resurser är redan bokade:\n\n${conflicts.join('\n')}\n\nVill du boka ändå?`);
            if (!proceed) return;
        }

        // 2. Förbered packlistor & Statuskontroll
        const finalCarItems = window.unitChecklists[carId] || [];

        // Samla alla vagnars listor till en gemensam array för statuskontroll i kalendern
        let allCartItems = [];
        selectedCarts.forEach(id => {
            if (window.unitChecklists[id]) {
                // Vi tar hela listan (inklusive headers) för varje vagn
                allCartItems = allCartItems.concat(window.unitChecklists[id]);
            }
        });

        // Filtrera ut endast produkter (items) för att se om allt är packat
        // Vi ignorerar rubriker (headers) eftersom de aldrig kan bli "done"
        const carItemsOnly = finalCarItems.filter(i => i.type === 'item');
        const cartItemsOnly = allCartItems.filter(i => i.type === 'item');

        const isCarDone = carItemsOnly.length === 0 || carItemsOnly.every(i => i.done);
        const isCartsDone = cartItemsOnly.length === 0 || cartItemsOnly.every(i => i.done);
        
        // Om allt i både bil och vagnar är ibockat är hela uppdraget "Klar"
        const isAllDone = isCarDone && isCartsDone;

        const assData = {
            event: eventName,
            businessArea: businessArea,
            startDate: start,
            endDate: end,
            car: carId,
            trailer: trailerId,
            carts: selectedCarts,
            carTemplate: data.carTemplate || "",
            cartTemplate: data.cartTemplate || "",
            numDays: data.numDays || 1,

            // Uppdaterar status automatiskt till Klar om allt är ibockat
            step: isAllDone ? 'Klar' : 'Packar', 
            carItems: window.unitChecklists[carId] || [],
            cartItems: allCartItems, // Sparar den samlade listan så kalendern kan läsa av statusen
            expanded: false
        };

        if (editingAssignmentId) {
            await updateDoc(doc(db, "assignments", editingAssignmentId), assData);
        } else {
            await addDoc(collection(db, "assignments"), assData);
        }

        // 3. RENSA ALLT EFTER LYCKAD SPARNING
        editingAssignmentId = null;
        window.pendingAssignmentData = null;
        window.unitChecklists = {};
        window.isPackingPhase = false;

        window.showView('calendar', start);
    } catch (error) {
        console.error("Fel vid sparande:", error);
        alert("Ett fel uppstod vid sparande. Kontrollera konsolen.");
    }
};

window.deleteAssignment = async (id) => {
    if (confirm("Är du säker på att du vill radera detta uppdrag permanent?")) {
        try {
            await deleteDoc(doc(db, "assignments", id));
            if (editingAssignmentId === id) editingAssignmentId = null;
            showView('calendar'); // Gå tillbaka till dashboard efter radering
        } catch (error) {
            console.error("Fel vid radering:", error);
            alert("Ett fel uppstod vid radering.");
        }
    }
};

window.finishAssignment = async (id, car, trailer, carts) => {
    if (confirm("Vill du avsluta uppdraget?")) {
        await deleteDoc(doc(db, "assignments", id));
        if (car !== "Ej kopplad") await updateDoc(doc(db, "cars", car), { status: 'Ledig' });
        if (trailer !== "Ej kopplad") await updateDoc(doc(db, "trailers", trailer), { status: 'Ledig' });

        // Loopa igenom arrayen av vagnar och gör dem lediga
        if (Array.isArray(carts)) {
            for (const cartId of carts) {
                await updateDoc(doc(db, "carts", cartId), { status: 'Ledig' });
            }
        }
    }
};

window.updateCheck = async (id, list, idx) => {
    const ass = assignments.find(a => a.id === id);
    const newList = [...ass[list]];
    newList[idx].done = !newList[idx].done;
    await updateDoc(doc(db, "assignments", id), { [list]: newList });
};

// 1. Funktion för att markera alla/avmarkera alla i en lista
window.toggleAllItems = (unitId) => {
    const list = window.unitChecklists[unitId];
    // Kontrollera om alla redan är markerade
    const allDone = list.filter(i => i.type === 'item').every(i => i.done);

    // Ändra status på alla rader
    list.forEach(item => {
        if (item.type === 'item') item.done = !allDone;
    });

    renderChecklist();
};

// 2. Funktion för att avbryta och nollställa
window.cancelCreate = () => {
    editingAssignmentId = null;
    window.pendingAssignmentData = null;
    window.unitChecklists = {};
    window.isPackingPhase = false;
    window.showView('calendar');
};

window.toggleExpand = async (id, state) => {
    await updateDoc(doc(db, "assignments", id), { expanded: state });
};

window.updateStep = async (id, step) => {
    await updateDoc(doc(db, "assignments", id), { step: step });
};

document.getElementById('current-date').innerText = new Date().toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' });
showView('calendar');

window.updateComment = (unitId, index, val) => {
    if (window.unitChecklists[unitId] && window.unitChecklists[unitId][index]) {
        window.unitChecklists[unitId][index].comment = val;
        console.log(`Notering sparad för ${window.unitChecklists[unitId][index].name}: ${val}`);
    }
};

let logoClickCount = 0;
let logoClickTimer;

// Kör detta när sidan laddas för att återställa tidigare tillstånd
document.addEventListener('DOMContentLoaded', () => {
    const logo = document.querySelector('.logo-area'); 
    
    if (logo) {
        logo.addEventListener('click', async () => {
            logoClickCount++;
            
            // Återställ räknaren om man inte klickar snabbt nog (inom 2 sekunder)
            clearTimeout(logoClickTimer);
            logoClickTimer = setTimeout(() => { logoClickCount = 0; }, 2000);

            if (logoClickCount === 5) {
                logoClickCount = 0;
                const statsSnap = await getDoc(doc(window.db, "settings", "site_stats"));
                
                if (statsSnap.exists()) {
                    const data = statsSnap.data();
                    const dev = data.devices || {};
                    
                    // Skapa en snygg lista över enheter
                    let deviceList = Object.entries(dev)
                        .map(([name, count]) => `• ${name}: ${count} st`)
                        .join('\n');

                    alert(`☕ FOGAROLLI INSIGHTS\n\n` +
                        `Totala besök: ${data.totalVisits}\n\n` +
                        `ENHETER:\n${deviceList || "Ingen data än"}`);
                }
            }
        });
    }

    const isCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
    if (isCollapsed) {
        document.getElementById('sidebar').classList.add('collapsed');
    }
});


// Globala variabler för att hålla koll på grafer
let statsCharts = {};

// Hjälpfunktion för att dölja/visa den vita huvudmenyn i TV-läge
function toggleMainHeader(show) {
    const header = document.querySelector('.top-header');
    if (header) header.style.display = show ? 'flex' : 'none';
    const mainContent = document.querySelector('.main-content');
    if (mainContent) mainContent.style.padding = show ? '25px' : '0';
}

window.renderStatsView = (area) => {
    toggleMainHeader(true);
    
    const totalMissions = assignments.length;
    const completedMissions = assignments.filter(a => a.step === 'Klar').length;
    const fleetFix = [...cars, ...trailers, ...carts].filter(u => u.healthStatus === 'danger' || u.healthStatus === 'warn').length;

    area.innerHTML = `
        <div class="stats-dashboard-premium">
            <div class="premium-kpi-grid">
                <div class="p-kpi-card mission">
                    <span class="p-kpi-label">UPPDRAG</span>
                    <span class="p-kpi-total">${totalMissions}</span>
                    <div class="p-kpi-sub">Totalt genomförda</div>
                </div>
                <div class="p-kpi-card fix">
                    <span class="p-kpi-label">ATT ÅTGÄRDA</span>
                    <span class="p-kpi-total">${fleetFix}</span>
                    <div class="p-kpi-sub">Fordon & Släp</div>
                </div>
            </div>

            <div class="info-card-container">
                <div class="infographic-card">
                    <div class="card-info">
                        <h5>Affärsområden</h5>
                        <p>Fördelning av verksamhet</p>
                    </div>
                    <div class="chart-box">
                        <canvas id="chartArea"></canvas>
                        <div class="chart-center-label">
                            <span id="center-total">${totalMissions}</span>
                            <small>Event</small>
                        </div>
                    </div>
                </div>

                <div class="infographic-card">
                    <div class="card-info">
                        <h5>Fordonsutnyttjande</h5>
                        <p>Topp 5 mest använda</p>
                    </div>
                    <div class="chart-box-bar">
                        <canvas id="chartCarts"></canvas>
                    </div>
                </div>

                <div class="infographic-card">
                    <div class="card-info">
                        <h5>Packningseffektivitet</h5>
                        <p>Status på aktuella listor</p>
                    </div>
                    <div class="chart-box">
                        <canvas id="chartPacking"></canvas>
                    </div>
                </div>
            </div>
        </div>
    `;

    setTimeout(() => {
        initStatsCharts();
    }, 50);
};

// Uppdaterad graf-initialisering för en "mjukare" look
function initStatsCharts() {
    Object.values(statsCharts).forEach(chart => chart.destroy());

    // 1. Affärsområden (Doughnut med rundade hörn)
    const areaData = { 'Event': 0, 'Catering': 0, 'Street': 0, 'FPJ': 0 };
    assignments.forEach(a => { if(areaData[a.businessArea] !== undefined) areaData[a.businessArea]++; });

    statsCharts.area = new Chart(document.getElementById('chartArea'), {
        type: 'doughnut',
        data: {
            labels: Object.keys(areaData),
            datasets: [{
                data: Object.values(areaData),
                backgroundColor: ['#e30613', '#5c4033', '#2ecc71', '#f1c40f'],
                hoverOffset: 10,
                borderWidth: 0,
                borderRadius: 5
            }]
        },
        options: {
            cutout: '80%',
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(0,0,0,0.8)',
                    padding: 12,
                    cornerRadius: 10,
                    displayColors: false
                }
            },
            animation: { animateScale: true }
        }
    });

    // 2. Vagnar (Horisontella staplar med gradients-känsla)
    const cartUsage = {};
    assignments.forEach(a => {
        if (a.carts) a.carts.forEach(c => cartUsage[c] = (cartUsage[c] || 0) + 1);
    });
    const sortedCarts = Object.entries(cartUsage).sort((a,b) => b[1]-a[1]).slice(0, 5);

    statsCharts.carts = new Chart(document.getElementById('chartCarts'), {
        type: 'bar',
        data: {
            labels: sortedCarts.map(c => c[0]),
            datasets: [{
                data: sortedCarts.map(c => c[1]),
                backgroundColor: '#5c4033',
                borderRadius: 20,
                barThickness: 12
            }]
        },
        options: {
            indexAxis: 'y',
            scales: {
                x: { display: false },
                y: { grid: { display: false }, border: { display: false } }
            },
            plugins: { legend: { display: false } }
        }
    });

    // 3. Packstatus (Pie)
    const packStatus = { 'Klara': 0, 'Packas': 0 };
    assignments.forEach(a => { a.step === 'Klar' ? packStatus['Klara']++ : packStatus['Packas']++; });

    statsCharts.pack = new Chart(document.getElementById('chartPacking'), {
        type: 'pie',
        data: {
            labels: Object.keys(packStatus),
            datasets: [{
                data: Object.values(packStatus),
                backgroundColor: ['#2ecc71', '#e30613'],
                borderWidth: 0
            }]
        },
        options: {
            plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, usePointStyle: true } } }
        }
    });
}

window.openPackingDirectly = (id) => {
    // Vi använder din befintliga editAssignment men tvingar den till steg 2
    window.editAssignment(id);
    window.isPackingPhase = true; // HOPPA DIREKT TILL PACKLISTAN
    window.render();
};

window.renderTVDashboard = (area) => {
    toggleMainHeader(false); 
    const allUnits = [...cars, ...trailers, ...carts];
    
    // Rensa gammalt intervall om det finns
    if (tvRefreshInterval) clearInterval(tvRefreshInterval);

    // Starta nytt intervall (Var 5:e minut för data/väder, men klockan sköts i render)
    tvRefreshInterval = setInterval(() => {
        if (currentView === 'tv') window.render();
    }, 300000); // 300 000 ms = 5 min

    renderTVDashboard(area, assignments, allUnits);
};

window.toggleTVTheme = () => {
    const current = localStorage.getItem('tv-theme');
    localStorage.setItem('tv-theme', current === 'dark' ? 'light' : 'dark');
    window.renderTVDashboard(document.getElementById('content-area'));
};

function fleetAlertsCount() {
    return [...cars, ...trailers, ...carts].filter(u => u.healthStatus === 'danger' || u.healthStatus === 'warn').length;
}

window.render = () => {
    const area = document.getElementById('content-area');
    if (!area) return;

    // 1. Hantera TV-vyn separat (den sköter sin egen rensning och header)
    if (currentView === 'tv') {
        window.renderTVDashboard(area);
        return;
    }

    // 2. Rensa ytan och återställ headern för alla vanliga vyer
    area.innerHTML = '';
    toggleMainHeader(true);

    // 3. Kontrollera att mallar är laddade innan "Skapa uppdrag" ritas ut
    if (currentView === 'create' && !packingTemplates) {
        area.innerHTML = `
            <div style="padding:100px; text-align:center; color:var(--fog-brown);">
                <i class="fas fa-spinner fa-spin fa-2x"></i>
                <p style="margin-top:15px; font-weight:bold;">Hämtar packmallar från databasen...</p>
            </div>`;
        return;
    }

    // 4. Välj vy baserat på currentView
    if (currentView === 'dashboard') renderDashboard(area);
    if (currentView === 'create') renderCreate(area);
    if (currentView === 'availability') renderAvailabilityView(area, cars, trailers, carts, db, assignments);
    if (currentView === 'stats') renderStatsView(area);
    if (currentView === 'settings' || currentView === 'admin') renderAdminView(area); 
    if (currentView === 'calendar') renderCalendarView(assignments, db, cars, trailers, carts, selectedStartDate);
};

/* =============================================================
   ADMIN & SYSTEM: FORDONS- OCH MALLHANTERING (FIXAD)
   ============================================================= */

window.renderAdminView = async (area) => {
    const allUnits = [...cars, ...trailers, ...carts];
    
    area.innerHTML = `
        <div class="admin-container-vision">
            <div class="admin-card-vision">
                <div class="admin-card-header-minimal">
                    <h4><i class="fas fa-truck-pickup"></i> Fordonsparken</h4>
                    <span class="admin-unit-count">${allUnits.length} enheter</span>
                </div>
                
                <div class="admin-list-wrapper">
                    ${allUnits.length > 0 ? allUnits.map(u => {
                        const isCar = cars.some(c => c.id === u.id);
                        const isTrailer = trailers.some(t => t.id === u.id);
                        const uType = isCar ? 'car' : isTrailer ? 'trailer' : 'cart';
                        const typeLabel = isCar ? 'BIL' : isTrailer ? 'SLÄP' : 'VAGN';

                        return `
                            <div class="admin-unit-item">
                                <div class="unit-info-side">
                                    <span class="unit-id-text">${u.id}</span>
                                    <span class="unit-type-tag ${uType}">${typeLabel}</span>
                                </div>
                                <div class="unit-control-side">
                                    <div class="visibility-toggle">
                                        <span class="toggle-label-text">Visa i Fleet</span>
                                        <label class="switch-ios">
                                            <input type="checkbox" ${u.isVisible !== false ? 'checked' : ''} 
                                                   onchange="window.toggleUnitVisibility('${u.id}', '${uType}', this.checked)">
                                            <span class="slider-ios"></span>
                                        </label>
                                    </div>
                                    <button class="btn-delete-minimal" onclick="window.deleteUnitPermanent('${u.id}', '${uType}')">
                                        <i class="fas fa-trash-alt"></i>
                                    </button>
                                </div>
                            </div>`;
                    }).join('') : '<div class="admin-empty">Inga fordon hittades.</div>'}
                </div>
            </div>

            <div class="admin-card-vision" style="margin-top: 30px;">
                <div class="admin-card-header-minimal">
                    <h4><i class="fas fa-boxes"></i> Packmallar</h4>
                </div>
                <div class="admin-template-action">
                    <button class="btn-primary-modern" onclick="window.initTemplateEditor()">
                        <i class="fas fa-edit"></i> Öppna Mall-editor
                    </button>
                    <div id="admin-template-editor-container" style="margin-top:20px;"></div>
                </div>
            </div>
        </div>
    `;
};

window.initTemplateEditor = async () => {
    const container = document.getElementById('admin-template-editor-container');
    const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
    const docSnap = await getDoc(doc(window.db, "settings", "packing_templates"));

    if (!docSnap.exists()) return alert("Inga mallar hittades. Kör migreringen i konsolen igen.");
    window.currentEditingTemplates = docSnap.data();

    container.innerHTML = `
        <div class="template-editor-ui">
            <select id="sel-template-to-edit" class="modern-select" style="margin-bottom:15px;" onchange="window.loadTemplateToEdit(this.value)">
                <option value="">Välj mall att ändra...</option>
                <optgroup label="Transportbilar">
                    ${window.currentEditingTemplates.car.map((t, i) => `<option value="car-${i}">${t.name}</option>`).join('')}
                </optgroup>
                <optgroup label="Kaffevagnar">
                    ${window.currentEditingTemplates.cart.map((t, i) => `<option value="cart-${i}">${t.name}</option>`).join('')}
                </optgroup>
            </select>
            <div id="template-items-list"></div>
        </div>
    `;
};

window.loadTemplateToEdit = (val) => {
    if (!val) return;
    const [type, index] = val.split('-');
    const template = window.currentEditingTemplates[type][index];
    const area = document.getElementById('template-items-list');

    if (!template || !template.items) return alert("Fel vid laddning av mall.");

    area.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; margin-top:20px;">
            <h5 style="margin:0; color:var(--fog-brown); font-weight:800;">${template.name}</h5>
            <button class="btn-select-all" onclick="window.addTemplateItem('${type}', ${index})">
                <i class="fas fa-plus"></i> Ny rad
            </button>
        </div>
        <div class="items-editor-grid" style="display:flex; flex-direction:column; gap:8px;">
            ${template.items.map((item, i) => {
                // Hanterar nu både gamla strängar och nya objekt för både bil och vagn
                const name = typeof item === 'string' ? item : (item.n || "");
                const qty = typeof item === 'string' ? 1 : (item.q || 1);

                return `
                    <div class="item-edit-row" style="display:flex; gap:8px;">
                        <input type="text" value="${name}" placeholder="Namn" style="flex:1; padding:10px; border:1px solid #ddd; border-radius:8px;" 
                               onchange="window.updateItemValue('${type}', ${index}, ${i}, 'n', this.value)">
                        <input type="number" step="0.01" value="${qty}" style="width:75px; padding:10px; border:1px solid #ddd; border-radius:8px;" 
                                     onchange="window.updateItemValue('${type}', ${index}, ${i}, 'q', this.value)">
                        <button onclick="window.removeTemplateItem('${type}', ${index}, ${i})" style="background:none; border:none; color:#e30613; padding:5px; cursor:pointer;">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>`;
            }).join('')}
        </div>
        <button class="btn-primary-modern" style="width:100%; margin-top:25px; background:var(--fog-brown);" onclick="window.saveTemplatesToFirebase()">
            <i class="fas fa-save"></i> SPARA ÄNDRINGAR I DATABASEN
        </button>
    `;
};

window.addTemplateItem = (type, tIdx) => {
    // Skapar alltid ett objekt med namn och antal nu
    window.currentEditingTemplates[type][tIdx].items.push({ n: "Ny artikel", q: 1 });
    window.loadTemplateToEdit(`${type}-${tIdx}`);
};

window.removeTemplateItem = (type, tIdx, iIdx) => {
    window.currentEditingTemplates[type][tIdx].items.splice(iIdx, 1);
    window.loadTemplateToEdit(`${type}-${tIdx}`);
};

window.updateItemValue = (type, tIdx, iIdx, key, val) => {
    const template = window.currentEditingTemplates[type][tIdx];
    let item = template.items[iIdx];
    
    // Om det gamla formatet var en sträng, konvertera till objekt vid ändring
    if (typeof item === 'string') {
        item = { n: item, q: 1 };
        template.items[iIdx] = item;
    }
    
    if (key === 'q') item.q = parseFloat(val) || 0;
    else item.n = val;
};

window.saveTemplatesToFirebase = async () => {
    const { doc, setDoc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
    await setDoc(doc(window.db, "settings", "packing_templates"), window.currentEditingTemplates);
    alert("Alla ändringar har sparats!");
};

window.toggleUnitVisibility = async (id, type, isVisible) => {
    const colMap = { car: 'cars', trailer: 'trailers', cart: 'carts' };
    const { doc, updateDoc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
    await updateDoc(doc(window.db, colMap[type], id), { isVisible: isVisible });
};

window.deleteUnitPermanent = async (id, type) => {
    if (!confirm(`Är du helt säker? Detta raderar ${id} permanent från databasen.`)) return;
    const colMap = { car: 'cars', trailer: 'trailers', cart: 'carts' };
    const { doc, deleteDoc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
    await deleteDoc(doc(window.db, colMap[type], id));
};


let deferredPrompt;

// 1. Registrera Service Worker
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js');
}

// 2. Lyssna efter installations-förfrågan
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    // Visa din egna "Installera app"-knapp här om du vill
    console.log("Appen är redo att installeras!");
    
    // Om du vill visa en knapp automatiskt i din Admin-vy t.ex:
    const adminArea = document.querySelector('.admin-container');
    if (adminArea) {
        const installBtn = document.createElement('button');
        installBtn.className = 'btn-primary-modern';
        installBtn.style.marginTop = '20px';
        installBtn.innerHTML = '<i class="fas fa-mobile-alt"></i> Installera som App';
        installBtn.onclick = async () => {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                if (outcome === 'accepted') deferredPrompt = null;
            }
        };
        adminArea.appendChild(installBtn);
    }
});

// Funktion för att visa iOS-instruktioner
window.showIOSInstallInstructions = () => {
    // 1. Kolla om det är iOS (iPhone/iPad)
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    
    // 2. Kolla om appen redan körs i "standalone" (installerat läge)
    const isStandalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;

    // Visa bara om det är iOS och INTE installerat
    if (isIOS && !isStandalone) {
        // Kolla om användaren redan stängt ner rutan denna session
        if (sessionStorage.getItem('ios_banner_closed')) return;

        const banner = document.createElement('div');
        banner.className = 'ios-install-banner';
        banner.innerHTML = `
            <div class="ios-banner-header">
                <h4>Installera Fogarolli-appen</h4>
                <button class="ios-close-btn" onclick="this.parentElement.parentElement.remove(); sessionStorage.setItem('ios_banner_closed', 'true');">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="ios-instruction-step">
                <div class="ios-icon-bg"><i class="fa-solid fa-arrow-up-from-bracket"></i></div>
                <span>Tryck på <strong>Dela-knappen</strong> i verktygsfältet längst ner.</span>
            </div>
            <div class="ios-instruction-step">
                <div class="ios-icon-bg"><i class="fa-regular fa-square-plus ios-add-icon"></i></div>
                <span>Skrolla ner och välj <strong>"Lägg till på hemskärmen"</strong>.</span>
            </div>
        `;
        document.body.appendChild(banner);
    }
};

// Kör kollen när sidan laddats
window.addEventListener('load', () => {
    setTimeout(window.showIOSInstallInstructions, 2000); // Vänta 2 sekunder innan rutan visas
});

// 2. Funktion för att spåra besök
const trackVisit = async () => {
    if (localStorage.getItem('fog_admin')) return;

    // Identifiera enhet
    let device = "Övrigt";
    const ua = navigator.userAgent;

    if (/android/i.test(ua)) device = "Android";
    else if (/iPhone|iPad|iPod/i.test(ua)) device = "iPhone/iOS";
    else if (/Macintosh/i.test(ua)) device = "Mac";
    else if (/Windows/i.test(ua)) device = "Windows";

    try {
        const statsRef = doc(window.db, "settings", "site_stats");
        await updateDoc(statsRef, {
            totalVisits: increment(1),
            [`devices.${device}`]: increment(1) // Skapar fält som devices.iPhone, devices.Android osv.
        });
    } catch (e) {
        // Om dokumentet inte finns, skapa det med startvärden
        await setDoc(doc(window.db, "settings", "site_stats"), { 
            totalVisits: 1,
            devices: { [device]: 1 }
        });
    }
};

// Kör spårningen direkt när sidan laddas
trackVisit();
