export class CyberMatrixGrid {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    
    this.gridSize = 40; // Clean square cell size
    this.nodes = [];
    this.mouse = { x: -1000, y: -1000 };
    this.animFrame = null;

    this.init();
  }

  init() {
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
    });

    this.animate();
  }

  resize() {
    this.width = this.canvas.width = window.innerWidth;
    this.height = this.canvas.height = window.innerHeight;
    this.cols = Math.ceil(this.width / this.gridSize);
    this.rows = Math.ceil(this.height / this.gridSize);
    this.createNodes();
  }

  createNodes() {
    this.nodes = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        // Subtle security nodes (reduced frequency & opacity)
        if (Math.random() < 0.08) {
          this.nodes.push({
            c, r,
            x: c * this.gridSize,
            y: r * this.gridSize,
            alpha: Math.random() * 0.2 + 0.05,
            speed: (Math.random() * 0.005 + 0.002) * (Math.random() < 0.5 ? 1 : -1),
            color: Math.random() < 0.8 ? '#00ff9d' : '#00f0ff'
          });
        }
      }
    }
  }

  animate() {
    this.ctx.clearRect(0, 0, this.width, this.height);

    // 1. Draw base grid lines (Subtle 2.5% opacity)
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.025)';
    this.ctx.lineWidth = 1;

    for (let x = 0; x <= this.width; x += this.gridSize) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, this.height);
      this.ctx.stroke();
    }

    for (let y = 0; y <= this.height; y += this.gridSize) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(this.width, y);
      this.ctx.stroke();
    }

    // 2. Draw subtle square nodes
    for (const node of this.nodes) {
      node.alpha += node.speed;
      if (node.alpha > 0.35 || node.alpha < 0.03) {
        node.speed = -node.speed;
      }

      // Check mouse proximity
      const dist = Math.hypot(node.x - this.mouse.x, node.y - this.mouse.y);
      let renderAlpha = node.alpha;
      let scale = 1;

      if (dist < 140) {
        renderAlpha = Math.min(0.5, node.alpha + (1 - dist / 140) * 0.3);
        scale = 1 + (1 - dist / 140) * 0.2;
      }

      this.ctx.fillStyle = node.color;
      this.ctx.globalAlpha = renderAlpha;
      
      const p = 4;
      const size = (this.gridSize - p * 2) * scale;
      const offset = (size - (this.gridSize - p * 2)) / 2;
      this.ctx.fillRect(node.x + p - offset, node.y + p - offset, size, size);
    }

    // 3. Highlight grid square under cursor (subtle highlight)
    const hoverCol = Math.floor(this.mouse.x / this.gridSize);
    const hoverRow = Math.floor(this.mouse.y / this.gridSize);

    if (hoverCol >= 0 && hoverCol < this.cols && hoverRow >= 0 && hoverRow < this.rows) {
      this.ctx.globalAlpha = 0.15;
      this.ctx.fillStyle = '#00ff9d';
      this.ctx.fillRect(
        hoverCol * this.gridSize,
        hoverRow * this.gridSize,
        this.gridSize,
        this.gridSize
      );

      this.ctx.strokeStyle = 'rgba(0, 255, 157, 0.3)';
      this.ctx.lineWidth = 1;
      this.ctx.strokeRect(
        hoverCol * this.gridSize,
        hoverRow * this.gridSize,
        this.gridSize,
        this.gridSize
      );
    }

    this.ctx.globalAlpha = 1;
    this.animFrame = requestAnimationFrame(() => this.animate());
  }

  destroy() {
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
  }
}
