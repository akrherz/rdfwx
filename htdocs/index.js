const GEOJSON_URI = "https://mesonet.agron.iastate.edu/geojson/agclimate.py";

let map = null;
let highlightedFeature = null; // Track the currently highlighted feature
let latestGeoJSON = null; // store last fetched GeoJSON for fallbacks
let stationLayer = null;
let interactionsEnabled = false;
let currentVariable = 'tmpf';
let currentUnits = 'f';
let baseTileLayer = null;
let baseLayerMode = 'osm';
let showRecentOnly = true;

const VARIABLE_META = {
    tmpf: { title: 'Air Temperature', legendTitle: 'Temperature Legend' },
    dwpf: { title: 'Dew Point', legendTitle: 'Dew Point Legend' },
    relh: { title: 'Relative Humidity', legendTitle: 'Humidity Legend' },
    sknt: { title: 'Wind Speed', legendTitle: 'Wind Speed Legend' },
    pday: { title: 'Daily Rainfall', legendTitle: 'Rainfall Legend' },
    cci: { title: 'Adult Cattle Comfort Index', legendTitle: 'Cattle Comfort Index Legend' },
    cci_shade: { title: 'Adult Cattle Comfort Index Shade', legendTitle: 'Cattle Comfort Index Legend' },
};

const LEGEND_CONTENT = {
    tmpf: [
        ['#313695', '<= 0 F'], ['#4575b4', '1-10 F'], ['#74add1', '11-20 F'],
        ['#abd9e9', '21-30 F'], ['#e0f3f8', '31-40 F'], ['#fee090', '41-50 F'],
        ['#fdae61', '51-60 F'], ['#f46d43', '61-70 F'], ['#d73027', '71-80 F'], ['#a50026', '> 80 F'],
    ],
    dwpf: [
        ['#313695', '<= 0 F'], ['#4575b4', '1-10 F'], ['#74add1', '11-20 F'],
        ['#abd9e9', '21-30 F'], ['#e0f3f8', '31-40 F'], ['#fee090', '41-50 F'],
        ['#fdae61', '51-60 F'], ['#f46d43', '61-70 F'], ['#d73027', '71-80 F'], ['#a50026', '> 80 F'],
    ],
    relh: [
        ['#f2f5c8', '< 20%'], ['#d8ebb5', '20-39%'], ['#a9d7c6', '40-59%'], ['#71b5c9', '60-79%'], ['#2c7da0', '>= 80%'],
    ],
    sknt: [
        ['#e9f7ef', '< 5 mph'], ['#b8e0d1', '5-9 mph'], ['#78c6a3', '10-19 mph'], ['#4ea37c', '20-29 mph'], ['#2d6a4f', '>= 30 mph'],
    ],
    pday: [
        ['#f3f5f7', '< 0.01 in'], ['#dceef8', '0.01-0.09 in'], ['#9bc8e4', '0.10-0.49 in'], ['#5a9fd1', '0.50-0.99 in'], ['#2367ad', '>= 1.00 in'],
    ],
    cci: [
        ['#73d92d', 'No Stress'], ['#80c1ff', 'Mild'], ['#ffe200', 'Moderate'],
        ['#ff8533', 'Severe'], ['#ff0000', 'Extreme'], ['#af66cc', 'Extreme Danger'],
    ],
    cci_shade: [
        ['#73d92d', 'No Stress'], ['#80c1ff', 'Mild'], ['#ffe200', 'Moderate'],
        ['#ff8533', 'Severe'], ['#ff0000', 'Extreme'], ['#af66cc', 'Extreme Danger'],
    ],
};

const CCI_LEGEND_THRESHOLDS_F = [77, 86, 95, 104, 113];

// Utility function to convert knots to MPH and round to integer
function knotsToMph(knots) {
    if (knots === null || knots === undefined || isNaN(knots)) {
        return 'N/A';
    }
    return Math.round(knots * 1.15078); // 1 knot = 1.15078 mph
}

// Utility function to convert degrees to cardinal direction
function degreesToCardinal(degrees) {
    if (degrees === null || degrees === undefined || isNaN(degrees)) {
        return '';
    }
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const index = Math.round(degrees / 22.5) % 16;
    return directions[index];
}

// Utility function to format numbers with proper handling of null/undefined
function formatValue(value, unit = '', decimals = 0) {
    if (value === null || value === undefined || isNaN(value)) {
        return 'N/A';
    }
    return decimals > 0 ? `${value.toFixed(decimals)}${unit}` : `${Math.round(value)}${unit}`;
}

function parseNumeric(value) {
    if (value === null || value === undefined) {
        return null;
    }
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
    }
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed === '' || trimmed.toUpperCase() === 'M') {
            return null;
        }
        const parsed = Number.parseFloat(trimmed.replace('%', ''));
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}

function getStationCodeFromRawFeature(feature) {
    if (!feature) {
        return null;
    }
    const props = feature.properties || {};
    return props.station || feature.id || null;
}

function getStationCodeFromOlFeature(feature) {
    if (!feature) {
        return null;
    }
    const stationProp = feature.get('station');
    const featureId = feature.getId && feature.getId();
    return stationProp || featureId || null;
}

