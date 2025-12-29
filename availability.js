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
    // ... tidigare logik för hStatus, usage etc behålls ...
    const notes = unit.notes || [];

    // Ersätt tab-journal HTML med denna:
    const journalHtml = `
        <div id="tab-journal" class="fm-pane ${activeTab === 'tab-journal' ? 'active' : ''}">
            <div id="chat-feed-v3">
                ${notes.map(n => {
                    const isBrist = n.category === 'brist';
                    const isResolved = n.resolved === true;
                    return `
                        <div class="teams-msg-row ${isBrist ? 'brist' : ''} ${isResolved ? 'resolved' : ''}">
                            <div class="teams-avatar">${getInitials(n.author)}</div>
                            <div class="teams-msg-content">
                                <div class="teams-msg-header">
                                    <strong>${n.author}</strong> <span>${n.date}</span>
                                </div>
                                <div class="teams-bubble">
                                    <div style="flex:1;">
                                        ${n.imageUrl ? `<img src="${n.imageUrl}" class="teams-chat-img" onclick="window.open(this.src)">` : ''}
                                        <p>${n.text}</p>
                                        ${isBrist && !isResolved ? `
                                            <button class="teams-res-btn" onclick="window.resolveFleetNote('${unit.id}', '${type}', '${n.id}')" style="margin-top:10px; background:#2ecc71; color:white; border:none; padding:4px 10px; border-radius:4px; font-size:0.7rem; cursor:pointer; font-weight:700;">
                                                <i class="fas fa-check"></i> Markera som åtgärdad
                                            </button>
                                        ` : ''}
                                    </div>
                                    <div style="display:flex; align-items:center; gap:8px; margin-left:15px;">
                                        ${isResolved ? '<i class="fas fa-check-circle" style="color:#2ecc71; font-size:1rem;"></i>' : ''}
                                        <i class="fas fa-trash" style="color:#eee; cursor:pointer; font-size:0.8rem;" onclick="window.deleteFleetNote('${unit.id}', '${type}', '${n.id}')"></i>
                                    </div>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>

            <div class="teams-input-container">
                <div class="teams-input-row">
                    <input type="text" id="chat-text-input" placeholder="Skriv ett meddelande" 
                           onkeydown="if(event.key==='Enter') window.saveFleetNote('${unit.id}', '${type}')">
                </div>
                <div class="teams-input-actions">
                    <div class="action-icons">
                        <i class="fas fa-font"></i>
                        <label style="cursor:pointer;"><i class="fas fa-paperclip"></i><input type="file" hidden accept="image/*" onchange="window.handleChatImageUpload('${unit.id}', '${type}')"></label>
                        <i class="far fa-smile"></i>
                        <select id="chat-cat-select" style="border:none; background:none; font-size:0.75rem; font-weight:700; color:#616161; outline:none; cursor:pointer;">
                            <option value="info">INFO</option>
                            <option value="brist">BRIST</option>
                        </select>
                    </div>
                    <button class="teams-send-btn" onclick="window.saveFleetNote('${unit.id}', '${type}')">
                        <i class="fas fa-paper-plane"></i>
                    </button>
                </div>
            </div>
        </div>
    `;

    // Uppdatera body.innerHTML och kör scroll-fix
    // ...
    setTimeout(() => {
        const feed = document.getElementById('chat-feed-v3');
        if (feed) feed.scrollTop = feed.scrollHeight;
    }, 100);
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
