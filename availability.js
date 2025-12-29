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

const getInitials = (name) => name ? name.split(' ').map(n => n[0]).join('').toUpperCase() : '?';

export function showUnitManagementModal(unit, type, db, activeTab = 'tab-overview', allEvents = []) {
    const modal = document.getElementById('unit-modal');
    const body = document.getElementById('modal-body');
    if (!modal || !body) return;

    const hStatus = unit.healthStatus || 'ok';
    const notes = unit.notes || [];
    const images = unit.attachedImages || [];
    const docs = unit.attachedDocs || []; // Dokument-arkiv
    
    // 1. Beräkna användning (Senaste 30 dagarna)
    const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(new Date().getDate() - 30);
    const unitEvents = (allEvents || []).filter(e => e.car === unit.id || (e.carts && e.carts.includes(unit.id)));
    const activeDays = unitEvents.filter(e => new Date(e.startDate) >= thirtyDaysAgo).length;
    const usagePercent = Math.round((activeDays / 30) * 100);

    // 2. Kontrollera besiktning och beräkna "Dagar kvar"
    const now = new Date();
    const nextInsp = unit.nextInspection ? new Date(unit.nextInspection) : null;
    const isInspExpired = nextInsp && now > nextInsp;

    let countdownText = "";
    let countdownClass = "";
    if (nextInsp) {
        const diffDays = Math.ceil((nextInsp - now) / (1000 * 60 * 60 * 24));
        if (diffDays < 0) {
            countdownText = "UTGÅNGEN!";
            countdownClass = "is-expired"; // Blinkande röd via CSS
        } else if (diffDays <= 30) {
            countdownText = `${diffDays} dagar kvar`;
            countdownClass = "is-urgent"; // Brun/varningsfärg
        } else {
            countdownText = `${diffDays} dagar kvar`;
            countdownClass = "is-safe"; // Grå
        }
    }

    // 3. Status-konfiguration för headern
    const statusCfg = {
        ok: { cl: 'ok', icon: 'fa-check-circle', txt: 'Driftklar', color: '#2ecc71', bg: '#e6f9ed' },
        warn: { cl: 'warn', icon: 'fa-exclamation-triangle', txt: 'Brist', color: '#f1c40f', bg: '#fff9e6' },
        danger: { cl: 'danger', icon: 'fa-radiation', txt: 'Körförbud', color: '#e30613', bg: '#fff5f5' }
    };
    const s = statusCfg[hStatus];

    // Hjälpfunktion för Teams-avatarer
    const getInitials = (name) => name ? name.split(' ').map(n => n[0]).join('').toUpperCase() : '?';

    // 4. GENERERA 5 SENASTE LOGGAR MED TEAMS-STIL
    const recentNotesHtml = notes.length > 0 ? [...notes].reverse().slice(0, 5).map(n => `
        <div class="mini-teams-row" style="display:flex; gap:10px; margin-bottom:10px;">
            <div class="teams-avatar" style="width:28px; height:28px; border-radius:50%; background:#d1d1d1; color:#444; display:flex; align-items:center; justify-content:center; font-size:0.65rem; font-weight:700; flex-shrink:0;">${getInitials(n.author)}</div>
            <div style="display:flex; flex-direction:column;">
                <div style="font-size:0.6rem; color:#616161; margin-bottom:2px;"><strong>${n.author}</strong> <span>${n.date}</span></div>
                <div class="teams-bubble" style="background:${n.category === 'brist' ? '#fff8f8' : 'white'}; padding:8px 12px; border-radius:0 8px 8px 8px; border:1px solid #e1dfdd; border-left: ${n.category === 'brist' ? '3px solid var(--fog-red)' : '1px solid #e1dfdd'};">
                    <p style="margin:0; font-size:0.8rem; line-height:1.4;">${n.text}</p>
                </div>
            </div>
        </div>
    `).join('') : '<p style="color:#ccc; font-size:0.8rem; font-style:italic; padding:10px;">Inga anteckningar i loggen.</p>';

    body.innerHTML = `
        <div class="bento-modal" style="width: 820px;">
            <header class="modal-header-vision" style="padding:15px 20px; border-bottom:1px solid #eee; display:flex; justify-content:space-between; align-items:center;">
                <div style="display:flex; align-items:center; gap:10px;">
                    <i class="fas ${type === 'car' ? 'fa-truck-pickup' : 'fa-coffee'}" style="font-size: 1.2rem; color: var(--fog-brown)"></i>
                    <h3 style="margin:0; font-weight:900; font-size:1.1rem;">${unit.id} <span style="background:#005a9e; color:white; padding:2px 6px; border-radius:4px; font-size:0.7rem; margin-left:6px;">${unit.regNo || '---'}</span></h3>
                </div>
                <div class="header-right-actions" style="display:flex; align-items:center; gap:12px;">
                    <div class="status-pill-header" style="padding:5px 12px; border-radius:20px; font-weight:900; font-size:0.65rem; display:flex; align-items:center; gap:6px; background:${s.bg}; color:${s.color}; ${hStatus === 'danger' ? 'animation: badgePulse 2s infinite;' : ''}">
                        <i class="fas ${s.icon}"></i> ${s.txt}
                    </div>
                    <button class="fm-close-icon" onclick="window.closeUnitModal()" style="border:none; background:#f5f5f5; width:30px; height:30px; border-radius:50%; cursor:pointer;"><i class="fas fa-times"></i></button>
                </div>
            </header>

            <nav class="fm-nav-tabs" style="padding: 0 20px; border-bottom: 1px solid #eee; display:flex; gap:20px;">
                <button class="fm-tab-link ${activeTab === 'tab-overview' ? 'active' : ''}" onclick="window.switchModalTab(this, 'tab-overview')">Översikt</button>
                <button class="fm-tab-link ${activeTab === 'tab-journal' ? 'active' : ''}" onclick="window.switchModalTab(this, 'tab-journal')">Journal (${notes.length})</button>
            </nav>
            
            <div class="fm-viewport" style="flex:1; overflow:hidden;">
                <div id="tab-overview" class="fm-pane ${activeTab === 'tab-overview' ? 'active' : ''}" style="display:${activeTab === 'tab-overview' ? 'block' : 'none'};">
                    <div class="bento-grid-modal" style="display:grid; grid-template-columns: 1fr 300px; gap:15px; padding:15px;">
                        
                        <div style="display:flex; flex-direction:column; gap:15px;">
                            <div class="bento-box">
                                <span class="bento-title">Senaste Loggar</span>
                                <div style="margin-top:5px;">${recentNotesHtml}</div>
                            </div>
                            
                            <div class="bento-box">
                                <span class="bento-title">Bilder & Dokumentation</span>
                                ${images.length > 0 ? `<div class="image-grid-overview" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(60px,1fr)); gap:8px;">${images.map(url => `<div class="overview-img-wrapper" style="aspect-ratio:1; border-radius:8px; overflow:hidden;"><img src="${url}" style="width:100%; height:100%; object-fit:cover;"></div>`).join('')}</div>` : `
                                    <div class="empty-images-placeholder" style="padding:20px; border:2px dashed #eee; border-radius:15px; text-align:center; color:#ccc;">
                                        <i class="fas fa-camera-retro" style="font-size:1.5rem; display:block; margin-bottom:5px;"></i>
                                        <p style="font-size:0.7rem; font-weight:700; margin:0;">Inga bilder bifogade</p>
                                    </div>
                                `}
                                <label style="display:block; text-align:center; margin-top:15px; font-size:0.65rem; color:var(--fog-brown); cursor:pointer; font-weight:850;">
                                    <i class="fas fa-plus-circle"></i> LADDA UPP NY BILD
                                    <input type="file" id="image-upload-input" hidden accept="image/*" onchange="window.handleImageUpload('${unit.id}', '${type}')">
                                </label>
                            </div>

                            <div class="bento-box">
                                <span class="bento-title">Manualer & Dokument</span>
                                <div class="doc-list" style="margin-top:10px; display:flex; flex-direction:column; gap:8px;">
                                    ${docs.length > 0 ? docs.map(doc => `
                                        <div class="doc-item" onclick="window.open('${doc.url}')" style="display:flex; align-items:center; gap:10px; padding:8px; background:#f9f9f9; border-radius:8px; cursor:pointer; transition: 0.2s;">
                                            <i class="fas fa-file-pdf" style="color:var(--fog-red);"></i>
                                            <span style="font-size:0.75rem; font-weight:600; flex:1;">${doc.name}</span>
                                            <i class="fas fa-external-link-alt" style="font-size:0.6rem; color:#ccc;"></i>
                                        </div>
                                    `).join('') : `
                                        <div style="font-size:0.7rem; color:#ccc; text-align:center; padding:10px;">Inga dokument uppladdade</div>
                                    `}
                                </div>
                                <label style="display:block; text-align:center; margin-top:12px; font-size:0.6rem; color:#999; cursor:pointer; font-weight:700;">
                                    <i class="fas fa-file-upload"></i> LADDA UPP DOKUMENT (PDF)
                                    <input type="file" hidden accept=".pdf" onchange="window.handleDocUpload('${unit.id}', '${type}')">
                                </label>
                            </div>
                        </div>

                        <div style="display:flex; flex-direction:column; gap:15px;">
                            <div class="bento-box">
                                <span class="bento-title">Besiktning & Service</span>
                                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:15px;">
                                    <div>
                                        <label style="font-size:0.5rem; font-weight:800; color:#999; text-transform:uppercase;">Service</label>
                                        <div style="font-weight:700; font-size:0.8rem;">${unit.lastService || '---'}</div>
                                    </div>
                                    <div>
                                        <label style="font-size:0.5rem; font-weight:800; color:#999; text-transform:uppercase;">Besiktning</label>
                                        <div style="font-weight:700; font-size:0.8rem; color:${isInspExpired ? '#e30613' : 'inherit'};">
                                            ${unit.nextInspection || '---'}
                                        </div>
                                        <div style="font-size:0.6rem; font-weight:800; margin-top:2px; color:${countdownClass === 'is-expired' ? 'var(--fog-red)' : (countdownClass === 'is-urgent' ? 'var(--fog-brown)' : '#999')};">
                                            ${countdownText}
                                        </div>
                                    </div>
                                </div>

                                <div style="margin-top:15px; border-top:1px solid #f5f5f5; padding-top:12px;">
                                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                                        <span style="font-size:0.6rem; font-weight:800; color:#bbb; text-transform:uppercase;">Användningsgrad</span>
                                        <span style="font-size:0.85rem; font-weight:900; color:var(--fog-brown);">${usagePercent}%</span>
                                    </div>
                                    <div style="height:6px; background:#f0f0f0; border-radius:10px; overflow:hidden;">
                                        <div style="height:100%; width:${usagePercent}%; background:var(--fog-brown); border-radius:10px;"></div>
                                    </div>
                                    <div style="font-size:0.65rem; color:#999; margin-top:6px; font-weight:600;">Bokad ${activeDays} av 30 dagar</div>
                                </div>

                                <button onclick="window.saveVehicleData('${unit.id}', '${type}')" style="width:100%; margin-top:12px; background:var(--fog-brown); color:white; border:none; padding:8px; border-radius:6px; cursor:pointer; font-weight:700; font-size:0.75rem;">Spara Ändringar</button>
                            </div>

                            <div class="bento-box" style="padding:10px;">
                                <span class="bento-title">Systemstatus</span>
                                <div style="display:flex; gap:4px;">
                                    <button onclick="window.setFleetStatus('${unit.id}', '${type}', 'ok')" style="flex:1; padding:7px 0; border-radius:8px; border:1px solid #eee; font-weight:850; font-size:0.6rem; background:${hStatus === 'ok' ? '#2ecc71' : 'white'}; color:${hStatus === 'ok' ? 'white' : '#666'};">OK</button>
                                    <button onclick="window.setFleetStatus('${unit.id}', '${type}', 'warn')" style="flex:1; padding:7px 0; border-radius:8px; border:1px solid #eee; font-weight:850; font-size:0.6rem; background:${hStatus === 'warn' ? '#f1c40f' : 'white'}; color:${hStatus === 'warn' ? 'white' : '#666'};">BRIST</button>
                                    <button onclick="window.setFleetStatus('${unit.id}', '${type}', 'danger')" style="flex:1; padding:7px 0; border-radius:8px; border:1px solid #eee; font-weight:850; font-size:0.6rem; background:${hStatus === 'danger' ? '#e30613' : 'white'}; color:${hStatus === 'danger' ? 'white' : '#666'};">FÖRBUD</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div id="tab-journal" class="fm-pane ${activeTab === 'tab-journal' ? 'active' : ''}" style="display:${activeTab === 'tab-journal' ? 'flex' : 'none'}; flex-direction:column; height:100%;">
                    </div>
            </div>
        </div>
    `;

    modal.style.display = 'flex';
    if (activeTab === 'tab-journal') setTimeout(() => {
        const feed = document.getElementById('chat-feed-v3');
        if (feed) feed.scrollTop = feed.scrollHeight;
    }, 150);
}