function getWindDisplayData(props) {
    const drct = parseNumeric(props.drct);
    const sknt = parseNumeric(props.sknt);
    if (sknt !== null) {
        return {
            speed: convertWind(sknt),
            direction: drct === null ? '' : degreesToCardinal(drct),
        };
    }

    if (typeof props.wind === 'string') {
        const match = props.wind.trim().match(/^([NSEW]{1,3})@(-?\d+(?:\.\d+)?)$/i);
        if (match) {
            const speedMph = Number.parseFloat(match[2]);
            const speed = currentUnits === 'c' ? speedMph * 1.60934 : speedMph;
            return {
                speed,
                direction: match[1].toUpperCase(),
            };
        }
    }

    return {
        speed: null,
        direction: '',
    };
}

function convertTemperature(fahrenheit) {
    const value = parseNumeric(fahrenheit);
    if (value === null) {
        return null;
    }
    if (currentUnits === 'c') {
        return (value - 32.0) * (5.0 / 9.0);
    }
    return value;
}

function convertCci(valueInFahrenheit) {
    const value = parseNumeric(valueInFahrenheit);
    if (value === null) {
        return null;
    }
    if (currentUnits === 'c') {
        return (value - 32.0) * (5.0 / 9.0);
    }
    return value;
}

function convertRain(inches) {
    const value = parseNumeric(inches);
    if (value === null) {
        return null;
    }
    if (currentUnits === 'c') {
        return value * 25.4;
    }
    return value;
}

function convertWind(knots) {
    const value = parseNumeric(knots);
    if (value === null) {
        return null;
    }
    const mph = value * 1.15078;
    if (currentUnits === 'c') {
        return mph * 1.60934;
    }
    return mph;
}

function getTemperatureUnitLabel() {
    return currentUnits === 'c' ? '°C' : '°F';
}

function getRainUnitLabel() {
    return currentUnits === 'c' ? ' mm' : ' in';
}

function getWindUnitLabel() {
    return currentUnits === 'c' ? ' km/h' : ' mph';
}

function update_page(data) {
    const site = $("#site").val();
    const feature = data.features.find(f => getStationCodeFromRawFeature(f) === site);
    if (feature) {
        const props = feature.properties;
        const airTemp = convertTemperature(props.tmpf);
        const rainfall = convertRain(props.pday);
        const windData = getWindDisplayData(props);
        const cciRaw = parseNumeric(props[currentVariable]) ?? parseNumeric(props.cci);
        const cciValue = convertCci(cciRaw);

        $("#airtemp").text(`Air Temp: ${formatValue(airTemp, getTemperatureUnitLabel())}`);
        $("#rain").text(`Rainfall: ${formatValue(rainfall, getRainUnitLabel(), 2)}`);
        if (currentVariable === 'cci' || currentVariable === 'cci_shade') {
            $("#humidity").text(`CCI: ${formatValue(cciValue)}`);
        } else {
            const relhValue = parseNumeric(props.relh ?? props.rh);
            $("#humidity").text(`Humidity: ${formatValue(relhValue, '%')}`);
        }
        
        // Enhanced wind display with direction
        const windSpeed = windData.speed === null ? 'N/A' : Math.round(windData.speed);
        const windDir = windData.direction;
        const windText = windDir ? `Wind: ${windSpeed}${getWindUnitLabel()} ${windDir}` : `Wind Speed: ${windSpeed}${getWindUnitLabel()}`;
        $("#wind").text(windText);
        
        // If the GeoJSON feature has coordinates (standard GeoJSON: [lon, lat])
        try {
            const coords = feature.geometry && feature.geometry.coordinates;
            if (coords && coords.length >= 2) {
                // coords is [lon, lat]
                renderForecastForLatLon(coords[1], coords[0]);
            }
        } catch (e) {
            console.warn('Unable to determine coordinates for forecast lookup', e);
        }
    } else {
        // Handle case where selected station is not found in data
        $("#airtemp").text("Air Temp: No data");
        $("#rain").text("Rainfall: No data");
        $("#humidity").text("Humidity: No data");
        $("#wind").text("Wind Speed: No data");
        console.warn(`Station ${site} not found in current data`);
    }
}

function updateStatusMessage() {
    const statusElement = document.getElementById('status-message');
    if (!statusElement) {
        return;
    }
    const now = new Date();
    statusElement.textContent = `Last updated: ${now.toLocaleTimeString()}`;
    statusElement.style.color = '#333'; // Reset color on successful update
}

function load_geojson() {
    $.ajax({
        url: GEOJSON_URI,
        type: "GET",
        dataType: "json",
        success: (data) => {
            // keep a copy of the raw GeoJSON for coordinate fallbacks
            latestGeoJSON = data;
            update_page(data);
            update_map(data);
            updateStatusMessage(); // Update the status message on successful fetch
        },
        error: (xhr, status, error) => {
            const statusElement = document.getElementById('status-message');
            if (statusElement) {
                statusElement.textContent = `Failed to fetch data: ${error}`;
                statusElement.style.color = '#900';
            }
            
            // Update weather displays to show error state
            $("#airtemp").text("Air Temp: Error");
            $("#rain").text("Rainfall: Error");
            $("#humidity").text("Humidity: Error");
            $("#wind").text("Wind Speed: Error");
        }
    });
}

