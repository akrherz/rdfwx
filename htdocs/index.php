<?php
require_once "../include/myview.php";
$OL="10.10.0";
$t = new MyView();
$t->content = <<<EOM

    <div class="wx-layout">
        <aside class="obs-panel" aria-label="Observation panel">
            <div class="panel-header">
                <h2>Current Observations</h2>
                <p class="panel-subtitle">Research and Demonstration Farm Stations</p>
            </div>

            <div class="station-select">
                <label for="site">Select Site</label>
                <select id="site" class="form-control">
                    <option value="BOOI4">Ames - AEA ISU-RDF</option>
                    <option value="AMFI4">Ames - Finch Farm</option>
                    <option value="AHDI4">Ames - Hinds Farm</option>
                    <option value="AEEI4">Ames - Horticulture ISU-RDF</option>
                    <option value="AHTI4">Ames - Horticulture (Vineyard)</option>
                    <option value="AKCI4">Ames - Kitchen Farm</option>
                    <option value="BNKI4">Bankston - Park Farm Winery (Vineyard)</option>
                    <option value="CNAI4">Castana - Western ISU-RDF</option>
                    <option value="CIRI4">Cedar Rapids</option>
                    <option value="SBEI4">CFE - Ocheyedan</option>
                    <option value="CHAI4">Chariton - McNay ISU-RDF</option>
                    <option value="CRFI4">Crawfordsville - Southeast ISU-RDF</option>
                    <option value="DONI4">Doon</option>
                    <option value="FRUI4">Fruitland - Muscatine Island ISU-RDF</option>
                    <option value="GVNI4">Glenwood - Blackwing Vineyard</option>
                    <option value="GREI4">Greenfield - Neely Kinyon ISU-RDF</option>
                    <option value="CSII4">Inwood - Calico Skies Winery</option>
                    <option value="DOCI4">Jefferson - Deals Orchard</option>
                    <option value="KNAI4">Kanawha</option>
                    <option value="OKLI4">Lewis - Armstrong ISU-RDF</option>
                    <option value="MCSI4">Marcus</option>
                    <option value="TPOI4">Masonville - Timeless Prairie Orchard</option>
                    <option value="NASI4">Nashua - Northeast ISU-RDF</option>
                    <option value="NWLI4">Newell - Allee ISU-RDF</option>
                    <option value="OSTI4">Oskaloosa - Tassel Ridge (Vineyard)</option>
                    <option value="CAMI4">Sutherland - Northwest ISU-RDF</option>
                    <option value="WMNI4">Wellman</option>
                    <option value="WTPI4">West Point</option>
                </select>
            </div>

            <div class="weather-container" aria-live="polite">
                <div class="weather-item" id="airtemp">Air Temp: Loading...</div>
                <div class="weather-item" id="rain">Rainfall: Loading...</div>
                <div class="weather-item" id="humidity">Humidity: Loading...</div>
                <div class="weather-item" id="wind">Wind Speed: Loading...</div>
            </div>

            <div id="status-message" class="status-message">Fetching data...</div>

            <section class="legend-panel">
                <h3>Temperature Legend</h3>
                <div id="legend-panel" class="legend-list"></div>
            </section>
        </aside>

        <div class="map-stage">
            <div class="map-toolbar" aria-label="Map controls">
                <h2 class="map-title">Air Temperature - Current</h2>
                <div class="toolbar-row">
                    <div class="variable-tabs" role="tablist" aria-label="Variable selector">
                        <button class="variable-tab is-active" data-variable="tmpf" type="button">Air Temp</button>
                        <button class="variable-tab" data-variable="dwpf" type="button">Dew Point</button>
                        <button class="variable-tab" data-variable="relh" type="button">Humidity</button>
                        <button class="variable-tab" data-variable="sknt" type="button">Wind</button>
                        <button class="variable-tab" data-variable="pday" type="button">Rain</button>
                        <button class="variable-tab" data-variable="cci" type="button">CCI</button>
                        <button class="variable-tab" data-variable="cci_shade" type="button">CCI Shade</button>
                    </div>
                    <div class="toolbar-selects">
                        <label class="sr-only" for="display-variable">Display variable</label>
                        <select id="display-variable" class="control-select control-select-variable">
                            <option value="tmpf" selected>Air Temperature</option>
                            <option value="dwpf">Dew Point</option>
                            <option value="relh">Relative Humidity</option>
                            <option value="sknt">Wind Speed</option>
                            <option value="pday">Daily Rainfall</option>
                            <option value="cci">Cattle Comfort Index</option>
                            <option value="cci_shade">Cattle Comfort Index Shade</option>
                        </select>
                        <label class="sr-only" for="display-units">Display units</label>
                        <select id="display-units" class="control-select">
                            <option value="english" selected>English Units</option>
                            <option value="metric">Metric Units</option>
                        </select>
                    </div>
                </div>
            </div>

            <div id="map" class="map-container"></div>

            <div class="tool-rail" aria-label="Map quick tools">
                <button id="rail-layers" class="rail-btn" type="button" title="Toggle basemap" aria-label="Toggle basemap">L</button>
                <button id="rail-panel-toggle" class="rail-btn" type="button" title="Toggle observation panel" aria-label="Toggle observation panel">S</button>
                <button id="rail-download" class="rail-btn" type="button" title="Download latest data" aria-label="Download latest data">D</button>
                <button id="rail-stale-toggle" class="rail-btn rail-btn-alert" type="button" title="Toggle stale stations" aria-label="Toggle stale stations">!</button>
            </div>

            <div id="nws-forecast-row" class="forecast-row" aria-live="polite"></div>
        </div>
    </div>
EOM;
$t->headextra = <<<EOM
<link rel="stylesheet" href="/vendor/openlayers/{$OL}/ol.css">
<link rel="stylesheet" href="styles.css?v=2">
EOM;
$t->jsextra = <<<EOM
<script src="/vendor/openlayers/{$OL}/ol.js"></script>
<script src="index.js?v=4"></script>
EOM;

$t->render('full.phtml');