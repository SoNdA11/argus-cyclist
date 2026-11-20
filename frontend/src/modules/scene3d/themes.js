// Argus Cyclist - Virtual Cycling Environment for interactive bicycling experiments.
// Copyright (C) 2026  Paulo Sérgio
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Visual themes for the 3D scene. A theme is pure data applied on top of the same
// procedural world, so adding a theme never touches the geometry code.

import { Color3 } from './babylon.js';

// Same grade scale as MapController (route colors), so the 3D road and the map agree.
export const GRADE_STOPS = [
    [-10, '#2ecc71'], [0, '#2ecc71'], [3, '#f1c40f'], [6, '#e67e22'],
    [9, '#e74c3c'], [12, '#8e44ad'], [15, '#4a0e6e']
];

const STOP_COLORS = GRADE_STOPS.map(([g, hex]) => [g, Color3.FromHexString(hex)]);

export function gradeColor(grade) {
    if (!(grade > STOP_COLORS[0][0])) return STOP_COLORS[0][1].clone();
    for (let i = 1; i < STOP_COLORS.length; i++) {
        const [g1, c1] = STOP_COLORS[i];
        if (grade <= g1) {
            const [g0, c0] = STOP_COLORS[i - 1];
            return Color3.Lerp(c0, c1, (grade - g0) / (g1 - g0));
        }
    }
    return STOP_COLORS[STOP_COLORS.length - 1][1].clone();
}

export const THEMES = {
    night: {
        label: 'Neon',
        sky: '#070b1e',
        fog: '#1a0f3a',
        fogDensity: 0.0055,
        ground: '#0b1030',
        hills: 1.5,                  // terrain undulation amplitude (m)
        asphalt: '#15182a',
        laneLine: '#ff2bd6',
        edgeEmissive: true,          // grade-colored road edges glow
        props: 'posts',
        propColor: '#00e5ff',
        markerColor: '#ff2bd6',
        skyline: 'city',
        skylineColor: '#1b1450',
        skylineAccent: '#00e5ff',
        hemi: 0.35,
        hemiGround: '#1a0f3a',
        sun: 0,
        glow: true,
        glowIntensity: 0.8,
        rider: { jersey: '#ff3b30', frame: '#d0d4dc' }
    },
    day: {
        label: 'Diurno',
        sky: '#8ec9f0',
        fog: '#cfe6f5',
        fogDensity: 0.0032,
        ground: '#6aa84f',
        hills: 7,
        asphalt: '#3a3d45',
        laneLine: '#f5f5f5',
        edgeEmissive: false,
        props: 'trees',
        propColor: '#2f6b35',
        propColor2: '#6b4a2b',       // trunks
        markerColor: '#ff6a00',
        skyline: 'mountains',
        skylineColor: '#7d9db5',
        skylineAccent: '#eef4f8',    // snow caps
        hemi: 0.75,
        hemiGround: '#5a6b4a',
        sun: 0.9,
        glow: false,
        glowIntensity: 0,
        rider: { jersey: '#ff3b30', frame: '#2b2f38' }
    }
};

export const THEME_ORDER = ['night', 'day'];
