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