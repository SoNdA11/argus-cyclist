import { CONFIG } from '../config.js';

export class MapController {
    constructor() {
        this.map = null;
        this.marker = null;
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
    }

    init(containerId) {
        if (!window.mapboxgl) {
            console.error("Mapbox GL JS is not loaded.");
            return;
        }

        window.mapboxgl.accessToken = CONFIG.MAPBOX_TOKEN;

        this.map = new window.mapboxgl.Map({
            container: containerId,
            style: CONFIG.STYLES[this.currentStyleIndex],
            center: CONFIG.START_POSITION,
            zoom: CONFIG.DEFAULT_ZOOM,
            pitch: 75,
            bearing: 0,
            antialias: true, 
            projection: 'globe'
        });

        this.map.addControl(new window.mapboxgl.NavigationControl({ 
            showCompass: true, 
            visualizePitch: true 
        }), 'top-right');

        this.map.on('style.load', () => {
            this.configureStandardStyle();
            this.addRouteLayer();
        });

        this.map.on('click', (e) => {
            if (this.editorMode) {
                this.handleEditorClick(e);
            }
        });

        this.map.on('dragstart', () => { 
            this.followCyclist = false; 
        });

        this.initMarker();
    }

    initMarker() {
        const elMarker = document.createElement('div');
        elMarker.className = 'cyclist-marker';
        this.marker = new window.mapboxgl.Marker(elMarker)
            .setLngLat(CONFIG.START_POSITION)
            .addTo(this.map);
    }

    // --- MAPBOX STANDARD ---
    configureStandardStyle() {
        let preset = 'day';
        if (this.currentStyleIndex === 0) {
            preset = 'dusk'; 
        } else {
            preset = 'day';
        }

        try {
            this.map.setConfigProperty('basemap', 'lightPreset', preset);
            this.map.setConfigProperty('basemap', 'showPointOfInterestLabels', false);
        } catch (e) {
            console.log("Current style does not support Standard configuration (ok if it's custom).");
        }

        if (!this.map.getSource('mapbox-dem')) {
            this.map.addSource('mapbox-dem', {
                'type': 'raster-dem',
                'url': 'mapbox://mapbox.mapbox-terrain-dem-v1',
                'tileSize': 512,
                'maxzoom': 14
            });
        }
        this.map.setTerrain({ 'source': 'mapbox-dem', 'exaggeration': 1.0 });
    }

    toggleLayer() {
        this.currentStyleIndex = (this.currentStyleIndex + 1) % CONFIG.STYLES.length;
        const newStyle = CONFIG.STYLES[this.currentStyleIndex];
        const newTheme = CONFIG.THEMES[this.currentStyleIndex];

        document.documentElement.setAttribute('data-theme', newTheme);
        
        this.map.setStyle(newStyle);
    }

    addRouteLayer() {
        if (!this.routeGeoJSON) return;

        if (!this.map.getSource('route')) {
            this.map.addSource('route', { type: 'geojson', data: this.routeGeoJSON });
        }

        if (this.map.getLayer('route')) this.map.removeLayer('route');
        if (this.map.getLayer('route-outline')) this.map.removeLayer('route-outline');

        this.map.addLayer({
            id: 'route-outline', type: 'line', source: 'route',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: {
                'line-width': 12,
                'line-color': '#000000',
                'line-opacity': 0.5,
                'line-blur': 2
            },
            slot: 'middle'
        });

        this.map.addLayer({
            id: 'route', type: 'line', source: 'route',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: {
                'line-width': 7, 
                'line-color': [
                    'interpolate', ['linear'], ['get', 'grade'],
                    -5, '#00ff00', 0, '#38bdf8', 3, '#38bdf8', 6, '#fbbf24', 10, '#ef4444', 15, '#991b1b'
                ],
                'line-opacity': 1.0
            },
            slot: 'middle'
        });
    }

    centerCamera() {
        if (this.prevLngLat) {
            this.followCyclist = true;
            this.map.flyTo({ 
                center: this.prevLngLat, 
                zoom: 17, 
                pitch: 75, 
                bearing: this.map.getBearing() 
            });
        }
    }

    renderRoute(geojson) {
        this.routeGeoJSON = geojson;
        if (this.map.isStyleLoaded()) {
            this.addRouteLayer();
        }
    }

    updateCyclistPosition(lat, lon, speed) {
        if (lat === 0 && lon === 0) return;

        const newLngLat = [lon, lat];
        this.marker.setLngLat(newLngLat);

        if (this.shouldUpdateBearing(newLngLat)) {
            if (this.prevLngLat) {
                const bearing = this.calculateBearing(this.prevLngLat[1], this.prevLngLat[0], lat, lon);
                
                if (!isNaN(bearing) && speed > 3.0 && this.followCyclist) {
                    this.map.easeTo({
                        center: newLngLat,
                        bearing: bearing, 
                        pitch: 75, 
                        duration: 1000, 
                        easing: (t) => t
                    });
                }
            }
            this.lastBearingUpdatePos = newLngLat;
        } else if (this.followCyclist) {
            this.map.easeTo({ center: newLngLat, duration: 1000, easing: (t) => t });
        }
        
        this.prevLngLat = newLngLat;
    }

