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
        });

        this.map.on('style.load', () => {
            this.setup3DEnvironment();
            this.addRouteLayer();
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
        const currentTheme = CONFIG.THEMES[this.currentStyleIndex];

        const isSatellite = currentTheme === 'satellite';

        const outlineColor = isSatellite ? '#ffffff' : '#000000';
        const outlineOpacity = isSatellite ? 0.9 : 0.4;
        const outlineWidth = isSatellite ? 12 : 10;
        const wallColor = isSatellite ? '#ffffff' : '#000000';

        ['route-glow', 'route-line', 'route-case'].forEach(id => {
            if (this.map.getLayer(id)) this.map.removeLayer(id);
        });

        if (this.map.getSource(sourceId)) {
            this.map.getSource(sourceId).setData(this.routeGeoJSON);
        } else {
            this.map.addSource(sourceId, { 
                type: 'geojson', 
                data: this.routeGeoJSON,
                lineMetrics: true 
            });
        }

        if (this.map.getLayer('route-outline')) {
            this.map.setPaintProperty('route-outline', 'line-color', outlineColor);
            this.map.setPaintProperty('route-outline', 'line-opacity', outlineOpacity);
            this.map.setPaintProperty('route-outline', 'line-width', outlineWidth);
        } else {
            this.map.addLayer({
                id: 'route-outline',
                type: 'line',
                source: sourceId,
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: {
                    'line-width': outlineWidth,
                    'line-color': outlineColor,
                    'line-opacity': outlineOpacity,
                    'line-blur': 0
                }
            });
        }

        const gradientExpression = [
            'interpolate', ['linear'], ['get', 'grade'],
            -10, '#2ecc71',
            0,   '#2ecc71',
            3,   '#f1c40f',
            6,   '#e67e22',
            9,   '#e74c3c',
            12,  '#8e44ad',
            15,  wallColor
        ];

        if (this.map.getLayer('route')) {
            this.map.setPaintProperty('route', 'line-color', gradientExpression);
        } else {
            this.map.addLayer({
                id: 'route',
                type: 'line',
                source: sourceId,
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: {
                    'line-width': 6,
                    'line-color': gradientExpression,
                    'line-opacity': 1.0
                }
            });
        }
        
        const labels = this.map.getStyle().layers.find(l => l.type === 'symbol');
        if (labels) {
            if (this.map.getLayer('route-outline')) this.map.moveLayer('route-outline', labels.id);
            if (this.map.getLayer('route')) this.map.moveLayer('route', labels.id);
        }
    }

    renderRoute(geojson) {
        this.routeGeoJSON = geojson;
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
        this.map.flyTo({ center: [lon, lat], zoom: 17, pitch: 60, bearing: 0 });
        if (this.marker) this.marker.setLngLat([lon, lat]);
        this.prevLngLat = [lon, lat];
        this.followCyclist = true;
    }

    centerCamera() {
        if (this.prevLngLat) {
            this.followCyclist = true;
            this.map.flyTo({
                center: this.prevLngLat,
                zoom: 17,
                pitch: 60,
                bearing: this.marker ? this.marker.getRotation() : 0
            });
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
    }

   async calculateRouteOSRM(start, end) {
        const sLng = parseFloat(start.lng).toFixed(6);
        const sLat = parseFloat(start.lat).toFixed(6);
        const eLng = parseFloat(end.lng).toFixed(6);
        const eLat = parseFloat(end.lat).toFixed(6);

        const url = `https://router.project-osrm.org/route/v1/driving/${sLng},${sLat};${eLng},${eLat}?overview=full&geometries=geojson`;

        console.log("Trying to connect to:", url);

        try {
            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`HTTP Error: ${response.status}`);
            }

            const data = await response.json();

            if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
                console.warn("Invalid OSRM response:", data);
                alert("Route not found. Try points closer to a road.");
                return;
            }

            const route = data.routes[0];
            const coordinates = route.geometry.coordinates;

            console.log("Route found! Points:", coordinates.length);
            
            const enrichedPoints = coordinates.map(coord => {
                const elevation = this.map.queryTerrainElevation({ lng: coord[0], lat: coord[1] }) || 0;
                return { 
                    lat: coord[1], 
                    lon: coord[0], 
                    ele: elevation 
                };
            });

            this.generatedRouteData = enrichedPoints;

            if (document.getElementById('editorDist')) {
                document.getElementById('editorDist').innerText = (route.distance / 1000).toFixed(2) + " km";
            }

            this.drawEditorRoute(coordinates);

        } catch (e) {
            console.error("OSRM ERROR DETAILS:", e);
            alert(`Error plotting route: ${e.message}. Check the Console (F12) for details.`);
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

    async handleEditorClick(e) {
        if (!this.editorMode) return;

        if (this.editorPoints.length >= 2) {
            this.editorPoints = [];
            this.editorMarkers.forEach(m => m.remove());
            this.editorMarkers = [];
            if (this.map.getSource('editor-route')) {
                this.map.getSource('editor-route').setData({ type: 'FeatureCollection', features: [] });
            }
        }

        const coord = e.lngLat;
        this.editorPoints.push(coord);

        const color = this.editorPoints.length === 1 ? '#00ff00' : '#ff0000';
        const el = document.createElement('div');
        el.className = 'editor-marker';
        el.style.backgroundColor = color;
        el.style.width = '15px';
        el.style.height = '15px';
        el.style.borderRadius = '50%';
        el.style.border = '2px solid white';
        el.style.boxShadow = '0 0 5px rgba(0,0,0,0.5)';

        const marker = new maplibregl.Marker({ element: el })
            .setLngLat(coord)
            .addTo(this.map);

        this.editorMarkers.push(marker);

        if (this.editorPoints.length === 2) {
            await this.calculateRouteOSRM(this.editorPoints[0], this.editorPoints[1]);
        }
    }
}