import { doc, updateDoc, arrayUnion, getDoc, collection, addDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

let dbInstance; 
let isMaintenanceExpanded = false;

export function initAvailabilityModule(db) {
    dbInstance = db;
}

export async function renderAvailabilityView(area, cars, trailers, carts, db, assignments = []) {
    dbInstance = db;
    
    const allUnits = [...cars, ...trailers, ...carts];
    const now = new Date();
    const oneYearAgo = new Date(); 
    oneYearAgo.setFullYear(now.getFullYear() - 1);

    // --- AUTOMATISK STATUS-UPPDATERING ---
    // (Samma logik som tidigare för att sätta 'danger' vid utgången besiktning)
    for (const u of allUnits) {
        const uType = cars.find(c => c.id === u.id) ? 'car' : trailers.find(t => t.id === u.id) ? 'trailer' : 'cart';
        if (uType !== 'cart') {
            const nextInsp = u.nextInspection ? new Date(u.nextInspection) : null;
            if (nextInsp && nextInsp < now && u.healthStatus !== 'danger') {
                const colMap = { car: 'cars', trailer: 'trailers', cart: 'carts' };
                await updateDoc(doc(db, colMap[uType], u.id), { 
                    healthStatus: 'danger',
                    notes: arrayUnion({
                        text: "SYSTEM: Status ändrad till Körförbud p.g.a. utgången besiktning.",
                        category: "besiktning",
                        author: "System",
                        date: new Date().toLocaleString('sv-SE'),
                        id: "sys-auto-" + Date.now()
                    })
                });
                u.healthStatus = 'danger';
            }
        }
    }

    // --- LOGIK FÖR EXPANDERING ---
    window.toggleMaintenanceExpand = () => {
        isMaintenanceExpanded = !isMaintenanceExpanded;
        // Rendera om hela vyn för att visa alla/färre kort
        renderAvailabilityView(area, cars, trailers, carts, db);
    };

    // Filtrera fram åtgärder
    const maintenanceAlerts = allUnits.filter(u => {
        const isCart = carts.find(c => c.id === u.id);
        const nextInsp = (!isCart && u.nextInspection) ? new Date(u.nextInspection) : null;
        const lastServ = u.lastService ? new Date(u.lastService) : null;
        return u.healthStatus === 'danger' || (nextInsp && nextInsp < now) || (lastServ && lastServ < oneYearAgo) || u.healthStatus === 'warn';
    });

    // Bestäm vilka kort som ska visas
    const visibleAlerts = isMaintenanceExpanded ? maintenanceAlerts : maintenanceAlerts.slice(0, 4);
    const extraCount = maintenanceAlerts.length > 4 ? maintenanceAlerts.length - 4 : 0;

    area.innerHTML = `
        <div class="fleet-container">
            <div class="maintenance-overview ${isMaintenanceExpanded ? 'is-expanded' : ''}">
                <div class="mo-header-flex">
                    <h4 class="mo-title"><i class="fas fa-clipboard-list"></i> Kritiska Åtgärder</h4>
                    ${maintenanceAlerts.length > 4 ? `
                        <span class="mo-more-badge clickable" onclick="window.toggleMaintenanceExpand()">
                            ${isMaintenanceExpanded ? 'Visa färre' : `+${extraCount} ytterligare`}
                        </span>
                    ` : ''}
                </div>
                <div class="mo-grid">
                    ${maintenanceAlerts.length > 0 ? visibleAlerts.map(u => {
                        const isCar = cars.find(c => c.id === u.id);
                        const isTrailer = trailers.find(t => t.id === u.id);
                        const uType = isCar ? 'car' : isTrailer ? 'trailer' : 'cart';
                        
                        const nextInsp = (uType !== 'cart' && u.nextInspection) ? new Date(u.nextInspection) : null;
                        const lastServ = u.lastService ? new Date(u.lastService) : null;
                        const isExpired = nextInsp && nextInsp < now;
                        const needsService = lastServ && lastServ < oneYearAgo;

                        return `
                            <div class="mo-card" onclick="window.openUnitDetail('${u.id}', '${uType}')">
                                <div class="mo-unit">
                                    <strong>${u.id}</strong>
                                    <span>${u.regNo || (uType === 'cart' ? 'Kaffevagn' : 'Enhet')}</span>
                                </div>
                                <div class="mo-alerts">
                                    ${isExpired ? '<span class="mo-tag danger">BESIKTNING</span>' : ''}
                                    ${needsService ? '<span class="mo-tag warn">SERVICE</span>' : ''}
                                    ${u.healthStatus === 'danger' && !isExpired ? '<span class="mo-tag danger">KÖRFÖRBUD</span>' : ''}
                                    ${u.healthStatus === 'warn' && !isExpired && !needsService ? '<span class="mo-tag warn">BRISTER</span>' : ''}
                                </div>
                                <i class="fas fa-chevron-right mo-arrow"></i>
                            </div>
                        `;
                    }).join('') : '<div class="mo-empty">Inga kritiska åtgärder krävs just nu.</div>'}
                </div>
            </div>

            <div class="fleet-sections-grid">
                ${renderFleetGroup('Företagsbilar', 'fa-truck-pickup', cars, 'car')}
                ${renderFleetGroup('Släpvagnar', 'fa-trailer', trailers, 'trailer')}
                ${renderFleetGroup('Kaffevagnar', 'fa-coffee', carts, 'cart')}
            </div>
        </div>
    `;

    window.updateChatStatusIcon = (select) => {
        const icon = document.getElementById('chat-icon-status');
        if (select.value === 'brist') {
            icon.className = 'fas fa-exclamation-triangle status-brist';
        } else {
            icon.className = 'fas fa-info-circle status-info';
        }
    };

    // --- GLOBALA FUNKTIONER ---
    window.openUnitDetail = (id, type) => {
        const list = type === 'car' ? cars : type === 'trailer' ? trailers : carts;
        const unit = list.find(u => u.id === id);
        if (unit) showUnitManagementModal(unit, type, db, 'tab-overview', assignments);
    };

    window.closeUnitModal = () => document.getElementById('unit-modal').style.display = 'none';

    window.switchModalTab = (btn, tabId) => {
        document.querySelectorAll('.fm-tab-link').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.fm-pane').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const pane = document.getElementById(tabId);
        if (pane) pane.classList.add('active');
        if (tabId === 'tab-journal') setTimeout(window.scrollToBottom, 50);
    };

    window.scrollToBottom = () => {
        const feed = document.getElementById('chat-feed-v3');
        if (feed) feed.scrollTop = feed.scrollHeight;
    };

    window.saveVehicleData = async (unitId, uType) => {
        const regNo = document.getElementById('inp-reg').value;
        const lastInsp = document.getElementById('inp-last-insp').value;
        const nextInsp = document.getElementById('inp-next-insp').value;
        const lastServ = document.getElementById('inp-last-serv').value;

        const colMap = { car: 'cars', trailer: 'trailers', cart: 'carts' };
        await updateDoc(doc(db, colMap[uType], unitId), {
            regNo, lastInspection: lastInsp, nextInspection: nextInsp, lastService: lastServ
        });
        
        const unitRef = await getDoc(doc(db, colMap[uType], unitId));
        showUnitManagementModal({id: unitRef.id, ...unitRef.data()}, uType, db, 'tab-overview');
    };

    window.setFleetStatus = async (id, uType, status) => {
        const colMap = { car: 'cars', trailer: 'trailers', cart: 'carts' };
        await updateDoc(doc(db, colMap[uType], id), { healthStatus: status });
        const unitRef = await getDoc(doc(db, colMap[uType], id));
        showUnitManagementModal({id: unitRef.id, ...unitRef.data()}, uType, db, 'tab-overview');
    };

    window.saveFleetNote = async (id, uType) => {
        const input = document.getElementById('chat-text-input');
        const text = input.value.trim();
        const category = document.getElementById('chat-cat-select').value;
        if (!text) return;

        const colMap = { car: 'cars', trailer: 'trailers', cart: 'carts' };
        const noteId = "id-" + Math.random().toString(36).substr(2, 9) + "-" + Date.now();
        
        await updateDoc(doc(db, colMap[uType], id), {
            notes: arrayUnion({
                text, category, author: 'Admin', date: new Date().toLocaleString('sv-SE'), id: noteId 
            })
        });
        input.value = '';
        const unitRef = await getDoc(doc(db, colMap[uType], id));
        showUnitManagementModal({id: unitRef.id, ...unitRef.data()}, uType, db, 'tab-journal');
    };

    window.deleteFleetNote = async (unitId, uType, noteId) => {
        if (!confirm("Radera meddelande?")) return;
        const colMap = { car: 'cars', trailer: 'trailers', cart: 'carts' };
        const docRef = doc(db, colMap[uType], unitId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            const updatedNotes = data.notes.filter(n => String(n.id) !== String(noteId));
            await updateDoc(docRef, { notes: updatedNotes });
            showUnitManagementModal({id: docSnap.id, ...data, notes: updatedNotes}, uType, db, 'tab-journal');
        }
    };

    window.resolveFleetNote = async (unitId, uType, noteId) => {
        const colMap = { car: 'cars', trailer: 'trailers', cart: 'carts' };
        const docRef = doc(db, colMap[uType], unitId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            const updatedNotes = data.notes.map(n => {
                if (String(n.id) === String(noteId)) return { ...n, resolved: true, resolvedDate: new Date().toLocaleString('sv-SE') };
                return n;
            });
            await updateDoc(docRef, { notes: updatedNotes });
            showUnitManagementModal({id: docSnap.id, ...data, notes: updatedNotes}, uType, db, 'tab-journal');
        }
    };
}

function renderFleetGroup(title, icon, items, type) {
    return `
        <div class="fleet-group">
            <h4 class="fleet-group-title"><span><i class="fas ${icon}"></i> ${title}</span><span>${items.length} st</span></h4>
            <div class="fleet-cards-grid">
                ${items.map(item => {
                    const hStatus = item.healthStatus || 'ok';
                    const notesCount = (item.notes || []).length;
                    return `
                    <div class="fleet-card hs-${hStatus}" onclick="window.openUnitDetail('${item.id}', '${type}')">
                        <div class="fleet-card-header"><span class="fleet-unit-id">${item.id}</span><div class="fleet-status-indicator"></div></div>
                        <div class="fleet-meta"><span><i class="far fa-comment-dots"></i> ${notesCount}</span><span class="status-text">${hStatus === 'ok' ? 'Driftklar' : hStatus === 'warn' ? 'Brist' : 'Akut'}</span></div>
                    </div>`;
                }).join('')}
            </div>
        </div>
    `;
}

export function showUnitManagementModal(unit, type, db, activeTab = 'tab-overview', allEvents = []) {
    const modal = document.getElementById('unit-modal');
    const body = document.getElementById('modal-body');
    const hStatus = unit.healthStatus || 'ok';
    const notes = unit.notes || [];
    const images = unit.attachedImages || [];
    
    // Beräkna användning
    const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(new Date().getDate() - 30);
    const unitEvents = (allEvents || []).filter(e => e.car === unit.id || (e.carts && e.carts.includes(unit.id)));
    const activeDays = unitEvents.filter(e => new Date(e.startDate) >= thirtyDaysAgo).length;
    const usagePercent = Math.round((activeDays / 30) * 100);

    const now = new Date();
    const nextInsp = unit.nextInspection ? new Date(unit.nextInspection) : null;
    const isInspExpired = nextInsp && now > nextInsp;

    // Status-konfiguration
    const statusCfg = {
        ok: { cl: 'ok', icon: 'fa-check-circle', txt: 'Driftklar' },
        warn: { cl: 'warn', icon: 'fa-exclamation-triangle', txt: 'Brist' },
        danger: { cl: 'danger', icon: 'fa-radiation', txt: 'Körförbud' }
    };
    const s = statusCfg[hStatus];

    // GENERERA 5 SENASTE LOGGAR (Punkt 2)
    const recentNotesHtml = notes.length > 0 ? [...notes].reverse().slice(0, 5).map(n => `
        <div class="bubble-vision ${n.category}">
            <div style="font-size:0.6rem; font-weight:700; opacity:0.5; margin-bottom:3px;">${n.author} • ${n.date}</div>
            <div style="font-size:0.8rem;">${n.text}</div>
        </div>
    `).join('') : '<p style="color:#ccc; font-size:0.8rem; font-style:italic; padding:10px;">Inga anteckningar i loggen.</p>';

    body.innerHTML = `
        <div class="bento-modal">
            <header class="modal-header-vision">
                <div style="display:flex; align-items:center; gap:12px;">
                    <i class="fas ${type === 'car' ? 'fa-truck-pickup' : 'fa-coffee'}" style="font-size: 1.2rem; color: var(--fog-brown)"></i>
                    <h3 style="margin:0; font-weight:900;">${unit.id} <span style="background:#005a9e; color:white; padding:2px 6px; border-radius:4px; font-size:0.7rem; margin-left:6px;">${unit.regNo || '---'}</span></h3>
                </div>
                <div class="header-right-actions">
                    <div class="status-pill-header ${s.cl}" style="padding:5px 12px; border-radius:20px; font-weight:900; font-size:0.65rem; display:flex; align-items:center; gap:6px; background:${hStatus === 'danger' ? '#fff5f5' : (hStatus === 'warn' ? '#fff9e6' : '#e6f9ed')}; color:${hStatus === 'danger' ? 'var(--fog-red)' : (hStatus === 'warn' ? '#f1c40f' : '#2ecc71')}; ${hStatus === 'danger' ? 'animation: badgePulse 2s infinite;' : ''}">
                        <i class="fas ${s.icon}"></i> ${s.txt}
                    </div>
                    <button class="fm-close-icon" onclick="window.closeUnitModal()" style="border:none; background:#f5f5f5; width:30px; height:30px; border-radius:50%; cursor:pointer;"><i class="fas fa-times"></i></button>
                </div>
            </header>

            <nav class="fm-nav-tabs">
                <button class="fm-tab-link ${activeTab === 'tab-overview' ? 'active' : ''}" onclick="window.switchModalTab(this, 'tab-overview')">Översikt</button>
                <button class="fm-tab-link ${activeTab === 'tab-journal' ? 'active' : ''}" onclick="window.switchModalTab(this, 'tab-journal')">Journal (${notes.length})</button>
            </nav>
            
            <div class="fm-viewport">
                <div id="tab-overview" class="fm-pane ${activeTab === 'tab-overview' ? 'active' : ''}">
                    <div class="bento-grid-modal">
                        <div style="display:flex; flex-direction:column; gap:15px;">
                            <div class="bento-box">
                                <span class="bento-title">Senaste Journalanteckningar</span>
                                <div style="margin-top:5px;">${recentNotesHtml}</div>
                            </div>
                            
                            <div class="bento-box">
                                <span class="bento-title">Bilder</span>
                                ${images.length > 0 ? `<div class="image-grid-overview">${images.map(url => `<div class="overview-img-wrapper"><img src="${url}"></div>`).join('')}</div>` : `
                                    <div class="empty-images-placeholder">
                                        <i class="fas fa-camera-retro"></i>
                                        <p>Inga bilder uppladdade</p>
                                    </div>
                                `}
                                <label style="display:block; text-align:center; margin-top:15px; font-size:0.65rem; color:var(--fog-brown); cursor:pointer; font-weight:850;">
                                    <i class="fas fa-plus-circle"></i> LADDA UPP NY BILD
                                    <input type="file" id="image-upload-input" hidden accept="image/*" onchange="window.handleImageUpload('${unit.id}', '${type}')">
                                </label>
                            </div>
                        </div>

                        <div style="display:flex; flex-direction:column; gap:15px;">
                            <div class="bento-box">
                                <span class="bento-title">Besiktning & Service</span>
                                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                                    <div>
                                        <label style="font-size:0.5rem; font-weight:800; color:#bbb;">SERVICE</label>
                                        <div style="font-weight:700; font-size:0.8rem;">${unit.lastService || '---'}</div>
                                    </div>
                                    <div>
                                        <label style="font-size:0.5rem; font-weight:800; color:#bbb;">BESIKTNING</label>
                                        <div style="font-weight:700; font-size:0.8rem; color:${isInspExpired ? 'var(--fog-red)' : 'inherit'};">
                                            ${unit.nextInspection || '---'} ${isInspExpired ? '<i class="fas fa-clock"></i>' : ''}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div class="usage-tile-vision">
                                <div class="percent">${usagePercent}%</div>
                                <div class="label">Bokad ${activeDays} av 30 dagar</div>
                            </div>

                            <div class="bento-box" style="padding:10px;">
                                <span class="bento-title">Systemstatus</span>
                                <div style="display:flex; gap:4px;">
                                    <button onclick="window.setFleetStatus('${unit.id}', '${type}', 'ok')" style="flex:1; padding:8px 0; border-radius:10px; border:1px solid #eee; font-weight:850; font-size:0.6rem; background:${hStatus === 'ok' ? '#2ecc71' : 'white'}; color:${hStatus === 'ok' ? 'white' : '#666'};">OK</button>
                                    <button onclick="window.setFleetStatus('${unit.id}', '${type}', 'warn')" style="flex:1; padding:8px 0; border-radius:10px; border:1px solid #eee; font-weight:850; font-size:0.6rem; background:${hStatus === 'warn' ? '#f1c40f' : 'white'}; color:${hStatus === 'warn' ? 'white' : '#666'};">BRIST</button>
                                    <button onclick="window.setFleetStatus('${unit.id}', '${type}', 'danger')" style="flex:1; padding:8px 0; border-radius:10px; border:1px solid #eee; font-weight:850; font-size:0.6rem; background:${hStatus === 'danger' ? '#e30613' : 'white'}; color:${hStatus === 'danger' ? 'white' : '#666'};">FÖRBUD</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div id="tab-journal" class="fm-pane ${activeTab === 'tab-journal' ? 'active' : ''}">
                    <div id="chat-feed-v3" style="flex:1; overflow-y:auto; padding:15px; background:#f9fcfb;">
                        ${notes.map(n => `
                            <div class="bubble-vision ${n.category}" style="border-left:4px solid ${n.category === 'brist' ? 'var(--fog-red)' : '#0078d4'}; padding:10px; background:white; margin-bottom:10px; border-radius:12px;">
                                <div style="font-size:0.6rem; opacity:0.5; margin-bottom:3px;">${n.author} • ${n.date}</div>
                                <div style="display:flex; justify-content:space-between; align-items:center;">
                                    <span style="font-size:0.85rem;">${n.text}</span>
                                    ${n.category === 'brist' && !n.resolved ? `<button onclick="window.resolveFleetNote('${unit.id}', '${type}', '${n.id}')" style="background:#2ecc71; color:white; border:none; padding:3px 10px; border-radius:5px; font-size:0.7rem; cursor:pointer;">Åtgärda</button>` : ''}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    <div style="padding:10px 15px; background:white; border-top:1px solid #eee; display:flex; gap:10px; align-items:center;">
                        <select id="chat-cat-select" style="padding:8px; border-radius:10px; border:1px solid #ddd; font-size:0.75rem; font-weight:800;">
                            <option value="info">Info</option>
                            <option value="brist">Brist</option>
                        </select>
                        <input type="text" id="chat-text-input" placeholder="Skriv i loggen..." style="flex:1; padding:10px 15px; border-radius:20px; border:1px solid #eee; outline:none; font-size:0.9rem;">
                        <button onclick="window.saveFleetNote('${unit.id}', '${type}')" style="background:var(--fog-brown); color:white; border:none; width:38px; height:38px; border-radius:50%; cursor:pointer;"><i class="fas fa-paper-plane"></i></button>
                    </div>
                </div>
            </div>
        </div>
    `;
    modal.style.display = 'flex';
}

function renderModernBubble(note, unitId, uType) {
    const isBrist = note.category === 'brist';
    const isResolved = note.resolved === true;
    let bubbleClass = isBrist ? 'brist' : 'info';
    if (isResolved) bubbleClass += ' resolved';

    return `
        <div class="fm-msg-row ${bubbleClass}">
            <div class="fm-msg-meta"><span class="fm-msg-author">${note.author || 'Admin'}</span> <span class="fm-msg-time">${note.date}</span></div>
            <div class="fm-bubble-flex-container">
                <div class="fm-msg-bubble">
                    <p>${note.text}${isResolved ? ` <small>(Åtgärdad ${note.resolvedDate})</small>` : ''}</p>
                    ${isBrist && !isResolved ? `<button class="btn-resolve-note" onclick="window.resolveFleetNote('${unitId}', '${uType}', '${note.id}')">Åtgärda</button>` : ''}
                </div>
                <button class="fm-delete-note-inline" onclick="window.deleteFleetNote('${unitId}', '${uType}', '${note.id}')"><i class="fas fa-trash-alt"></i></button>
            </div>
        </div>
    `;
}

const SYSTEM_LOG_ID = "main_system_log";

window.closeUnitModal = () => {
    const modal = document.getElementById('unit-modal');
    if (modal) modal.style.display = 'none';
};

window.openBugModal = async () => {
    if (!dbInstance) {
        alert("Databaskontakt saknas. Gå till Fleet-vyn en gång först.");
        return;
    }

    const modal = document.getElementById('unit-modal');
    const body = document.getElementById('modal-body');
    
    // Hämta det gemensamma dokumentet
    const docRef = doc(dbInstance, "bugreports", SYSTEM_LOG_ID);
    const docSnap = await getDoc(docRef);
    const currentContent = docSnap.exists() ? docSnap.data().text : "";

    body.innerHTML = `
        <div class="fm-premium-container" style="height: 600px; display: flex; flex-direction: column; background: #fff; border-radius:16px;">
            <header class="fm-header-slim">
                <div class="fm-id-block">
                    <i class="fas fa-file-alt" style="color: var(--fog-brown);"></i>
                    <div>
                        <h3>Gemensam Systemlogg</h3>
                        <small>Skriv och spara för att uppdatera dokumentet</small>
                    </div>
                </div>
                <button class="fm-close-icon" onclick="window.closeUnitModal()">
                    <i class="fas fa-times"></i>
                </button>
            </header>
            
            <div style="flex: 1; padding: 0;">
                <textarea id="bug-text-area" 
                    style="width: 100%; height: 100%; padding: 30px; border: none; outline: none; 
                           font-family: 'Courier New', monospace; font-size: 1rem; line-height: 1.6; 
                           resize: none; background: #fff; color: #333;" 
                    placeholder="Börja skriva i loggen...">${currentContent}</textarea>
            </div>
            
            <footer style="padding: 15px 20px; border-top: 1px solid #eee; background: #f9f9f9; display: flex; justify-content: flex-end;">
                <button class="btn-primary-modern" onclick="window.saveSystemLog()" 
                    style="background: var(--fog-brown); color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-weight: bold;">
                    <i class="fas fa-save"></i> Spara ändringar
                </button>
            </footer>
        </div>
    `;

    modal.style.display = 'flex';
};

window.saveSystemLog = async () => {
    const text = document.getElementById('bug-text-area').value;

    try {
        // setDoc skriver över det fasta dokumentet i Firebase
        await setDoc(doc(dbInstance, "bugreports", SYSTEM_LOG_ID), {
            text: text,
            lastUpdated: new Date().toLocaleString('sv-SE'),
            updatedBy: 'Admin'
        });

        alert("Systemloggen har uppdaterats!");
    } catch (e) {
        console.error("FirebaseError:", e);
        alert("Kunde inte spara ändringar. Kontrollera dina Firebase-regler.");
    }
};

window.handleImageUpload = async (unitId, uType) => {
    const fileInput = document.getElementById('image-upload-input');
    const file = fileInput.files[0];
    if (!file) return;

    try {
        const storage = getStorage();
        const storageRef = ref(storage, `fleet_images/${unitId}/${Date.now()}_${file.name}`);
        
        // 1. Ladda upp filen
        await uploadBytes(storageRef, file);
        const url = await getDownloadURL(storageRef);
        
        // 2. Uppdatera Firestore
        const colMap = { car: 'cars', trailer: 'trailers', cart: 'carts' };
        const docRef = doc(dbInstance, colMap[uType], unitId);
        
        // Hämta befintliga bilder först
        const docSnap = await getDoc(docRef);
        const currentImages = docSnap.data().attachedImages || [];
        
        await updateDoc(docRef, {
            attachedImages: [...currentImages, url]
        });
        
        // 3. Rendera om modalen
        const updatedDoc = await getDoc(docRef);
        showUnitManagementModal({id: unitId, ...updatedDoc.data()}, uType, dbInstance, 'tab-overview');
        alert("Bild uppladdad!");
    } catch (e) {
        console.error("Bilduppladdning misslyckades:", e);
        alert("Kunde inte ladda upp bild. Kontrollera Storage-inställningarna.");
    }
};


// Sök upp saveFleetNote i availability.js och uppdatera slutet av funktionen:
window.saveFleetNote = async (id, uType) => {
    const input = document.getElementById('chat-text-input');
    const catSelect = document.getElementById('chat-cat-select');
    if (!input || !catSelect) return;

    const text = input.value.trim();
    const category = catSelect.value;
    if (!text) return;

    const colMap = { car: 'cars', trailer: 'trailers', cart: 'carts' };
    const noteId = "id-" + Math.random().toString(36).substr(2, 9) + "-" + Date.now();
    
    await updateDoc(doc(dbInstance, colMap[uType], id), {
        notes: arrayUnion({
            text, category, author: 'Admin', date: new Date().toLocaleString('sv-SE'), id: noteId 
        })
    });

    input.value = '';
    const unitRef = await getDoc(doc(dbInstance, colMap[uType], id));
    
    // Rendera om modalen
    showUnitManagementModal({id: unitRef.id, ...unitRef.data()}, uType, dbInstance, 'tab-journal');
    
    // FIX: Tvinga scroll till botten direkt efter rendering
    setTimeout(() => {
        const feed = document.getElementById('chat-feed-v3');
        if (feed) feed.scrollTop = feed.scrollHeight;
    }, 100);
};
