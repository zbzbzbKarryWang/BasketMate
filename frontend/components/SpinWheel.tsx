"use client";

import { useRef, useEffect, useState, useCallback } from "react";

export interface SpinWheelItem {
  id: string;
  name: string;
  emoji?: string;
}

const defaultColors = [
  "#FFADAD", "#FFD6A5", "#FDFFB6", "#CAFFBF", "#9BF6FF", "#A0C4FF",
  "#BDB2FF", "#FFC6FF", "#FBBF24", "#F87171",
];

interface SpinWheelProps {
  items: SpinWheelItem[];
  onSpinEnd: (selected: SpinWheelItem) => void; // 旋转结束回调，用于打开确认弹窗
  size?: number;
  pointerRotate?: number;
  isSpinning?: boolean;
  onSpinStart?: () => void;
}

export function SpinWheel({
  items,
  onSpinEnd,
  size = 400,
  pointerRotate = 0,
  isSpinning = false,
  onSpinStart,
}: SpinWheelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [internalSpinning, setInternalSpinning] = useState(false);
  const spinning = isSpinning || internalSpinning;

  const currentRotationRef = useRef(0);
  const animFrameRef = useRef<number | null>(null);
  const startRotationRef = useRef(0);
  const targetRotationRef = useRef(0);
  const duration = 4000;

  const cx = size / 2;
  const cy = size / 2;
  const wheelRadius = size * 0.43;
  const outerRadius = size * 0.48;
  const colors = defaultColors;

  // 绘制灰色底盘
  const drawBase = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      ctx.save();
      ctx.shadowColor = "rgba(0, 0, 0, 0.15)";
      ctx.shadowBlur = 12;
      ctx.shadowOffsetY = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, outerRadius, 0, Math.PI * 2);
      ctx.fillStyle = "#F3F4F6";
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.strokeStyle = "#E5E7EB";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    },
    [cx, cy, outerRadius]
  );

  // 绘制转盘扇区
  const drawWheel = useCallback(
    (ctx: CanvasRenderingContext2D, rotation: number) => {
      const count = items.length;
      if (count === 0) return;
      const angle = (2 * Math.PI) / count;

      items.forEach((item, i) => {
        const start = i * angle + rotation;
        const end = (i + 1) * angle + rotation;

        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, wheelRadius, start, end);
        ctx.closePath();
        ctx.fillStyle = colors[i % colors.length];
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(start + angle / 2);
        ctx.fillStyle = "#1F2937";
        ctx.font = `bold ${size * 0.04}px system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const displayText = item.emoji ? `${item.emoji} ${item.name}` : item.name;
        ctx.fillText(displayText, wheelRadius * 0.7, 0);
        ctx.restore();
      });
    },
    [items, cx, cy, wheelRadius, colors, size]
  );

  // 指针：等腰三角形
  const drawPointer = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((pointerRotate * Math.PI) / 180);

      const triangleHeight = size * 0.07;
      const halfBase = size * 0.05;

      ctx.beginPath();
      ctx.moveTo(0, -outerRadius + triangleHeight);
      ctx.lineTo(-halfBase, -outerRadius);
      ctx.lineTo(halfBase, -outerRadius);
      ctx.closePath();

      ctx.fillStyle = "#008B1D";
      ctx.shadowColor = "rgba(0,0,0,0.2)";
      ctx.shadowBlur = 6;
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.strokeStyle = "#006414";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    },
    [cx, cy, outerRadius, size, pointerRotate]
  );

  // 中心按钮
  const drawCenterButton = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.09, 0, Math.PI * 2);
      ctx.fillStyle = "#FFFFFF";
      ctx.shadowColor = "rgba(0,0,0,0.1)";
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.strokeStyle = "#D1D5DB";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#008B1D";
      ctx.font = `bold ${size * 0.075}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("转", 0, 0);
      ctx.restore();
    },
    [cx, cy, size]
  );

  const draw = useCallback(
    (rotation: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, size, size);
      drawBase(ctx);
      drawWheel(ctx, rotation);
      drawPointer(ctx);
      drawCenterButton(ctx);
    },
    [drawBase, drawWheel, drawPointer, drawCenterButton, size]
  );

  useEffect(() => {
    draw(currentRotationRef.current);
  }, [draw, items]);

  // 动画
  const animate = useCallback(
    (timestamp: number, startTime: number) => {
      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const currentRotation =
        startRotationRef.current +
        (targetRotationRef.current - startRotationRef.current) * eased;

      draw(currentRotation);
      currentRotationRef.current = currentRotation;

      if (progress < 1) {
        animFrameRef.current = requestAnimationFrame((t) => animate(t, startTime));
      } else {
        draw(currentRotation);
        // 计算选中项
        const pointerAngle = (3 * Math.PI) / 2;
        const norm = (2 * Math.PI - (currentRotation % (2 * Math.PI))) % (2 * Math.PI);
        const hit = (norm + pointerAngle) % (2 * Math.PI);
        const anglePer = (2 * Math.PI) / items.length;
        const idx = Math.floor(hit / anglePer) % items.length;
        const selected = items[idx];
        setInternalSpinning(false);
        onSpinEnd(selected);
      }
    },
    [draw, items, onSpinEnd]
  );

  const handleSpin = useCallback(() => {
    if (spinning || items.length === 0) return;
    setInternalSpinning(true);
    onSpinStart?.();

    const minRot = 3 * 2 * Math.PI;
    const maxRot = 6 * 2 * Math.PI;
    const addRot = Math.random() * (maxRot - minRot) + minRot;
    const startRotation = currentRotationRef.current;
    startRotationRef.current = startRotation;
    targetRotationRef.current = startRotation + addRot;

    const startTime = performance.now();
    animFrameRef.current = requestAnimationFrame((t) => animate(t, startTime));
  }, [spinning, items.length, animate, onSpinStart]);

  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const scaleX = e.currentTarget.width / rect.width;
    const scaleY = e.currentTarget.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX - cx;
    const y = (e.clientY - rect.top) * scaleY - cy;
    const distance = Math.sqrt(x * x + y * y);
    if (distance < size * 0.12) {
      handleSpin();
    }
  };

  return (
    <div className="flex flex-col items-center">
      <div className="relative inline-block">
        <canvas
          ref={canvasRef}
          width={size}
          height={size}
          className="cursor-pointer"
          onClick={handleCanvasClick}
        />
      </div>
    </div>
  );
}