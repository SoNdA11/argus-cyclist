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

export class ElevationChart {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.data = [];
        this.progress = 0;
        this.isPaused = false;

        window.addEventListener('resize', () => {
            if (!this.isPaused) this.draw();
        });
    }

    setPaused(paused) {
        this.isPaused = paused;
        if (paused) {
            const w = this.canvas.width;
            const h = this.canvas.height;
            this.ctx.clearRect(0, 0, w, h);
        } else {
            this.draw();
        }
    }

    setData(elevations) {
        this.data = elevations;
        if (!this.isPaused) this.draw();
    }

    setProgress(pct) {
        this.progress = pct;
        if (!this.isPaused) this.draw();
    }

    getGradientColor(deltaEle) {
        if (deltaEle > 3.0) return "#e74c3c";
        if (deltaEle > 1.5) return "#e67e22";
        if (deltaEle > 0.5) return "#f1c40f";
        if (deltaEle < -0.5) return "#3498db";
        return "#2ecc71";
    }

    draw() {
        const w = this.canvas.width = this.canvas.parentElement.offsetWidth;
        const h = this.canvas.height = this.canvas.parentElement.offsetHeight;

        this.ctx.clearRect(0, 0, w, h);

        if (this.isPaused || !this.data || this.data.length === 0) return;

        const maxEle = Math.max(...this.data);
        const minEle = Math.min(...this.data);
        const range = maxEle - minEle || 1;
        const stepX = w / (this.data.length - 1);

        const fillGradient = this.ctx.createLinearGradient(0, h, 0, 0);
        fillGradient.addColorStop(0, "rgba(44, 62, 80, 0.6)");
        fillGradient.addColorStop(1, "rgba(231, 76, 60, 0.1)");

        this.ctx.beginPath();
        this.ctx.moveTo(0, h);
        this.data.forEach((ele, i) => {
            const y = h - ((ele - minEle) / range) * (h * 0.8) - (h * 0.1);
            this.ctx.lineTo(i * stepX, y);
        });
        this.ctx.lineTo(w, h);
        this.ctx.fillStyle = fillGradient;
        this.ctx.fill();

        this.ctx.lineWidth = 2.5;
        this.ctx.lineCap = "round";
        this.ctx.lineJoin = "round";

        for (let i = 0; i < this.data.length - 1; i++) {
            const ele1 = this.data[i];
            const ele2 = this.data[i + 1];

            const x1 = i * stepX;
            const y1 = h - ((ele1 - minEle) / range) * (h * 0.8) - (h * 0.1);

            const x2 = (i + 1) * stepX;
            const y2 = h - ((ele2 - minEle) / range) * (h * 0.8) - (h * 0.1);

            const deltaEle = ele2 - ele1;

            this.ctx.beginPath();
            this.ctx.moveTo(x1, y1);
            this.ctx.lineTo(x2, y2);
            this.ctx.strokeStyle = this.getGradientColor(deltaEle);
            this.ctx.stroke();
        }
    }
}