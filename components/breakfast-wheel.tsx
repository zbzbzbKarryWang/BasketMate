"use client"

import { useState, useRef, useMemo } from "react";
import { Wheel } from 'react-roulette-pro';
import 'react-roulette-pro/dist/index.css';
import type { BreakfastOption } from '@/lib/types';

interface BreakfastWheelProps {
  options: BreakfastOption[];
  onSelect: (option: BreakfastOption) => void;
  onTempAdd: () => void;
  onTempRemove: () => void;
}

export function BreakfastWheel({
  options,
  onSelect,
  onTempAdd,
  onTempRemove,
}: BreakfastWheelProps) {
  const [mustSpin, setMustSpin] = useState(false);
  const [prizeNumber, setPrizeNumber] = useState(0);
  // 使用 ref 避免闭包陷阱，确保回调中读取到最新 options
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // 颜色生成函数（确保不出现白色或浅色）
  const getColorForIndex = (id: string) => {
    const colors = [
      "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4",
      "#DDA0DD", "#FFB347", "#5F9EA0", "#E76F51",
    ];
    const index = id.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[index % colors.length];
  };

  // 转换数据格式为库需要的格式
  const wheelData = useMemo(() => {
    if (!options || options.length === 0) {
      return [];
    }
    return options.map((opt) => ({
      option: `${opt.emoji} ${opt.name}`,
      style: {
        backgroundColor: getColorForIndex(opt.id),
        textColor: "#1F2937",
      },
    }));
  }, [options]);

  // 提取背景颜色数组
  const backgroundColors = useMemo(() => {
    if (!wheelData || wheelData.length === 0) {
      return [];
    }
    return wheelData.map(d => d.style.backgroundColor);
  }, [wheelData]);

  const handleSpinClick = () => {
    if (mustSpin || options.length === 0) return;

    // 生成随机索引（0 到 length-1）
    const randomIndex = Math.floor(Math.random() * options.length);
    setPrizeNumber(randomIndex);
    setMustSpin(true);
  };

  const handleStopSpinning = () => {
    setMustSpin(false);
    const currentOptions = optionsRef.current;
    if (prizeNumber >= 0 && prizeNumber < currentOptions.length) {
      const selected = currentOptions[prizeNumber];
      onSelect(selected);
    }
  };

  if (options.length === 0) {
    return (
      <div className="flex flex-col items-center py-6 text-center text-sm text-muted-foreground">
        <p>当前转盘没有可选早餐，请先使用「临时添加」。</p>
        <div className="flex items-center justify-center gap-6 mt-6">
          <button onClick={onTempAdd} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">临时添加</button>
          <button onClick={onTempRemove} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-destructive transition-colors">临时删除</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center">
      {/* 指针 */}
      <div className="relative z-10 -mb-3">
        <div className="w-0 h-0 border-l-[12px] border-r-[12px] border-t-[20px] border-l-transparent border-r-transparent border-t-primary" />
      </div>

      <Wheel
        mustStartSpinning={mustSpin}
        prizeNumber={prizeNumber}
        data={wheelData}
        onStopSpinning={handleStopSpinning}
      />

      <div className="flex items-center justify-center gap-6 mt-4">
        <button onClick={onTempAdd} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">临时添加</button>
        <button onClick={onTempRemove} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-destructive transition-colors">临时删除</button>
      </div>

      <button
        onClick={handleSpinClick}
        disabled={mustSpin}
        className="mt-4 px-6 py-2 bg-primary text-white rounded-full disabled:opacity-50"
      >
        {mustSpin ? "旋转中..." : "转"}
      </button>
    </div>
  );
}