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
            console.log("Estilo atual não suporta configuração Standard (ok se for custom)");
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
}