function highlightSelectedStation(feature) {
    if (highlightedFeature) {
        // Reset the style of the previously highlighted feature
        highlightedFeature.setStyle(createCombinedStyle(
            highlightedFeature.get('tmpf'),
            highlightedFeature.get('sknt'),
            highlightedFeature.get('drct'),
            getStationLabelText(highlightedFeature)
        ));
    }

    // Apply a highlight effect on top of the existing style
    const temp = feature.get('tmpf');
    const speed = feature.get('sknt');
    const direction = feature.get('drct');

    const highlightStyle = new ol.style.Style({
        image: new ol.style.Circle({
            radius: 10, // Larger radius for highlighting
            fill: new ol.style.Fill({ color: 'rgba(255, 255, 0, 0.5)' }), // Semi-transparent yellow
            stroke: new ol.style.Stroke({ color: 'black', width: 2 }),
        }),
        zIndex: 3, // Ensure the highlight is above other styles
    });

    feature.setStyle([highlightStyle, ...createCombinedStyle(temp, speed, direction, getStationLabelText(feature))]);
    highlightedFeature = feature; // Update the highlighted feature
}

function update_dropdown_and_page(feature) {
    const props = feature.getProperties();
    const station = getStationCodeFromOlFeature(feature);

    // Update the dropdown menu
    if (station) {
        $("#site").val(station);
    }

    // Update the displayed data
    const airTemp = convertTemperature(props.tmpf);
    const rainfall = convertRain(props.pday);
    const windData = getWindDisplayData(props);

    $("#airtemp").text(`Air Temp: ${formatValue(airTemp, getTemperatureUnitLabel())}`);
    $("#rain").text(`Rainfall: ${formatValue(rainfall, getRainUnitLabel(), 2)}`);
    if (currentVariable === 'cci' || currentVariable === 'cci_shade') {
        const cciRaw = parseNumeric(props[currentVariable]) ?? parseNumeric(props.cci);
        const cciValue = convertCci(cciRaw);
        $("#humidity").text(`CCI: ${formatValue(cciValue)}`);
    } else {
        const relhValue = parseNumeric(props.relh ?? props.rh);
        $("#humidity").text(`Humidity: ${formatValue(relhValue, '%')}`);
    }
    
    // Enhanced wind display with direction
    const windSpeed = windData.speed === null ? 'N/A' : Math.round(windData.speed);
    const windDir = windData.direction;
    const windText = windDir ? `Wind: ${windSpeed}${getWindUnitLabel()} ${windDir}` : `Wind Speed: ${windSpeed}${getWindUnitLabel()}`;
    $("#wind").text(windText);

    // Highlight the selected station on the map
    highlightSelectedStation(feature);

    // Persist the selected station in a cookie
    setCookie('selectedStation', station, 7);

    // Render NWS forecast for the selected feature's location
    try {
        const lonlat = ol.proj.toLonLat(feature.getGeometry().getCoordinates()); // [lon, lat]
        if (lonlat && lonlat.length >= 2) {
            renderForecastForLatLon(lonlat[1], lonlat[0]);
        }
    } catch (e) {
        console.warn('Could not compute lon/lat for forecast lookup', e);
        // Fallback: try to get coordinates from the last-fetched GeoJSON by station id
        try {
            if (latestGeoJSON && latestGeoJSON.features) {
                const f = latestGeoJSON.features.find(ff => ff.properties && ff.properties.station === station);
                if (f && f.geometry && f.geometry.coordinates && f.geometry.coordinates.length >= 2) {
                    renderForecastForLatLon(f.geometry.coordinates[1], f.geometry.coordinates[0]);
                }
            }
        } catch (e2) {
            console.warn('Fallback forecast lookup failed', e2);
        }
    }
}

// Ensure a forecast container exists below the map and minimal styles for the forecast row
function ensureForecastContainerExists() {
    if (!document.getElementById('nws-forecast-row')) {
        const mapStage = document.querySelector('.map-stage');
        const container = document.createElement('div');
        container.id = 'nws-forecast-row';
        container.className = 'forecast-row';
        container.style.display = 'flex';
        container.style.flexWrap = 'nowrap';
        container.style.overflowX = 'auto';
        container.style.gap = '8px';
        container.style.padding = '8px 0 2px';
        container.style.boxSizing = 'border-box';
        container.style.width = '100%';
        container.setAttribute('aria-live', 'polite');

        if (mapStage) {
            mapStage.appendChild(container);
        } else {
            document.body.appendChild(container);
        }
    }
}

// Small helper to inject card styles if not already present
function addForecastStyles() {
    if (document.getElementById('nws-forecast-styles')) return;
    const style = document.createElement('style');
    style.id = 'nws-forecast-styles';
    style.textContent = `
        #nws-forecast-row .nws-card { min-width: 200px; max-width: 320px; background:#fff; border:1px solid #d0d0d0; border-radius:6px; padding:8px; box-shadow:0 1px 2px rgba(0,0,0,0.08); font-family:Barlow,"Trebuchet MS",sans-serif; }
        #nws-forecast-row .nws-card header { display:flex; justify-content:space-between; align-items:center; }
        #nws-forecast-row .nws-card .nws-icon img { width:64px; height:64px; object-fit:contain; }
        #nws-forecast-row .nws-card .nws-short { font-weight:600; margin-top:6px; }
        #nws-forecast-row .nws-card details { margin-top:6px; }
    `;
    document.head.appendChild(style);
}

