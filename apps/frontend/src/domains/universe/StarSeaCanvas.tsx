import React, { useEffect, useRef } from 'react';
import { useUiStore } from '../../store/uiStore';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  angle: number;
  spin: number;
  color: string;
}

interface MantaRay {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  targetAngle: number;
  wingPhase: number;
  size: number;
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

    const particles: Particle[] = [];
    const mantas: MantaRay[] = Array.from({ length: reduceMotion ? 1 : 3 }).map(() => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 1.5,
      vy: (Math.random() - 0.5) * 1.5,
      angle: Math.random() * Math.PI * 2,
      targetAngle: 0,
      wingPhase: Math.random() * Math.PI * 2,
      size: 40 + Math.random() * 40,
    }));

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
    };
    window.addEventListener('resize', resize);

    const drawManta = (manta: MantaRay) => {
      ctx.save();
      ctx.translate(manta.x, manta.y);
      ctx.rotate(manta.angle);

      // Create a gradient for the manta ray to look like Elysia's crystal aesthetic
      const grad = ctx.createLinearGradient(-manta.size * 2, 0, manta.size, 0);
      grad.addColorStop(0, 'rgba(255, 182, 193, 0.05)'); // Tail end: Soft pink/transparent
      grad.addColorStop(0.5, 'rgba(240, 182, 214, 0.4)'); // Body: brighter pink
      grad.addColorStop(1, 'rgba(255, 235, 240, 0.7)'); // Head: bright white-pink

      ctx.fillStyle = grad;
      ctx.beginPath();
      
      const wingFlap = Math.sin(manta.wingPhase) * manta.size * 0.6;
      
      // Nose center
      ctx.moveTo(manta.size * 0.8, 0);
      
      // Right Horn
      ctx.quadraticCurveTo(manta.size * 0.9, manta.size * 0.1, manta.size, manta.size * 0.15);
      ctx.quadraticCurveTo(manta.size * 0.8, manta.size * 0.2, manta.size * 0.6, manta.size * 0.1);
      
      // Right Wing (sweeping back)
      ctx.quadraticCurveTo(0, manta.size * 0.8 + wingFlap, -manta.size * 0.2, manta.size * 0.9 + wingFlap);
      ctx.quadraticCurveTo(-manta.size * 0.4, manta.size * 0.5, -manta.size * 0.5, manta.size * 0.1);

      // Long elegant Tail
      ctx.lineTo(-manta.size * 2.5, 0);

      // Left Wing (sweeping back)
      ctx.lineTo(-manta.size * 0.5, -manta.size * 0.1);
      ctx.quadraticCurveTo(-manta.size * 0.4, -manta.size * 0.5, -manta.size * 0.2, -manta.size * 0.9 - wingFlap);
      ctx.quadraticCurveTo(0, -manta.size * 0.8 - wingFlap, manta.size * 0.6, -manta.size * 0.1);

      // Left Horn
      ctx.quadraticCurveTo(manta.size * 0.8, -manta.size * 0.2, manta.size, -manta.size * 0.15);
      ctx.quadraticCurveTo(manta.size * 0.9, -manta.size * 0.1, manta.size * 0.8, 0);
      
      ctx.fill();
      
      // Add glowing crystal core
      ctx.shadowColor = 'rgba(255, 182, 193, 0.9)';
      ctx.shadowBlur = 25;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.beginPath();
      ctx.ellipse(manta.size * 0.3, 0, manta.size * 0.35, manta.size * 0.12, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    };

    const createTrailParticle = (x: number, y: number) => {
      if (reduceMotion && particles.length > 20) return;
      if (!reduceMotion && particles.length > 150) return;
      
      particles.push({
        x: x + (Math.random() - 0.5) * 20,
        y: y + (Math.random() - 0.5) * 20,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        life: 1,
        maxLife: 50 + Math.random() * 50,
        size: 1 + Math.random() * 3,
        angle: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.1,
        color: `rgba(255, 182, 214, ${Math.random() * 0.5 + 0.2})`, // Pink crystal
      });
    };

    const drawParticle = (p: Particle) => {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      
      const alpha = p.life / p.maxLife;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      
      // Diamond shape for crystal dust
      ctx.beginPath();
      ctx.moveTo(0, -p.size);
      ctx.lineTo(p.size * 0.6, 0);
      ctx.lineTo(0, p.size);
      ctx.lineTo(-p.size * 0.6, 0);
      ctx.closePath();
      ctx.fill();
      
      ctx.restore();
    };

    const createExplosion = (x: number, y: number) => {
      const count = reduceMotion ? 15 : 40;
      for (let i = 0; i < count; i++) {
        particles.push({
          x,
          y,
          vx: (Math.random() - 0.5) * 6,
          vy: (Math.random() - 0.5) * 6,
          life: 1,
          maxLife: 60 + Math.random() * 40,
          size: 2 + Math.random() * 4,
          angle: Math.random() * Math.PI * 2,
          spin: (Math.random() - 0.5) * 0.4,
          color: `rgba(255, 182, 214, ${Math.random() * 0.6 + 0.4})`, // brighter pink crystal
        });
      }
    };

    const handleExplosion = (e: CustomEvent<{ x: number, y: number }>) => {
      createExplosion(e.detail.x, e.detail.y);
    };

    window.addEventListener('star-sea-explosion', handleExplosion as EventListener);

    const update = () => {
      ctx.clearRect(0, 0, width, height);

      // Update and draw mantas
      mantas.forEach(manta => {
        // Change direction randomly but smoothly
        if (Math.random() < 0.01) {
          manta.targetAngle = manta.angle + (Math.random() - 0.5) * Math.PI;
        }
        
        manta.angle += (manta.targetAngle - manta.angle) * 0.02;
        
        const speed = 0.5 + Math.sin(manta.wingPhase) * 0.2;
        manta.vx = Math.cos(manta.angle) * speed;
        manta.vy = Math.sin(manta.angle) * speed;
        
        manta.x += manta.vx;
        manta.y += manta.vy;
        manta.wingPhase += 0.03;

        // Wrap around screen
        if (manta.x > width + manta.size) manta.x = -manta.size;
        if (manta.x < -manta.size) manta.x = width + manta.size;
        if (manta.y > height + manta.size) manta.y = -manta.size;
        if (manta.y < -manta.size) manta.y = height + manta.size;

        drawManta(manta);

        // Emit trail particles from tail
        if (Math.random() < (reduceMotion ? 0.1 : 0.3)) {
          const tailX = manta.x - Math.cos(manta.angle) * manta.size * 1.2;
          const tailY = manta.y - Math.sin(manta.angle) * manta.size * 1.2;
          createTrailParticle(tailX, tailY);
        }
      });

      // Update and draw particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.angle += p.spin;
        p.life -= 1;
        
        if (p.life <= 0) {
          particles.splice(i, 1);
        } else {
          drawParticle(p);
        }
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
      className="absolute inset-0 z-[1] pointer-events-none"
      style={{ mixBlendMode: 'screen' }}
    />
  );
};
