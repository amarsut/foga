import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc, getDocs, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { renderCalendarView } from './calendar.js';
import { renderAvailabilityView, initAvailabilityModule } from './availability.js';
let currentCarItems = [];
let currentCartItems = [];

let currentCarChecklists = {};
let currentCartChecklists = {};

window.unitChecklists = {};
window.activeUnitId = null;
window.listSectionsExpanded = { base: true, refill: true };

window.carListVisible = true;
window.cartListVisible = true;
window.isPackingPhase = false;

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

// Mallar för packlistor
const PACKING_TEMPLATES = {
    car: {
        "Mall 1 (Low Capacity)": ["Parasoll", "Bord & stolar", "Kabel", "5kg bönor", "Muggar"],
        "Mall 2 (High Capacity)": ["Stort Tält", "4st Bord", "Långelkabel", "15kg bönor", "Muggar", "Vattentank"]
    },
    cart: {
        "15 Tkr": [
            { n: "Koppar 16 Oz (rör)", q: 4 }, { n: "Koppar 12 Oz (rör)", q: 5 }, { n: "Koppar 6 Oz (rör)", q: 2 }, { n: "Koppar 4 Oz (rör)", q: 1 }, { n: "Lock 12/16 Oz (rör)", q: 2 },
            { n: "Diskmedel (flaska)", q: 0.25 }, { n: "Rengöringsspray (flaska)", q: 0.25 },
            { n: "Hela bönor (kg)", q: 8 }, { n: "Malda bönor (kg)", q: 3 }, { n: "Kaffefilter (burk)", q: 0.5 }, { n: "Socker (låda)", q: 0.5 }, { n: "Rörpinnar (låda)", q: 0.5 },
            { n: "Earl Gray (st)", q: 7 }, { n: "Gottland (st)", q: 7 }, { n: "Öland (st)", q: 7 }, { n: "Sugrör (låda)", q: 0.5 },
            { n: "Servetter (påse)", q: 0.5 }, { n: "Torky (rulle)", q: 0.5 },
            { n: "Karamellsirap (flaska)", q: 1.5 }, { n: "Vaniljsirap (flaska)", q: 1.5 }, { n: "Sopsäckar (rulle)", q: 0.5 },
            { n: "Burk, malt (st)", q: 4 }, { n: "Burk, choklad (st)", q: 4 }, { n: "Burk, hela bönor (st)", q: 4 },
            { n: "Förkläde (st)", q: 2 }, { n: "Svarta trasor (st)", q: 4 }, { n: "Grå trasor (st)", q: 2 },
            { n: "Cantucci (burk)", q: 0.8 }, { n: "Chaipulver (burk)", q: 1.5 }, { n: "Chokladpåsar (st)", q: 6 },
            { n: "Mjölk (liter)", q: 40 }, { n: "Havremjölk (liter)", q: 8 }, { n: "Grädde (patron)", q: 4 },
            { n: "Puly caff (burk)", q: 0.25 }, { n: "Plasthandskar (låda)", q: 0.25 }, { n: "Vatten (liter)", q: 60 },
            { n: "Chokladbollar (st)", q: 45 }, { n: "Kakor (st)", q: 52 }, { n: "Muffins (st)", q: 72 }, { n: "Is (box)", q: 0.66 }
        ],
        "25 Tkr": [
            { n: "Koppar 16 Oz (rör)", q: 6 }, { n: "Koppar 12 Oz (rör)", q: 7 }, { n: "Koppar 6 Oz (rör)", q: 3 }, { n: "Koppar 4 Oz (rör)", q: 1 }, { n: "Lock 12/16 Oz (rör)", q: 4 },
            { n: "Diskmedel (flaska)", q: 0.25 }, { n: "Rengöringsspray (flaska)", q: 0.25 },
            { n: "Hela bönor (kg)", q: 10 }, { n: "Malda bönor (kg)", q: 4 }, { n: "Kaffefilter (burk)", q: 0.7 }, { n: "Socker (låda)", q: 0.5 }, { n: "Rörpinnar (låda)", q: 0.5 },
            { n: "Earl Gray (st)", q: 10 }, { n: "Gottland (st)", q: 10 }, { n: "Öland (st)", q: 10 }, { n: "Sugrör (låda)", q: 0.7 },
            { n: "Servetter (påse)", q: 0.5 }, { n: "Torky (rulle)", q: 0.5 },
            { n: "Karamellsirap (flaska)", q: 1.5 }, { n: "Vaniljsirap (flaska)", q: 1.5 }, { n: "Sopsäckar (rulle)", q: 0.5 },
            { n: "Burk, malt (st)", q: 4 }, { n: "Burk, choklad (st)", q: 4 }, { n: "Burk, hela bönor (st)", q: 4 },
            { n: "Förkläde (st)", q: 2 }, { n: "Svarta trasor (st)", q: 4 }, { n: "Grå trasor (st)", q: 2 },
            { n: "Cantucci (burk)", q: 1 }, { n: "Chaipulver (burk)", q: 2 }, { n: "Chokladpåsar (st)", q: 10 },
            { n: "Mjölk (liter)", q: 65 }, { n: "Havremjölk (liter)", q: 12 }, { n: "Grädde (patron)", q: 6 },
            { n: "Puly caff (burk)", q: 0.25 }, { n: "Plasthandskar (låda)", q: 0.25 }, { n: "Vatten (liter)", q: 60 },
            { n: "Chokladbollar (st)", q: 60 }, { n: "Kakor (st)", q: 72 }, { n: "Muffins (st)", q: 96 }, { n: "Is (box)", q: 1 }
        ],
        "40 Tkr": [
            { n: "Koppar 16 Oz (rör)", q: 9 }, { n: "Koppar 12 Oz (rör)", q: 12 }, { n: "Koppar 6 Oz (rör)", q: 3 }, { n: "Koppar 4 Oz (rör)", q: 2 }, { n: "Lock 12/16 Oz (rör)", q: 6 },
            { n: "Diskmedel (flaska)", q: 0.25 }, { n: "Rengöringsspray (flaska)", q: 0.25 },
            { n: "Hela bönor (kg)", q: 14 }, { n: "Malda bönor (kg)", q: 6 }, { n: "Kaffefilter (burk)", q: 1 }, { n: "Socker (låda)", q: 0.5 }, { n: "Rörpinnar (låda)", q: 0.5 },
            { n: "Earl Gray (st)", q: 15 }, { n: "Gottland (st)", q: 15 }, { n: "Öland (st)", q: 15 }, { n: "Sugrör (låda)", q: 1 },
            { n: "Servetter (påse)", q: 1 }, { n: "Torky (rulle)", q: 0.5 },
            { n: "Karamellsirap (flaska)", q: 2 }, { n: "Vaniljsirap (flaska)", q: 2 }, { n: "Sopsäckar (rulle)", q: 0.5 },
            { n: "Burk, malt (st)", q: 4 }, { n: "Burk, choklad (st)", q: 4 }, { n: "Burk, hela bönor (st)", q: 4 },
            { n: "Förkläde (st)", q: 2 }, { n: "Svarta trasor (st)", q: 4 }, { n: "Grå trasor (st)", q: 2 },
            { n: "Cantucci (burk)", q: 1 }, { n: "Chaipulver (burk)", q: 3 }, { n: "Chokladpåsar (st)", q: 14 },
            { n: "Mjölk (liter)", q: 73 }, { n: "Havremjölk (liter)", q: 12 }, { n: "Grädde (patron)", q: 10 },
            { n: "Puly caff (burk)", q: 0.25 }, { n: "Plasthandskar (låda)", q: 0.25 }, { n: "Vatten (liter)", q: 60 },
            { n: "Chokladbollar (st)", q: 90 }, { n: "Kakor (st)", q: 108 }, { n: "Muffins (st)", q: 96 }, { n: "Is (box)", q: 1 }
        ]
    }
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

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
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

    window.isPackingPhase = false; 
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

function renderDashboard(area) {
    const freeCars = cars.filter(c => c.status === 'Ledig').length;
    area.innerHTML = `
        <div class="stats-grid">
            <div class="stat-card"><h3>${assignments.length}</h3><p>Aktiva Uppdrag</p></div>
            <div class="stat-card"><h3>${freeCars}</h3><p>Lediga Bilar</p></div>
            <div class="stat-card"><h3>${assignments.filter(a => a.step === 'På plats').length}</h3><p>Vagnar på fältet</p></div>
        </div>
        <div class="mission-list">${assignments.map(a => renderMissionCard(a)).join('')}</div>
    `;
}

function renderMissionCard(a) {
    const isPackar = a.step === 'Packar';
    const startDate = new Date(a.startDate);
    const day = startDate.getDate();
    const month = startDate.toLocaleDateString('sv-SE', { month: 'short' });

    // Beräkna pack-progress
    const totalItems = (a.carItems || []).concat(a.cartItems || []).filter(i => i.type === 'item');
    const doneItems = totalItems.filter(i => i.done).length;
    const progressPercent = totalItems.length > 0 ? Math.round((doneItems / totalItems.length) * 100) : 0;

    return `
        <div class="mission-card" style="display:flex; padding:0; overflow:hidden; margin-bottom:15px;">
            <div class="date-badge">
                <span class="day">${day}</span>
                <span class="month">${month}</span>
            </div>
            <div style="padding: 15px; flex:1; display:flex; flex-direction:column; gap:8px;">
                <div style="display:flex; justify-content:space-between; align-items:start;">
                    <div>
                        <strong style="font-size:1.1rem; display:block;">${a.event}</strong>
                        <small style="color:#888;">${a.businessArea || 'Event'}</small>
                    </div>
                    <button onclick="toggleExpand('${a.id}', ${!a.expanded})" style="background:none; border:none; color:#ccc;">
                        <i class="fas fa-chevron-${a.expanded ? 'up' : 'down'}"></i>
                    </button>
                </div>

                <div class="resource-row">
                    ${a.car ? `<div class="res-pill"><i class="fas fa-truck"></i> ${a.car}</div>` : ''}
                    ${(a.carts || []).map(c => `<div class="res-pill"><i class="fas fa-coffee"></i> ${c}</div>`).join('')}
                </div>

                <div class="pack-progress-container" style="margin-top:5px;">
                    <div style="display:flex; justify-content:space-between; font-size:0.65rem; font-weight:800; color:#999; text-transform:uppercase; margin-bottom:4px;">
                        <span>Packning</span>
                        <span>${doneItems}/${totalItems.length} klart</span>
                    </div>
                    <div class="progress-bar-bg" style="height:6px; background:#eee; border-radius:10px; overflow:hidden;">
                        <div class="progress-fill" style="height:100%; background:${progressPercent === 100 ? 'var(--success)' : 'var(--fog-red)'}; width:${progressPercent}%; transition:width 0.5s;"></div>
                    </div>
                </div>

                ${a.expanded ? `
                    <div style="padding-top:10px; margin-top:5px; border-top:1px solid #f9f9f9; display:flex; gap:15px;">
                        <button onclick="window.editAssignment('${a.id}')" class="btn-edit-details" style="font-size:0.75rem;"><i class="fas fa-edit"></i> Redigera</button>
                        <button onclick="deleteAssignment('${a.id}')" style="background:none; border:none; color:var(--fog-red); font-size:0.75rem; cursor:pointer;">Radera</button>
                    </div>
                ` : ''}
            </div>
        </div>
    `;
}

function renderAvailability(area) {
    area.innerHTML = `
        <div class="section-title" style="margin-bottom:20px; font-weight:bold; color:var(--fog-brown);">Företagsbilar</div>
        <div class="fleet-grid">${cars.map(c => `<div class="unit-card"><i class="fas fa-truck-pickup"></i><h4>${c.id}</h4><span class="status-tag ${c.status === 'Ledig' ? 'bg-ledig' : 'bg-upptagen'}">${c.status}</span></div>`).join('')}</div>
        
        <div class="section-title" style="margin:40px 0 20px; font-weight:bold; color:var(--fog-brown);">Släpvagnar</div>
        <div class="fleet-grid">${trailers.map(c => `<div class="unit-card"><i class="fas fa-trailer"></i><h4>${c.id}</h4><span class="status-tag ${c.status === 'Ledig' ? 'bg-ledig' : 'bg-upptagen'}">${c.status}</span></div>`).join('')}</div>
        
        <div class="section-title" style="margin:40px 0 20px; font-weight:bold; color:var(--fog-brown);">Kaffevagnar</div>
        <div class="fleet-grid">${carts.map(c => `<div class="unit-card"><i class="fas fa-coffee"></i><h4>${c.id}</h4><span class="status-tag ${c.status === 'Ledig' ? 'bg-ledig' : 'bg-upptagen'}">${c.status}</span></div>`).join('')}</div>
    `;
}

// Uppdaterar vagnens lista när man byter mall i dropdown-menyn
window.updateTemplateItems = () => {
    const data = window.pendingAssignmentData;
    if (!data) return;

    // Kontroll för att behålla bockar vid redigering
    if (editingAssignmentId && Object.keys(window.unitChecklists).length > 0) {
        const ass = assignments.find(a => a.id === editingAssignmentId);
        if (ass && ass.carTemplate === data.carTemplate && ass.cartTemplate === data.cartTemplate &&
            ass.car === data.carId && JSON.stringify(ass.carts) === JSON.stringify(data.selectedCarts)) {
            
            // Säkerställ att vi har en aktiv flik vald även om vi returnerar tidigt
            if (!window.activeUnitId) window.activeUnitId = Object.keys(window.unitChecklists)[0];
            return; 
        }
    }

    const carTemplateName = data.carTemplate;
    const cartTemplateName = data.cartTemplate;
    const numDays = parseInt(data.numDays) || 1;
    const selectedCar = data.carId;
    const selectedCarts = data.selectedCarts || [];

    window.unitChecklists = {};

    // 1. FÖRETAGSBILEN (Basutrustning + Påfyllning)
    if (selectedCar) {
        let carList = [];
        if (carTemplateName && PACKING_TEMPLATES.car[carTemplateName]) {
            carList.push({ type: 'header', sectionId: 'base', name: `Basutrustning: ${carTemplateName}`, unitId: selectedCar });
            PACKING_TEMPLATES.car[carTemplateName].forEach(name => {
                carList.push({ name, done: false, type: 'item', sectionId: 'base', unitId: selectedCar });
            });
        }

        // --- REFILL-KALKYL START ---
        // Vi packar för (Dagar - 1) i bilen eftersom Dag 1 finns i vagnen. 
        // Vi multiplicerar med antal vagnar.
        const refillDaysTotal = Math.max(0, (numDays - 1) * selectedCarts.length);
        if (cartTemplateName && refillDaysTotal > 0 && PACKING_TEMPLATES.cart[cartTemplateName]) {
            carList.push({ type: 'header', sectionId: 'refill', name: `Sammanställd Påfyllning (${refillDaysTotal} extra dagsransoner)` });
            PACKING_TEMPLATES.cart[cartTemplateName].forEach(item => {
                carList.push({ 
                    name: `${(item.q * refillDaysTotal).toLocaleString('sv-SE')}x ${item.n}`, 
                    done: false, 
                    type: 'item',
                    sectionId: 'refill',
                    unitId: selectedCar
                });
            });
        }
        // --- REFILL-KALKYL SLUT ---
        window.unitChecklists[selectedCar] = carList;
    }

    // 2. VAGNARNA (Alltid 1 dagsranson i vagnen)
    selectedCarts.forEach(id => {
        if (cartTemplateName && PACKING_TEMPLATES.cart[cartTemplateName]) {
            window.unitChecklists[id] = [
                { type: 'header', sectionId: 'base', name: `Dag 1 - Lager i vagn`, unitId: id },
                ...PACKING_TEMPLATES.cart[cartTemplateName].map(item => ({
                    name: `${item.q.toLocaleString('sv-SE')}x ${item.n}`,
                    done: false,
                    type: 'item',
                    sectionId: 'base',
                    unitId: id 
                }))
            ];
        }
    });

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
    const formatItemName = (name) => name.replace(/^([\d,x]+)/, '<strong>$1</strong>');
    const allDone = currentList.filter(i => i.type === 'item').every(i => i.done);

    container.innerHTML = `
        <div class="unit-tabs">
            ${unitIds.map(id => {
        const isDone = window.unitChecklists[id].filter(i => i.type === 'item').every(i => i.done);
        // LÄGG TILL: En ikon om enheten är klar
        return `<button class="unit-tab ${window.activeUnitId === id ? 'active' : ''} ${isDone ? 'done' : ''}" 
                        onclick="window.setActiveUnit('${id}')">
                            ${isDone ? '<i class="fas fa-check-circle" style="color:#2ecc71; margin-right:5px;"></i>' : ''}
                            ${id}
                        </button>`;
    }).join('')}
        </div>

        <div class="checklist-header-flex" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; padding:0 5px;">
            <h4 style="color:var(--fog-red); margin:0; font-size:1.1rem; font-weight:800;">${window.activeUnitId}</h4>
            <button class="btn-select-all" onclick="window.toggleAllItems('${window.activeUnitId}')">
                <i class="fas ${allDone ? 'fa-undo' : 'fa-check-double'}"></i> 
                ${allDone ? 'Avmarkera alla' : 'Välj alla'}
            </button>
        </div>

        <div class="inner-list-container">
            ${currentList.map((item, i) => {
        // ... (resten av koden för headers och items är samma som förut)
        if (item.type === 'header') {
            const expanded = window.listSectionsExpanded[item.sectionId];
            return `<div class="list-group-header" onclick="window.toggleSection('${item.sectionId}')">
                                <span>${item.name}</span>
                                <i class="fas fa-chevron-${expanded ? 'up' : 'down'}"></i>
                            </div>`;
        }
        if (!window.listSectionsExpanded[item.sectionId]) return '';
        return `
                    <div class="form-check-item ${item.done ? 'checked' : ''}" onclick="window.toggleFormCheck('${window.activeUnitId}', ${i})">
                        <div class="item-content-wrapper">
                            <span class="item-main-text">
                                <strong>${item.qty || ''}${item.qty ? 'x ' : ''}</strong>${item.name}
                            </span>
                            
                            <div class="item-comment-area" onclick="event.stopPropagation()">
                                <input type="text" 
                                    placeholder="+ Notering (t.ex. 85x)" 
                                    value="${item.comment || ''}" 
                                    onchange="window.updateComment('${window.activeUnitId}', ${i}, this.value)"
                                    class="comment-input-transparent">
                            </div>
                        </div>
                        <i class="${item.done ? 'fas fa-check-square' : 'far fa-square'}"></i>
                    </div>`;
    }).join('')}
        </div>
    `;
}

function renderCreate(area) {
    const editData = editingAssignmentId ? assignments.find(a => a.id === editingAssignmentId) : null;
    // Hämta det temporärt sparade data-objektet
    const saved = window.pendingAssignmentData || {};

    if (!window.isPackingPhase) {
        // STEG 1: EVENTDETALJER
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
                                        <option value="${area}" ${(saved.businessArea || editData?.businessArea) === area ? 'selected' : ''}>${area}</option>
                                    `).join('')}
                                </select>
                            </div>
                        </div>
                        <div class="form-grid">
                            <div class="form-group">
                                <label>Startdatum</label>
                                <input type="date" id="start-date" value="${saved.startDate || editData?.startDate || (selectedStartDate || '')}" class="modern-input" onclick="this.showPicker()">
                            </div>
                            <div class="form-group">
                                <label>Slutdatum</label>
                                <input type="date" id="end-date" value="${saved.endDate || editData?.endDate || (selectedStartDate || '')}" class="modern-input" onclick="this.showPicker()">
                            </div>
                        </div>

                        <h3 class="section-title" style="margin-top:20px;"><i class="fas fa-truck-loading"></i> Resurser & Mallar</h3>
                        <div class="form-grid">
                            <div class="form-group">
                                <label>Transportbil</label>
                                <select id="sel-car" class="modern-select">
                                    <option value="">Välj Transportbil</option>
                                    ${cars.map(c => `<option value="${c.id}" ${(saved.carId || editData?.car) === c.id ? 'selected' : ''}>${c.id}</option>`).join('')}
                                </select>
                            </div>
                            <div class="form-group">
                                <label>Släpvagn</label>
                                <select id="sel-trailer" class="modern-select">
                                    <option value="">Välj Släp</option>
                                    ${trailers.map(t => `<option value="${t.id}" ${(saved.trailerId || editData?.trailer) === t.id ? 'selected' : ''}>${t.id}</option>`).join('')}
                                </select>
                            </div>
                        </div>
                        
                        <div class="form-grid">
                            <div class="form-group">
                                <label>Packmall Transportbil</label>
                                <select id="sel-car-template" class="modern-select">
                                    <option value="">-- Välj mall --</option>
                                    ${Object.keys(PACKING_TEMPLATES.car).map(t => `
                                        <option value="${t}" ${(saved.carTemplate || editData?.carTemplate) === t ? 'selected' : ''}>${t}</option>
                                    `).join('')}
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
                                    <option value="">-- Välj nivå --</option>
                                    ${Object.keys(PACKING_TEMPLATES.cart).map(t => `
                                        <option value="${t}" ${(saved.cartTemplate || editData?.cartTemplate) === t ? 'selected' : ''}>${t}</option>
                                    `).join('')}
                                </select>
                            </div>
                        </div>

                        <div class="form-group">
                            <label>Välj Fogarollibilar</label>
                            <div class="cart-chip-container">
                                ${carts.map(c => {
            // Kontrollera om vagnen finns i sparade listan eller i databasens lista
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

// Kör detta när sidan laddas för att återställa tidigare tillstånd
document.addEventListener('DOMContentLoaded', () => {
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
        <div class="stats-dashboard-compact">
            <div class="stats-kpi-row">
                <div class="kpi-box">
                    <div class="kpi-icon"><i class="fas fa-star"></i></div>
                    <div class="kpi-data">
                        <span class="kpi-val">${window.mostUsedCart || 'Andrea'}</span>
                        <span class="kpi-lab">Mest använd vagn</span>
                    </div>
                </div>
                <div class="kpi-box">
                    <div class="kpi-icon"><i class="fas fa-calendar-check"></i></div>
                    <div class="kpi-data">
                        <span class="kpi-val">${totalMissions}</span>
                        <span class="kpi-lab">Totalt Uppdrag</span>
                    </div>
                </div>
                <div class="kpi-box">
                    <div class="kpi-icon"><i class="fas fa-check-double"></i></div>
                    <div class="kpi-data">
                        <span class="kpi-val">${completedMissions}</span>
                        <span class="kpi-lab">Slutförda</span>
                    </div>
                </div>
                <div class="kpi-box warning">
                    <div class="kpi-icon"><i class="fas fa-tools"></i></div>
                    <div class="kpi-data">
                        <span class="kpi-val">${fleetFix}</span>
                        <span class="kpi-lab">Fordon att åtgärda</span>
                    </div>
                </div>
            </div>

            <div class="stats-main-grid">
                <div class="chart-container-card">
                    <h5>AFFÄRSOMRÅDEN</h5>
                    <canvas id="chartArea"></canvas>
                </div>
                <div class="chart-container-card">
                    <h5>NYTTJANDE FOGAROLLIBIL</h5>
                    <canvas id="chartCarts"></canvas>
                </div>
                <div class="chart-container-card">
                    <h5>NYTTJANDE TRANSPORTBIL</h5>
                    <canvas id="chartResources"></canvas>
                </div>
                <div class="chart-container-card">
                    <h5>PACK-STATUS (TOTALT)</h5>
                    <canvas id="chartPacking"></canvas>
                </div>
            </div>
        </div>
    `;

    // Rita graferna efter att DOM har laddats
    setTimeout(() => {
        initStatsCharts();
    }, 50);
};

function initStatsCharts() {
    // Förstör gamla grafer om de finns
    Object.values(statsCharts).forEach(chart => chart.destroy());

    // 1. Affärsområden
    const areaData = { 'Event': 0, 'Catering': 0, 'Street': 0, 'FPJ': 0 };
    assignments.forEach(a => { if(areaData[a.businessArea] !== undefined) areaData[a.businessArea]++; });

    statsCharts.area = new Chart(document.getElementById('chartArea'), {
        type: 'doughnut',
        data: {
            labels: Object.keys(areaData),
            datasets: [{
                data: Object.values(areaData),
                backgroundColor: ['#e30613', '#5c4033', '#2ecc71', '#f1c40f'],
                borderWidth: 0
            }]
        },
        options: { plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 10 } } } }, cutout: '70%' }
    });

    // 2. Fordonsutnyttjande
    const carUsage = {};
    assignments.forEach(a => { carUsage[a.car] = (carUsage[a.car] || 0) + 1; });
    const sortedCars = Object.entries(carUsage).sort((a,b) => b[1]-a[1]).slice(0, 5);

    statsCharts.res = new Chart(document.getElementById('chartResources'), {
        type: 'bar',
        data: {
            labels: sortedCars.map(c => c[0]),
            datasets: [{ label: 'Uppdrag', data: sortedCars.map(c => c[1]), backgroundColor: '#5c4033', borderRadius: 5 }]
        },
        options: { scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }, plugins: { legend: { display: false } } }
    });

    // 3. Packstatus
    const packStatus = { 'Klara': 0, 'Packas': 0 };
    assignments.forEach(a => { a.step === 'Klar' ? packStatus['Klara']++ : packStatus['Packas']++; });

    statsCharts.pack = new Chart(document.getElementById('chartPacking'), {
        type: 'pie',
        data: {
            labels: Object.keys(packStatus),
            datasets: [{ data: Object.values(packStatus), backgroundColor: ['#2ecc71', '#e30613'] }]
        },
        options: { plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 10 } } } } }
    });

    // 4. Räkna vagnutnyttjande/Fogarollibil
    const cartUsage = {};
    assignments.forEach(a => {
        if (a.carts && Array.isArray(a.carts)) {
            a.carts.forEach(cartId => {
                cartUsage[cartId] = (cartUsage[cartId] || 0) + 1;
            });
        }
    });
    
    // 2. Sortera för att visa de 5 mest använda vagnarna
    const sortedCarts = Object.entries(cartUsage)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
    
    // 3. Skapa grafen
    statsCharts.carts = new Chart(document.getElementById('chartCarts'), {
        type: 'bar',
        data: {
            labels: sortedCarts.map(c => c[0]),
            datasets: [{
                label: 'Antal Uppdrag',
                data: sortedCarts.map(c => c[1]),
                backgroundColor: '#e30613', // Fogarolli-röd för vagnarna
                borderRadius: 5
            }]
        },
        options: {
            indexAxis: 'y', // Pro-tip: Horisontella staplar är snyggt för vagnnamn
            scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } },
            plugins: { legend: { display: false } }
        }
    });
}