// Fetch NWS point/forecast for a lat,lon and render simple cards
async function renderForecastForLatLon(lat, lon) {
    ensureForecastContainerExists();
    addForecastStyles();
    const container = document.getElementById('nws-forecast-row');
    if (!container) return;
    container.innerHTML = '<div style="padding:8px">Loading forecast...</div>';

    try {
        // 1) Lookup point metadata
        const pointResp = await fetch(`https://api.weather.gov/points/${lat},${lon}`);
        if (!pointResp.ok) throw new Error('Point lookup failed');
        const pointJson = await pointResp.json();
        const forecastUrl = pointJson.properties && pointJson.properties.forecast;
        if (!forecastUrl) throw new Error('No forecast URL for point');

        // 2) Fetch forecast periods
        const forecastResp = await fetch(forecastUrl);
        if (!forecastResp.ok) throw new Error('Forecast fetch failed');
        const forecastJson = await forecastResp.json();
        const periods = (forecastJson.properties && forecastJson.properties.periods) || [];

        // 3) Render periods as horizontal cards (limit to first 12 to avoid huge rows)
        container.innerHTML = '';
        if (!periods.length) {
            container.innerHTML = '<div style="padding:8px">Forecast not available</div>';
            return;
        }

        periods.slice(0, 12).forEach(period => {
            const card = document.createElement('article');
            card.className = 'nws-card';
            card.innerHTML = `
                <header>
                    <div>
                        <div style="font-weight:700">${period.name}</div>
                        <div style="font-size:0.9rem;color:#555">${period.windSpeed || ''} ${period.windDirection || ''}</div>
                    </div>
                    <div style="text-align:right">
                        <div style="font-size:1.2rem;font-weight:800">${period.temperature !== null ? `${period.temperature  }°${  period.temperatureUnit}` : ''}</div>
                    </div>
                </header>
                <div style="display:flex;align-items:center;gap:8px;margin-top:6px">
                    <div class="nws-icon"><img src="${period.icon || ''}" alt="${(period.shortForecast||'').replace(/"/g,'')}"></div>
                    <div style="flex:1">
                        <div class="nws-short">${period.shortForecast || ''}</div>
                        <details><summary>Details</summary><div style="margin-top:6px">${period.detailedForecast || ''}</div></details>
                    </div>
                </div>
            `;
            container.appendChild(card);
        });

    } catch (err) {
        console.warn('Forecast render error', err);
        container.innerHTML = `<div style="padding:8px;color:#900">Forecast load failed: ${err.message}</div>`;
    }
}

function showTooltip(feature, coordinate) {
    const tooltip = document.getElementById('tooltip');
    if (!tooltip) {
        const newTooltip = document.createElement('div');
        newTooltip.id = 'tooltip';
        newTooltip.className = 'tooltip';
        document.body.appendChild(newTooltip);
    }

    const tooltipElement = document.getElementById('tooltip');
    const props = feature.getProperties();
    tooltipElement.textContent = `${props.station}: ${getActiveVariableLabel(props)}`;
    tooltipElement.style.left = `${coordinate[0]}px`;
    tooltipElement.style.top = `${coordinate[1]}px`;
    tooltipElement.style.display = 'block';
}

function hideTooltip() {
    const tooltip = document.getElementById('tooltip');
    if (tooltip) {
        tooltip.style.display = 'none';
    }
}

function enable_map_interaction(vectorLayer) {
    map.on('singleclick', (event) => {
        const features = map.getFeaturesAtPixel(event.pixel);
        if (features && features.length > 0) {
            const feature = features[0];
            if (getStationCodeFromOlFeature(feature)) {
                update_dropdown_and_page(feature);
            }
        }
    });

    map.on('pointermove', (event) => {
        const features = map.getFeaturesAtPixel(event.pixel);
        if (features && features.length > 0) {
            const feature = features[0];
            if (getStationCodeFromOlFeature(feature)) {
                showTooltip(feature, event.pixel);
            }
        } else {
            hideTooltip();
        }
    });
}

function getTemperatureColor(temp) {
    if (temp <= 0) return '#313695'; // Dark blue
    if (temp <= 10) return '#4575b4'; // Blue
    if (temp <= 20) return '#74add1'; // Light blue
    if (temp <= 30) return '#abd9e9'; // Very light blue
    if (temp <= 40) return '#e0f3f8'; // Pale blue
    if (temp <= 50) return '#fee090'; // Pale yellow
    if (temp <= 60) return '#fdae61'; // Orange
    if (temp <= 70) return '#f46d43'; // Red-orange
    if (temp <= 80) return '#d73027'; // Red
    return '#a50026'; // Dark red
}

function getVariableValue(feature, variable) {
    const rawValue = feature.get(variable);
    const value = parseNumeric(rawValue);
    if (value === null) {
        return null;
    }
    if (variable === 'tmpf' || variable === 'dwpf') {
        return convertTemperature(value);
    }
    if (variable === 'sknt') {
        return convertWind(value);
    }
    if (variable === 'pday') {
        return convertRain(value);
    }
    if (variable === 'cci' || variable === 'cci_shade') {
        return convertCci(value);
    }
    return value;
}

function getCciColor(value) {
    const normalizedF = currentUnits === 'c' ? ((value * 9.0) / 5.0) + 32.0 : value;
    if (normalizedF <= 77) return '#73d92d';
    if (normalizedF <= 86) return '#80c1ff';
    if (normalizedF <= 95) return '#ffe200';
    if (normalizedF <= 104) return '#ff8533';
    if (normalizedF <= 113) return '#ff0000';
    return '#af66cc';
}

