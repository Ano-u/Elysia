import React, { useState } from "react";
import { CrystalButton } from "./CrystalButton";

interface NavIconButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  isActive?: boolean;
}

export const NavIconButton: React.FC<NavIconButtonProps> = ({
  icon,
  label,
  onClick,
  isActive = false,
}) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <CrystalButton
      variant={isActive ? "primary" : "ghost"}
      size="icon"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
      className={`w-12 h-12 rounded-full transition-all duration-500 border-2 ${
        isActive
          ? "shadow-[0_0_20px_rgba(96,165,250,0.4)] border-blue-200 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-900/20 scale-110"
          : "opacity-60 border-transparent hover:opacity-100 dark:hover:bg-white/10 hover:bg-black/5 hover:border-white/40"
      }`}
    >
      <div className="relative flex items-center justify-center">
        <div
          className={`${
            isActive ? "text-blue-500 animate-pulse" : "text-slate-500 dark:text-slate-300"
          } transition-[filter,opacity,transform] duration-300 ease-out ${
            isHovered ? "blur-[1.4px] opacity-70 scale-95" : "blur-0 opacity-100 scale-100"
          }`}
        >
          {icon}
        </div>
        <span
          className={`pointer-events-none absolute inset-0 flex items-center justify-center text-[10px] font-semibold ${
            isActive ? "text-blue-700 dark:text-blue-100" : "text-slate-700 dark:text-slate-100"
          } transition-opacity duration-300 ${
            isHovered ? "opacity-100" : "opacity-0"
          }`}
        >
          {label}
        </span>
      </div>
    </CrystalButton>
  );
};
