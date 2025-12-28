// calendar.js
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Vi lägger till en variabel utanför för att komma ihåg valt filter
let activeFilter = { type: 'all', id: null };

export function renderCalendarView(assignments, db, cars = [], trailers = [], carts = [], targetDate = null) {
    const area = document.getElementById('content-area');
    
    // 1. Rendera filter-baren (nu med släp)
    area.innerHTML = `
        <div class="calendar-filter-bar">
            <button class="filter-btn ${activeFilter.type === 'all' ? 'active' : ''}" onclick="window.setCalFilter('all')">
                <i class="fas fa-th"></i> Alla
            </button>
            <div class="filter-separator"></div>
            ${cars.map(c => `
                <button class="filter-btn ${activeFilter.id === c.id ? 'active' : ''}" onclick="window.setCalFilter('car', '${c.id}')">
                    <i class="fas fa-truck-pickup"></i> ${c.id}
                </button>
            `).join('')}
            <div class="filter-separator"></div>
            ${trailers.map(t => `
                <button class="filter-btn ${activeFilter.id === t.id ? 'active' : ''}" onclick="window.setCalFilter('trailer', '${t.id}')">
                    <i class="fas fa-trailer"></i> ${t.id}
                </button>
            `).join('')}
            <div class="filter-separator"></div>
            ${carts.map(c => `
                <button class="filter-btn ${activeFilter.id === c.id ? 'active' : ''}" onclick="window.setCalFilter('cart', '${c.id}')">
                    <i class="fas fa-coffee"></i> ${c.id}
                </button>
            `).join('')}
        </div>
        <div id="calendar-container"></div>
    `;

    window.setCalFilter = (type, id = null) => {
        activeFilter = { type, id };
        renderCalendarView(assignments, db, cars, trailers, carts);
    };

    // 2. Filtreringslogik
    const filteredAssignments = assignments.filter(a => {
        if (activeFilter.type === 'all') return true;
        if (activeFilter.type === 'car') return a.car === activeFilter.id;
        if (activeFilter.type === 'trailer') return a.trailer === activeFilter.id;
        if (activeFilter.type === 'cart') return a.carts && a.carts.includes(activeFilter.id);
        return true;
    });

    // 3. Förbered events för FullCalendar
    const events = filteredAssignments.map(a => ({
        id: a.id,
        title: a.event,
        start: a.startDate,
        end: a.endDate,
        extendedProps: {
            area: a.businessArea || 'Event',
            car: a.car,
            trailer: a.trailer,
            carts: a.carts || [],
            carItems: a.carItems || [],
            cartItems: a.cartItems || []
        }
    }));

    const calendarEl = document.getElementById('calendar-container');
    const calendar = new FullCalendar.Calendar(calendarEl, {
        initialDate: targetDate || new Date(), // Hoppar till valt datum
        initialView: 'dayGridTwoWeeks',
        editable: true,
        locale: 'sv',
        firstDay: 1,
        weekNumbers: true,
        weekNumberCalculation: 'ISO',
        buttonText: { today: 'Idag', month: 'Månad' },
        height: 'auto',
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridTwoWeeks,dayGridMonth'
        },
        views: {
            dayGridTwoWeeks: { type: 'dayGrid', duration: { weeks: 2 }, buttonText: '2 Veckor' }
        },

        eventClassNames: function(arg) {
            const props = arg.event.extendedProps;
            
            // Filtrera så vi bara kollar faktiska produkter, inte rubriker
            const carItems = (props.carItems || []).filter(i => i.type === 'item');
            const cartItems = (props.cartItems || []).filter(i => i.type === 'item');

            // Kontrollera om alla produkter är markerade som done: true
            const carReady = carItems.length === 0 || carItems.every(i => i.done);
            const cartReady = cartItems.length === 0 || cartItems.every(i => i.done);

            // Om inte båda är klara, lägg till klassen för "stripsat" utseende
            return !(carReady && cartReady) ? ['fc-event-incomplete'] : [];
        },

        eventContent: function(arg) {
            const props = arg.event.extendedProps;
            const carReady = props.carItems?.every(i => i.done) ?? true;
            const cartReady = props.cartItems?.every(i => i.done) ?? true;
            const isReady = carReady && cartReady;

            // Mappning för korta namn
            const areaMap = { 'Event': 'EVE', 'Catering': 'CAT', 'Street': 'STR', 'FPJ': 'FPJ' };
            const shortArea = areaMap[props.area] || props.area;

            return {
                html: `
                    <div class="fc-custom-event">
                        <div class="event-area-badge tag-${shortArea.toLowerCase()}">${shortArea}</div>
                        <div class="fc-event-title-bold">
                            ${arg.isStart ? (isReady ? '<i class="fas fa-check-circle"></i>' : '<i class="fas fa-clock"></i>') : ''} 
                            ${arg.event.title}
                        </div>
                        <div class="fc-event-details"><i class="fas fa-truck"></i> ${props.car}</div>
                        <div class="fc-event-details"><i class="fas fa-coffee"></i> ${(props.carts || []).join(', ')}</div>
                        ${!arg.isEnd ? '<div class="continue-arrow-bottom"><i class="fas fa-arrow-right"></i></div>' : ''}
                    </div>
                `
            };
        },
        events: events,
        eventClick: (info) => window.editAssignment(info.event.id),
        dateClick: (info) => window.showView('create', info.dateStr)
    });

    calendar.render();
}

// Hjälpfunktion för att fixa FullCalendar's datumhantering
function addDays(dateStr, days) {
    const date = new Date(dateStr);
    date.setDate(date.getDate() + days);
    return date.toISOString().split('T')[0];
}