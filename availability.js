import { doc, updateDoc, arrayUnion, getDoc, collection, addDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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
    const now = new Date();

    const unitEvents = allEvents.filter(e => e.car === unit.id || (e.carts && e.carts.includes(unit.id)));
    const futureEvents = unitEvents.filter(e => new Date(e.startDate) >= now).sort((a,b) => new Date(a.startDate) - new Date(b.startDate));

    body.innerHTML = `
        <div class="bento-modal">
            <header class="modal-header-vision" style="padding:15px 25px; border-bottom:1px solid #eee; display:flex; justify-content:space-between; align-items:center;">
                <div style="display:flex; align-items:center; gap:12px;">
                    <i class="fas ${type === 'car' ? 'fa-truck-pickup' : 'fa-coffee'}" style="font-size:1.4rem; color:var(--fog-brown);"></i>
                    <h3 style="margin:0; font-weight:900;">${unit.id} <span style="background:#005a9e; color:white; padding:2px 6px; border-radius:4px; font-size:0.7rem; margin-left:8px;">${unit.regNo || ''}</span></h3>
                </div>
                ${hStatus === 'danger' ? `<div class="status-pulse-badge" style="background:#fff5f5; color:var(--fog-red); padding:5px 12px; border-radius:20px; font-weight:800; font-size:0.7rem;"><i class="fas fa-radiation"></i> KÖRFÖRBUD (DANGER)</div>` : ''}
                <button class="fm-close-icon" onclick="window.closeUnitModal()" style="border:none; background:#f5f5f5; width:30px; height:30px; border-radius:50%; cursor:pointer;"><i class="fas fa-times"></i></button>
            </header>

            <nav class="fm-nav-tabs" style="display:flex; gap:25px; padding:0 25px; border-bottom:1px solid #eee;">
                <button class="fm-tab-link ${activeTab === 'tab-overview' ? 'active' : ''}" onclick="window.switchModalTab(this, 'tab-overview')">Översikt & Planering</button>
                <button class="fm-tab-link ${activeTab === 'tab-journal' ? 'active' : ''}" onclick="window.switchModalTab(this, 'tab-journal')">Journal (${notes.length})</button>
            </nav>
            
            <div class="fm-viewport" style="flex:1; overflow:hidden; background:#fbfbfb;">
                <div id="tab-overview" class="fm-pane ${activeTab === 'tab-overview' ? 'active' : ''}" style="display:${activeTab === 'tab-overview' ? 'block' : 'none'};">
                    <div class="bento-grid-modal">
                        <div class="bento-box">
                            <span class="bento-title">Kommande Uppdrag</span>
                            <div class="fm-timeline-mini" style="max-height:300px; overflow-y:auto;">
                                ${futureEvents.length > 0 ? futureEvents.map(e => `
                                    <div style="padding:10px; border-bottom:1px solid #f9f9f9; display:flex; gap:15px; align-items:center;">
                                        <div style="color:#999; font-weight:800; font-size:0.7rem; min-width:80px;">${e.startDate}</div>
                                        <div style="flex:1;"><strong style="font-size:0.85rem;">${e.event}</strong><br><small style="color:#aaa;">Planerat</small></div>
                                    </div>
                                `).join('') : '<p style="color:#ccc; font-style:italic; padding:20px;">Inga bokade uppdrag.</p>'}
                            </div>
                        </div>

                        <div style="display:flex; flex-direction:column; gap:20px;">
                            <div class="bento-box">
                                <span class="bento-title">Teknisk Specifikation</span>
                                <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px;">
                                    <div class="spec-item">
                                        <label style="font-size:0.6rem; font-weight:800; color:#bbb; text-transform:uppercase;">Reg-nr</label>
                                        <div style="font-weight:700;">${unit.regNo || '---'}</div>
                                    </div>
                                    <div class="spec-item">
                                        <label style="font-size:0.6rem; font-weight:800; color:#bbb; text-transform:uppercase;">Nästa Besiktning</label>
                                        <input type="date" id="inp-next-insp" value="${unit.nextInspection || ''}" style="width:100%; border:1px solid #eee; padding:5px; border-radius:5px;">
                                    </div>
                                </div>
                                <button onclick="window.saveVehicleData('${unit.id}', '${type}')" style="width:100%; margin-top:15px; background:var(--fog-brown); color:white; border:none; padding:10px; border-radius:8px; cursor:pointer; font-weight:700;">Uppdatera Information</button>
                            </div>

                            <div class="bento-box">
                                <span class="bento-title">Systemstatus</span>
                                <div style="display:flex; gap:5px;">
                                    <button onclick="window.setFleetStatus('${unit.id}', '${type}', 'ok')" style="flex:1; padding:10px; border:1px solid #eee; border-radius:8px; background:${hStatus === 'ok' ? '#2ecc71' : 'white'}; color:${hStatus === 'ok' ? 'white' : '#666'}; font-weight:800;">OK</button>
                                    <button onclick="window.setFleetStatus('${unit.id}', '${type}', 'warn')" style="flex:1; padding:10px; border:1px solid #eee; border-radius:8px; background:${hStatus === 'warn' ? '#f1c40f' : 'white'}; color:${hStatus === 'warn' ? 'white' : '#666'}; font-weight:800;">BRIST</button>
                                    <button onclick="window.setFleetStatus('${unit.id}', '${type}', 'danger')" style="flex:1; padding:10px; border:1px solid #eee; border-radius:8px; background:${hStatus === 'danger' ? '#e30613' : 'white'}; color:${hStatus === 'danger' ? 'white' : '#666'}; font-weight:800;">FÖRBUD</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div id="tab-journal" class="fm-pane ${activeTab === 'tab-journal' ? 'active' : ''}" style="display:${activeTab === 'tab-journal' ? 'flex' : 'none'}; flex-direction:column; height:100%;">
                    <div id="chat-feed-v3" style="flex:1; overflow-y:auto; padding:20px;">
                        ${notes.length > 0 ? notes.map(n => `
                            <div class="bubble ${n.category === 'brist' ? 'brist' : 'info'} ${n.resolved ? 'resolved' : ''}">
                                <div class="meta" style="font-size:0.65rem; color:#999; margin-bottom:5px;">${n.author} • ${n.date}</div>
                                <div style="display:flex; justify-content:space-between; align-items:center;">
                                    <span>${n.text}</span>
                                    ${n.category === 'brist' && !n.resolved ? `<button onclick="window.resolveFleetNote('${unit.id}', '${type}', '${n.id}')" style="background:#2ecc71; color:white; border:none; padding:3px 10px; border-radius:5px; font-size:0.7rem; cursor:pointer;">Åtgärda</button>` : ''}
                                </div>
                            </div>
                        `).join('') : '<p style="text-align:center; color:#ccc; padding:40px;">Inga journalnoteringar.</p>'}
                    </div>
                    <div style="padding:15px; border-top:1px solid #eee; background:white; display:flex; gap:10px;">
                        <input type="text" id="chat-text-input" placeholder="Skriv i loggen..." style="flex:1; padding:10px 15px; border-radius:20px; border:1px solid #eee;">
                        <button onclick="window.saveFleetNote('${unit.id}', '${type}')" style="background:var(--fog-brown); color:white; border:none; width:40px; height:40px; border-radius:50%; cursor:pointer;"><i class="fas fa-paper-plane"></i></button>
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
