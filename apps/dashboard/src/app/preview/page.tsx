/**
 * BillionaireFintech.tsx
 * 
 * CONCEPTUAL NORTH STAR UI for SpendOS.
 * This file is a standalone demonstration of 10/10 Fintech UX.
 * 
 * Design Principles Applied:
 * 1. "Dark Mode First" – High contrast, deep space grays (#0A0A0B).
 * 2. "Glassmorphism" – Translucent overlays for depth.
 * 3. "Information Density" – High data throughput without clutter.
 * 4. "Micro-Interactions" – Hover states that feel like physical buttons.
 * 5. "Financial Trust" – Precise typography (Inter/Geist) and serious aesthetics.
 */

import React, { useState } from 'react';
import { 
  TrendingUp, 
  ArrowUpRight, 
  ArrowDownLeft, 
  CreditCard, 
  LayoutDashboard, 
  PieChart, 
  Users, 
  Settings, 
  Bell, 
  Search,
  CheckCircle2,
  XCircle,
  MoreVertical,
  ChevronRight
} from 'lucide-react';

// --- STYLED COMPONENTS (Simulated with Tailwind logic) ---

const GlassCard = ({ children, className = "" }: { children: React.ReactNode, className?: string }) => (
  <div className={`bg-[#161618]/60 backdrop-blur-xl border border-[#232326] rounded-2xl p-6 ${className}`}>
    {children}
  </div>
);

