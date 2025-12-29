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
