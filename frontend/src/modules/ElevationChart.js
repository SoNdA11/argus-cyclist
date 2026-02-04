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

    draw() {
        if (this.isPaused || !this.data || this.data.length === 0) return;

        const w = this.canvas.width = this.canvas.parentElement.offsetWidth;
        const h = this.canvas.height = this.canvas.parentElement.offsetHeight;

        this.ctx.clearRect(0, 0, w, h);

        const maxEle = Math.max(...this.data);
        const minEle = Math.min(...this.data);
        const range = maxEle - minEle || 1;
        const stepX = w / (this.data.length - 1);

        this.ctx.beginPath();
        this.ctx.moveTo(0, h);
        this.data.forEach((ele, i) => {
            const y = h - ((ele - minEle) / range) * (h * 0.8) - (h * 0.1);
            this.ctx.lineTo(i * stepX, y);
        });
        this.ctx.lineTo(w, h);
        this.ctx.fillStyle = "rgba(100, 100, 100, 0.3)";
        this.ctx.fill();

        this.ctx.beginPath();
        this.data.forEach((ele, i) => {
            const y = h - ((ele - minEle) / range) * (h * 0.8) - (h * 0.1);
            if (i === 0) this.ctx.moveTo(0, y);
            else this.ctx.lineTo(i * stepX, y);
        });
        this.ctx.strokeStyle = "#888";
        this.ctx.lineWidth = 1;
        this.ctx.stroke();
    }
}