export class ElevationChart {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.elevations = [];
        
        window.addEventListener('resize', () => this.resize());
    }

    setData(elevations) {
        this.elevations = elevations;
        this.resize();
    }

    resize() {
        if (!this.canvas.parentElement) return;
        this.canvas.width = this.canvas.parentElement.clientWidth;
        this.canvas.height = this.canvas.parentElement.clientHeight;
        this.draw();
    }

    draw() {
        if (!this.elevations || this.elevations.length === 0) return;

        const w = this.canvas.width;
        const h = this.canvas.height;
        
        // Get colors from CSS variables
        const style = getComputedStyle(document.documentElement);
        const fillStyle = style.getPropertyValue('--chart-fill').trim() || '#334155';
        
        this.ctx.clearRect(0, 0, w, h);
        
        let min = Infinity, max = -Infinity;
        this.elevations.forEach(e => { 
            if(e < min) min = e; 
            if(e > max) max = e; 
        });
        
        const range = max - min || 1;
        const step = w / (this.elevations.length - 1);
        
        this.ctx.beginPath(); 
        this.ctx.moveTo(0, h);
        
        this.elevations.forEach((elev, i) => {
            const x = i * step;
            const normalizedH = (elev - min) / range; 
            const y = h - (normalizedH * (h * 0.9));
            this.ctx.lineTo(x, y);
        });
        
        this.ctx.lineTo(w, h); 
        this.ctx.closePath(); 
        this.ctx.fillStyle = fillStyle; 
        this.ctx.fill();
    }
}