// calendar.js
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Initiera globala variabler för tillstånd
if (!window.activeFilter) window.activeFilter = { type: 'all', id: null };
let mobileStartDate = new Date(); 

export function renderCalendarView(assignments, db, cars = [], trailers = [], carts = [], targetDate = null) {
    // Spara referenser i window för att navigeringen ska fungera
    window.lastAssignments = assignments;
    window.lastCars = cars;
    window.lastTrailers = trailers;
    window.lastCarts = carts;
    window.renderCalendarView = renderCalendarView; 

    const area = document.getElementById('content-area');
    const isMobile = window.innerWidth < 768;
    if (targetDate) mobileStartDate = new Date(targetDate);

    // 1. Filter-bar
    area.innerHTML = `
        <div class="calendar-filter-bar">
            <button class="filter-btn ${window.activeFilter.type === 'all' ? 'active' : ''}" onclick="window.setCalFilter('all')">
                <i class="fas fa-th"></i> Alla
            </button>
            ${cars.map(c => `<button class="filter-btn ${window.activeFilter.type === 'car' && window.activeFilter.id === c.id ? 'active' : ''}" onclick="window.setCalFilter('car', '${c.id}')"><i class="fas fa-truck-pickup"></i> ${c.id}</button>`).join('')}
            ${trailers.map(t => `<button class="filter-btn ${window.activeFilter.type === 'trailer' && window.activeFilter.id === t.id ? 'active' : ''}" onclick="window.setCalFilter('trailer', '${t.id}')"><i class="fas fa-trailer"></i> ${t.id}</button>`).join('')}
            ${carts.map(c => `<button class="filter-btn ${window.activeFilter.type === 'cart' && window.activeFilter.id === c.id ? 'active' : ''}" onclick="window.setCalFilter('cart', '${c.id}')"><i class="fas fa-coffee"></i> ${c.id}</button>`).join('')}
        </div>
        <div id="calendar-container"></div>
    `;

    window.setCalFilter = (type, id = null) => {
        window.activeFilter = { type, id };
        renderCalendarView(assignments, db, cars, trailers, carts, isMobile ? mobileStartDate : null);
    };

    const filteredAssignments = assignments.filter(a => {
        const f = window.activeFilter;
        if (f.type === 'all') return true;
        if (f.type === 'car') return a.car === f.id;
        if (f.type === 'trailer') return a.trailer === f.id;
        if (f.type === 'cart') return a.carts && a.carts.includes(f.id);
        return true;
    });

    if (isMobile) {
        renderMobileTimeline(filteredAssignments, mobileStartDate);
    } else {
        renderDesktopFullCalendar(filteredAssignments, targetDate);
    }

    function renderMobileTimeline(data, start) {
        const container = document.getElementById('calendar-container');
        container.classList.add('mobile-timeline-view');
        
        // NY HTML-STRUKTUR FÖR HEADERN
        let html = `<div class="mobile-nav-header">
            <button class="nav-arrow-btn" onclick="window.changeMobileDate(-7)">
                <i class="fas fa-chevron-left"></i>
            </button>
            
            <span class="week-title">Vecka ${getWeekNumber(start)}</span>
            
            <div class="nav-right-group">
                <button class="btn-today-mobile" onclick="window.goToMobileToday()">Idag</button>
                <button class="nav-arrow-btn" onclick="window.changeMobileDate(7)">
                    <i class="fas fa-chevron-right"></i>
                </button>
            </div>
        </div>`;

        for (let i = 0; i < 7; i++) {
            const date = new Date(start);
            date.setDate(start.getDate() + i);
            const dateStr = date.toISOString().split('T')[0];
            const dayName = date.toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'short' });
            const dayEvents = data.filter(a => dateStr >= a.startDate && dateStr <= a.endDate);

            html += `<div class="day-card ${dayEvents.length > 0 ? 'has-events' : ''}">
                <div class="day-card-header">${dayName}</div>
                <div class="day-card-body">
                    ${dayEvents.length > 0 ? dayEvents.map(e => {
                        const isStart = dateStr === e.startDate;
                        const isEnd = dateStr === e.endDate;
                        const isMulti = e.startDate !== e.endDate;
                        const carReady = (e.carItems || []).filter(i => i.type === 'item').every(i => i.done);
                        const cartReady = (e.cartItems || []).filter(i => i.type === 'item').every(i => i.done);
                        const isReady = carReady && cartReady;
                        const areaMap = { 'Event': 'EVE', 'Catering': 'CAT', 'Street': 'STR', 'FPJ': 'FPJ' };
                        const shortArea = areaMap[e.businessArea] || 'EVE';

                        return `<div class="mobile-event-card ${isReady ? 'm-event-ready' : 'm-event-incomplete'}" onclick="window.editAssignment('${e.id}')">
                            <div class="m-event-top">
                                <div class="m-badge-group">
                                    <span class="m-event-badge tag-${shortArea.toLowerCase()}">${shortArea}</span>
                                    ${isMulti ? `<span class="m-multi-label">${isStart ? 'START <i class="fas fa-arrow-right"></i>' : (isEnd ? '<i class="fas fa-arrow-left"></i> SLUT' : '<i class="fas fa-exchange-alt"></i> FORTS.')}</span>` : ''}
                                </div>
                                <i class="${isReady ? 'fas fa-check-circle status-ok' : 'fas fa-clock status-wait'}"></i>
                            </div>
                            <div class="m-event-title">${e.event}</div>
                            <div class="m-event-meta">
                                <span><i class="fas fa-truck"></i> ${e.car || 'Ingen'}</span>
                                <span><i class="fas fa-coffee"></i> ${e.carts?.join(', ') || 'Inga vagnar'}</span>
                            </div>
                        </div>`;
                    }).join('') : '<div class="m-empty-day">Inga planerade uppdrag</div>'}
                </div>
            </div>`;
        }
        container.innerHTML = html;
    }

    function renderDesktopFullCalendar(data, target) {
        const calendarEl = document.getElementById('calendar-container');
        calendarEl.classList.remove('mobile-timeline-view');
        const events = data.map(a => ({
            id: a.id, title: a.event, start: a.startDate, end: a.endDate,
            extendedProps: { area: a.businessArea || 'Event', car: a.car, carts: a.carts || [], carItems: a.carItems || [], cartItems: a.cartItems || [] }
        }));
        const calendar = new FullCalendar.Calendar(calendarEl, {
            initialDate: target || new Date(),
            initialView: 'dayGridMonth',
            locale: 'sv',
            firstDay: 1,
            height: 'auto',
            contentHeight: 'auto', 
            aspectRatio: 2.5,      // Högre siffra = lägre rutor
            expandRows: false,     // Tillåt inte rader att sträcka ut sig
            weekNumbers: true,
            headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridTwoWeeks,dayGridMonth' },
            views: { dayGridTwoWeeks: { type: 'dayGrid', duration: { weeks: 2 }, buttonText: '2 Veckor' } },
            buttonText: { today: 'Idag', month: 'Månad' },
            weekText: 'v.',
            events: events,
            eventClassNames: function(arg) {
                const p = arg.event.extendedProps;
                const carReady = (p.carItems || []).filter(i => i.type === 'item').every(i => i.done);
                const cartReady = (p.cartItems || []).filter(i => i.type === 'item').every(i => i.done);
                return !(carReady && cartReady) ? ['fc-event-incomplete'] : [];
            },
            eventContent: function(arg) {
                const props = arg.event.extendedProps;
                const areaMap = { 'Event': 'EVE', 'Catering': 'CAT', 'Street': 'STR', 'FPJ': 'FPJ' };
                const shortArea = areaMap[props.area] || props.area;
                return {
                    html: `<div class="fc-custom-event">
                        <div class="event-area-badge tag-${shortArea.toLowerCase()}">${shortArea}</div>
                        <div class="fc-event-title-bold">${arg.event.title}</div>
                        <div class="fc-event-details"><i class="fas fa-truck"></i> ${props.car}</div>
                        <div class="fc-event-details"><i class="fas fa-coffee"></i> ${(props.carts || []).join(', ')}</div>
                    </div>`
                };
            },
            eventClick: (info) => window.editAssignment(info.event.id)
        });
        calendar.render();
    }
}

// Globala navigeringsfunktioner
window.changeMobileDate = (days) => {
    mobileStartDate.setDate(mobileStartDate.getDate() + days);
    if (window.renderCalendarView) window.renderCalendarView(window.lastAssignments, null, window.lastCars, window.lastTrailers, window.lastCarts, mobileStartDate);
};

window.goToMobileToday = () => {
    mobileStartDate = new Date();
    if (window.renderCalendarView) window.renderCalendarView(window.lastAssignments, null, window.lastCars, window.lastTrailers, window.lastCarts, mobileStartDate);
};

function getWeekNumber(d) { d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7)); var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1)); return Math.ceil((((d - yearStart) / 86400000) + 1) / 7); }