function getCciThresholdLabels() {
    if (currentUnits === 'c') {
        return CCI_LEGEND_THRESHOLDS_F.map((value) => `${Math.round((value - 32) * (5 / 9))}°C`);
    }
    return CCI_LEGEND_THRESHOLDS_F.map((value) => `${value}°F`);
}

function getCciLegendHtml() {
    const labels = getCciThresholdLabels();

    const rows = [
        { color: '#73d92d', category: 'No Stress', range: `<= ${labels[0]}` },
        { color: '#80c1ff', category: 'Mild', range: `${labels[0]} - ${labels[1]}` },
        { color: '#ffe200', category: 'Moderate', range: `${labels[1]} - ${labels[2]}` },
        { color: '#ff8533', category: 'Severe', range: `${labels[2]} - ${labels[3]}` },
        { color: '#ff0000', category: 'Extreme', range: `${labels[3]} - ${labels[4]}` },
        { color: '#af66cc', category: 'Extreme Danger', range: `> ${labels[4]}` },
    ];

    const rowHtml = rows
        .map((row) => `
            <div class="cci-legend-row">
                <span class="cci-legend-swatch" style="background:${row.color};" aria-hidden="true"></span>
                <span class="cci-legend-category">${row.category}</span>
                <span class="cci-legend-range">${row.range}</span>
            </div>
        `)
        .join('');

    return `
        <div class="cci-legend-wrap">
            ${rowHtml}
        </div>
    `;
}

function getVariableColor(value, variable) {
    if (value === null || value === undefined || Number.isNaN(value)) {
        return '#9ba7ad';
    }
    if (variable === 'tmpf' || variable === 'dwpf') {
        const tempF = currentUnits === 'c' ? ((value * 9.0) / 5.0) + 32.0 : value;
        return getTemperatureColor(tempF);
    }
    if (variable === 'relh') {
        if (value < 20) return '#f2f5c8';
        if (value < 40) return '#d8ebb5';
        if (value < 60) return '#a9d7c6';
        if (value < 80) return '#71b5c9';
        return '#2c7da0';
    }
    if (variable === 'sknt') {
        if (value < (currentUnits === 'c' ? 8 : 5)) return '#e9f7ef';
        if (value < (currentUnits === 'c' ? 16 : 10)) return '#b8e0d1';
        if (value < (currentUnits === 'c' ? 32 : 20)) return '#78c6a3';
        if (value < (currentUnits === 'c' ? 48 : 30)) return '#4ea37c';
        return '#2d6a4f';
    }
    if (variable === 'pday') {
        const drizzle = currentUnits === 'c' ? 0.25 : 0.01;
        const light = currentUnits === 'c' ? 2.5 : 0.1;
        const moderate = currentUnits === 'c' ? 12.7 : 0.5;
        const heavy = currentUnits === 'c' ? 25.4 : 1.0;
        if (value < drizzle) return '#f3f5f7';
        if (value < light) return '#dceef8';
        if (value < moderate) return '#9bc8e4';
        if (value < heavy) return '#5a9fd1';
        return '#2367ad';
    }
    if (variable === 'cci' || variable === 'cci_shade') {
        return getCciColor(value);
    }
    return '#4575b4';
}

function getStationLabelText(feature) {
    const value = getVariableValue(feature, currentVariable);
    if (value === null) {
        return 'M';
    }

    if (currentVariable === 'pday') {
        return value.toFixed(2);
    }
    if (currentVariable === 'relh') {
        return `${Math.round(value)}%`;
    }
    return `${Math.round(value)}`;
}

function createValueLabelStyle(labelText) {
    return new ol.style.Style({
        text: new ol.style.Text({
            text: labelText,
            font: 'bold 12px Barlow, Trebuchet MS, sans-serif',
            fill: new ol.style.Fill({ color: '#111111' }),
            stroke: new ol.style.Stroke({ color: '#ffffff', width: 3 }),
            offsetY: -13,
        }),
        zIndex: 4,
    });
}

function createWindArrowStyle(speed, direction) {
    // Convert knots to mph for better scaling
    const speedMph = speed * 1.15078;
    return new ol.style.Style({
        image: new ol.style.Icon({
            src: `data:image/svg+xml;utf8,${  encodeURIComponent(`
                <svg xmlns="http://www.w3.org/2000/svg" width="75" height="75" viewBox="0 0 75 75">
                    <g transform="rotate(${direction}, 37.5, 37.5)">
                        <line x1="37.5" y1="37.5" x2="37.5" y2="10" stroke="black" stroke-width="2.5" />
                        <polygon points="37.5,10 32.5,15 42.5,15" fill="black" />
                    </g>
                </svg>
            `)}`,
            scale: Math.max(0.8, Math.min(2.5, speedMph / 12)), // Adjusted scaling for MPH values
            anchor: [0.5, 0.5], // Ensure the arrow's tail starts at the observation's location
        }),
    });
}

function createCombinedStyle(temp, speed, direction, labelText = 'M') {
    const tempValue = parseNumeric(temp);
    const speedValue = parseNumeric(speed);
    const directionValue = parseNumeric(direction);
    const labelStyle = createValueLabelStyle(labelText);

    if (tempValue === null) {
        return [
            new ol.style.Style({
                image: new ol.style.Circle({
                    radius: 6.25,
                    fill: new ol.style.Fill({ color: '#9ba7ad' }),
                    stroke: new ol.style.Stroke({ color: 'black', width: 1.25 }),
                }),
                zIndex: 2,
            }),
            labelStyle,
        ];
    }

    return [
        new ol.style.Style({
            image: new ol.style.Circle({
                radius: 6.25, // Increased radius by 25%
                fill: new ol.style.Fill({ color: getTemperatureColor(tempValue) }),
                stroke: new ol.style.Stroke({ color: 'black', width: 1.25 }), // Adjusted stroke width
            }),
            zIndex: 2, // Ensure the circle is rendered on top of the arrow
        }),
        ...(speedValue === null || directionValue === null ? [] : [createWindArrowStyle(speedValue, directionValue)]),
        labelStyle,
    ];
}