// ==========================================
// LAGER-TV MED TOGGLE OCH KOMPAKT DESIGN
// ==========================================
window.renderTVDashboard = (area) => {
    toggleMainHeader(false); 
    const now = new Date();
    const isDarkMode = localStorage.getItem('tv-theme') === 'dark';

    // Beräkna total dags-progress
    const allItems = assignments.flatMap(a => (a.carItems || []).concat(a.cartItems || [])).filter(i => i.type === 'item');
    const totalDone = allItems.filter(i => i.done).length;
    const totalProgress = allItems.length > 0 ? Math.round((totalDone / allItems.length) * 100) : 0;

    const upcoming = assignments
        .sort((a, b) => a.startDate.localeCompare(b.startDate))
        .slice(0, 6);

    const fleetAlerts = [...cars, ...trailers, ...carts]
        .filter(u => u.healthStatus === 'danger' || u.healthStatus === 'warn');

    area.innerHTML = `
        <div class="tv-screen ${isDarkMode ? 'dark-theme' : 'light-theme'}">
            <div class="tv-header-glass">
                <div class="tv-title-group">
                    <div class="tv-weather-widget">
                        <i class="fas fa-cloud-sun weather-icon"></i>
                        <div class="weather-text">
                            <span class="temp">2°C</span>
                            <span class="desc">Eslöv | Molnigt</span>
                        </div>
                    </div>
                    <h1>LOGISTIK-PLANERING</h1>
                </div>
                
                <div class="tv-total-progress-box">
                    <span class="label">TOTAL PACKSTATUS I DAG</span>
                    <div class="total-bar-container">
                        <div class="total-bar-fill" style="width: ${totalProgress}%"></div>
                        <span class="total-percent">${totalProgress}%</span>
                    </div>
                </div>

                <div class="tv-controls">
                    <div class="tv-clock-modern">
                        <span class="time">${now.toLocaleTimeString('sv-SE', {hour: '2-digit', minute:'2-digit'})}</span>
                        <span class="date">${now.toLocaleDateString('sv-SE')}</span>
                    </div>
                    <button onclick="window.toggleTVTheme()" class="theme-toggle-modern">
                        <i class="fas ${isDarkMode ? 'fa-sun' : 'fa-moon'}"></i>
                    </button>
                    <button onclick="window.showView('calendar')" class="tv-exit-modern"><i class="fas fa-times"></i></button>
                </div>
            </div>

            <div class="tv-layout-grid">
                <div class="tv-main-col">
                    <h3 class="tv-section-label">KOMMANDE PACKLISTOR</h3>
                    <div class="tv-mission-list">
                        ${upcoming.map(a => {
                            const total = (a.carItems || []).concat(a.cartItems || []).filter(i => i.type === 'item');
                            const done = total.filter(i => i.done).length;
                            const prog = total.length > 0 ? Math.round((done/total.length)*100) : 0;
                            return `
                                <div class="tv-card-glass ${prog === 100 ? 'complete' : ''}">
                                    <div class="tv-card-info">
                                        <span class="tv-event-title">${a.event}</span>
                                        <span class="tv-event-meta"><i class="fas fa-truck"></i> ${a.car} | <i class="far fa-calendar"></i> ${a.startDate}</span>
                                    </div>
                                    <div class="tv-card-progress">
                                        <div class="prog-label">${prog}%</div>
                                        <div class="prog-bar-bg"><div class="prog-bar-fill" style="width:${prog}%"></div></div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>

                <div class="tv-side-col">
                    <div class="side-section">
                        <h3 class="tv-section-label">FLEET STATUS</h3>
                        <div class="tv-fleet-list">
                            ${fleetAlerts.map(u => `
                                <div class="tv-fleet-tag-row ${u.healthStatus}">
                                    <span class="unit-name">${u.id}</span>
                                    <span class="status-badge">${u.healthStatus === 'danger' ? 'KÖRFORBUD' : 'BRIST'}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>

                    <div class="side-section info-section">
                        <h3 class="tv-section-label">DAGENS NOTERING</h3>
                        <div class="tv-info-card">
                            <i class="fas fa-info-circle"></i>
                            <p>Kom ihåg att ladda batterierna på vagn Andrea efter dagens pass. Inventering av bönor på fredag!</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
};

window.toggleTVTheme = () => {
    const current = localStorage.getItem('tv-theme');
    localStorage.setItem('tv-theme', current === 'dark' ? 'light' : 'dark');
    renderTVDashboard(document.getElementById('content-area'));
};

function fleetAlertsCount() {
    return [...cars, ...trailers, ...carts].filter(u => u.healthStatus === 'danger' || u.healthStatus === 'warn').length;
}

// Uppdatera din befintliga window.render-funktion i script.js
const originalRender = window.render;
window.render = () => {
    const area = document.getElementById('content-area');
    if (currentView === 'tv') {
        renderTVDashboard(area);
        return;
    }
    if (currentView === 'stats') {
        renderStatsView(area);
        return;
    }
    originalRender(); 
};