    setInitialPosition(lat, lon) {
        this.map.flyTo({ center: [lon, lat], zoom: 17, pitch: 75, bearing: 0 });
        this.marker.setLngLat([lon, lat]);
        this.prevLngLat = [lon, lat];
        this.followCyclist = true;
    }

    calculateBearing(lat1, lon1, lat2, lon2) {
        const toRad = (deg) => deg * Math.PI / 180;
        const toDeg = (rad) => rad * 180 / Math.PI;
        const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
        const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
                  Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
        return (toDeg(Math.atan2(y, x)) + 360) % 360;
    }

    shouldUpdateBearing(currentPos) {
        if (!this.lastBearingUpdatePos) { 
            this.lastBearingUpdatePos = currentPos; 
            return true; 
        }
        const dx = currentPos[0] - this.lastBearingUpdatePos[0];
        const dy = currentPos[1] - this.lastBearingUpdatePos[1];
        return Math.sqrt(dx*dx + dy*dy) > 0.0001; 
    }

    // --- EDITOR LOGIC ---

    enableEditorMode() {
        this.editorMode = true;
        this.editorPoints = [];
        this.generatedRouteData = null;
            
        this.map.getCanvas().style.cursor = 'crosshair';
            
        if (this.map.getSource('editor-route')) {
            this.map.removeLayer('editor-route-line');
            this.map.removeSource('editor-route');
        }
            
        if (this.editorMarkers) {
            this.editorMarkers.forEach(m => m.remove());
        }
        this.editorMarkers = [];
    }

    disableEditorMode() {
        this.editorMode = false;
        this.map.getCanvas().style.cursor = '';
        if (this.editorMarkers) {
            this.editorMarkers.forEach(m => m.remove());
        }
        if (this.map.getSource('editor-route')) {
            this.map.removeLayer('editor-route-line');
            this.map.removeSource('editor-route');
        }
    }

    async handleEditorClick(e) {
        if (!this.editorMode) return;
        
        if (this.editorPoints.length >= 2) {
            return; 
        }

        const coord = e.lngLat;
        const pointIndex = this.editorPoints.length; 
        
        this.editorPoints.push(coord);

        const color = pointIndex === 0 ? '#00ff00' : '#ff0000';
        const el = document.createElement('div');
        el.className = 'editor-marker';
        el.style.backgroundColor = color;
        el.style.width = '15px'; el.style.height = '15px'; el.style.borderRadius = '50%';
        el.style.border = '2px solid white';
        el.style.cursor = 'grab';
        el.style.boxShadow = '0 0 5px rgba(0,0,0,0.5)';
        
        const marker = new window.mapboxgl.Marker({ element: el, draggable: true })
            .setLngLat(coord)
            .addTo(this.map);

        marker.on('dragend', async () => {
            const newLngLat = marker.getLngLat();
            
            this.editorPoints[pointIndex] = newLngLat;
            
            console.log(`Point ${pointIndex} moved to:`, newLngLat);

            if (this.editorPoints.length === 2) {
                await this.calculateRoute();
            }
        });

        this.editorMarkers.push(marker);

        if (this.editorPoints.length === 2) {
            await this.calculateRoute();
        }
    }

    async calculateRoute() {
        const start = this.editorPoints[0];
        const end = this.editorPoints[1];
        const token = window.mapboxgl.accessToken;

        const url = `https://api.mapbox.com/directions/v5/mapbox/cycling/${start.lng},${start.lat};${end.lng},${end.lat}?geometries=geojson&overview=full&access_token=${token}`;

        try {
            const res = await fetch(url);
            const data = await res.json();

            if (!data.routes || data.routes.length === 0) {
                alert("No route found!");
                return;
            }

            const route = data.routes[0];
            const coordinates = route.geometry.coordinates;

            const enrichedPoints = coordinates.map(coord => {
                const elevation = this.map.queryTerrainElevation({lng: coord[0], lat: coord[1]}) || 0;
                return { lat: coord[1], lon: coord[0], ele: elevation };
            });

            this.generatedRouteData = enrichedPoints;

            const distKm = (route.distance / 1000).toFixed(2);
            let elevGain = 0;
            for(let i=1; i<enrichedPoints.length; i++) {
                const diff = enrichedPoints[i].ele - enrichedPoints[i-1].ele;
                if (diff > 0) elevGain += diff;
            }

            document.getElementById('editorDist').innerText = distKm + " km";
            document.getElementById('editorElev').innerText = elevGain.toFixed(0) + " m";

            this.drawEditorRoute(coordinates);

        } catch (e) {
            console.error("Error fetching route:", e);
            alert("Error calculating route");
        }
    }

    drawEditorRoute(coords) {
        if (this.map.getSource('editor-route')) {
            this.map.getSource('editor-route').setData({
                type: 'Feature', geometry: { type: 'LineString', coordinates: coords }
            });
        } else {
            this.map.addSource('editor-route', {
                type: 'geojson',
                data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } }
            });
            this.map.addLayer({
                id: 'editor-route-line',
                type: 'line',
                source: 'editor-route',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: { 'line-color': '#38bdf8', 'line-width': 4 }
            });
        }
    }

    getGeneratedRoute() {
        return this.generatedRouteData;
    }
}