function filterRecentData(features) {
    if (!showRecentOnly) {
        return features;
    }
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000); // One hour ago

    return features.filter((feature) => {
        const ts = feature.get('utc_valid') || feature.get('valid_utc');
        if (!ts) {
            return true;
        }
        const validDate = new Date(ts);
        if (Number.isNaN(validDate.getTime())) {
            return true;
        }
        return validDate >= oneHourAgo; // Only include data within the last hour
    });
}

function update_map(data) {
    const allFeatures = new ol.format.GeoJSON().readFeatures(data, {
        featureProjection: 'EPSG:3857',
    });

    const recentFeatures = filterRecentData(allFeatures);

    const vectorSource = new ol.source.Vector({
        features: recentFeatures,
    });

    const vectorLayer = new ol.layer.Vector({
        source: vectorSource,
        style: (feature) => {
            const temp = feature.get('tmpf');
            const speed = feature.get('sknt');
            const direction = feature.get('drct');
            const labelStyle = createValueLabelStyle(getStationLabelText(feature));

            if (currentVariable !== 'tmpf') {
                const value = getVariableValue(feature, currentVariable);
                if (value === null) {
                    return createCombinedStyle(temp, speed, direction, getStationLabelText(feature));
                }
                return [
                    new ol.style.Style({
                        image: new ol.style.Circle({
                            radius: 6.25,
                            fill: new ol.style.Fill({ color: getVariableColor(value, currentVariable) }),
                            stroke: new ol.style.Stroke({ color: 'black', width: 1.25 }),
                        }),
                        zIndex: 2,
                    }),
                    labelStyle,
                ];
            }
            return createCombinedStyle(temp, speed, direction, getStationLabelText(feature));
        },
    });

    if (stationLayer) {
        map.removeLayer(stationLayer);
    }
    stationLayer = vectorLayer;
    map.addLayer(stationLayer);

    if (!interactionsEnabled) {
        enable_map_interaction(stationLayer);
        interactionsEnabled = true;
    }
}

function addTemperatureLegend() {
    const legendPanel = document.getElementById('legend-panel');
    const legendHeading = document.querySelector('.legend-panel h3');
    if (legendHeading) {
        legendHeading.textContent = VARIABLE_META[currentVariable]?.legendTitle || 'Variable Legend';
    }
    if (!legendPanel) {
        return;
    }
    if (currentVariable === 'cci' || currentVariable === 'cci_shade') {
        legendPanel.innerHTML = getCciLegendHtml();
        return;
    }

    const rows = getLegendRows(currentVariable);
    const gradient = (currentVariable === 'tmpf' || currentVariable === 'dwpf')
        ? '<div class="legend-gradient" aria-hidden="true"></div>'
        : '';
    const legendRows = rows
        .map(([color, label]) => `<div class="legend-row"><span class="legend-swatch" style="background-color:${color}"></span> ${label}</div>`)
        .join('');

    legendPanel.innerHTML = `${gradient}${legendRows}`;
}

function getLegendRows(variable) {
    if (variable === 'tmpf' || variable === 'dwpf') {
        if (currentUnits === 'c') {
            return [
                ['#313695', '<= -18 C'], ['#4575b4', '-17 to -12 C'], ['#74add1', '-11 to -7 C'],
                ['#abd9e9', '-6 to -1 C'], ['#e0f3f8', '0 to 4 C'], ['#fee090', '5 to 10 C'],
                ['#fdae61', '11 to 16 C'], ['#f46d43', '17 to 21 C'], ['#d73027', '22 to 27 C'], ['#a50026', '> 27 C'],
            ];
        }
        return [
            ['#313695', '<= 0 F'], ['#4575b4', '1-10 F'], ['#74add1', '11-20 F'],
            ['#abd9e9', '21-30 F'], ['#e0f3f8', '31-40 F'], ['#fee090', '41-50 F'],
            ['#fdae61', '51-60 F'], ['#f46d43', '61-70 F'], ['#d73027', '71-80 F'], ['#a50026', '> 80 F'],
        ];
    }
    if (variable === 'relh') {
        return [
            ['#f2f5c8', '< 20%'], ['#d8ebb5', '20-39%'], ['#a9d7c6', '40-59%'], ['#71b5c9', '60-79%'], ['#2c7da0', '>= 80%'],
        ];
    }
    if (variable === 'sknt') {
        if (currentUnits === 'c') {
            return [
                ['#e9f7ef', '< 8 km/h'], ['#b8e0d1', '8-15 km/h'], ['#78c6a3', '16-31 km/h'], ['#4ea37c', '32-47 km/h'], ['#2d6a4f', '>= 48 km/h'],
            ];
        }
        return [
            ['#e9f7ef', '< 5 mph'], ['#b8e0d1', '5-9 mph'], ['#78c6a3', '10-19 mph'], ['#4ea37c', '20-29 mph'], ['#2d6a4f', '>= 30 mph'],
        ];
    }
    if (variable === 'pday') {
        if (currentUnits === 'c') {
            return [
                ['#f3f5f7', '< 0.25 mm'], ['#dceef8', '0.25-2.49 mm'], ['#9bc8e4', '2.50-12.69 mm'], ['#5a9fd1', '12.70-25.39 mm'], ['#2367ad', '>= 25.40 mm'],
            ];
        }
        return [
            ['#f3f5f7', '< 0.01 in'], ['#dceef8', '0.01-0.09 in'], ['#9bc8e4', '0.10-0.49 in'], ['#5a9fd1', '0.50-0.99 in'], ['#2367ad', '>= 1.00 in'],
        ];
    }
    if (variable === 'cci' || variable === 'cci_shade') {
        return [
            ['#73d92d', 'No Stress'], ['#80c1ff', 'Mild'], ['#ffe200', 'Moderate'],
            ['#ff8533', 'Severe'], ['#ff0000', 'Extreme'], ['#af66cc', 'Extreme Danger'],
        ];
    }
    return LEGEND_CONTENT.tmpf;
}

