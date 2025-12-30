// tv.js
export function renderTVDashboard(area, assignments, units) {
    const isDarkMode = localStorage.getItem('tv-theme') === 'dark';
    const now = new Date();

    const sortedMissions = assignments.sort((a, b) => a.startDate.localeCompare(b.startDate));
    const mainMission = sortedMissions[0];
    const otherMissions = sortedMissions.slice(1, 6); // Visar upp till 5 ytterligare kort

    const getUnitIcon = (ass, id, isCar = false) => {
        const list = isCar ? (ass.carItems || []) : (ass.cartItems || []).filter(i => i.unitId === id);
        const items = list.filter(i => i.type === 'item');
        if (items.length === 0) return 'fa-clock'; 
        return items.every(i => i.done) ? 'fa-check-circle' : 'fa-clock';
    };

    area.innerHTML = `
        <div class="tv-screen ${isDarkMode ? 'dark-theme' : 'light-theme'}">
            <div class="tv-container">
                
                <header class="tv-header-v3">
                    <div class="h-left">
                        <div class="tv-weather-badge">
                            <i class="fas fa-sun"></i> <span>2°C ESLÖV</span>
                        </div>
                        <h1 class="tv-logo">LOGISTIK<span>ÖVERSIKT</span></h1>
                    </div>

                    <div class="h-right">
                        <div class="tv-clock-cluster">
                            <div class="tv-clock-v3">
                                <div class="time">${now.toLocaleTimeString('sv-SE', {hour: '2-digit', minute:'2-digit'})}</div>
                                <div class="date">${now.toLocaleDateString('sv-SE', { weekday: 'long' }).toUpperCase()}</div>
                            </div>
                            <div class="tv-actions-v3">
                                <button onclick="window.toggleTVTheme()" class="tv-btn"><i class="fas ${isDarkMode ? 'fa-sun' : 'fa-moon'}"></i></button>
                                <button onclick="window.showView('calendar')" class="tv-btn exit"><i class="fas fa-times"></i></button>
                            </div>
                        </div>
                    </div>
                </header>

                <main class="tv-bento-layout">
                    <div class="bento-hero" onclick="window.openPackingDirectly('${mainMission?.id}')">
                        <div class="hero-label">NÄSTA UPPDRAG</div>
                        <div class="hero-body">
                            <h2>${mainMission?.event || 'Inga uppdrag'}</h2>
                            <div class="hero-unit-row">
                                <div class="unit-status-pill">
                                    <i class="fas fa-truck-pickup"></i> ${mainMission?.car} <i class="fas ${getUnitIcon(mainMission, mainMission?.car, true)} status-icon"></i>
                                </div>
                                ${(mainMission?.carts || []).map(cartId => `
                                    <div class="unit-status-pill">
                                        <i class="fas fa-coffee"></i> ${cartId} <i class="fas ${getUnitIcon(mainMission, cartId)} status-icon"></i>
                                    </div>
                                `).join('')}
                                <div class="hero-date-pill"><i class="fas fa-calendar-alt"></i> ${mainMission?.startDate}</div>
                            </div>
                        </div>
                        <div class="hero-footer">
                            <div class="hero-prog-wrapper">
                                <div class="prog-text">PACKSTATUS <span>${calculateProg(mainMission)}%</span></div>
                                <div class="prog-track-v3"><div class="prog-fill-v3" style="width:${calculateProg(mainMission)}%"></div></div>
                            </div>
                        </div>
                    </div>

                    <div class="bento-scroll-list">
                        ${otherMissions.map(a => `
                            <div class="tv-compact-card" onclick="window.openPackingDirectly('${a.id}')">
                                <div class="c-info">
                                    <div class="c-header-row">
                                        <span class="c-name">${a.event}</span>
                                        <span class="c-date-label"><i class="fas fa-calendar-day"></i> ${a.startDate}</span>
                                    </div>
                                    <div class="c-unit-row">
                                        <span class="c-cart-status"><i class="fas ${getUnitIcon(a, a.car, true)}"></i> ${a.car}</span>
                                        ${(a.carts || []).map(cartId => `
                                            <span class="c-cart-status"><i class="fas ${getUnitIcon(a, cartId)}"></i> ${cartId}</span>
                                        `).join('')}
                                    </div>
                                </div>
                                <div class="c-prog-side">
                                    <span class="c-perc">${calculateProg(a)}%</span>
                                    <div class="c-bar-mini"><div class="c-fill-mini" style="width:${calculateProg(a)}%"></div></div>
                                </div>
                            </div>
                        `).join('')}
                    </div>

                    <aside class="bento-sidebar-v3">
                        <div class="sidebar-panel">
                            <h3>FLEET ALERT</h3>
                            <div class="alert-grid">
                                ${units.filter(u => u.healthStatus === 'danger' || u.healthStatus === 'warn').map(u => `
                                    <div class="alert-pill-clean ${u.healthStatus}">
                                        <span class="pill-id">${u.id}</span>
                                        <span class="pill-status">${u.healthStatus === 'danger' ? 'KÖRFORBUD' : 'BRIST'}</span>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                        <div class="sidebar-panel info-note">
                            <h3>NOTERING</h3>
                            <div class="note-body">
                                <i class="fas fa-thumbtack pin-icon"></i>
                                <p>Kom ihåg att ladda batterierna på vagn Andrea. Inventering på fredag!</p>
                            </div>
                            <div class="update-ts">UPPDATERAD: ${now.toLocaleTimeString('sv-SE', {hour: '2-digit', minute:'2-digit'})}</div>
                        </div>
                    </aside>
                </main>
            </div>
        </div>
    `;
}

function calculateProg(a) {
    if (!a) return 0;
    const total = (a.carItems || []).concat(a.cartItems || []).filter(i => i.type === 'item');
    const done = total.filter(i => i.done).length;
    return total.length > 0 ? Math.round((done / total.length) * 100) : 0;
}
