import React from 'react';
import { Users, LayoutGrid, Euro, Moon, Building2 } from 'lucide-react';
import { motion } from 'framer-motion';

const StatBox = ({ label, value, subLabel, icon: Icon, color = "text-white", delay = 0 }) => (
    <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay, duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
        className="bg-[#0a0d12] border border-white/[0.05] rounded-2xl p-6 mb-4 relative overflow-hidden group hover:border-emerald-500/10 transition-all duration-500"
    >
        <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/[0.02] blur-3xl group-hover:bg-emerald-500/[0.04] transition-colors duration-700" />
        <div className="flex items-center justify-between mb-3">
            <span className="text-white/25 text-[10px] font-bold tracking-[0.2em] uppercase">{label}</span>
            <div className="w-7 h-7 rounded-lg bg-white/[0.03] flex items-center justify-center">
                <Icon size={14} className="text-white/20" />
            </div>
        </div>
        <div className={`text-3xl font-black tracking-tight ${color}`}>
            {value}
        </div>
        <div className="text-white/15 text-[10px] font-medium mt-1.5 uppercase tracking-wider">{subLabel}</div>
    </motion.div>
);

const StatsSidebar = ({ data, goal, pricePerUnit = 15 }) => {
    const totalSq = Number(data?.totalSqMeters || 0);
    const totalAmount = Number(data?.totalAmount || 0);
    const targetGoal = Number(goal || 710);
    const goalReached = totalSq >= targetGoal;
    const displaySq = Math.min(totalSq, targetGoal);
    const overflowM2 = Math.max(0, totalSq - targetGoal);
    // Use actual amounts from DB × 12 for yearly
    const donationTotal = (Number(data?.totalAmount || 0) * 12) + Number(data?.totalAmountCash || 0);

    const kaufTotal = overflowM2 * pricePerUnit * 12;

    return (
        <div className="w-full flex flex-col relative z-10 transition-all h-full">
            <div className="space-y-2">

                {/* Header */}
                <div className="mb-8">
                    <div className="flex items-center gap-3 mb-3">
                        <Moon size={14} className="text-emerald-500/50" />
                        <h3 className="text-white/50 text-xs font-bold uppercase tracking-[0.3em]">Live Statistik</h3>
                    </div>
                    <div className="h-0.5 w-12 bg-gradient-to-r from-emerald-500/50 to-transparent rounded-full" />
                </div>

                <StatBox
                    label="Unterstützer"
                    value={Number(data?.totalSponsors || 0).toLocaleString()}
                    subLabel="Aktive Beteiligung"
                    icon={Users}
                    delay={0.1}
                />

                <StatBox
                    label="Quadratmeter"
                    value={`${displaySq.toLocaleString()} m²`}
                    subLabel={goalReached ? `Ziel erreicht! ✅ (${targetGoal} m²)` : `Ziel: ${targetGoal.toLocaleString()} m²`}
                    icon={LayoutGrid}
                    color={goalReached ? "text-emerald-400" : "text-emerald-400/70"}
                    delay={0.2}
                />

                <StatBox
                    label="Gesamtsumme"
                    value={`€${donationTotal.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
                    subLabel="Jährliche Abo-Beiträge"
                    icon={Euro}
                    color="text-emerald-400"
                    delay={0.3}
                />

                {/* Moschee Kauf - only when goal reached */}
                {goalReached && overflowM2 > 0 && (
                    <StatBox
                        label="Moschee Kauf"
                        value={`€${kaufTotal.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
                        subLabel={`${overflowM2} m² für Kauf`}
                        icon={Building2}
                        color="text-[#c9a84c]"
                        delay={0.4}
                    />
                )}

                {/* Moschee Abo Info */}
                <motion.div
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5, duration: 0.6 }}
                    className="bg-gradient-to-br from-[#0a1510] to-[#0a0d12] border border-emerald-800/10 rounded-2xl p-5 mt-2"
                >
                    <div className="text-emerald-500/50 text-[10px] font-bold uppercase tracking-[0.15em] mb-2">🕌 Moschee Abo</div>
                    <p className="text-white/20 text-[11px] leading-relaxed">
                        Jeder Quadratmeter deckt Miete und laufende Kosten der Moschee.
                    </p>
                    <div className="mt-3 flex items-baseline gap-1.5">
                        <span className="text-emerald-400/60 text-lg font-black">{pricePerUnit}€</span>
                        <span className="text-white/15 text-[9px] uppercase tracking-wider">pro m² / Monat</span>
                    </div>
                </motion.div>
            </div>

            {/* Realtime indicator */}
            <div className="mt-auto pt-10 text-center opacity-15 hover:opacity-50 transition-opacity duration-500">
                <p className="text-white text-[8px] font-bold uppercase tracking-[0.4em]">Realtime Synchronization</p>
                <div className="flex justify-center space-x-1.5 mt-2">
                    {[1, 2, 3].map(i => <div key={i} className="w-1 h-1 bg-emerald-500 rounded-full animate-pulse" style={{ animationDelay: `${i * 200}ms` }} />)}
                </div>
            </div>
        </div>
    );
};

export default StatsSidebar;
