import React, { useState } from "react";
import { CrystalButton } from "./CrystalButton";

interface NavIconButtonProps {
  icon?: React.ReactNode;
  iconSrc?: string;
  label: string;
  onClick: () => void;
  isActive?: boolean;
  activeIconColorClass?: string;
  activeLabelColorClass?: string;
}

export const NavIconButton: React.FC<NavIconButtonProps> = ({
  icon,
  iconSrc,
  label,
  onClick,
  isActive = false,
  activeIconColorClass = "text-blue-500",
  activeLabelColorClass = "text-blue-700 dark:text-blue-100",
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
            isActive ? `${activeIconColorClass} animate-pulse` : "text-slate-500 dark:text-slate-300"
          } transition-[filter,opacity,transform] duration-300 ease-out ${
            isHovered ? "blur-[1.4px] opacity-70 scale-95" : "blur-0 opacity-100 scale-100"
          }`}
        >
          {iconSrc ? (
            <span
              aria-hidden="true"
              className="inline-block h-6 w-6 bg-current mt-2"
              style={{
                WebkitMaskImage: `url(${iconSrc})`,
                WebkitMaskRepeat: "no-repeat",
                WebkitMaskPosition: "center",
                WebkitMaskSize: "contain",
                maskImage: `url(${iconSrc})`,
                maskRepeat: "no-repeat",
                maskPosition: "center",
                maskSize: "contain",
              }}
            />
          ) : (
            icon
          )}
        </div>
        <span
          className={`pointer-events-none absolute inset-0 flex items-center justify-center text-[10px] font-semibold min-w-[2em] text-center leading-tight whitespace-normal${
            isActive ? activeLabelColorClass : "text-slate-700 dark:text-slate-100"
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
