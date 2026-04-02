/*
    Argus Cyclist - Virtual Cycling Environment for interactive bicycling experiments.
    Copyright (C) 2026  Paulo Sérgio

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { CONFIG } from '../config.js';

export class MapController {
    constructor() {
        this.map = null;
        this.marker = null;
        this.markerElement = null;
        this.currentStyleIndex = 0;
        this.followCyclist = false;
        this.isFlying = false;
        this.prevLngLat = null;
        this.lastBearingUpdatePos = null;
        this.routeGeoJSON = null;

        // --- EDITOR STATE ---
        this.editorMode = false;
        this.editorMarkers = [];
        this.editorPoints = [];
        this.generatedRouteData = null;

        this.lastXPDist = 0;
    }

    init(containerId) {
        this.map = new maplibregl.Map({
            container: containerId,
            style: CONFIG.STYLES[this.currentStyleIndex],
            center: CONFIG.START_POSITION,
            zoom: CONFIG.DEFAULT_ZOOM,
            pitch: 60,
            bearing: 0,
            antialias: true
        });

        this.map.addControl(new maplibregl.NavigationControl({
            showCompass: true,
            visualizePitch: true
        }), 'top-right');

        this.map.on('load', () => {
            this.setup3DEnvironment();
            this.addRouteLayer();

            if (this.editorMode) this.setupEditorLayers();

            // Adiciona o efeito visual de passar o mouse sobre a linha no modo editor
            this.map.on('mouseenter', 'editor-route', () => { if (this.editorMode) this.map.getCanvas().style.cursor = 'copy'; });
            this.map.on('mouseleave', 'editor-route', () => { if (this.editorMode) this.map.getCanvas().style.cursor = 'crosshair'; });
        });

        this.map.on('style.load', () => {
            this.setup3DEnvironment();
            this.addRouteLayer();
            // === NOVO: Restaura a linha vermelha do Editor ===
            if (this.editorMode && this.generatedRouteData && this.generatedRouteData.length > 0) {
                // Converte os dados salvos de volta para o formato [lng, lat] que o mapa exige
                const coords = this.generatedRouteData.map(p => [p.lon, p.lat]);
                this.drawEditorRoute(coords);
            }
        });

        this.map.on('click', (e) => {
            if (this.editorMode) this.handleEditorClick(e);
        });

        this.map.on('dragstart', () => { this.followCyclist = false; });

        this.initMarker();
    }

    setup3DEnvironment() {
        if (!this.map) return;

        if (!this.map.getSource('terrain-source')) {
            this.map.addSource('terrain-source', {
                type: 'raster-dem',
                url: CONFIG.TERRAIN_SOURCE,
                tileSize: 256
            });
        }

        this.map.setTerrain({
            source: 'terrain-source',
            exaggeration: 1.5
        });

        if (!this.map.getLayer('3d-buildings')) {
            const layers = this.map.getStyle().layers;
            const labelLayerId = layers.find(l => l.type === 'symbol' && l.layout['text-field'])?.id;

            this.map.addLayer({
                'id': '3d-buildings',
                'source': 'openmaptiles',
                'source-layer': 'building',
                'filter': ['!=', 'hide_3d', true],
                'type': 'fill-extrusion',
                'minzoom': 13,
                'paint': {
                    'fill-extrusion-color': [
                        'interpolate', ['linear'], ['get', 'render_height'],
                        0, '#d1d5db',
                        30, '#9ca3af',
                        100, '#4b5563'
                    ],
                    'fill-extrusion-height': ['get', 'render_height'],
                    'fill-extrusion-base': ['get', 'render_min_height'],
                    'fill-extrusion-opacity': 0.8
                }
            }, labelLayerId);
        }
    }

    initMarker() {
        this.markerElement = document.createElement('div');
        this.markerElement.className = 'cyclist-marker';

        this.markerElement.innerHTML = `
            <svg viewBox="0 0 512 512" width="40" height="40" style="overflow: visible;">
                <path class="arrow-shape" 
                      d="M233.4 27.8C244.6 10.4 267.4 10.4 278.6 27.8L487.4 354.2C498.4 371.4 484.9 396.2 463.9 394.6L266.6 377.1C260.6 376.6 251.4 376.6 245.4 377.1L48.1 394.6C27.1 396.2 13.6 371.4 24.6 354.2L233.4 27.8Z" 
                />
            </svg>
        `;

        this.markerElement.style.width = '40px';
        this.markerElement.style.height = '40px';

        this.marker = new maplibregl.Marker({
            element: this.markerElement,
            rotationAlignment: 'map',
            pitchAlignment: 'map',
            anchor: 'center'
        })
            .setLngLat(CONFIG.START_POSITION)
            .addTo(this.map);
    }

    // ===================
    // CAMERA AND POSITION
    // ===================

    updatePosition(lat, lng, heading) {
        if (!this.map || !this.marker) return;

        const newLngLat = [lng, lat];

        this.marker.setLngLat(newLngLat);

        if (heading !== undefined && heading !== null) {
            this.marker.setRotation(heading);
        }

        if (this.followCyclist) {
            this.map.easeTo({
                center: newLngLat,
                bearing: heading || this.map.getBearing(),
                pitch: 60,
                duration: 1000,
                easing: (t) => t
            });
        }

        this.prevLngLat = newLngLat;
    }

    updateCyclistPosition(lat, lon, speed, telemetry) {
        if (lat === 0 && lon === 0) return;

        let heading = this.marker.getRotation();
        if (this.prevLngLat) {
            const calculatedBearing = this.calculateBearing(this.prevLngLat[1], this.prevLngLat[0], lat, lon);
            if (!isNaN(calculatedBearing) && speed > 1.0) {
                heading = calculatedBearing;
            }
        }

        this.updatePosition(lat, lon, heading);

        if (telemetry && telemetry.total_dist > 0) {
            this.calculatePassiveXP(telemetry);
        }
    }

    calculateBearing(lat1, lon1, lat2, lon2) {
        const toRad = (deg) => deg * Math.PI / 180;
        const toDeg = (rad) => rad * 180 / Math.PI;
        const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
        const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
            Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
        return (toDeg(Math.atan2(y, x)) + 360) % 360;
    }

    // ===============
    // ROUTE RENDERING
    // ===============

    addRouteLayer() {
        if (!this.routeGeoJSON || !this.map) return;

        const sourceId = 'route';
        const outlineSourceId = 'route-continuous';
        const currentTheme = CONFIG.THEMES[this.currentStyleIndex];

        const istactical = currentTheme === 'tactical';
        const isSatellite = currentTheme === 'satellite';

        const outlineColor = isSatellite ? '#ffffff' : '#000000';
        const outlineOpacity = isSatellite ? 0.9 : 0.4;
        const outlineWidth = isSatellite ? 12 : 10;
        const wallColor = isSatellite ? '#ffffff' : '#000000';

        ['route-glow', 'route-line', 'route-case', 'route-outline', 'route'].forEach(id => {
            if (this.map.getLayer(id)) this.map.removeLayer(id);
        });

        if (this.map.getSource(sourceId)) {
            this.map.getSource(sourceId).setData(this.routeGeoJSON);
        } else {
            this.map.addSource(sourceId, {
                type: 'geojson',
                data: this.routeGeoJSON,
                lineMetrics: false
            });
        }

        let continuousCoords = [];
        if (this.routeGeoJSON.features && this.routeGeoJSON.features.length > 0) {
            this.routeGeoJSON.features.forEach((f, i) => {
                if (f.geometry && f.geometry.coordinates && f.geometry.coordinates.length === 2) {
                    if (i === 0) continuousCoords.push(f.geometry.coordinates[0]);
                    continuousCoords.push(f.geometry.coordinates[1]);
                }
            });
        }

        const continuousGeoJSON = {
            type: 'Feature',
            geometry: {
                type: 'LineString',
                coordinates: continuousCoords
            }
        };

        if (this.map.getSource(outlineSourceId)) {
            this.map.getSource(outlineSourceId).setData(continuousGeoJSON);
        } else {
            this.map.addSource(outlineSourceId, {
                type: 'geojson',
                data: continuousGeoJSON
            });
        }

        const gradientExpression = [
            'interpolate', ['linear'], ['get', 'grade'],
            -10, '#2ecc71',
            0, '#2ecc71',
            3, '#f1c40f',
            6, '#e67e22',
            9, '#e74c3c',
            12, '#8e44ad',
            15, wallColor
        ];

        this.map.addLayer({
            id: 'route-outline',
            type: 'line',
            source: outlineSourceId,
            layout: {
                'line-join': 'round',
                'line-cap': 'round'
            },
            paint: {
                'line-width': outlineWidth,
                'line-color': outlineColor,
                'line-opacity': outlineOpacity,
                'line-blur': 0
            }
        });

        this.map.addLayer({
            id: 'route',
            type: 'line',
            source: sourceId,
            layout: {
                'line-join': 'bevel',
                'line-cap': 'butt'
            },
            paint: {
                'line-width': istactical ? 8 : 6,
                'line-color': gradientExpression,
                'line-opacity': 1.0
            }
        });

        const labels = this.map.getStyle().layers.find(l => l.type === 'symbol');
        if (labels) {
            if (this.map.getLayer('route-outline')) this.map.moveLayer('route-outline', labels.id);
            if (this.map.getLayer('route')) this.map.moveLayer('route', labels.id);
        }
    }

    resetState() {
        this.prevLngLat = null;
        this.lastXPDist = 0;
        this.followCyclist = true;
    }

    renderRoute(geojson) {
        this.routeGeoJSON = geojson;

        this.resetState();

        if (this.map.loaded()) {
            this.addRouteLayer();
        }
    }

    // ================
    // THEME MANAGEMENT
    // ================

    toggleLayer() {
        const nextIndex = (this.currentStyleIndex + 1) % CONFIG.STYLES.length;
        this.currentStyleIndex = nextIndex;
        const nextStyleURL = CONFIG.STYLES[nextIndex];

        document.documentElement.setAttribute('data-theme', CONFIG.THEMES[nextIndex]);

        this.map.setStyle(nextStyleURL);
    }

    // ==============
    // HELPER METHODS
    // ==============

    setInitialPosition(lat, lon) {
        this.map.jumpTo({ center: [lon, lat], zoom: 17, pitch: 60, bearing: 0 });
        if (this.marker) this.marker.setLngLat([lon, lat]);
        this.prevLngLat = [lon, lat];
        this.followCyclist = true;
    }

    centerCamera() {
        if (this.prevLngLat) {
            this.followCyclist = true;
            this.isFlying = true;

            this.map.flyTo({
                center: this.prevLngLat,
                zoom: 17,
                pitch: 60,
                bearing: this.marker ? this.marker.getRotation() : 0,
                duration: 1500
            });

            setTimeout(() => {
                this.isFlying = false;
            }, 1550);
        }
    }

    calculatePassiveXP(telemetry) {
        if (telemetry.total_dist <= 0) return;
        if (this.lastXPDist === 0) {
            this.lastXPDist = telemetry.total_dist;
            return;
        }
        const deltaMeters = telemetry.total_dist - this.lastXPDist;
        if (deltaMeters > 1.0) {
            let xpGain = deltaMeters * 0.1;
            const grade = telemetry.grade || 0;
            if (grade > 2.0) xpGain *= 1.5;
            if (grade > 5.0) xpGain *= 2.0;
            if (window.ui && window.ui.addXP) {
                window.ui.addXP(xpGain);
            }
            this.lastXPDist = telemetry.total_dist;
        }
    }

    /**
     * Safely fetches the elevation, avoiding the "RangeError".
     */
    getSafeElevation(lng, lat) {
        if (!this.map || !this.map.getSource('terrain-source')) return 0;
        if (isNaN(lng) || isNaN(lat)) return 0;
        if (lng < -180 || lng > 180 || lat < -85 || lat > 85) return 0;

        try {
            // MapLibre handles the Array [lng, lat] format best for querying the 3D mesh.
            const ele = this.map.queryTerrainElevation([lng, lat]);
            return ele || 0;
        } catch (e) {
            console.warn(`Terrain lookup failed for [${lng}, ${lat}]:`, e);
            return 0;
        }
    }

    // ============
    // EDITOR LOGIC
    // ============

    enableEditorMode() {
        this.editorMode = true;
        this.editorPoints = [];
        this.map.getCanvas().style.cursor = 'crosshair';
    }

    disableEditorMode() {
        this.editorMode = false;
        this.map.getCanvas().style.cursor = '';

        // 1. Clears screen markers
        this.editorMarkers.forEach(m => m.remove());
        this.editorMarkers = [];
        this.editorPoints = [];

        // 2. Temporarily clears saved data.
        this.generatedRouteData = null;

        // 3. Delete the red line from the map by injecting an empty GeoJSON.
        if (this.map.getSource('editor-route')) {
            this.map.getSource('editor-route').setData({
                type: 'FeatureCollection',
                features: []
            });
        }

        // LIMPA O GRÁFICO AO CANCELAR
        if (window.chart) {
            window.chart.setData([]);
        }
    }

    // Returns the data with the calculated elevation so the UIManager can save it.
    getGeneratedRoute() {
        return this.generatedRouteData || [];
    }

    async calculateRouteOSRM(pointsArray) {
        const coordsString = pointsArray.map(p => `${parseFloat(p.lng).toFixed(6)},${parseFloat(p.lat).toFixed(6)}`).join(';');
        const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${coordsString}?overview=full&geometries=geojson`;

        try {
            const response = await fetch(osrmUrl);
            if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);

            const data = await response.json();
            if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
                console.warn("Route not found.");
                return;
            }

            const route = data.routes[0];
            const coordinates = route.geometry.coordinates;

            const elevationLocations = coordinates.map(c => ({ latitude: c[1], longitude: c[0] }));

            let elevationData = null;
            try {
                const elevResponse = await fetch('https://api.open-elevation.com/api/v1/lookup', {
                    method: 'POST',
                    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
                    body: JSON.stringify({ locations: elevationLocations })
                });

                if (elevResponse.ok) {
                    const elevResult = await elevResponse.json();
                    elevationData = elevResult.results;
                }
            } catch (elevError) {
                console.warn("External lift API failed.", elevError);
            }

            const rawPoints = coordinates.map((coord, index) => {
                let currentElevation = 0;
                if (elevationData && elevationData[index]) {
                    currentElevation = elevationData[index].elevation;
                } else {
                    currentElevation = this.map.queryTerrainElevation([coord[0], coord[1]]) || 0;
                }
                return { lat: coord[1], lon: coord[0], ele: currentElevation };
            });

            const smoothedPoints = rawPoints.map((p, i, arr) => {
                let start = Math.max(0, i - 2);
                let end = Math.min(arr.length - 1, i + 2);
                let sum = 0;
                for (let j = start; j <= end; j++) {
                    sum += arr[j].ele;
                }
                return { ...p, ele: sum / (end - start + 1) };
            });

            let totalElevationGain = 0;
            let previousElevation = null;

            smoothedPoints.forEach(p => {
                if (previousElevation !== null) {
                    const diff = p.ele - previousElevation;
                    if (diff > 0.2) totalElevationGain += diff;
                }
                previousElevation = p.ele;
            });

            this.generatedRouteData = smoothedPoints;

            if (document.getElementById('editorDist')) {
                document.getElementById('editorDist').innerText = (route.distance / 1000).toFixed(2) + " km";
            }
            if (document.getElementById('editorElev')) {
                document.getElementById('editorElev').innerText = totalElevationGain.toFixed(0) + " m";
            }

            if (window.chart) {
                const elevationsOnly = smoothedPoints.map(p => p.ele);
                window.chart.setData(elevationsOnly);
            }

            this.drawEditorRoute(coordinates);

        } catch (e) {
            console.error("OSRM ERROR:", e);
        }
    }

    async handleEditorClick(e) {
        if (!this.editorMode) return;

        const coord = e.lngLat;
        const features = this.map.queryRenderedFeatures(e.point, { layers: ['editor-route'] });
        const clickedOnLine = features.length > 0;

        const isFirst = this.editorPoints.length === 0;
        const color = isFirst ? '#00ff00' : '#ff0000';

        const el = document.createElement('div');
        el.className = 'editor-marker';
        el.style.backgroundColor = color;
        el.style.width = '16px';
        el.style.height = '16px';
        el.style.borderRadius = '50%';
        el.style.border = '3px solid white';
        el.style.boxShadow = '0 0 8px rgba(0,0,0,0.6)';
        el.style.cursor = 'grab';

        const marker = new maplibregl.Marker({ element: el, draggable: true })
            .setLngLat(coord)
            .addTo(this.map);

        marker.on('dragend', async () => {
            this.editorPoints = this.editorMarkers.map(m => m.getLngLat());
            if (this.editorPoints.length >= 2) await this.calculateRouteOSRM(this.editorPoints);
        });

        // === NOVO: LÓGICA DE INSERÇÃO INTELIGENTE ===
        if (clickedOnLine && this.editorPoints.length >= 2) {
            // Se clicou na linha, encontra o segmento mais próximo para inserir o ponto no meio do array
            let bestIndex = 1;
            let minIncrease = Infinity;
            const distance = (p1, p2) => Math.hypot(p1.lng - p2.lng, p1.lat - p2.lat);

            for (let i = 0; i < this.editorPoints.length - 1; i++) {
                const p1 = this.editorPoints[i];
                const p2 = this.editorPoints[i + 1];
                // Compara a distância direta vs distância passando pelo novo ponto
                const increase = distance(p1, coord) + distance(coord, p2) - distance(p1, p2);

                if (increase < minIncrease) {
                    minIncrease = increase;
                    bestIndex = i + 1; // O índice exato para "partir" a linha
                }
            }
            // Insere o novo ponto e marcador na posição correta do array
            this.editorPoints.splice(bestIndex, 0, coord);
            this.editorMarkers.splice(bestIndex, 0, marker);
        } else {
            this.editorPoints.push(coord);
            this.editorMarkers.push(marker);
        }

        if (this.editorPoints.length >= 2) {
            await this.calculateRouteOSRM(this.editorPoints);
        }
    }

    drawEditorRoute(coordinates) {
        const sourceId = 'editor-route';

        const geojson = {
            'type': 'Feature',
            'properties': {},
            'geometry': {
                'type': 'LineString',
                'coordinates': coordinates
            }
        };

        if (this.map.getSource(sourceId)) {
            this.map.getSource(sourceId).setData(geojson);
        } else {
            this.map.addSource(sourceId, { type: 'geojson', data: geojson });
            this.map.addLayer({
                'id': sourceId,
                'type': 'line',
                'source': sourceId,
                'layout': { 'line-join': 'round', 'line-cap': 'round' },
                'paint': {
                    'line-color': '#ff0000',
                    'line-width': 4
                }
            });
        }
    }

    // ========
    // UI FIXES
    // ========

    forceResize() {
        if (this.map) {
            this.map.resize();
        }
    }
}