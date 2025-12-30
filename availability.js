import { doc, updateDoc, arrayUnion, getDoc, collection, addDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

let dbInstance; 
let isMaintenanceExpanded = false;

export function initAvailabilityModule(db) {
    dbInstance = db;
}

export async function renderAvailabilityView(area, cars, trailers, carts, db, assignments = []) {
    dbInstance = db;
    
    // NYTT: Filtrera bort dolda enheter direkt
    const visibleCars = cars.filter(c => c.isVisible !== false);
    const visibleTrailers = trailers.filter(t => t.isVisible !== false);
    const visibleCarts = carts.filter(c => c.isVisible !== false);
    const allVisibleUnits = [...visibleCars, ...visibleTrailers, ...visibleCarts];
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
    const maintenanceAlerts = allVisibleUnits.filter(u => {
        const isCart = visibleCarts.find(c => c.id === u.id);
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

            <div class="fleet-container">
                <div class="fleet-sections-grid">
                    ${renderFleetGroup('Företagsbilar', 'fa-truck-pickup', visibleCars, 'car')}
                    ${renderFleetGroup('Släpvagnar', 'fa-trailer', visibleTrailers, 'trailer')}
                    ${renderFleetGroup('Kaffevagnar', 'fa-coffee', visibleCarts, 'cart')}
                </div>
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
        const isBristMode = document.getElementById('chat-type-toggle').classList.contains('is-brist');
        const category = isBristMode ? 'brist' : 'info';
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

    window.deleteFleetNote = async function(unitId, unitType, noteId) {
        if (!confirm("Vill du radera detta meddelande permanent? Om det innehåller en bild raderas den även från Media-fliken.")) return;

        try {
            const { doc, getDoc, updateDoc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
            if (!window.db) throw new Error("Databas ej hittad.");

            const docRef = doc(window.db, unitType === 'car' ? 'cars' : 'carts', unitId);
            const snap = await getDoc(docRef);

            if (snap.exists()) {
                const data = snap.data();
                let notes = data.notes || [];
                let attachedImages = data.attachedImages || [];

                // 1. Hitta anteckningen som ska raderas
                const noteToDelete = notes.find(n => n.id === noteId);

                if (noteToDelete) {
                    // 2. VIKTIGT: Om anteckningen har en bild, ta bort den bilden från Media-listan också
                    if (noteToDelete.imageUrl && noteToDelete.isAttachment) {
                        // Vi filtrerar bort exakt den bild-strängen som fanns i anteckningen
                        attachedImages = attachedImages.filter(imgUrl => imgUrl !== noteToDelete.imageUrl);
                    }

                    // 3. Ta bort själva anteckningen från listan
                    const updatedNotes = notes.filter(n => n.id !== noteId);

                    // 4. Uppdatera BÅDA listorna i databasen samtidigt
                    await updateDoc(docRef, {
                        notes: updatedNotes,
                        attachedImages: attachedImages
                    });

                    console.log("Meddelande och eventuell tillhörande bild raderad.");
                    window.refreshModal(unitId, unitType);
                }
            }
        } catch (error) {
            console.error("Fel vid radering av meddelande:", error);
            alert("Kunde inte radera meddelandet: " + error.message);
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
                    // Räkna data för ikonerna
                    const notesCount = (item.notes || []).length;
                    const imagesCount = (item.attachedImages || []).length;
                    const docsCount = (item.attachedDocs || []).length;

                    return `
                    <div class="fleet-card hs-${hStatus}" onclick="window.openUnitDetail('${item.id}', '${type}')">
                        <div class="fleet-card-header">
                            <span class="fleet-unit-id">${item.id}</span>
                            <div class="fleet-status-indicator"></div>
                        </div>
                        <div class="fleet-meta">
                            <div class="fleet-meta-left">
                                <span><i class="far fa-comment-dots"></i> ${notesCount}</span>
                                ${imagesCount > 0 ? `<span><i class="far fa-image"></i> ${imagesCount}</span>` : ''}
                                ${docsCount > 0 ? `<span><i class="far fa-file-alt"></i> ${docsCount}</span>` : ''}
                            </div>
                            <i class="fas fa-chevron-right fleet-card-arrow-icon"></i>
                        </div>
                    </div>`;
                }).join('')}
            </div>
        </div>
    `;
}

const getInitials = (name) => name ? name.split(' ').map(n => n[0]).join('').toUpperCase() : '?';

window.showUnitManagementModal = function(unit, type, db, activeTab = 'tab-overview', allEvents = []) {
    const modal = document.getElementById('unit-modal');
    const body = document.getElementById('modal-body');
    if (!modal || !body) return;

    const hStatus = unit.healthStatus || 'ok';
    const notes = unit.notes || [];
    const images = unit.attachedImages || [];
    const docs = unit.attachedDocs || [];
    
    // 1. Beräkna användning (Senaste 30 dagarna)
    const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(new Date().getDate() - 30);
    const unitEvents = (allEvents || []).filter(e => e.car === unit.id || (e.carts && e.carts.includes(unit.id)));
    const activeDays = unitEvents.filter(e => new Date(e.startDate) >= thirtyDaysAgo).length;
    const usagePercent = Math.round((activeDays / 30) * 100);

    // 2. Kontrollera besiktning
    const now = new Date();
    const nextInsp = unit.nextInspection ? new Date(unit.nextInspection) : null;
    const isInspExpired = nextInsp && now > nextInsp;

    // 3. Status-konfiguration för headern
    const statusCfg = {
        ok: { icon: 'fa-check-circle', txt: 'Driftklar', color: '#2ecc71', bg: '#e6f9ed' },
        warn: { icon: 'fa-exclamation-triangle', txt: 'Brist', color: '#f1c40f', bg: '#fff9e6' },
        danger: { icon: 'fa-radiation', txt: 'Körförbud', color: '#e30613', bg: '#fff5f5' }
    };
    const s = statusCfg[hStatus];
    const getInitials = (name) => name ? name.split(' ').map(n => n[0]).join('').toUpperCase() : '?';

    // 4. Data-urval för Översikt
    const activeTasks = notes.filter(n => n.category === 'brist' && !n.resolved).reverse().slice(0, 5);
    const recentImages = [...images].reverse().slice(0, 6); // Ökat till 6 för att passa 3-kolumnsgrid bättre
    const recentDocs = [...docs].reverse().slice(0, 3);

    body.innerHTML = `
        <div class="bento-modal" style="width: 850px;">
            <header class="modal-header-vision" style="padding:15px 20px; border-bottom:1px solid #eee; display:flex; justify-content:space-between; align-items:center;">
                <div style="display:flex; align-items:center; gap:10px;">
                    <i class="fas ${type === 'car' ? 'fa-truck-pickup' : 'fa-coffee'}" style="font-size: 1.2rem; color: var(--fog-brown)"></i>
                    <h3 style="margin:0; font-weight:900; font-size:1.1rem;">${unit.id} <span style="background:#005a9e; color:white; padding:2px 6px; border-radius:4px; font-size:0.7rem; margin-left:6px;">${unit.regNo || '---'}</span></h3>
                </div>
                <div class="header-right-actions" style="display:flex; align-items:center; gap:12px;">
                    <div class="status-pill-header" style="padding:5px 12px; border-radius:20px; font-weight:900; font-size:0.65rem; display:flex; align-items:center; gap:6px; background:${s.bg}; color:${s.color};">
                        <i class="fas ${s.icon}"></i> ${s.txt}
                    </div>
                    <button class="fm-close-icon" onclick="window.closeUnitModal()" style="border:none; background:#f5f5f5; width:30px; height:30px; border-radius:50%; cursor:pointer;"><i class="fas fa-times"></i></button>
                </div>
            </header>

            <nav class="fm-nav-tabs" style="padding: 0 20px; border-bottom: 1px solid #eee; display:flex; gap:20px;">
                <button class="fm-tab-link ${activeTab === 'tab-overview' ? 'active' : ''}" onclick="window.switchModalTab(this, 'tab-overview')">Översikt</button>
                <button class="fm-tab-link ${activeTab === 'tab-journal' ? 'active' : ''}" onclick="window.switchModalTab(this, 'tab-journal')">Journal (${notes.length})</button>
                <button class="fm-tab-link ${activeTab === 'tab-media' ? 'active' : ''}" onclick="window.switchModalTab(this, 'tab-media')">Media (${images.length + docs.length})</button>
            </nav>
            
            <div class="fm-viewport" style="flex:1; overflow:hidden;">
                <div id="tab-overview" class="fm-pane ${activeTab === 'tab-overview' ? 'active' : ''}" style="display:${activeTab === 'tab-overview' ? 'block' : 'none'};">
                    <div class="bento-grid-modal" style="display:grid; grid-template-columns: 1fr 300px; gap:15px; padding:15px; height: 100%;">
                        
                        <div style="display:flex; flex-direction:column;">
                            <div class="bento-box" style="background: #fcfcfc; flex: 1;">
                                <span class="bento-title">Aktuella Åtgärder</span>
                                <div style="display:flex; flex-direction:column; gap:10px; margin-top:12px;">
                                    ${activeTasks.length > 0 ? activeTasks.map(n => `
                                        <div class="task-bubble-item" style="display:flex; align-items:center; gap:12px; background:#fff; border:1px solid #e1dfdd; border-radius: 0 12px 12px 12px; border-left: 4px solid #e30613; padding:12px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                                            <div style="flex:1;">
                                                <div style="font-size:0.85rem; font-weight:700; color:#242424;">${n.text}</div>
                                                <div style="font-size:0.65rem; color:#999; margin-top:4px; font-weight:600;">${n.author} • ${n.date}</div>
                                            </div>
                                            <button onclick="window.resolveFleetNote('${unit.id}', '${type}', '${n.id}')" 
                                                    style="background:#f5f5f5; border:none; color:#2ecc71; width:30px; height:30px; border-radius:50%; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:0.2s;">
                                                <i class="fas fa-check" style="font-size:0.9rem;"></i>
                                            </button>
                                        </div>
                                    `).join('') : `
                                        <div style="text-align:center; padding:40px; border:1px dashed #eee; border-radius:12px;">
                                            <p style="font-size:0.75rem; color:#ccc; margin:0;">Inga öppna brister att åtgärda.</p>
                                        </div>
                                    `}
                                </div>
                            </div>
                        </div>

                        <div style="display:flex; flex-direction:column; gap:15px; overflow-y: auto; padding-right: 5px;">
                            
                            <div class="bento-box">
                                <span class="bento-title">Besiktning & Service</span>
                                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-top:10px;">
                                    <div><label style="font-size:0.5rem; font-weight:800; color:#999;">SERVICE</label><div style="font-weight:700; font-size:0.8rem;">${unit.lastService || '---'}</div></div>
                                    <div><label style="font-size:0.5rem; font-weight:800; color:#999;">BESIKTNING</label><div style="font-weight:700; font-size:0.8rem; color:${isInspExpired ? '#e30613' : 'inherit'};">${unit.nextInspection || '---'}</div></div>
                                </div>
                                <div style="margin-top:15px; border-top:1px solid #f5f5f5; padding-top:12px;">
                                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;"><span style="font-size:0.6rem; font-weight:800; color:#bbb; text-transform:uppercase;">Användningsgrad</span><span style="font-size:0.85rem; font-weight:900; color:var(--fog-brown);">${usagePercent}%</span></div>
                                    <div style="height:6px; background:#f0f0f0; border-radius:10px; overflow:hidden;"><div style="height:100%; width:${usagePercent}%; background:var(--fog-brown);"></div></div>
                                </div>
                            </div>

                            <button onclick="window.saveVehicleData('${unit.id}', '${type}')" style="width:100%; background:var(--fog-brown); color:white; border:none; padding:5px; border-radius:6px; font-weight:700; font-size:0.75rem; cursor:pointer;">Spara Ändringar</button>

                            <div class="bento-box" style="padding:10px;">
                                <span class="bento-title">Systemstatus</span>
                                <div style="display:flex; gap:4px; margin-top:5px;">
                                    <button onclick="window.setFleetStatus('${unit.id}', '${type}', 'ok')" style="flex:1; padding:7px 0; border-radius:8px; border:1px solid #eee; font-size:0.65rem; background:${hStatus === 'ok' ? '#2ecc71' : 'white'}; color:${hStatus === 'ok' ? 'white' : '#666'};">OK</button>
                                    <button onclick="window.setFleetStatus('${unit.id}', '${type}', 'warn')" style="flex:1; padding:7px 0; border-radius:8px; border:1px solid #eee; font-size:0.65rem; background:${hStatus === 'warn' ? '#f1c40f' : 'white'}; color:${hStatus === 'warn' ? 'white' : '#666'};">BRIST</button>
                                    <button onclick="window.setFleetStatus('${unit.id}', '${type}', 'danger')" style="flex:1; padding:7px 0; border-radius:8px; border:1px solid #eee; font-size:0.65rem; background:${hStatus === 'danger' ? '#e30613' : 'white'}; color:${hStatus === 'danger' ? 'white' : '#666'};">FÖRBUD</button>
                                </div>
                            </div>

                            <div class="bento-box">
                                <span class="bento-title">Senaste Bilder</span>
                                ${images.length > 0 ? `
                                    <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:5px; margin-top:10px;">
                                        ${recentImages.map(url => `
                                            <div style="aspect-ratio:1; border-radius:4px; overflow:hidden; border:1px solid #eee; cursor:pointer;" onclick="window.viewImage('${url}')">
                                                <img src="${url}" style="width:100%; height:100%; object-fit:cover;">
                                            </div>
                                        `).join('')}
                                    </div>
                                ` : `
                                    <div style="text-align:center; padding:15px; border:1px dashed #eee; border-radius:12px; margin-top:10px;">
                                        <p style="font-size:0.65rem; color:#999; margin:0;">Inga bilder</p>
                                    </div>
                                `}
                            </div>

                            <div class="bento-box">
                                <span class="bento-title">Senaste Dokument</span>
                                ${docs.length > 0 ? `
                                    <div style="display:flex; flex-direction:column; gap:5px; margin-top:10px;">
                                        ${recentDocs.map(doc => `
                                            <div style="font-size:0.65rem; color:#666; display:flex; align-items:center; gap:8px; background:#f9f9f9; padding:6px; border-radius:6px; cursor:pointer;" onclick="window.viewPdf('${doc.url}')">
                                                <i class="fas fa-file-pdf" style="color:var(--fog-red);"></i> 
                                                <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1;">${doc.name}</span>
                                            </div>
                                        `).join('')}
                                    </div>
                                ` : `
                                    <div style="text-align:center; padding:15px; border:1px dashed #eee; border-radius:12px; margin-top:10px;">
                                        <p style="font-size:0.65rem; color:#999; margin:0;">Inga dokument</p>
                                    </div>
                                `}
                            </div>
                        </div>
                    </div>
                </div>

                <div id="tab-media" class="fm-pane ${activeTab === 'tab-media' ? 'active' : ''}" style="display:${activeTab === 'tab-media' ? 'block' : 'none'}; padding:20px;">
                    <div style="display:grid; grid-template-columns: 1fr 300px; gap:20px;">
                        <div>
                            <div style="display:flex; justify-content:space-between; margin-bottom:15px;"><h4 style="margin:0; font-size:0.9rem;">Bildgalleri</h4><label style="font-size:0.7rem; color:var(--fog-brown); cursor:pointer;"><i class="fas fa-plus-circle"></i> LADDA UPP BILD<input type="file" hidden accept="image/*" onchange="window.handleImageUpload(this, '${unit.id}', '${type}')"></label></div>
                            <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap:10px;">
                                ${images.map((url, idx) => `
                                    <div style="aspect-ratio:1; border-radius:8px; overflow:hidden; border:1px solid #ddd; position:relative; cursor:pointer;" onclick="window.viewImage('${url}')">
                                        <img src="${url}" style="width:100%; height:100%; object-fit:cover;">
                                        <div onclick="event.stopPropagation(); window.deleteImage('${unit.id}', '${type}', ${idx})" 
                                            style="position:absolute; top:5px; right:5px; background:rgba(227,6,19,0.8); color:white; width:22px; height:22px; border-radius:4px; display:flex; align-items:center; justify-content:center; font-size:0.7rem;">
                                            <i class="fas fa-trash-alt"></i>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                        <div style="border-left: 1px solid #eee; padding-left:20px;">
                            <div style="display:flex; justify-content:space-between; margin-bottom:15px;"><h4 style="margin:0; font-size:0.9rem;">Dokument</h4><label style="font-size:0.7rem; color:#666; cursor:pointer;"><i class="fas fa-file-upload"></i> NY PDF<input type="file" hidden accept=".pdf" onchange="window.handleDocUpload(this, '${unit.id}', '${type}')"></label></div>
                            <div style="display:flex; flex-direction:column; gap:10px;">
                                ${docs.map((doc, idx) => `
                                    <div class="doc-item" style="display:flex; align-items:center; gap:10px; padding:10px; background:#f9f9f9; border-radius:8px; cursor:pointer;" onclick="window.viewPdf('${doc.url}')">
                                        <i class="fas fa-file-pdf" style="color:var(--fog-red); font-size:1rem;"></i>
                                        <div style="flex:1; overflow:hidden;">
                                            <div style="font-size:0.75rem; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${doc.name}</div>
                                        </div>
                                        <i class="fas fa-trash-alt" onclick="event.stopPropagation(); window.deleteDoc('${unit.id}', '${type}', ${idx})" 
                                        style="color:#ccc; padding:5px; cursor:pointer;" onmouseover="this.style.color='#e30613'" onmouseout="this.style.color='#ccc'"></i>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                </div>

                <div id="tab-journal" class="fm-pane ${activeTab === 'tab-journal' ? 'active' : ''}" style="display:${activeTab === 'tab-journal' ? 'flex' : 'none'}; flex-direction:column; height:100%;">
                    <div id="chat-feed-v3" style="flex:1; overflow-y:auto; padding:20px 40px; background:#f5f5f5; display:flex; flex-direction:column; gap:15px;">
                        ${notes.map(n => {
                            const isBrist = n.category === 'brist';
                            const isSystem = n.author === 'System';
                            const hasImage = n.imageUrl && n.isAttachment;
                            return `
                                <div class="teams-msg-row ${isSystem ? 'system-msg' : 'user-msg'} ${isBrist ? 'brist-style' : ''}">
                                    <div class="teams-avatar" style="width:32px; height:32px; border-radius:50%; background:${isSystem ? '#eee' : '#d1d1d1'}; color:#444; display:flex; align-items:center; justify-content:center; font-size:0.7rem; font-weight:700; flex-shrink:0;">${getInitials(n.author)}</div>
                                    <div class="teams-content-wrapper">
                                        <div class="teams-msg-header"><strong>${n.author}</strong> <span>${n.date}</span></div>
                                        <div class="teams-bubble-container">
                                            <div class="teams-bubble" style="${hasImage ? 'padding:5px;' : ''}">
                                                ${hasImage ? `<img src="${n.imageUrl}" onclick="window.viewImage('${n.imageUrl}')" style="max-width:250px; max-height:200px; border-radius:8px; cursor:pointer; display:block;">` : `<p style="margin:0; font-size:0.85rem; line-height:1.5;">${n.text}</p>`}
                                                ${isBrist && !n.resolved ? `<button class="teams-res-btn" onclick="window.resolveFleetNote('${unit.id}', '${type}', '${n.id}')"><i class="fas fa-check"></i> Åtgärda</button>` : ''}
                                            </div>
                                            <i class="fas fa-trash-alt teams-del-btn" onclick="window.deleteFleetNote('${unit.id}', '${type}', '${n.id}')"></i>
                                        </div>
                                    </div>
                                </div>`;
                        }).join('')}
                    </div>
                    <div class="teams-input-container" style="padding:10px 20px; background:#f5f5f5; border-top:1px solid #eee;">
                        <div class="teams-input-bar">
                            <input type="file" id="chat-file-upload" hidden accept="image/*, .pdf" onchange="window.handleChatUpload(this, '${unit.id}', '${type}')">
                            <button class="chat-action-btn" onclick="document.getElementById('chat-file-upload').click()" title="Bifoga bild eller dokument"><i class="fas fa-paperclip"></i></button>
                            <input type="text" id="chat-text-input" placeholder="Skriv ett meddelande..." onkeydown="if(event.key==='Enter') window.saveFleetNote('${unit.id}', '${type}')">
                            <div id="chat-type-toggle" class="chat-category-pill" onclick="this.classList.toggle('is-brist')"><span class="opt-info">Info</span><span class="opt-brist">Brist</span></div>
                            <button class="chat-action-btn" onclick="window.saveFleetNote('${unit.id}', '${type}')" style="color:var(--fog-brown);"><i class="fas fa-paper-plane"></i></button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    modal.style.display = 'flex';
    if (activeTab === 'tab-journal') setTimeout(() => { const f = document.getElementById('chat-feed-v3'); if(f) f.scrollTop = f.scrollHeight; }, 150);
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

window.handleImageUpload = async function(inputElement, unitId, unitType) {
    const file = inputElement.files[0];
    // Viktigt: Kolla att vi har ett ID, annars blir det fel vid refresh
    if (!file || !unitId || unitId === 'undefined' || unitId === 'null') {
        console.error("Unit ID saknas vid uppladdning.");
        return alert("Kunde inte hitta fordonets ID. Prova att stänga och öppna modalen igen.");
    }

    // Komprimera bilden först (kräver din compressImage funktion)
    const base64String = await window.compressImage(file);
    const timestamp = new Date().toLocaleString('sv-SE');

    try {
        const { doc, updateDoc, arrayUnion } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
        // Säkerställ att db finns
        if (!window.db) throw new Error("Databasen är inte initierad.");

        const docRef = doc(window.db, unitType === 'car' ? 'cars' : 'carts', unitId);
        
        await updateDoc(docRef, {
            // 1. Lägg till i Media-fliken (som vanligt)
            attachedImages: arrayUnion(base64String),
            
            // 2. Lägg till en "smart" notis i journalen som innehåller bilddatan
            notes: arrayUnion({
                id: Date.now().toString(),
                author: "System",
                text: `📸 Bild bifogad: ${file.name}`, // Fallback-text
                date: timestamp,
                category: "info",
                imageUrl: base64String, // <--- NYTT: Här sparas bilden för chatten!
                isAttachment: true      // Flagga för enklare hantering
            })
        });

        // Uppdatera modalen direkt
        window.refreshModal(unitId, unitType);

    } catch (error) {
        console.error("Fel vid bilduppladdning:", error);
        alert(`Ett fel uppstod: ${error.message}`);
    } finally {
        // Rensa input-fältet så man kan ladda upp samma fil igen om man vill
        inputElement.value = '';
    }
};

window.handleDocUpload = async function(inputElement, unitId, unitType) {
    const file = inputElement.files[0];
    if (!file || !unitId || unitId === 'undefined') return alert("ID saknas.");

    const reader = new FileReader();
    reader.onload = async (e) => {
        const base64String = e.target.result;
        const today = new Date().toISOString().split('T')[0];
        const timestamp = new Date().toLocaleString('sv-SE');

        try {
            const { doc, updateDoc, arrayUnion } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
            const docRef = doc(window.db, unitType === 'car' ? 'cars' : 'carts', unitId);
            
            await updateDoc(docRef, {
                attachedDocs: arrayUnion({
                    name: file.name,
                    url: base64String,
                    date: today
                }),
                notes: arrayUnion({
                    id: Date.now().toString(),
                    author: "System",
                    text: `📄 Dokument bifogat: ${file.name}`,
                    date: timestamp,
                    category: "info"
                })
            });

            window.refreshModal(unitId, unitType);
        } catch (error) {
            console.error("Fel vid dokumentuppladdning:", error);
        }
    };
    reader.readAsDataURL(file);
};

window.refreshModal = async function(unitId, unitType) {
    const { getDoc, doc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
    const collectionName = unitType === 'car' ? 'cars' : 'carts';
    const docRef = doc(window.db, collectionName, unitId);
    const snap = await getDoc(docRef);
    
    if (snap.exists() && typeof window.showUnitManagementModal === 'function') {
        // VIKTIGT: Vi lägger till ID manuellt i data-objektet
        const unitData = { id: snap.id, ...snap.data() };
        
        // Vi stannar kvar i den flik användaren var i (Journal eller Media)
        const currentTab = document.querySelector('.fm-tab-link.active')?.getAttribute('onclick').match(/'([^']+)'/)[1] || 'tab-overview';
        
        window.showUnitManagementModal(unitData, unitType, window.db, currentTab);
    }
};

window.handleChatUpload = function(inputElement, unitId, unitType) {
    const file = inputElement.files[0];
    if (!file) return;

    if (file.type === "application/pdf") {
        window.handleDocUpload(inputElement, unitId, unitType);
    } else if (file.type.startsWith("image/")) {
        window.handleImageUpload(inputElement, unitId, unitType);
    } else {
        alert("Vänligen välj en bild eller en PDF-fil.");
    }
};

window.viewImage = function(base64Url) {
    const newTab = window.open();
    newTab.document.write(`
        <html>
            <body style="margin:0; background:#222; display:flex; align-items:center; justify-content:center;">
                <img src="${base64Url}" style="max-width:100%; max-height:100%; box-shadow: 0 0 20px rgba(0,0,0,0.5);">
            </body>
        </html>
    `);
};

window.viewPdf = function(base64Url) {
    const newTab = window.open();
    if (!newTab) {
        alert("Webbläsaren blockerade fönstret. Tillåt popup-fönster för denna sida.");
        return;
    }
    newTab.document.write(`
        <html>
            <head><title>Dokumentvisning</title></head>
            <body style="margin:0; height:100vh;">
                <embed src="${base64Url}" type="application/pdf" width="100%" height="100%" />
            </body>
        </html>
    `);
};

window.compressImage = function(file, maxWidth = 800, quality = 0.7) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                // Behåll proportioner
                if (width > maxWidth) {
                    height = (maxWidth / width) * height;
                    width = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                // Returnera som komprimerad JPEG-sträng
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
        };
    });
};

// Radera bild baserat på index i arrayen
window.deleteImage = async function(unitId, unitType, index) {
    if (!confirm("Vill du radera bilden permanent?")) return;

    const { doc, getDoc, updateDoc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
    const docRef = doc(window.db, unitType === 'car' ? 'cars' : 'carts', unitId);
    
    const snap = await getDoc(docRef);
    if (snap.exists()) {
        const images = snap.data().attachedImages || [];
        images.splice(index, 1); // Ta bort bilden på rätt plats
        await updateDoc(docRef, { attachedImages: images });
        window.refreshModal(unitId, unitType);
    }
};

// Radera dokument baserat på index
window.deleteDoc = async function(unitId, unitType, index) {
    if (!confirm("Vill du radera dokumentet permanent?")) return;

    const { doc, getDoc, updateDoc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
    const docRef = doc(window.db, unitType === 'car' ? 'cars' : 'carts', unitId);
    
    const snap = await getDoc(docRef);
    if (snap.exists()) {
        const docs = snap.data().attachedDocs || [];
        docs.splice(index, 1);
        await updateDoc(docRef, { attachedDocs: docs });
        window.refreshModal(unitId, unitType);
    }
};
