const GEOJSON_URI = "https://mesonet.agron.iastate.edu/api/1/currents.geojson?network=ISUSM";

let map = null;
let highlightedFeature = null; // Track the currently highlighted feature
let latestGeoJSON = null; // store last fetched GeoJSON for fallbacks

function update_page(data) {
    const site = $("#site").val();
    const feature = data.features.find(f => f.properties.station === site);
    if (feature) {
        const props = feature.properties;
        $("#airtemp").text(`Air Temp: ${props.tmpf} °F`);
        $("#rain").text(`Rainfall: ${props.pday} in`);
        $("#humidity").text(`Humidity: ${props.relh} %`);
        $("#wind").text(`Wind Speed: ${props.sknt} knots`);
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
    }
}

function updateStatusMessage() {
    const statusElement = document.getElementById('status-message');
    const now = new Date();
    statusElement.textContent = `Last updated: ${now.toLocaleTimeString()}`;
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
        error: () => {
            const statusElement = document.getElementById('status-message');
            statusElement.textContent = 'Failed to fetch data';
        }
    });
}

function highlightSelectedStation(feature) {
    if (highlightedFeature) {
        // Reset the style of the previously highlighted feature
        highlightedFeature.setStyle(createCombinedStyle(
            highlightedFeature.get('tmpf'),
            highlightedFeature.get('sknt'),
            highlightedFeature.get('drct')
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

    feature.setStyle([highlightStyle, ...createCombinedStyle(temp, speed, direction)]);
    highlightedFeature = feature; // Update the highlighted feature
}

function update_dropdown_and_page(feature) {
    const props = feature.getProperties();
    const station = props.station;

    // Update the dropdown menu
    $("#site").val(station);

    // Update the displayed data
    $("#airtemp").text(`Air Temp: ${props.tmpf} °F`);
    $("#rain").text(`Rainfall: ${props.pday} in`);
    $("#humidity").text(`Humidity: ${props.relh} %`);
    $("#wind").text(`Wind Speed: ${props.sknt} knots`);

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
        const mapEl = document.getElementById('map');
        const container = document.createElement('div');
        container.id = 'nws-forecast-row';
        container.style.display = 'flex';
        container.style.flexWrap = 'nowrap';
        container.style.overflowX = 'auto';
        container.style.gap = '8px';
        container.style.padding = '8px';
        container.style.background = 'rgba(255,255,255,0.95)';
        container.style.borderTop = '1px solid #ccc';
        container.style.boxSizing = 'border-box';
        container.style.width = '100%';
        container.setAttribute('aria-live', 'polite');

        // Place the forecast row after the map element
        if (mapEl && mapEl.parentNode) {
            mapEl.parentNode.insertBefore(container, mapEl.nextSibling);
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
        #nws-forecast-row .nws-card { min-width: 200px; max-width: 320px; background:#fff; border:1px solid #d0d0d0; border-radius:6px; padding:8px; box-shadow:0 1px 2px rgba(0,0,0,0.08); font-family:Arial,Helvetica,sans-serif; }
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
    tooltipElement.textContent = `${props.station}: ${props.tmpf}°F, ${props.sknt} knots`;
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
            if (feature.getProperties().station) {
                update_dropdown_and_page(feature);
            }
        }
    });

    map.on('pointermove', (event) => {
        const features = map.getFeaturesAtPixel(event.pixel);
        if (features && features.length > 0) {
            const feature = features[0];
            if (feature.getProperties().station) {
                showTooltip(feature, event.coordinate);
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

function createWindArrowStyle(speed, direction) {
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
            scale: Math.max(1, Math.min(2.5, speed / 10)), // Adjusted scaling for better visibility
            anchor: [0.5, 0.5], // Ensure the arrow's tail starts at the observation's location
        }),
    });
}

function createCombinedStyle(temp, speed, direction) {
    if (temp === null || speed === null || direction === null) {
        return [
            new ol.style.Style({
                text: new ol.style.Text({
                    text: 'M',
                    font: 'bold 16px Arial',
                    fill: new ol.style.Fill({ color: 'black' }),
                    stroke: new ol.style.Stroke({ color: 'white', width: 2 }),
                }),
            }),
        ];
    }

    const windArrowStyle = createWindArrowStyle(speed, direction);

    return [
        new ol.style.Style({
            image: new ol.style.Circle({
                radius: 6.25, // Increased radius by 25%
                fill: new ol.style.Fill({ color: getTemperatureColor(temp) }),
                stroke: new ol.style.Stroke({ color: 'black', width: 1.25 }), // Adjusted stroke width
            }),
            zIndex: 2, // Ensure the circle is rendered on top of the arrow
        }),
        windArrowStyle,
    ];
}

function filterRecentData(features) {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000); // One hour ago

    return features.filter((feature) => {
        const utcValid = new Date(feature.get('utc_valid'));
        return utcValid >= oneHourAgo; // Only include data within the last hour
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

            return createCombinedStyle(temp, speed, direction);
        },
    });

    map.addLayer(vectorLayer);
    enable_map_interaction(vectorLayer);
}