function getActiveVariableLabel(props) {
    const value = props[currentVariable];
    if (value === null || value === undefined || Number.isNaN(value)) {
        return `${(VARIABLE_META[currentVariable]?.title || 'Value')}: N/A`;
    }
    if (currentVariable === 'tmpf' || currentVariable === 'dwpf') {
        return `${VARIABLE_META[currentVariable].title}: ${formatValue(convertTemperature(value), getTemperatureUnitLabel())}`;
    }
    if (currentVariable === 'sknt') {
        return `${VARIABLE_META[currentVariable].title}: ${formatValue(convertWind(value), getWindUnitLabel())}`;
    }
    if (currentVariable === 'pday') {
        return `${VARIABLE_META[currentVariable].title}: ${formatValue(convertRain(value), getRainUnitLabel(), 2)}`;
    }
    if (currentVariable === 'relh') {
        return `${VARIABLE_META[currentVariable].title}: ${formatValue(value, '%')}`;
    }
    if (currentVariable === 'cci' || currentVariable === 'cci_shade') {
        return `${VARIABLE_META[currentVariable].title}: ${formatValue(convertCci(value))}`;
    }
    return `${VARIABLE_META[currentVariable]?.title || 'Value'}: ${formatValue(value)}`;
}

function syncVariableUi(variable) {
    const mapTitle = document.querySelector('.map-title');
    if (mapTitle) {
        mapTitle.textContent = `${VARIABLE_META[variable]?.title || 'Variable'} - Current`;
    }
    document.querySelectorAll('.variable-tab').forEach((tab) => {
        tab.classList.toggle('is-active', tab.dataset.variable === variable);
    });
    const select = document.getElementById('display-variable');
    if (select) {
        select.value = variable;
    }
}

function syncStateToUrl() {
    const url = new URL(window.location.href);
    url.searchParams.set('variable', currentVariable);
    url.searchParams.set('units', currentUnits === 'c' ? 'metric' : 'english');
    url.searchParams.delete('map');
    window.history.replaceState({}, '', url);
}

function normalizeUnits(units) {
    const value = (units || '').toString().toLowerCase();
    if (value === 'metric' || value === 'c' || value === 'si') {
        return 'c';
    }
    if (value === 'english' || value === 'f' || value === 'imperial') {
        return 'f';
    }
    return null;
}

function getUnitsSelectValue() {
    return currentUnits === 'c' ? 'metric' : 'english';
}

function setCurrentVariable(variable) {
    if (!VARIABLE_META[variable]) {
        return;
    }
    currentVariable = variable;
    syncVariableUi(variable);
    addTemperatureLegend();
    syncStateToUrl();
    if (latestGeoJSON) {
        update_page(latestGeoJSON);
        update_map(latestGeoJSON);
    }
}

function setCurrentUnits(units) {
    const normalizedUnits = normalizeUnits(units);
    if (!normalizedUnits) {
        return;
    }
    currentUnits = normalizedUnits;
    const unitSelect = document.getElementById('display-units');
    if (unitSelect) {
        unitSelect.value = getUnitsSelectValue();
    }
    addTemperatureLegend();
    syncStateToUrl();
    if (latestGeoJSON) {
        update_page(latestGeoJSON);
        update_map(latestGeoJSON);
    }
}

function setStatus(message) {
    const statusElement = document.getElementById('status-message');
    if (statusElement) {
        statusElement.textContent = message;
    }
}

function toggleBasemap() {
    if (!baseTileLayer) {
        return;
    }
    if (baseLayerMode === 'osm') {
        baseTileLayer.setSource(new ol.source.XYZ({
            url: 'https://{a-c}.tile.opentopomap.org/{z}/{x}/{y}.png',
            attributions: 'Map data: OpenStreetMap contributors, SRTM | Style: OpenTopoMap',
        }));
        baseLayerMode = 'topo';
        setStatus('Basemap: Topographic');
    } else {
        baseTileLayer.setSource(new ol.source.OSM());
        baseLayerMode = 'osm';
        setStatus('Basemap: Standard OSM');
    }
    const layerBtn = document.getElementById('rail-layers');
    if (layerBtn) {
        layerBtn.classList.toggle('is-active', baseLayerMode === 'topo');
    }
}

