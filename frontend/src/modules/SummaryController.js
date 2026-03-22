// Argus Cyclist - Virtual Cycling Environment for interactive bicycling experiments.
// Copyright (C) 2026  Paulo Sérgio
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

export class SummaryController {
    constructor() {
        this.currentActivity = null;
    }

    loadActivity(activity) {
        this.currentActivity = activity;
        this.renderSummary();
    }

    renderSummary() {
        if (!this.currentActivity) return;

        const act = this.currentActivity;

        document.getElementById('summaryRouteName').innerText = act.route_name || 'Free Ride';
        document.getElementById('summaryDateTime').innerText = new Date(act.created_at).toLocaleString();
        document.getElementById('summaryDistance').innerText = (act.total_distance / 1000).toFixed(1);
        document.getElementById('summaryElevation').innerText = Math.round(act.total_elevation || 0);
        document.getElementById('summaryAvgPower').innerText = act.avg_power || 0;
        document.getElementById('summaryEnergy').innerText = Math.round((act.avg_power * act.duration) / 1000) || 0;

        const hours = Math.floor(act.duration / 3600);
        const minutes = Math.floor((act.duration % 3600) / 60);
        document.getElementById('summaryDuration').innerText = `${hours}:${minutes.toString().padStart(2, '0')}`;

        document.getElementById('summaryAvgSpeed').innerText = (act.avg_speed || 0).toFixed(1);
        document.getElementById('summaryAvgHR').innerText = act.avg_hr || '--';
        document.getElementById('summaryTSS').innerText = act.tss ? act.tss.toFixed(1) : 0;

        const finishTrimp = document.getElementById('finish-trimp');
        if (finishTrimp) finishTrimp.innerText = act.trimp || 0;

        this.renderPowerDistribution();
        this.renderPowerChart();
        this.renderHRDistribution();
    }

    renderPowerDistribution() {
        const container = document.getElementById('powerDistribution');
        if (!container) return;

        const zones = [
            { name: 'Z1', color: '#7a9ab8', pct: 8 },
            { name: 'Z2', color: '#39e97b', pct: 22 },
            { name: 'Z3', color: '#ffd93d', pct: 30 },
            { name: 'Z4', color: '#ff6b2b', pct: 28 },
            { name: 'Z5+', color: '#ff3d5a', pct: 12 }
        ];

        let html = '<div style="display:flex;flex-direction:column;gap:8px;">';

        zones.forEach(zone => {
            html += `
                <div style="display:flex;align-items:center;gap:10px;">
                    <div style="width:60px;font-family:var(--metric-font);font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${zone.color}">${zone.name}</div>
                    <div style="flex:1;height:12px;background:var(--bg-elevated);border-radius:2px;overflow:hidden;">
                        <div style="height:100%;width:${zone.pct}%;background:${zone.color};border-radius:2px;opacity:0.7;"></div>
                    </div>
                    <div style="width:36px;text-align:right;font-family:var(--metric-font);font-size:12px;font-weight:700;color:${zone.color}">${zone.pct}%</div>
                </div>
            `;
        });

        html += `
            <div style="margin-top:16px;display:flex;justify-content:space-between;padding-top:12px;border-top:1px solid var(--border);">
                <div><div style="font-family:var(--metric-font);font-size:20px;font-weight:800;color:var(--text-primary)">${this.currentActivity?.np || 268}</div><div style="font-size:9px;letter-spacing:0.12em;text-transform:uppercase;color:var(--text-dim)">NP (W)</div></div>
                <div><div style="font-family:var(--metric-font);font-size:20px;font-weight:800;color:var(--text-primary)">${this.currentActivity?.if || 0.98}</div><div style="font-size:9px;letter-spacing:0.12em;text-transform:uppercase;color:var(--text-dim)">IF</div></div>
                <div><div style="font-family:var(--metric-font);font-size:20px;font-weight:800;color:var(--text-primary)">${this.currentActivity?.wkg || 3.73}</div><div style="font-size:9px;letter-spacing:0.12em;text-transform:uppercase;color:var(--text-dim)">W/kg</div></div>
            </div>
        `;

        container.innerHTML = html;
    }

    renderPowerChart() {
        const chart = document.getElementById('powerTimeChart');
        if (!chart) return;

        chart.innerHTML = '';

        // Generate random power data for demo
        for (let i = 0; i < 120; i++) {
            const bar = document.createElement('div');
            const h = 20 + Math.random() * 70 + (i > 30 && i < 50 ? 20 : 0) + (i > 70 && i < 90 ? 15 : 0);
            bar.style.cssText = `flex:1;background:rgba(255,107,43,0.7);height:${h}%;min-width:2px;`;
            chart.appendChild(bar);
        }
    }

    renderHRDistribution() {
        const container = document.getElementById('hrDistribution');
        if (!container) return;

        let zones = [];

        // Check if the backend provided real HR zone data
        if (this.currentActivity?.time_in_hr_zones && Object.keys(this.currentActivity.time_in_hr_zones).length > 0) {
            const hrData = this.currentActivity.time_in_hr_zones;

            // Calculate total time in zones to derive percentages
            let totalTime = 0;
            for (const zone in hrData) {
                totalTime += hrData[zone];
            }

            // Create zones array based on real data
            const zoneColors = { 'Z1': '#7a9ab8', 'Z2': '#39e97b', 'Z3': '#ffd93d', 'Z4': '#ff6b2b', 'Z5': '#ff3d5a' };

            zones = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5'].map(zoneKey => {
                const timeInZone = hrData[zoneKey] || 0;
                // Calculate percentage, default to 0 if totalTime is 0 to avoid NaN
                const pct = totalTime > 0 ? Math.round((timeInZone / totalTime) * 100) : 0;
                return {
                    name: zoneKey,
                    color: zoneColors[zoneKey],
                    pct: pct
                };
            });

        } else {
            // Fallback to demo/mock data if real data is missing
            zones = [
                { name: 'Z1 <115', color: '#7a9ab8', pct: 5 },
                { name: 'Z2 <133', color: '#39e97b', pct: 15 },
                { name: 'Z3 <152', color: '#ffd93d', pct: 38 },
                { name: 'Z4 <166', color: '#ff6b2b', pct: 32 },
                { name: 'Z5 185+', color: '#ff3d5a', pct: 10 }
            ];
        }

        let html = '';

        zones.forEach(zone => {
            html += `
                <div style="display:flex;align-items:center;gap:8px;">
                    <div style="width:52px;font-size:9px;font-family:var(--metric-font);font-weight:700;color:${zone.color};letter-spacing:0.1em;">${zone.name}</div>
                    <div style="flex:1;height:10px;background:var(--bg-elevated);border-radius:2px;overflow:hidden;">
                        <div style="height:100%;width:${zone.pct}%;background:${zone.color};border-radius:2px;opacity:0.7;"></div>
                    </div>
                    <div style="width:28px;font-size:10px;font-family:var(--metric-font);font-weight:700;color:${zone.color};text-align:right;">${zone.pct}%</div>
                </div>
            `;
        });

        container.innerHTML = html;

        document.getElementById('summaryAvgHRDetail').innerText = this.currentActivity?.avg_hr || 156;
        document.getElementById('summaryMaxHR').innerText = this.currentActivity?.max_hr || 178;
    }

    exportFIT() {
        if (this.currentActivity?.filename) {
            window.go.main.App.OpenFileFolder(this.currentActivity.filename);
        }
    }

    shareStrava() {
        alert("Strava sharing coming soon!");
    }
}