function addTemperatureLegend() {
    const legend = document.createElement('div');
    legend.id = 'temperature-legend';
    legend.style.position = 'absolute';
    legend.style.right = '10px';
    legend.style.bottom = '10px'; // Adjusted to display within the map space
    legend.style.backgroundColor = 'rgba(255, 255, 255, 0.8)'; // Semi-transparent background
    legend.style.padding = '5px';
    legend.style.border = '1px solid black';
    legend.style.fontSize = '12px'; // Smaller font size to save space
    legend.innerHTML = `
        <h4 style="margin: 0; font-size: 14px;">Temperature (°F)</h4>
        <div><span style="background-color: #313695; width: 12px; height: 12px; display: inline-block;">&nbsp;</span> ≤ 0</div>
        <div><span style="background-color: #4575b4; width: 12px; height: 12px; display: inline-block;">&nbsp;</span> 1-10</div>
        <div><span style="background-color: #74add1; width: 12px; height: 12px; display: inline-block;">&nbsp;</span> 11-20</div>
        <div><span style="background-color: #abd9e9; width: 12px; height: 12px; display: inline-block;">&nbsp;</span> 21-30</div>
        <div><span style="background-color: #e0f3f8; width: 12px; height: 12px; display: inline-block;">&nbsp;</span> 31-40</div>
        <div><span style="background-color: #fee090; width: 12px; height: 12px; display: inline-block;">&nbsp;</span> 41-50</div>
        <div><span style="background-color: #fdae61; width: 12px; height: 12px; display: inline-block;">&nbsp;</span> 51-60</div>
        <div><span style="background-color: #f46d43; width: 12px; height: 12px; display: inline-block;">&nbsp;</span> 61-70</div>
        <div><span style="background-color: #d73027; width: 12px; height: 12px; display: inline-block;">&nbsp;</span> 71-80</div>
        <div><span style="background-color: #a50026; width: 12px; height: 12px; display: inline-block;">&nbsp;</span> > 80</div>
    `;
    document.getElementById('map').appendChild(legend); // Append to the map container
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
    load_geojson();

    $("#site").change(() => {
        const site = $("#site").val();
        setCookie('selectedStation', site, 7);
        load_geojson();
    });

    // Initialize the OpenLayers map
    map = new ol.Map({
        target: 'map',
        layers: [
            new ol.layer.Tile({
                source: new ol.source.OSM(),
            }),
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

    // Add status message element to the map container
    const statusElement = document.createElement('div');
    statusElement.id = 'status-message';
    statusElement.style.position = 'absolute';
    statusElement.style.left = '10px';
    statusElement.style.bottom = '10px';
    statusElement.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
    statusElement.style.padding = '5px';
    statusElement.style.border = '1px solid black';
    statusElement.style.fontSize = '12px';
    statusElement.textContent = 'Fetching data...';
    document.getElementById('map').appendChild(statusElement);

    // Add temperature legend to the map container
    const legend = document.createElement('div');
    legend.id = 'temperature-legend';
    legend.style.position = 'absolute';
    legend.style.right = '10px';
    legend.style.bottom = '10px';
    legend.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
    legend.style.padding = '5px';
    legend.style.border = '1px solid black';
    legend.style.fontSize = '12px';
    legend.innerHTML = `
        <h4 style="margin: 0; font-size: 14px;">Temperature (°F)</h4>
        <div><span style="background-color: #313695; width: 12px; height: 12px; display: inline-block;">&nbsp;</span> ≤ 0</div>
        <div><span style="background-color: #4575b4; width: 12px; height: 12px; display: inline-block;">&nbsp;</span> 1-10</div>
        <div><span style="background-color: #74add1; width: 12px; height: 12px; display: inline-block;">&nbsp;</span> 11-20</div>
        <div><span style="background-color: #abd9e9; width: 12px; height: 12px; display: inline-block;">&nbsp;</span> 21-30</div>
        <div><span style="background-color: #e0f3f8; width: 12px; height: 12px; display: inline-block;">&nbsp;</span> 31-40</div>
        <div><span style="background-color: #fee090; width: 12px; height: 12px; display: inline-block;">&nbsp;</span> 41-50</div>
        <div><span style="background-color: #fdae61; width: 12px; height: 12px; display: inline-block;">&nbsp;</span> 51-60</div>
        <div><span style="background-color: #f46d43; width: 12px; height: 12px; display: inline-block;">&nbsp;</span> 61-70</div>
        <div><span style="background-color: #d73027; width: 12px; height: 12px; display: inline-block;">&nbsp;</span> 71-80</div>
        <div><span style="background-color: #a50026; width: 12px; height: 12px; display: inline-block;">&nbsp;</span> > 80</div>
    `;
    document.getElementById('map').appendChild(legend);

    addTemperatureLegend();
    startAutoRefresh(); // Start the automatic refresh
});