function toggleObservationPanel() {
    const layout = document.querySelector('.wx-layout');
    if (!layout) {
        return;
    }
    layout.classList.toggle('obs-collapsed');
    const panelBtn = document.getElementById('rail-panel-toggle');
    if (panelBtn) {
        panelBtn.classList.toggle('is-active', layout.classList.contains('obs-collapsed'));
    }
    setTimeout(() => {
        if (map) {
            map.updateSize();
        }
    }, 150);
}

function downloadLatestGeojson() {
    if (!latestGeoJSON) {
        setStatus('No data available to download yet.');
        return;
    }
    const blob = new Blob([JSON.stringify(latestGeoJSON, null, 2)], { type: 'application/geo+json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rdfwx-current-${new Date().toISOString().slice(0, 16).replace(':', '')}.geojson`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setStatus('Downloaded latest station data.');
}

function toggleStaleStations() {
    showRecentOnly = !showRecentOnly;
    const staleBtn = document.getElementById('rail-stale-toggle');
    if (staleBtn) {
        staleBtn.classList.toggle('is-active', !showRecentOnly);
    }
    if (latestGeoJSON) {
        update_map(latestGeoJSON);
    }
    setStatus(showRecentOnly ? 'Showing observations from last hour.' : 'Showing all stations, including stale observations.');
}

function initToolbarUi() {
    document.querySelectorAll('.variable-tab').forEach((tab) => {
        tab.addEventListener('click', () => {
            setCurrentVariable(tab.dataset.variable);
        });
    });

    const variableSelect = document.getElementById('display-variable');
    if (variableSelect) {
        variableSelect.addEventListener('change', (event) => {
            setCurrentVariable(event.target.value);
        });
    }

    const unitsSelect = document.getElementById('display-units');
    if (unitsSelect) {
        unitsSelect.value = getUnitsSelectValue();
        unitsSelect.addEventListener('change', (event) => {
            setCurrentUnits(event.target.value);
        });
    }

    syncVariableUi(currentVariable);
}

function initToolRailUi() {
    const layerBtn = document.getElementById('rail-layers');
    if (layerBtn) {
        layerBtn.addEventListener('click', toggleBasemap);
    }
    const panelBtn = document.getElementById('rail-panel-toggle');
    if (panelBtn) {
        panelBtn.addEventListener('click', toggleObservationPanel);
    }
    const downloadBtn = document.getElementById('rail-download');
    if (downloadBtn) {
        downloadBtn.addEventListener('click', downloadLatestGeojson);
    }
    const staleBtn = document.getElementById('rail-stale-toggle');
    if (staleBtn) {
        staleBtn.addEventListener('click', toggleStaleStations);
    }
}

function initVariableFromQueryString() {
    const params = new URLSearchParams(window.location.search);
    const variableParam = (params.get('variable') || '').toLowerCase();
    if (VARIABLE_META[variableParam]) {
        currentVariable = variableParam;
        return;
    }

    const mapParam = (params.get('map') || '').toLowerCase();
    if (mapParam === 'stressadultcattlecomfortindexshade' || mapParam === 'cattlecomfortindexshade' || mapParam === 'ccishade' || mapParam === 'cci_shade') {
        currentVariable = 'cci_shade';
        return;
    }
    if (mapParam === 'stressadultcattlecomfortindex' || mapParam === 'cattlecomfortindex' || mapParam === 'cci') {
        currentVariable = 'cci';
        return;
    }
}

function initUnitsFromQueryString() {
    const params = new URLSearchParams(window.location.search);
    const normalizedUnits = normalizeUnits(params.get('units'));
    if (normalizedUnits) {
        currentUnits = normalizedUnits;
    }
}

// Function to get a cookie value by name
function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
}

// Function to set a cookie
function setCookie(name, value, days) {
    const date = new Date();
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
    const expires = `expires=${date.toUTCString()}`;
    document.cookie = `${name}=${value}; ${expires}; path=/`;
}

function startAutoRefresh() {
    setInterval(() => {
        load_geojson(); // Refresh the GeoJSON source and update the map and data display
    }, 5 * 60 * 1000); // 5 minutes in milliseconds
}

$(document).ready(() => {
    let persistedStation = getCookie('selectedStation');
    if (!persistedStation) {
        persistedStation = 'BOOI4';
        setCookie('selectedStation', persistedStation, 7);
    }

    $("#site").val(persistedStation);

    $("#site").change(() => {
        const site = $("#site").val();
        setCookie('selectedStation', site, 7);
        load_geojson();
    });

    // Initialize the OpenLayers map
    baseTileLayer = new ol.layer.Tile({
        source: new ol.source.OSM(),
    });

    map = new ol.Map({
        target: 'map',
        layers: [
            baseTileLayer,
        ],
        view: new ol.View({
            center: ol.proj.fromLonLat([-93.65, 42.02]), // Centered on Ames, Iowa
            zoom: 7,
        }),
    });

    // Trigger a resize event to ensure the map is rendered correctly
    setTimeout(() => {
        map.updateSize();
    }, 100);

    $(window).on('resize', () => {
        map.updateSize();
    });

    // Ensure forecast container exists even before any selection
    ensureForecastContainerExists();
    addForecastStyles();
    initVariableFromQueryString();
    initUnitsFromQueryString();
    initToolbarUi();
    initToolRailUi();

    addTemperatureLegend();
    load_geojson();
    startAutoRefresh(); // Start the automatic refresh
});