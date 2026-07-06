import * as React from "react"
import { cn } from "@/lib/utils"

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "destructive" | "outline" | "blackCard" | 'PRINCIPAL' | 'ADMIN' | 'VIP' | 'MANAGER' | 'EMPLOYEE' | "success" | "warning" | "info"
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  const variants = {
    default: "border-transparent bg-slate-900 text-slate-50 hover:bg-slate-900/80 dark:bg-slate-50 dark:text-slate-900 dark:hover:bg-slate-50/80",
    secondary: "border-transparent bg-slate-100 text-slate-900 hover:bg-slate-100/80 dark:bg-slate-800 dark:text-slate-50 dark:hover:bg-slate-800/80",
    destructive: "border-transparent bg-red-500 text-slate-50 hover:bg-red-500/80 dark:bg-red-900 dark:text-slate-50 dark:hover:bg-red-900/80",
    outline: "text-slate-950 dark:text-slate-50",
    blackCard: "border-amber-500/30 bg-gradient-to-r from-slate-800 to-slate-700 text-amber-400 font-semibold shadow-sm",
    PRINCIPAL: "border-amber-500/30 bg-gradient-to-r from-slate-800 to-slate-700 text-amber-400 font-semibold shadow-sm",
    ADMIN: "border-violet-500/20 bg-violet-500/10 text-violet-600 dark:text-violet-400",
    VIP: "border-pink-500/20 bg-pink-500/10 text-pink-600 dark:text-pink-400",
    MANAGER: "border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-400",
    EMPLOYEE: "border-slate-500/20 bg-slate-500/10 text-slate-600 dark:text-slate-400",
    success: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    warning: "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400",
    info: "border-sky-500/20 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  }

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-slate-950 focus:ring-offset-2 dark:border-slate-800 dark:focus:ring-slate-300",
        variants[variant],
        className
      )}
      {...props}
    />
  )
}

export { Badge }
