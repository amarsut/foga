import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc, getDocs, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { renderCalendarView } from './calendar.js';
import { renderAvailabilityView } from './availability.js';

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
    authDomain: "fogarolli-logistics.firebaseapp.com.firebaseapp.com",
    projectId: "fogarolli-logistics",
    storageBucket: "fogarolli-logistics.firebasestorage.app.appspot.com",
    messagingSenderId: "274221920124",
    appId: "G-ZTPXPNDFT0"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

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

    // SÄKERHETSSPÄRR: Om vi inte redigerar något och går till create, 
    // se till att minnet är tomt.
    if (view === 'create' && !editingAssignmentId) {
        window.pendingAssignmentData = null;
        window.unitChecklists = {};
    }

    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const activeNav = document.querySelector(`[data-view="${view === 'dashboard' ? 'overview' : view}"]`);
    if (activeNav) activeNav.classList.add('active');

    const title = document.getElementById('view-title');
    title.innerText = view === 'dashboard' ? "Dashboard" :
        view === 'map' ? "Karta & Position" :
            view === 'create' ? "Skapa Nytt Uppdrag" :
                view === 'calendar' ? "Kalender" : "Fleet";

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
    return `
        <div class="mission-card">
            <div class="card-header" onclick="toggleExpand('${a.id}', ${!a.expanded})">
                <div class="unit-info"><span>Företagsbil</span><strong>${a.car}</strong></div>
                <div class="unit-info"><span>Släp</span><strong>${a.trailer}</strong></div>
                <div class="unit-info"><span>Kaffevagn</span><strong>${a.cart}</strong></div>
                <div class="event-info">
                    <strong>${a.event}</strong><br>
                    <small>${a.location} | <i class="far fa-calendar-alt"></i> ${a.startDate} — ${a.endDate}</small>
                </div>
                <div><span class="status-tag bg-upptagen">${a.step || 'Packar'}</span></div>
                <i class="fas fa-chevron-${a.expanded ? 'up' : 'down'}"></i>
            </div>
            ${a.expanded ? `
                <div class="expanded-content">
                    <div class="list-section">
                        <h4 style="color:var(--fog-red); margin-bottom:15px; font-size:0.8rem; text-transform:uppercase;"><i class="fas fa-truck"></i> Packlista Bil</h4>
                        ${a.carItems.map((item, i) => `
                            <div class="check-item ${item.done ? 'done' : ''}" onclick="updateCheck('${a.id}', 'carItems', ${i})">
                                <span><i class="${item.done ? 'fas fa-check-circle' : 'far fa-circle'}"></i> ${item.name}</span>
                            </div>
                        `).join('')}
                    </div>

                    <div class="list-section">
                        <h4 style="color:var(--fog-red); margin-bottom:15px; font-size:0.8rem; text-transform:uppercase;"><i class="fas fa-coffee"></i> Plocklista Vagn</h4>
                        ${a.cartItems ? a.cartItems.map((item, i) => `
                            <div class="check-item ${item.done ? 'done' : ''}" onclick="updateCheck('${a.id}', 'cartItems', ${i})">
                                <span><i class="${item.done ? 'fas fa-check-circle' : 'far fa-circle'}"></i> ${item.name}</span>
                            </div>
                        `).join('') : '<p>Ingen lista vald</p>'}
                    </div>

                    <div class="list-section">
                        <h4 style="color:var(--fog-red); margin-bottom:15px; font-size:0.8rem; text-transform:uppercase;"><i class="fas fa-tasks"></i> Fas & Åtgärd</h4>
                        <div style="display:flex; gap:10px; margin-top:10px;">
                            <button onclick="deleteAssignment('${a.id}')" class="btn-delete-small">
                                <i class="fas fa-trash-alt"></i> Radera
                            </button>
                            <button onclick="finishAssignment('${a.id}', '${a.car}', '${a.trailer}', '${a.carts}')" class="btn-finish">
                                <i class="fas fa-check-double"></i> Avsluta
                            </button>
                        </div>
                    </div>
                </div>
            ` : ''}
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
                        <span>${formatItemName(item.name)}</span>
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