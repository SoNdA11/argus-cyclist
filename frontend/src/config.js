const ESRI_SATELLITE_STYLE = {
    'version': 8,
    'sources': {
        'satellite-tiles': {
            'type': 'raster',
            'tiles': [
                'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
            ],
            'tileSize': 256,
            'attribution': 'Tiles &copy; Esri'
        }
    },
    'layers': [
        { 'id': 'satellite-layer', 'type': 'raster', 'source': 'satellite-tiles', 'minzoom': 0, 'maxzoom': 22 }
    ]
};

export const CONFIG = {
    START_POSITION: [-43.1729, -22.9068],
    DEFAULT_ZOOM: 17,

    DEFAULT_RIDER_WEIGHT: 75,
    DEFAULT_BIKE_WEIGHT: 8,
    DEFAULT_UNITS: 'metric',

    STYLES: [
        ESRI_SATELLITE_STYLE,
        'https://tiles.openfreemap.org/styles/liberty',
    ],

    THEMES: [
        'satellite',
        'day',
    ],

    TERRAIN_SOURCE: 'https://demotiles.maplibre.org/terrain-tiles/tiles.json'
};