// FIXA SCROLL I DIN saveFleetNote FUNKTION:
window.saveFleetNote = async (id, uType) => {
    // ... din befintliga spara-logik ...
    // Efter att du anropat showUnitManagementModal för att rendera om:
    setTimeout(() => {
        const feed = document.getElementById('chat-feed-v3');
        if (feed) feed.scrollTo({ top: feed.scrollHeight, behavior: 'smooth' });
    }, 150);
};

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

window.handleDocUpload = async (unitId, uType) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
        const storageRef = ref(getStorage(), `fleet_docs/${unitId}/${file.name}`);
        await uploadBytes(storageRef, file);
        const url = await getDownloadURL(storageRef);

        const colMap = { car: 'cars', trailer: 'trailers', cart: 'carts' };
        const docRef = doc(dbInstance, colMap[uType], unitId);
        const docSnap = await getDoc(docRef);
        const currentDocs = docSnap.data().attachedDocs || [];

        await updateDoc(docRef, {
            attachedDocs: [...currentDocs, { name: file.name, url: url, date: new Date().toLocaleDateString() }]
        });

        // Rendera om modalen
        const updatedDoc = await getDoc(docRef);
        showUnitManagementModal({id: unitId, ...updatedDoc.data()}, uType, dbInstance, 'tab-overview');
        alert("Dokument uppladdat!");
    } catch (e) {
        alert("Kunde inte ladda upp dokument.");
    }
};
