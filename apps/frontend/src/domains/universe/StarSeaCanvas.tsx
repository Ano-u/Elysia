import React, { useEffect, useRef } from 'react';
import { useUiStore } from '../../store/uiStore';

interface Petal {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  angle: number;
  spin: number;
  flipPhase: number;
  flipSpeed: number;
  color: string;
}

interface CrystalFlower {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  spin: number;
  size: number;
  petalCount: number;
}

export const StarSeaCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduceMotion = useUiStore((state) => state.reduceMotion);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = window.innerWidth;
    let height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;

    const petals: Petal[] = [];
    const flowers: CrystalFlower[] = Array.from({ length: reduceMotion ? 2 : 5 }).map(() => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      angle: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.01,
      size: 30 + Math.random() * 30,
      petalCount: Math.random() > 0.5 ? 4 : 6, // Elysia often has 4-pointed or 6-pointed flowers
    }));

    let mouseX = width / 2;
    let mouseY = height / 2;

    const handleMouseMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    };
    window.addEventListener('mousemove', handleMouseMove);

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
    };
    window.addEventListener('resize', resize);

    const getThemeColors = () => {
      const isDark = document.documentElement.classList.contains('dark');
      return {
        isDark,
        flowerGlow: isDark ? 'rgba(255, 182, 214, 0.8)' : 'rgba(255, 140, 190, 0.6)',
        flowerCenter: isDark ? 'rgba(255, 255, 255, 0.95)' : 'rgba(255, 255, 255, 1)',
        flowerPetalBase: isDark ? 'rgba(230, 140, 190, 0.3)' : 'rgba(255, 160, 200, 0.4)',
        flowerPetalTip: isDark ? 'rgba(255, 210, 240, 0.7)' : 'rgba(255, 230, 245, 0.8)',
        flowerStroke: isDark ? 'rgba(255, 200, 230, 0.6)' : 'rgba(220, 140, 180, 0.7)',
        petalColor: isDark 
          ? `rgba(255, 182, 214, ${Math.random() * 0.5 + 0.3})`
          : `rgba(255, 150, 190, ${Math.random() * 0.6 + 0.4})`,
        explosionColor: isDark
          ? `rgba(255, 182, 214, ${Math.random() * 0.6 + 0.4})`
          : `rgba(255, 120, 180, ${Math.random() * 0.7 + 0.3})`
      };
    };

    const drawFlower = (flower: CrystalFlower, colors: ReturnType<typeof getThemeColors>) => {
      ctx.save();
      ctx.translate(flower.x, flower.y);
      ctx.rotate(flower.angle);

      ctx.shadowColor = colors.flowerGlow;
      ctx.shadowBlur = colors.isDark ? 30 : 20;

      // Draw crystal petals
      for (let i = 0; i < flower.petalCount; i++) {
        ctx.save();
        ctx.rotate((i * Math.PI * 2) / flower.petalCount);

        // Petal gradient
        const grad = ctx.createLinearGradient(0, 0, 0, -flower.size);
        grad.addColorStop(0, colors.flowerPetalBase);
        grad.addColorStop(1, colors.flowerPetalTip);

        ctx.fillStyle = grad;
        ctx.strokeStyle = colors.flowerStroke;
        ctx.lineWidth = 1;

        ctx.beginPath();
        ctx.moveTo(0, 0);
        // Diamond/Lily shaped crystal petal
        ctx.bezierCurveTo(flower.size * 0.3, -flower.size * 0.3, flower.size * 0.2, -flower.size * 0.8, 0, -flower.size);
        ctx.bezierCurveTo(-flower.size * 0.2, -flower.size * 0.8, -flower.size * 0.3, -flower.size * 0.3, 0, 0);
        ctx.fill();
        ctx.stroke();

        // Inner facet line
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, -flower.size * 0.9);
        ctx.strokeStyle = colors.flowerCenter;
        ctx.lineWidth = 0.8;
        ctx.stroke();

        ctx.restore();
      }

      // Draw center crystal core (4-pointed star)
      ctx.fillStyle = colors.flowerCenter;
      ctx.shadowBlur = 15;
      ctx.beginPath();
      const rOuter = flower.size * 0.3;
      const rInner = flower.size * 0.1;
      for (let i = 0; i < 4; i++) {
        const rot = (i * Math.PI) / 2;
        ctx.lineTo(Math.cos(rot) * rOuter, Math.sin(rot) * rOuter);
        const rotInner = rot + Math.PI / 4;
        ctx.lineTo(Math.cos(rotInner) * rInner, Math.sin(rotInner) * rInner);
      }
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    };

    const createPetal = (x: number, y: number, colors: ReturnType<typeof getThemeColors>, isExplosion = false) => {
      if (!isExplosion) {
        if (reduceMotion && petals.length > 30) return;
        if (!reduceMotion && petals.length > 200) return;
      }
      
      const angle = Math.random() * Math.PI * 2;
      const speed = isExplosion ? Math.random() * 8 + 2 : Math.random() * 1.5 + 0.5;
      
      petals.push({
        x: x + (Math.random() - 0.5) * 20,
        y: y + (Math.random() - 0.5) * 20,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        maxLife: isExplosion ? 80 + Math.random() * 60 : 150 + Math.random() * 100,
        size: Math.random() * 6 + 4,
        angle: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.05,
        flipPhase: Math.random() * Math.PI * 2,
        flipSpeed: Math.random() * 0.05 + 0.02,
        color: isExplosion ? colors.explosionColor : colors.petalColor,
      });
    };

    const drawPetal = (p: Petal) => {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      
      // Simulate 3D flipping by scaling Y based on sine wave
      const scaleY = Math.sin(p.flipPhase);
      ctx.scale(1, Math.abs(scaleY) < 0.1 ? 0.1 : scaleY); 
      
      const alpha = p.life / p.maxLife;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      
      // Draw organic petal shape
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(p.size, p.size * 0.5, p.size, -p.size * 0.5, 0, -p.size);
      ctx.bezierCurveTo(-p.size, -p.size * 0.5, -p.size, p.size * 0.5, 0, 0);
      ctx.fill();
      
      ctx.restore();
    };

    const handleExplosion = (e: CustomEvent<{ x: number, y: number }>) => {
      const colors = getThemeColors();
      const count = reduceMotion ? 20 : 50;
      for (let i = 0; i < count; i++) {
        createPetal(e.detail.x, e.detail.y, colors, true);
      }
    };

    window.addEventListener('star-sea-explosion', handleExplosion as EventListener);

    const update = () => {
      ctx.clearRect(0, 0, width, height);
      
      const themeColors = getThemeColors();

      // Mouse interaction effect for petals (gentle swirl)
      const swirlRadius = 250;

      // Update and draw flowers
      flowers.forEach(flower => {
        // Slowly drift
        flower.x += flower.vx;
        flower.y += flower.vy;
        flower.angle += flower.spin;

        // Wrap around screen
        if (flower.x > width + flower.size * 2) flower.x = -flower.size * 2;
        if (flower.x < -flower.size * 2) flower.x = width + flower.size * 2;
        if (flower.y > height + flower.size * 2) flower.y = -flower.size * 2;
        if (flower.y < -flower.size * 2) flower.y = height + flower.size * 2;

        drawFlower(flower, themeColors);

        // Occasionally spawn petals from flowers
        if (Math.random() < (reduceMotion ? 0.01 : 0.03)) {
          createPetal(flower.x, flower.y, themeColors, false);
        }
      });

      // Update and draw floating petals
      for (let i = petals.length - 1; i >= 0; i--) {
        const p = petals[i];
        
        // Gentle downward drift
        p.vy += 0.005; // gravity
        
        // Mouse interaction: swirl away
        const dx = mouseX - p.x;
        const dy = mouseY - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < swirlRadius) {
          const force = (swirlRadius - dist) / swirlRadius;
          const angleToMouse = Math.atan2(dy, dx);
          // Swirl tangentially and slightly outward
          p.vx += Math.cos(angleToMouse + Math.PI / 2) * force * 0.2 - Math.cos(angleToMouse) * force * 0.1;
          p.vy += Math.sin(angleToMouse + Math.PI / 2) * force * 0.2 - Math.sin(angleToMouse) * force * 0.1;
        }

        // Apply friction
        p.vx *= 0.98;
        p.vy *= 0.98;

        p.x += p.vx;
        p.y += p.vy;
        p.angle += p.spin;
        p.flipPhase += p.flipSpeed;
        p.life -= 1;
        
        if (p.life <= 0) {
          petals.splice(i, 1);
        } else {
          drawPetal(p);
        }
      }

      // Random ambient background petals
      if (Math.random() < (reduceMotion ? 0.02 : 0.1)) {
        createPetal(Math.random() * width, -20, themeColors, false);
      }

      animationFrameId = requestAnimationFrame(update);
    };

    update();

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('star-sea-explosion', handleExplosion as EventListener);
      cancelAnimationFrame(animationFrameId);
    };
  }, [reduceMotion]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 z-[1] pointer-events-none dark:mix-blend-screen"
    />
  );
};
