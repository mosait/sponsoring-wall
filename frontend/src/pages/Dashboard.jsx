import React, { useState, useEffect, useRef, useMemo } from 'react';
import confetti from 'canvas-confetti';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Euro, Heart, Target, Sparkles, X } from 'lucide-react';
import { supabase, subscribeToSponsors } from '../lib/supabaseClient';
import SajadahElement from '../components/SajadahElement';

const Dashboard = () => {
    const [stats, setStats] = useState({
        totalSponsors: 0, totalSqMeters: 0, totalAmount: 0,
        totalAmountCash: 0, bookedIndices: [],
    });
    const [chatMessages, setChatMessages] = useState([]);
    const [milestoneCelebration, setMilestoneCelebration] = useState(null);
    const [pricePerUnit, setPricePerUnit] = useState(15);
    const [dashboardLocked, setDashboardLocked] = useState(false);
    const [boostModal, setBoostModal] = useState(null);
    const [boostAmount, setBoostAmount] = useState('');
    const [boostLoading, setBoostLoading] = useState(false);
    const [boostSuccess, setBoostSuccess] = useState(false);
    const lastProgressRef = useRef(0);
    const carpetScrollRef = useRef(null);

    // Queue für verzögertes Anzeigen
    const incomingQueueRef = useRef([]);
    const queueTimerRef = useRef(null);

    const BASE_GOAL = 710;
    const COLS = 40;

    // Verarbeite Queue mit 1 Sek Abstand
    const processQueue = () => {
        if (incomingQueueRef.current.length === 0) {
            queueTimerRef.current = null;
            return;
        }
        const next = incomingQueueRef.current.shift();
        setChatMessages(prev => [next, ...prev].slice(0, 12));
        queueTimerRef.current = setTimeout(processQueue, 1000);
    };

    const addToIncomingQueue = (msg) => {
        incomingQueueRef.current.push(msg);
        if (!queueTimerRef.current) {
            processQueue();
        }
    };

    const triggerMilestoneConfetti = () => {
        const count = 800;
        const defaults = { origin: { y: 0.6 } };
        function fire(ratio, opts) { confetti({ ...defaults, ...opts, particleCount: Math.floor(count * ratio) }); }
        fire(0.25, { spread: 40, startVelocity: 70 });
        fire(0.2, { spread: 80 });
        fire(0.35, { spread: 130, decay: 0.91, scalar: 0.8 });
        fire(0.1, { spread: 150, startVelocity: 30, decay: 0.92, scalar: 1.4 });
        fire(0.1, { spread: 160, startVelocity: 60 });
        setTimeout(() => {
            fire(0.3, { spread: 60, startVelocity: 80, origin: { x: 0.1, y: 0.5 } });
            fire(0.3, { spread: 60, startVelocity: 80, origin: { x: 0.9, y: 0.5 } });
        }, 400);
        setTimeout(() => {
            fire(0.4, { spread: 100, startVelocity: 60, origin: { x: 0.5, y: 0.8 } });
        }, 800);
    };

    const scrollToBoundary = () => {
        if (!carpetScrollRef.current) return;
        const container = carpetScrollRef.current;
        const totalHeight = container.scrollHeight;
        const viewHeight = container.clientHeight;
        const rowHeight = totalHeight / Math.ceil(BASE_GOAL / COLS);
        const bookedRows = Math.floor(stats.bookedIndices.length / COLS);
        const targetScroll = Math.max(0, (bookedRows - Math.floor(viewHeight / rowHeight) + 2) * rowHeight);
        container.scrollTo({ top: targetScroll, behavior: 'smooth' });
    };

    // Re-fetch all stats from DB (used for UPDATE/DELETE)
    const refetchStats = async () => {
        const { data, error } = await supabase
            .from('sponsors_public')
            .select('id,full_name,sq_meters,is_anonymous,total_amount,is_cash,created_at')
            .order('created_at', { ascending: false });

        if (data && !error) {
            const totalSq = data.reduce((sum, item) => sum + Number(item.sq_meters || 0), 0);
            const totalAmtBank = data.filter(s => !s.is_cash).reduce((sum, item) => sum + Number(item.total_amount || 0), 0);
            const totalAmtCash = data.filter(s => s.is_cash).reduce((sum, item) => sum + Number(item.total_amount || 0), 0);

            const currentProgInt = Math.floor((totalSq / BASE_GOAL) * 10);
            if (currentProgInt > lastProgressRef.current) {
                setMilestoneCelebration(currentProgInt * 10);
                triggerMilestoneConfetti();
                setTimeout(() => setMilestoneCelebration(null), 5000);
            }
            lastProgressRef.current = currentProgInt;

            setStats({
                totalSponsors: data.length, totalSqMeters: totalSq,
                totalAmount: totalAmtBank, totalAmountCash: totalAmtCash,
                bookedIndices: Array.from({ length: totalSq }, (_, i) => i)
            });

            setChatMessages(data.slice(0, 10).map(s => ({
                id: s.id, name: s.is_anonymous ? 'Anonym' : s.full_name,
                amount: s.sq_meters, isCash: s.is_cash, cashAmount: s.total_amount,
                time: new Date(s.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            })));
        }
    };

    useEffect(() => {
        supabase.rpc('get_public_settings').then(({ data }) => {
            const s = Array.isArray(data) ? data[0] : data;
            if (s?.price_per_unit) setPricePerUnit(s.price_per_unit);
            if (s) setDashboardLocked(s.dashboard_locked || false);
        });

        // Realtime-Listener für dashboard_locked
        const settingsChannel = supabase
            .channel('project_settings_changes')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'project_settings' }, ({ new: newData }) => {
                if (newData) setDashboardLocked(newData.dashboard_locked || false);
            })
            .subscribe();

        const fetchInitialState = async () => {
            const { data, error } = await supabase
                .from('sponsors_public')
                .select('id,full_name,sq_meters,is_anonymous,total_amount,is_cash,created_at')
                .order('created_at', { ascending: false });

            if (data && !error) {
                const totalSq = data.reduce((sum, item) => sum + Number(item.sq_meters || 0), 0);
                const totalAmtBank = data.filter(s => !s.is_cash).reduce((sum, item) => sum + Number(item.total_amount || 0), 0);
                const totalAmtCash = data.filter(s => s.is_cash).reduce((sum, item) => sum + Number(item.total_amount || 0), 0);
                setStats({
                    totalSponsors: data.length, totalSqMeters: totalSq,
                    totalAmount: totalAmtBank, totalAmountCash: totalAmtCash,
                    bookedIndices: Array.from({ length: totalSq }, (_, i) => i)
                });
                // Initiale Nachrichten direkt setzen (kein Queue-Delay beim Laden)
                setChatMessages(data.slice(0, 10).map(s => ({
                    id: s.id, name: s.is_anonymous ? 'Anonym' : s.full_name,
                    amount: s.sq_meters, isCash: s.is_cash, cashAmount: s.total_amount,
                    time: new Date(s.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                })));
                lastProgressRef.current = Math.floor((totalSq / BASE_GOAL) * 10);
            }
        };
        fetchInitialState();

        const unsubscribe = subscribeToSponsors((payload) => {
            const eventType = payload.eventType;

            if (eventType === 'INSERT') {
                const data = payload.new;
                if (!data) return;

                // Neue Nachrichten in Queue — kommen mit 1 Sek Abstand
                addToIncomingQueue({
                    id: data.id || Date.now(),
                    name: data.is_anonymous ? 'Anonym' : data.full_name,
                    amount: data.sq_meters,
                    isCash: data.iban === 'CASH',
                    cashAmount: data.total_amount,
                    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                });

                setStats(prev => {
                    const sqToAdd = Number(data.sq_meters || 0);
                    const newTotal = prev.totalSqMeters + sqToAdd;
                    const currentProgInt = Math.floor((newTotal / BASE_GOAL) * 10);
                    if (currentProgInt > lastProgressRef.current) {
                        setMilestoneCelebration(currentProgInt * 10);
                        triggerMilestoneConfetti();
                        setTimeout(() => setMilestoneCelebration(null), 5000);
                        lastProgressRef.current = currentProgInt;
                    }
                    return {
                        ...prev, totalSponsors: prev.totalSponsors + 1, totalSqMeters: newTotal,
                        totalAmount: data.iban !== 'CASH' ? prev.totalAmount + Number(data.total_amount || 0) : prev.totalAmount,
                        totalAmountCash: data.iban === 'CASH' ? (prev.totalAmountCash || 0) + Number(data.total_amount || 0) : (prev.totalAmountCash || 0),
                        bookedIndices: Array.from({ length: newTotal }, (_, i) => i)
                    };
                });
            } else if (eventType === 'UPDATE' || eventType === 'DELETE') {
                // Re-fetch from DB to get accurate totals
                refetchStats();
            }
        });

        const boostChannel = supabase.channel('boost-request')
            .on('broadcast', { event: 'boost' }, ({ payload }) => {
                const registered = JSON.parse(localStorage.getItem('sponsoring_registered') || 'null');
                if (registered) {
                    setBoostModal({ message: payload.message, ...registered });
                    setBoostAmount('');
                    setBoostSuccess(false);
                }
            })
            .subscribe();

        return () => {
            unsubscribe();
            settingsChannel.unsubscribe();
            boostChannel.unsubscribe();
            if (queueTimerRef.current) clearTimeout(queueTimerRef.current);
        };
    }, []);

    useEffect(() => {
        const timer = setTimeout(scrollToBoundary, 300);
        return () => clearTimeout(timer);
    }, [stats.bookedIndices.length]);

    const handleBoostSubmit = async (addSqm) => {
        if (!boostModal || !boostModal.iban) return;
        const sqmToAdd = addSqm || parseInt(boostAmount) || 0;
        if (sqmToAdd <= 0) return;
        setBoostLoading(true);
        const { data: success, error: rpcErr } = await supabase
            .rpc('boost_update_sponsor', {
                p_iban: boostModal.iban,
                p_add_sqm: sqmToAdd,
                p_price: pricePerUnit
            });
        setBoostLoading(false);
        if (rpcErr || !success) return;
        localStorage.setItem('sponsoring_registered', JSON.stringify({
            name: boostModal.name,
            email: boostModal.email,
            iban: boostModal.iban
        }));
        setBoostSuccess(true);
        setTimeout(() => setBoostModal(null), 2500);
    };

    const boostModalJSX = (
        <AnimatePresence>
            {boostModal && (
                <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
                    <motion.div
                        initial={{ scale: 0.8, y: 40 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.8, y: 40 }}
                        transition={{ type: 'spring', damping: 20, stiffness: 200 }}
                        style={{ background: '#fff', borderRadius: '24px', padding: '40px', width: '540px', maxWidth: '90vw', position: 'relative', boxShadow: '0 25px 80px rgba(0,0,0,0.3)' }}>
                        <button onClick={() => setBoostModal(null)}
                            style={{ position: 'absolute', top: '20px', right: '20px', background: '#f3f4f6', border: 'none', borderRadius: '50%', width: '40px', height: '40px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <X size={20} color="#6b7280" />
                        </button>
                        {boostSuccess ? (
                            <div style={{ textAlign: 'center', padding: '20px 0' }}>
                                <div style={{ fontSize: '64px', marginBottom: '16px' }}>✅</div>
                                <h2 style={{ fontSize: '24px', fontWeight: 900, color: '#059669', marginBottom: '8px' }}>Jazak Allahu Khairan!</h2>
                                <p style={{ color: '#6b7280' }}>Dein Beitrag wurde erfolgreich erhöht.</p>
                            </div>
                        ) : (
                            <>
                                <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                                    <div style={{ fontSize: '48px', marginBottom: '12px' }}>📢</div>
                                    <h2 style={{ fontSize: '22px', fontWeight: 900, color: '#0c151a', marginBottom: '12px' }}>Aufruf vom Admin</h2>
                                    <p style={{ fontSize: '17px', color: '#4b5563', background: '#f9fafb', borderRadius: '16px', padding: '16px', border: '2px solid #e5e7eb' }}>
                                        {boostModal.message}
                                    </p>
                                </div>
                                <div style={{ marginBottom: '20px' }}>
                                    <label style={{ display: 'block', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#9ca3af', marginBottom: '8px' }}>
                                        Deine E-Mail
                                    </label>
                                    <input type="email" readOnly value={boostModal.email}
                                        style={{ width: '100%', background: '#f9fafb', border: '2px solid #e5e7eb', borderRadius: '12px', padding: '12px 16px', color: '#6b7280', fontWeight: 700, boxSizing: 'border-box' }} />
                                </div>
                                <label style={{ display: 'block', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#9ca3af', marginBottom: '12px' }}>
                                    Um wie viele m² erhöhen?
                                </label>
                                <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
                                    {[1, 2, 5, 10].map(val => (
                                        <button key={val} onClick={() => handleBoostSubmit(val)} disabled={boostLoading}
                                            style={{ flex: 1, padding: '14px 0', borderRadius: '12px', border: '2px solid #bbf7d0', background: '#f0fdf4', color: '#16a34a', fontSize: '17px', fontWeight: 900, cursor: 'pointer', opacity: boostLoading ? 0.5 : 1 }}>
                                            +{val} m²
                                        </button>
                                    ))}
                                </div>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <input type="number" min="1" placeholder="Eigene m²" value={boostAmount}
                                        onChange={e => setBoostAmount(e.target.value)}
                                        style={{ flex: 1, background: '#f9fafb', border: '2px solid transparent', borderRadius: '12px', padding: '14px 16px', fontWeight: 700, color: '#0c151a', outline: 'none', boxSizing: 'border-box' }} />
                                    <button onClick={() => handleBoostSubmit()} disabled={boostLoading || !boostAmount}
                                        style={{ padding: '14px 28px', borderRadius: '12px', background: '#0c151a', color: '#fff', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', border: 'none', cursor: boostLoading || !boostAmount ? 'not-allowed' : 'pointer', opacity: boostLoading || !boostAmount ? 0.5 : 1, whiteSpace: 'nowrap' }}>
                                        {boostLoading ? 'Speichern...' : 'Erhöhen'}
                                    </button>
                                </div>
                            </>
                        )}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );

    const bookedCount = stats.bookedIndices.length;
    const activeUnits = useMemo(() => Array.from({ length: BASE_GOAL }, (_, i) => i), []);
    const overflowM2 = Math.max(0, stats.totalSqMeters - BASE_GOAL);
    const goalReached = stats.totalSqMeters >= BASE_GOAL;
    const totalForBar = Math.max(stats.totalSqMeters, BASE_GOAL);
    const greenPercent = goalReached ? (BASE_GOAL / totalForBar * 100) : (stats.totalSqMeters / BASE_GOAL * 100);
    const goldPercent = goalReached ? (overflowM2 / totalForBar * 100) : 0;
    const donationTotal = (Number(stats.totalAmount || 0) * 12) + Number(stats.totalAmountCash || 0);

    if (dashboardLocked) {
        return (
            <div style={{ minHeight: '100vh', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif' }}>
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6 }} style={{ textAlign: 'center' }}>
                    <img src="/logo.png" alt="Al-Rahma Logo" style={{ width: '700px', maxWidth: '90vw' }} />
                </motion.div>
            </div>
        );
    }

    return (
        <div style={{ minHeight: '100vh', height: '100vh', background: '#fff', fontFamily: 'Inter, sans-serif', display: 'flex', flexDirection: 'column-reverse', overflow: 'hidden' }}>

            {boostModalJSX}

            {/* Milestone */}
            <AnimatePresence>
                {milestoneCelebration && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.96)' }}>
                        <motion.div initial={{ scale: 0.3, y: 120 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', damping: 14, stiffness: 120 }}
                            style={{ textAlign: 'center', padding: '0 60px' }}>
                            <motion.div animate={{ scale: [1, 1.08, 1], opacity: [0.8, 1, 0.8] }} transition={{ repeat: Infinity, duration: 2.5 }}
                                style={{ fontSize: '80px', fontWeight: 900, color: '#059669', letterSpacing: '0.05em', marginBottom: '20px', direction: 'rtl' }}>
                                {'\u0627\u064E\u0644\u0644\u0647\u064F \u0623\u064E\u0643\u0652\u0628\u064E\u0631'}
                            </motion.div>
                            <motion.div animate={{ scale: [0.95, 1.05, 0.95] }} transition={{ repeat: Infinity, duration: 1.8 }}
                                style={{ fontSize: '28rem', fontWeight: 900, color: '#111827', lineHeight: 1, letterSpacing: '-0.04em' }}>
                                {milestoneCelebration}%
                            </motion.div>
                            <motion.div animate={{ opacity: [0.6, 1, 0.6] }} transition={{ repeat: Infinity, duration: 2 }}
                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '24px', fontSize: '56px', fontWeight: 900, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.3em', marginTop: '24px' }}>
                                <Sparkles size={56} />Meilenstein Erreicht!<Sparkles size={56} />
                            </motion.div>
                            <motion.div animate={{ scale: [1, 1.06, 1], opacity: [0.7, 1, 0.7] }} transition={{ repeat: Infinity, duration: 3, delay: 0.5 }}
                                style={{ fontSize: '72px', fontWeight: 900, color: '#d97706', letterSpacing: '0.05em', marginTop: '28px', direction: 'rtl' }}>
                                {'\u0627\u0644\u062D\u064E\u0645\u0652\u062F\u064F \u0644\u0650\u0644\u0651\u064E\u0647'}
                            </motion.div>
                            <motion.div animate={{ scale: [1, 1.3, 1], rotate: [-5, 5, -5] }} transition={{ repeat: Infinity, duration: 1.5 }}
                                style={{ marginTop: '40px', color: '#10b981', display: 'flex', justifyContent: 'center', gap: '32px' }}>
                                <Heart size={100} fill="currentColor" />
                                <Heart size={140} fill="currentColor" />
                                <Heart size={100} fill="currentColor" />
                            </motion.div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Live Chat — stapelt sich nach oben, neue kommen mit 1 Sek Abstand */}
            <div style={{
                position: 'fixed',
                bottom: '60px',
                left: '60px',
                zIndex: 100,
                width: '820px',
                pointerEvents: 'none',
                display: 'flex',
                flexDirection: 'column-reverse',
                gap: '16px',
                maxHeight: 'calc(90vh - 220px)',
                overflow: 'hidden',
            }}>
                <AnimatePresence mode='popLayout'>
                    {chatMessages.map((msg) => (
                        <motion.div
                            key={msg.id}
                            layout
                            initial={{ opacity: 0, y: 60, scale: 0.88 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.3 } }}
                            transition={{ type: 'spring', damping: 22, stiffness: 260 }}
                            style={{
                                background: 'rgba(255,255,255,0.82)',
                                backdropFilter: 'blur(20px)',
                                WebkitBackdropFilter: 'blur(20px)',
                                border: '2px solid rgba(16,185,129,0.2)',
                                borderRadius: '28px',
                                padding: '24px 32px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '20px',
                                boxShadow: '0 4px 24px rgba(0,0,0,0.07)',
                                flexShrink: 0,
                            }}>
                            <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#10b981', flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                    <span style={{ color: '#111827', fontSize: '38px', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {msg.name}
                                    </span>
                                    <span style={{ color: '#6b7280', fontSize: '26px', marginLeft: '16px', flexShrink: 0 }}>
                                        {msg.time}
                                    </span>
                                </div>
                                <div style={{ color: '#4b5563', fontSize: '30px' }}>
                                    {msg.isCash && msg.amount === 0
                                        ? <>hat <span style={{ color: '#d97706', fontWeight: 700 }}>&euro;{msg.cashAmount}</span> bar gespendet</>
                                        : <>hat <span style={{ color: '#059669', fontWeight: 700 }}>{msg.amount} m&sup2;</span> gespendet</>
                                    }
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>

            {/* HEADER */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '60px', padding: '44px 80px', borderBottom: '4px solid #e5e7eb', background: '#fff', flexShrink: 0, position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '18px', flexShrink: 0 }}>
                    <span style={{ color: '#059669', fontSize: '40px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em' }}>&#x1F54C; Al-Rahma</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ width: '16px', height: '16px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
                        <span style={{ color: '#9ca3af', fontSize: '24px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em' }}>Live</span>
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '18px', flexShrink: 0 }}>
                    <Target size={44} style={{ color: '#9ca3af' }} />
                    <span style={{ fontSize: '120px', fontWeight: 900, color: '#111827', lineHeight: 1, letterSpacing: '-0.03em' }}>
                        {Math.min(stats.totalSqMeters, BASE_GOAL)}
                    </span>
                    <span style={{ fontSize: '60px', fontWeight: 700, color: '#6b7280' }}>/ {BASE_GOAL} m&sup2;</span>
                </div>
                <div style={{ flex: 1, height: '64px', background: '#d1d5db', borderRadius: '999px', overflow: 'hidden', display: 'flex' }}>
                    <motion.div initial={{ width: 0 }} animate={{ width: `${greenPercent}%` }}
                        transition={{ duration: 1.5, ease: [0.23, 1, 0.32, 1] }}
                        style={{ height: '100%', background: 'linear-gradient(90deg, #059669, #10b981, #34d399)' }} />
                    {goalReached && goldPercent > 0 && (
                        <motion.div initial={{ width: 0 }} animate={{ width: `${goldPercent}%` }}
                            transition={{ duration: 1.5, delay: 0.3 }}
                            style={{ height: '100%', background: 'linear-gradient(90deg, #d97706, #f59e0b)' }} />
                    )}
                </div>
                <span style={{ fontSize: '120px', fontWeight: 900, color: '#059669', letterSpacing: '-0.03em', flexShrink: 0, lineHeight: 1 }}>
                    {((stats.totalSqMeters / BASE_GOAL) * 100).toFixed(1)}%
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '18px', padding: '24px 40px', background: '#f9fafb', borderRadius: '28px', border: '2px solid #e5e7eb', flexShrink: 0 }}>
                    <Users size={44} style={{ color: '#9ca3af' }} />
                    <span style={{ fontSize: '100px', fontWeight: 900, color: '#111827', lineHeight: 1 }}>
                        {Number(stats.totalSponsors).toLocaleString()}
                    </span>
                    <span style={{ color: '#9ca3af', fontSize: '24px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em' }}>Spender</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '18px', padding: '24px 40px', background: '#f0fdf4', borderRadius: '28px', border: '2px solid #bbf7d0', flexShrink: 0 }}>
                    <Euro size={44} style={{ color: '#10b981' }} />
                    <span style={{ fontSize: '100px', fontWeight: 900, color: '#065f46', lineHeight: 1 }}>
                        &euro;{donationTotal.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </span>
                </div>
                {goalReached && overflowM2 > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '18px', padding: '24px 40px', background: '#fffbeb', borderRadius: '28px', border: '2px solid #fde68a', flexShrink: 0 }}>
                        <span style={{ fontSize: '100px', fontWeight: 900, color: '#92400e', lineHeight: 1 }}>
                            &euro;{(overflowM2 * pricePerUnit * 12).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </span>
                        <span style={{ color: '#b45309', fontSize: '24px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em' }}>Kauf</span>
                    </div>
                )}
            </div>

            {/* TEPPICH */}
            <div style={{ flex: 1, padding: '36px 72px 36px', marginTop: '220px', overflow: 'hidden' }}>
                <div ref={carpetScrollRef}
                    style={{ height: '100%', position: 'relative', borderRadius: '56px', overflow: 'auto', border: '3px solid #6ee7b7', background: 'linear-gradient(180deg, #ecfdf5 0%, #d1fae5 100%)', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                    <div style={{ position: 'sticky', top: 0, left: 0, right: 0, height: 0, zIndex: 10, pointerEvents: 'none' }}>
                        <div style={{ position: 'absolute', top: '28px', left: '28px', width: '64px', height: '64px', borderLeft: '5px solid #6ee7b7', borderTop: '5px solid #6ee7b7', borderRadius: '16px 0 0 0' }} />
                        <div style={{ position: 'absolute', top: '28px', right: '28px', width: '64px', height: '64px', borderRight: '5px solid #6ee7b7', borderTop: '5px solid #6ee7b7', borderRadius: '0 16px 0 0' }} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`, gap: '10px', padding: '80px 72px 80px' }}>
                        {activeUnits.map((idx) => (
                            <SajadahElement key={idx} index={idx} isBooked={idx < bookedCount} isOverflow={false} delay={(idx % COLS) * 0.003} />
                        ))}
                    </div>
                    <div style={{ position: 'sticky', bottom: 0, left: 0, right: 0, height: 0, zIndex: 10, pointerEvents: 'none' }}>
                        <div style={{ position: 'absolute', bottom: '28px', left: '28px', width: '64px', height: '64px', borderLeft: '5px solid #6ee7b7', borderBottom: '5px solid #6ee7b7', borderRadius: '0 0 0 16px' }} />
                        <div style={{ position: 'absolute', bottom: '28px', right: '28px', width: '64px', height: '64px', borderRight: '5px solid #6ee7b7', borderBottom: '5px solid #6ee7b7', borderRadius: '0 0 16px 0' }} />
                        <div style={{ position: 'absolute', bottom: '28px', right: '120px', display: 'flex', alignItems: 'center', gap: '10px', opacity: 0.5 }}>
                            <span style={{ width: '14px', height: '14px', borderRadius: '50%', background: '#059669', display: 'inline-block' }} />
                            <span style={{ fontSize: '18px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.3em', color: '#065f46' }}>Live</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom Strip */}
            <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 90, height: '10px', display: 'flex' }}>
                <motion.div initial={{ width: 0 }} animate={{ width: `${greenPercent}%` }}
                    transition={{ duration: 2, ease: 'easeOut' }}
                    style={{ height: '100%', background: 'linear-gradient(90deg, #059669, #10b981, #34d399)' }} />
                {goalReached && goldPercent > 0 && (
                    <motion.div initial={{ width: 0 }} animate={{ width: `${goldPercent}%` }}
                        transition={{ duration: 2, delay: 0.5, ease: 'easeOut' }}
                        style={{ height: '100%', background: 'linear-gradient(90deg, #d97706, #f59e0b)' }} />
                )}
            </div>
        </div>
    );
};

export default Dashboard;
