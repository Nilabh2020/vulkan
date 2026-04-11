import React, { useEffect, useRef } from 'react';

const HackerBackground = () => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789$#@%&*()_+-=[]{}|;:,.<>?/πΩλ';
    const fontSize = 16;
    const columns = Math.floor(width / fontSize);
    const drops = new Array(columns).fill(1);

    const draw = () => {
      ctx.fillStyle = 'rgba(11, 11, 19, 0.05)';
      ctx.fillRect(0, 0, width, height);

      drops.forEach((y, i) => {
        const text = characters[Math.floor(Math.random() * characters.length)];
        const x = i * fontSize;
        
        // Calculate gradient color based on Y position
        const progress = y * fontSize / height;
        let color;
        if (progress < 0.33) {
          color = '#ff4fd8'; // Pink
        } else if (progress < 0.66) {
          color = '#6c3bff'; // Purple
        } else {
          color = '#4fc3ff'; // Blue
        }

        ctx.fillStyle = color;
        ctx.font = `${fontSize}px monospace`;
        ctx.fillText(text, x, y * fontSize);

        if (y * fontSize > height && Math.random() > 0.975) {
          drops[i] = 0;
        }
        drops[i]++;
      });
    };

    let animationId;
    const animate = () => {
      draw();
      animationId = requestAnimationFrame(animate);
    };

    animate();

    const handleResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    window.addEventListener('resize', handleResize);
    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        zIndex: -1,
        background: '#0b0b13'
      }}
    />
  );
};

export default HackerBackground;