const NavItem = ({ icon: Icon, label, active = false }: { icon: any, label: string, active?: boolean }) => (
  <div className={`flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-all duration-200 group ${active ? 'bg-indigo-600/10 text-indigo-400' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}>
    <Icon size={20} className={active ? 'text-indigo-400' : 'group-hover:text-white'} />
    <span className="font-medium text-sm">{label}</span>
  </div>
);

export default function BillionaireFintech() {
  const [activeTab, setActiveTab] = useState('Overview');

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-white font-sans selection:bg-indigo-500/30">
      
      {/* 1. LEFT NAVIGATION BAR (The Sidebar) */}
      <aside className="fixed left-0 top-0 bottom-0 w-64 border-r border-[#1C1C1E] bg-[#0A0A0B] p-6 hidden lg:flex flex-col">
        <div className="flex items-center gap-3 mb-10 px-2">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center font-bold italic">S</div>
          <span className="text-xl font-bold tracking-tight">SpendOS</span>
        </div>

        <nav className="flex-1 space-y-2">
          <NavItem icon={LayoutDashboard} label="Overview" active={activeTab === 'Overview'} />
          <NavItem icon={PieChart} label="Ledger" active={activeTab === 'Ledger'} />
          <NavItem icon={CreditCard} label="Corporate Cards" />
          <NavItem icon={Users} label="Team" />
          <NavItem icon={Settings} label="Governance" />
        </nav>

        <div className="mt-auto">
          <GlassCard className="p-4 bg-gradient-to-br from-indigo-600/20 to-transparent border-indigo-500/20">
            <h4 className="text-xs font-semibold text-indigo-400 uppercase tracking-wider mb-2">Enterprise Plan</h4>
            <p className="text-xs text-gray-400 leading-relaxed mb-3">You have ₹12.4 Cr remaining in your quarterly credit line.</p>
            <button className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-colors">Increase Limit</button>
          </GlassCard>
        </div>
      </aside>

      {/* 2. MAIN CONTENT AREA */}
      <main className="lg:ml-64 p-8 max-w-7xl mx-auto">
        
        {/* TOP HEADER */}
        <header className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-1">Financial Pulse</h1>
            <p className="text-gray-500 text-sm">Real-time spending across 4 global subsidiaries.</p>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-indigo-400 transition-colors" size={18} />
              <input 
                type="text" 
                placeholder="Search transactions..." 
                className="bg-[#161618] border border-[#232326] rounded-xl py-2 pl-10 pr-4 text-sm w-64 focus:outline-none focus:border-indigo-500/50 transition-all"
              />
            </div>
            <div className="w-10 h-10 bg-[#161618] border border-[#232326] rounded-xl flex items-center justify-center cursor-pointer hover:bg-[#1C1C1E] transition-colors relative">
              <Bell size={20} className="text-gray-400" />
              <div className="absolute top-2.5 right-2.5 w-2 h-2 bg-indigo-500 rounded-full border-2 border-[#0A0A0B]"></div>
            </div>
            <div className="flex items-center gap-3 pl-4 border-l border-[#232326]">
              <div className="text-right">
                <p className="text-sm font-bold">Zuck.eth</p>
                <p className="text-[10px] text-gray-500 font-mono uppercase tracking-widest">Admin</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-500 p-[1px]">
                <div className="w-full h-full rounded-[11px] bg-[#0A0A0B] flex items-center justify-center text-xs font-bold">JZ</div>
              </div>
            </div>
          </div>
        </header>

        {/* HERO METRICS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          <GlassCard className="border-l-4 border-l-indigo-600">
            <div className="flex justify-between items-start mb-4">
              <span className="text-gray-400 text-xs font-medium uppercase tracking-wider">Total Cash Outflow</span>
              <div className="px-2 py-1 bg-green-500/10 text-green-400 rounded-md text-[10px] font-bold flex items-center gap-1">
                <TrendingUp size={10} /> +12.4%
              </div>
            </div>
            <h2 className="text-3xl font-bold mb-1">₹4,20,89,120</h2>
            <p className="text-xs text-gray-500 leading-tight">vs ₹3,74,20,000 last month</p>
          </GlassCard>

          <GlassCard>
            <div className="flex justify-between items-start mb-4">
              <span className="text-gray-400 text-xs font-medium uppercase tracking-wider">Active Cards</span>
              <span className="text-gray-500 text-[10px] font-mono">LIVE FEED</span>
            </div>
            <div className="flex items-end gap-3">
              <h2 className="text-3xl font-bold mb-1">1,248</h2>
              <div className="h-6 w-24 bg-indigo-500/10 rounded-md mb-2 flex items-center justify-around px-2">
                 <div className="w-1 h-3 bg-indigo-500/40 rounded-full"></div>
                 <div className="w-1 h-5 bg-indigo-500 rounded-full"></div>
                 <div className="w-1 h-2 bg-indigo-500/60 rounded-full"></div>
                 <div className="w-1 h-4 bg-indigo-500/80 rounded-full"></div>
                 <div className="w-1 h-3 bg-indigo-500/40 rounded-full"></div>
              </div>
            </div>
            <p className="text-xs text-gray-500">Across 12 global departments</p>
          </GlassCard>

          <GlassCard className="bg-gradient-to-br from-indigo-600 to-purple-700 !p-0 overflow-hidden relative group cursor-pointer">
             <div className="p-6 relative z-10">
               <span className="text-white/70 text-xs font-medium uppercase tracking-wider">Smart Auditor AI</span>
               <h2 className="text-2xl font-bold mt-4 leading-tight">14 Risks Detected</h2>
               <div className="flex items-center gap-2 mt-2 text-white/80 text-sm font-medium">
                 View Audit Queue <ChevronRight size={16} />
               </div>
             </div>
             {/* Abstract background shapes */}
             <div className="absolute top-[-20%] right-[-10%] w-40 h-40 bg-white/10 rounded-full blur-3xl group-hover:bg-white/20 transition-all duration-500"></div>
          </GlassCard>
        </div>

        {/* RECENT ACTIVITY & QUEUE */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* LEFT: APPROVAL QUEUE */}
          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold">Pending Approvals</h3>
              <button className="text-xs text-indigo-400 hover:text-indigo-300 font-bold transition-colors">View All Queue</button>
            </div>
            
            {[
              { name: "Pratham (S)", amount: "₹45,200", vendor: "Amazon AWS", date: "2 mins ago", cat: "Infrastructure" },
              { name: "Varun (V)", amount: "₹1,20,000", vendor: "Apple Inc.", date: "1 hour ago", cat: "Hardware" },
              { name: "Siddharth (S)", amount: "₹8,400", vendor: "Starbucks", date: "4 hours ago", cat: "Food & Bev" },
            ].map((item, i) => (
              <div key={i} className="flex items-center justify-between p-5 bg-[#161618] border border-[#232326] rounded-2xl hover:border-indigo-500/30 transition-all group cursor-pointer">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-[#1C1C1E] flex items-center justify-center text-indigo-400 group-hover:scale-110 transition-transform">
                    <PieChart size={24} />
                  </div>
                  <div>
                    <p className="font-bold text-sm">{item.vendor}</p>
                    <p className="text-xs text-gray-500">{item.name} • {item.cat}</p>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className="font-bold text-sm">{item.amount}</p>
                    <p className="text-[10px] text-gray-600 uppercase font-mono">{item.date}</p>
                  </div>
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="w-8 h-8 rounded-full bg-green-500/10 text-green-500 flex items-center justify-center hover:bg-green-500 hover:text-white transition-all">
                      <CheckCircle2 size={18} />
                    </div>
                    <div className="w-8 h-8 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all">
                      <XCircle size={18} />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* RIGHT: LEDGER SNAPSHOT */}
          <div className="space-y-6">
            <h3 className="text-lg font-bold">Ledger Balance</h3>
            <GlassCard className="!p-0 border-[#232326]">
               <div className="p-6 border-b border-[#232326]">
                 <p className="text-gray-400 text-xs font-medium uppercase tracking-wider mb-2">Corporate Treasury</p>
                 <h2 className="text-4xl font-bold tracking-tighter">₹84.22 Cr</h2>
               </div>
               <div className="p-4 space-y-4">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-gray-500">Operating Expenses</span>
                    <span className="font-mono text-red-400">- ₹12.4M</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-gray-500">Merchant Reimbursements</span>
                    <span className="font-mono text-red-400">- ₹4.1M</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-gray-500">Stripe Inbound</span>
                    <span className="font-mono text-green-400">+ ₹52.8M</span>
                  </div>
               </div>
               <div className="p-4 bg-white/[0.02] flex justify-center">
                 <button className="text-[10px] font-bold text-gray-500 hover:text-white transition-colors uppercase tracking-widest">Reconcile All Accounts</button>
               </div>
            </GlassCard>

            <div className="p-1 bg-[#161618] border border-[#232326] rounded-2xl flex">
               <button className="flex-1 py-2 text-xs font-bold bg-indigo-600 rounded-xl">Insights</button>
               <button className="flex-1 py-2 text-xs font-bold text-gray-500 hover:text-gray-300 transition-colors">Forecast</button>
            </div>
          </div>

        </div>

      </main>
    </div>
  );
}
