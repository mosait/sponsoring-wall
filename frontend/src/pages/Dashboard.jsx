import React, { useState, useEffect, useRef, useMemo } from 'react';
import confetti from 'canvas-confetti';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Euro, Heart, Target, Sparkles, X } from 'lucide-react';
import { supabase, subscribeToSponsors } from '../lib/supabaseClient';
import { sendConfirmationEmail } from '../lib/emailService';
import SajadahElement from '../components/SajadahElement';
import QRCode from 'react-qr-code';

const DASH_T = {
    de: {
        orgName: 'Islamisches Zentrum Stuttgart',
        live: 'Live',
        spender: 'Spender',
        milestone: 'Meilenstein Erreicht!',
        extraLabel: 'Extra Gebetsplätze',
        langToggle: 'عربي',
        chatDonated: (amount) => `hat ${amount} Gebetspl. gespendet`,
        chatCash: (cashAmt) => `es wurde €${cashAmt} bar gespendet`,
        boostAdminCall: 'Aufruf vom Admin',
        boostEmail: 'Deine E-Mail',
        boostHowMany: 'Um wie viele Gebetsplätze erhöhen?',
        boostCustom: 'Eigene Anzahl',
        boostSaving: 'Speichern...',
        boostIncrease: 'Erhöhen',
        boostSuccessTitle: 'Jazak Allahu Khairan!',
        boostSuccessText: 'Dein Beitrag wurde erfolgreich erhöht.',
        monatlich: 'Monatlich',
    },
    ar: {
        orgName: 'المركز الإسلامي شتوتغارت',
        live: 'مباشر',
        spender: 'متبرع',
        milestone: 'تم الوصول للهدف!',
        extraLabel: 'مصلى إضافي',
        langToggle: 'DE',
        chatDonated: (amount) => `تبرع بـ ${amount} مصلى`,
        chatCash: (cashAmt) => `تبرع بـ €${cashAmt} نقداً`,
        boostAdminCall: 'نداء من المسؤول',
        boostEmail: 'بريدك الإلكتروني',
        boostHowMany: 'كم مصلى تريد إضافة؟',
        boostCustom: 'عدد مخصص',
        boostSaving: 'جارٍ الحفظ...',
        boostIncrease: 'رفع',
        boostSuccessTitle: 'جزاك الله خيراً!',
        boostSuccessText: 'تم رفع مساهمتك بنجاح.',
        monatlich: 'شهرياً',
    },
};

const Dashboard = () => {
    const [lang, setLang] = useState(() => localStorage.getItem('lang') || 'de');
    const [windowWidth, setWindowWidth] = useState(window.innerWidth);
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
    const [boostError, setBoostError] = useState('');
    const [showRegisterQr, setShowRegisterQr] = useState(false);
    const [qrSize, setQrSize] = useState(200);
    const lastProgressRef = useRef(0);
    const carpetScrollRef = useRef(null);
    const headerRef = useRef(null);
    const [headerHeight, setHeaderHeight] = useState(0);

    // Queue für verzögertes Anzeigen
    const incomingQueueRef = useRef([]);
    const queueTimerRef = useRef(null);
    const seenIdsRef = useRef(new Set());

    const dt = DASH_T[lang];
    // Responsive scale: 1.0 at 1920px TV, down to 0.3 on small screens
    const scale = Math.min(1, Math.max(0.3, windowWidth / 1920));
    const S = (px) => Math.round(px * scale);
    const BASE_GOAL = 500;
    const COLS = windowWidth < 600 ? 15 : windowWidth < 1024 ? 25 : 40;

    useEffect(() => {
        const handler = () => setWindowWidth(window.innerWidth);
        window.addEventListener('resize', handler);
        return () => window.removeEventListener('resize', handler);
    }, []);

    // Track actual header height so the grid never slides underneath it
    useEffect(() => {
        if (!headerRef.current) return;
        const ro = new ResizeObserver(entries => {
            for (const entry of entries) {
                setHeaderHeight(entry.contentRect.height +
                    parseFloat(getComputedStyle(entry.target).paddingTop) +
                    parseFloat(getComputedStyle(entry.target).paddingBottom));
            }
        });
        ro.observe(headerRef.current);
        return () => ro.disconnect();
    }, [dashboardLocked]); // re-observe after lock/unlock so height recalculates

    // Force the browser to treat the layout viewport as 1920px on desktop screens.
    // This makes the browser scale the TV layout to fit any screen automatically —
    // identical to what the user was achieving by manually zooming to 50%.
    // On mobile (screen width < 1024px) we leave the viewport untouched.
    useEffect(() => {
        if (dashboardLocked) return; // lock screen doesn't need the 1920 viewport
        if (window.screen.width < 1024) return;
        const meta = document.querySelector('meta[name=viewport]');
        if (!meta) return;
        const original = meta.content;
        meta.content = 'width=1920';
        return () => { meta.content = original; };
    }, [dashboardLocked]);

    const toggleLang = () => {
        const next = lang === 'de' ? 'ar' : 'de';
        setLang(next);
        localStorage.setItem('lang', next);
    };

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
        const rowHeight = totalHeight / Math.ceil(Math.max(BASE_GOAL, stats.bookedIndices.length) / COLS);
        const bookedRows = Math.floor(stats.bookedIndices.length / COLS);
        const targetScroll = Math.max(0, (bookedRows - Math.floor(viewHeight / rowHeight) + 2) * rowHeight);
        container.scrollTo({ top: targetScroll, behavior: 'smooth' });
    };

    // Re-fetch all stats from DB (used for all realtime events)
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

            // Build a lookup map for fast access
            const dataMap = new Map(data.map(s => [s.id, s]));

            // Update existing chat messages in-place if their values changed
            setChatMessages(prev => prev.map(msg => {
                const fresh = dataMap.get(msg.id);
                if (!fresh) return msg;
                return {
                    ...msg,
                    name: fresh.is_anonymous ? 'Anonym' : fresh.full_name,
                    amount: fresh.sq_meters,
                    isCash: fresh.is_cash,
                    cashAmount: fresh.total_amount,
                };
            }));

            // Queue only genuinely new entries into the live chat feed
            const newEntries = data.filter(s => !seenIdsRef.current.has(s.id));
            newEntries.forEach(s => {
                seenIdsRef.current.add(s.id);
                addToIncomingQueue({
                    id: s.id,
                    name: s.is_anonymous ? 'Anonym' : s.full_name,
                    amount: s.sq_meters,
                    isCash: s.is_cash,
                    cashAmount: s.total_amount,
                    time: new Date(s.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                });
            });
        }
    };

    useEffect(() => {
        supabase.rpc('get_public_settings').then(({ data }) => {
            const s = Array.isArray(data) ? data[0] : data;
            if (s?.price_per_unit) setPricePerUnit(s.price_per_unit);
            if (s) setDashboardLocked(s.dashboard_locked || false);
            if (s) setShowRegisterQr(s.show_register_qr || false);
            if (s?.qr_size) setQrSize(s.qr_size);
        });

        // Realtime-Listener für dashboard_locked
        const settingsChannel = supabase
            .channel('project_settings_changes')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'project_settings' }, ({ new: newData }) => {
                if (newData) setDashboardLocked(newData.dashboard_locked || false);
                if (newData) setShowRegisterQr(newData.show_register_qr || false);
                if (newData?.qr_size) setQrSize(newData.qr_size);
            })
            .subscribe();

        // Polling fallback every 3s (in case Realtime publication not set for project_settings)
        const settingsPoll = setInterval(() => {
            supabase.rpc('get_public_settings').then(({ data }) => {
                const s = Array.isArray(data) ? data[0] : data;
                if (s) setDashboardLocked(s.dashboard_locked || false);
                if (s) setShowRegisterQr(s.show_register_qr || false);
                if (s?.qr_size) setQrSize(s.qr_size);
            });
        }, 3000);

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
                // Mark all existing sponsors as seen so realtime only queues genuinely new ones
                data.forEach(s => seenIdsRef.current.add(s.id));
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

        const unsubscribe = subscribeToSponsors(() => {
            // payload.new is null for anon subscribers due to RLS blocking SELECT on sponsors.
            // Always refetch from sponsors_public (which anon can read) for all event types.
            refetchStats();
        });

        const boostChannel = supabase.channel('boost-request')
            .on('broadcast', { event: 'boost' }, ({ payload }) => {
                const registered = JSON.parse(localStorage.getItem('sponsoring_registered') || 'null');
                if (registered) {
                    setBoostModal({ message: payload.message, ...registered });
                    setBoostAmount('');
                    setBoostError('');
                    setBoostSuccess(false);
                }
            })
            .subscribe();

        return () => {
            unsubscribe();
            settingsChannel.unsubscribe();
            boostChannel.unsubscribe();
            clearInterval(settingsPoll);
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
        setBoostError('');
        setBoostLoading(true);
        const { data: success, error: rpcErr } = await supabase
            .rpc('boost_update_sponsor', {
                p_iban: boostModal.iban,
                p_add_sqm: sqmToAdd,
            });
        setBoostLoading(false);
        if (rpcErr || !success) {
            console.error('[boost] iban:', boostModal.iban, '| rpcErr:', rpcErr, '| success:', success);
            setBoostError(rpcErr ? `Fehler: ${rpcErr.message}` : 'Sponsor nicht gefunden. Stimmt die IBAN im Profil?');
            return;
        }
        localStorage.setItem('sponsoring_registered', JSON.stringify({
            name: boostModal.name,
            email: boostModal.email,
            iban: boostModal.iban
        }));
        sendConfirmationEmail({
            name: boostModal.name,
            email: boostModal.email,
            sqMeters: sqmToAdd,
            monthlyAmount: sqmToAdd * pricePerUnit,
        });
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
                                <h2 style={{ fontSize: '24px', fontWeight: 900, color: '#059669', marginBottom: '8px' }}>{dt.boostSuccessTitle}</h2>
                                <p style={{ color: '#6b7280' }}>{dt.boostSuccessText}</p>
                            </div>
                        ) : (
                            <>
                                <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                                    <div style={{ fontSize: '48px', marginBottom: '12px' }}>📢</div>
                                    <h2 style={{ fontSize: '22px', fontWeight: 900, color: '#0c151a', marginBottom: '12px' }}>{dt.boostAdminCall}</h2>
                                    <p style={{ fontSize: '17px', color: '#4b5563', background: '#f9fafb', borderRadius: '16px', padding: '16px', border: '2px solid #e5e7eb' }}>
                                        {boostModal.message}
                                    </p>
                                </div>
                                <div style={{ marginBottom: '20px' }}>
                                    <label style={{ display: 'block', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#9ca3af', marginBottom: '8px' }}>
                                        {dt.boostEmail}
                                    </label>
                                    <input type="email" readOnly value={boostModal.email}
                                        style={{ width: '100%', background: '#f9fafb', border: '2px solid #e5e7eb', borderRadius: '12px', padding: '12px 16px', color: '#6b7280', fontWeight: 700, boxSizing: 'border-box' }} />
                                </div>
                                <label style={{ display: 'block', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#9ca3af', marginBottom: '12px' }}>
                                    {dt.boostHowMany}
                                </label>
                                <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
                                    {[1, 2, 5, 10].map(val => {
                                        const selected = boostAmount === String(val);
                                        return (
                                            <button key={val} onClick={() => setBoostAmount(String(val))} disabled={boostLoading}
                                                style={{ flex: 1, padding: '14px 0', borderRadius: '12px', border: `2px solid ${selected ? '#16a34a' : '#bbf7d0'}`, background: selected ? '#16a34a' : '#f0fdf4', color: selected ? '#fff' : '#16a34a', fontSize: '17px', fontWeight: 900, cursor: 'pointer', opacity: boostLoading ? 0.5 : 1, transition: 'all 0.15s' }}>
                                                +{val}
                                            </button>
                                        );
                                    })}
                                </div>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <input type="number" min="1" placeholder={dt.boostCustom} value={boostAmount}
                                        onChange={e => setBoostAmount(e.target.value)}
                                        style={{ flex: 1, background: '#f9fafb', border: '2px solid transparent', borderRadius: '12px', padding: '14px 16px', fontWeight: 700, color: '#0c151a', outline: 'none', boxSizing: 'border-box' }} />
                                    <button onClick={() => handleBoostSubmit()} disabled={boostLoading || !boostAmount}
                                        style={{ padding: '14px 28px', borderRadius: '12px', background: '#0c151a', color: '#fff', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', border: 'none', cursor: boostLoading || !boostAmount ? 'not-allowed' : 'pointer', opacity: boostLoading || !boostAmount ? 0.5 : 1, whiteSpace: 'nowrap' }}>
                                        {boostLoading ? dt.boostSaving : dt.boostIncrease}
                                    </button>
                                </div>
                                {boostError && (
                                    <p style={{ marginTop: '10px', color: '#dc2626', fontSize: '13px', fontWeight: 600, textAlign: 'center' }}>{boostError}</p>
                                )}
                            </>
                        )}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );

    const bookedCount = stats.bookedIndices.length;
    const overflowCount = Math.max(0, bookedCount - BASE_GOAL);
    const activeUnits = useMemo(() => Array.from({ length: BASE_GOAL }, (_, i) => i), []);
    const greenPercent = Math.min((stats.totalSqMeters / BASE_GOAL) * 100, 100);
    const donationTotal = Number(stats.totalAmount || 0) + Number(stats.totalAmountCash || 0);

    if (dashboardLocked) {
        return (
            <div style={{ minHeight: '100vh', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif' }}>
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6 }} style={{ textAlign: 'center', padding: '40px' }}>
                    <img src="/logo.png" alt="IZS Logo" style={{ width: 'clamp(160px, 20vw, 320px)', marginBottom: '32px', display: 'block', margin: '0 auto 32px' }} />
                    <div style={{ fontSize: 'clamp(11px, 1.4vw, 20px)', fontWeight: 700, color: '#059669', letterSpacing: '0.25em', textTransform: 'uppercase' }}>Islamisches Zentrum Stuttgart</div>
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
                            style={{ textAlign: 'center', padding: `0 clamp(12px, 3.1vw, 60px)` }}>
                            <motion.div animate={{ scale: [1, 1.08, 1], opacity: [0.8, 1, 0.8] }} transition={{ repeat: Infinity, duration: 2.5 }}
                                style={{ fontSize: `clamp(24px, 4.2vw, 80px)`, fontWeight: 900, color: '#059669', letterSpacing: '0.05em', marginBottom: `clamp(8px, 1.04vw, 20px)`, direction: 'rtl' }}>
                                {'\u0627\u064E\u0644\u0644\u0647\u064F \u0623\u064E\u0643\u0652\u0628\u064E\u0631'}
                            </motion.div>
                            <motion.div animate={{ scale: [0.95, 1.05, 0.95] }} transition={{ repeat: Infinity, duration: 1.8 }}
                                style={{ fontSize: `clamp(80px, 23.3vw, 448px)`, fontWeight: 900, color: '#111827', lineHeight: 1, letterSpacing: '-0.04em' }}>
                                {milestoneCelebration}%
                            </motion.div>
                            <motion.div animate={{ opacity: [0.6, 1, 0.6] }} transition={{ repeat: Infinity, duration: 2 }}
                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: `clamp(8px, 1.25vw, 24px)`, fontSize: `clamp(18px, 2.9vw, 56px)`, fontWeight: 900, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.3em', marginTop: `clamp(8px, 1.25vw, 24px)` }}>
                                <Sparkles size={S(56)} />{dt.milestone}<Sparkles size={S(56)} />
                            </motion.div>
                            <motion.div animate={{ scale: [1, 1.06, 1], opacity: [0.7, 1, 0.7] }} transition={{ repeat: Infinity, duration: 3, delay: 0.5 }}
                                style={{ fontSize: `clamp(22px, 3.75vw, 72px)`, fontWeight: 900, color: '#d97706', letterSpacing: '0.05em', marginTop: `clamp(10px, 1.46vw, 28px)`, direction: 'rtl' }}>
                                {'\u0627\u0644\u062D\u064E\u0645\u0652\u062F\u064F \u0644\u0650\u0644\u0651\u064E\u0647'}
                            </motion.div>
                            <motion.div animate={{ scale: [1, 1.3, 1], rotate: [-5, 5, -5] }} transition={{ repeat: Infinity, duration: 1.5 }}
                                style={{ marginTop: `clamp(12px, 2.1vw, 40px)`, color: '#10b981', display: 'flex', justifyContent: 'center', gap: `clamp(10px, 1.7vw, 32px)` }}>
                                <Heart size={S(100)} fill="currentColor" />
                                <Heart size={S(140)} fill="currentColor" />
                                <Heart size={S(100)} fill="currentColor" />
                            </motion.div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Live Chat */}
            <div style={{
                position: 'fixed',
                bottom: windowWidth < 768 ? '10px' : 'clamp(40px, 3.1vw, 60px)',
                left: windowWidth < 768 ? '6px' : 'clamp(12px, 3.1vw, 60px)',
                zIndex: 100,
                width: windowWidth < 768 ? '48vw' : 'clamp(240px, 42.7vw, 820px)',
                pointerEvents: 'none',
                display: 'flex',
                flexDirection: 'column-reverse',
                gap: 'clamp(8px, 0.83vw, 16px)',
                maxHeight: 'calc(90vh - clamp(90px, 11.5vw, 220px))',
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
                                borderRadius: 'clamp(12px, 1.46vw, 28px)',
                                padding: 'clamp(10px, 1.25vw, 24px) clamp(12px, 1.67vw, 32px)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 'clamp(8px, 1.04vw, 20px)',
                                boxShadow: '0 4px 24px rgba(0,0,0,0.07)',
                                flexShrink: 0,
                                direction: lang === 'ar' ? 'rtl' : 'ltr',
                            }}>
                            <div style={{ width: S(20), height: S(20), borderRadius: '50%', background: '#10b981', flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'clamp(3px, 0.31vw, 6px)' }}>
                                    <span style={{ color: '#111827', fontSize: 'clamp(14px, 1.98vw, 38px)', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {msg.name}
                                    </span>
                                    <span style={{ color: '#6b7280', fontSize: 'clamp(10px, 1.35vw, 26px)', marginLeft: 'clamp(6px, 0.83vw, 16px)', flexShrink: 0 }}>
                                        {msg.time}
                                    </span>
                                </div>
                                <div style={{ color: '#4b5563', fontSize: 'clamp(11px, 1.56vw, 30px)' }}>
                                    {msg.isCash && msg.amount === 0
                                        ? lang === 'ar'
                                            ? <>تبرع بـ <span style={{ color: '#d97706', fontWeight: 700 }}>&euro;{msg.cashAmount}</span> نقداً</>
                                            : <>es wurde <span style={{ color: '#d97706', fontWeight: 700 }}>&euro;{msg.cashAmount}</span> bar gespendet</>
                                        : lang === 'ar'
                                            ? <>{dt.chatDonated(msg.amount)}</>
                                            : <>hat <span style={{ color: '#059669', fontWeight: 700 }}>{msg.amount} Gebetsplätze</span> gespendet</>
                                    }
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>

            {/* HEADER */}
            <div ref={headerRef} style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 'clamp(8px, 3.1vw, 60px)', padding: 'clamp(12px, 2.3vw, 44px) clamp(16px, 4.2vw, 80px)', borderBottom: '3px solid #e5e7eb', background: '#fff', flexShrink: 0, position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50 }}>
                <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                    <img src="/logo.png" alt="IZS Logo" style={{ height: 'clamp(80px, 10vw, 190px)', width: 'auto', display: 'block' }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 'clamp(6px, 0.94vw, 18px)', flexShrink: 0 }}>
                    <Target size={S(44)} style={{ color: '#9ca3af' }} />
                    <span style={{ fontSize: 'clamp(32px, 6.25vw, 120px)', fontWeight: 900, color: '#111827', lineHeight: 1, letterSpacing: '-0.03em' }}>
                        {stats.totalSqMeters}
                    </span>
                    <span style={{ fontSize: 'clamp(16px, 3.13vw, 60px)', fontWeight: 700, color: '#6b7280' }}>/ {BASE_GOAL}</span>
                </div>
                <div style={{ flex: 1, minWidth: 'clamp(100px, 10vw, 200px)', height: 'clamp(16px, 3.3vw, 64px)', background: '#d1d5db', borderRadius: '999px', overflow: 'hidden', display: 'flex' }}>
                    <motion.div initial={{ width: 0 }} animate={{ width: `${greenPercent}%` }}
                        transition={{ duration: 1.5, ease: [0.23, 1, 0.32, 1] }}
                        style={{ height: '100%', background: 'linear-gradient(90deg, #059669, #10b981, #34d399)' }} />
                </div>
                <span style={{ fontSize: 'clamp(32px, 6.25vw, 120px)', fontWeight: 900, color: '#059669', letterSpacing: '-0.03em', flexShrink: 0, lineHeight: 1 }}>
                    {((stats.totalSqMeters / BASE_GOAL) * 100).toFixed(1)}%
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'clamp(6px, 0.94vw, 18px)', padding: 'clamp(8px, 1.25vw, 24px) clamp(12px, 2.08vw, 40px)', background: '#f9fafb', borderRadius: 'clamp(10px, 1.46vw, 28px)', border: '2px solid #e5e7eb', flexShrink: 0 }}>
                    <Users size={S(44)} style={{ color: '#9ca3af' }} />
                    <span style={{ fontSize: 'clamp(28px, 5.2vw, 100px)', fontWeight: 900, color: '#111827', lineHeight: 1 }}>
                        {Number(stats.totalSponsors).toLocaleString()}
                    </span>
                    <span style={{ color: '#9ca3af', fontSize: 'clamp(9px, 1.25vw, 24px)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em' }}>{dt.spender}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 'clamp(2px, 0.3vw, 6px)', padding: 'clamp(8px, 1.25vw, 24px) clamp(12px, 2.08vw, 40px)', background: '#f0fdf4', borderRadius: 'clamp(10px, 1.46vw, 28px)', border: '2px solid #bbf7d0', flexShrink: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'clamp(4px, 0.6vw, 12px)' }}>
                        <Euro size={S(28)} style={{ color: '#10b981' }} />
                        <span style={{ fontSize: 'clamp(28px, 5.2vw, 100px)', fontWeight: 900, color: '#065f46', lineHeight: 1 }}>
                            {donationTotal.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </span>
                    </div>
                    <span style={{ color: '#10b981', fontSize: 'clamp(8px, 0.9vw, 16px)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em' }}>{dt.monatlich}</span>
                </div>
                {/* Language Toggle + Live */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'clamp(4px, 0.5vw, 10px)', flexShrink: 0 }}>
                    <button onClick={toggleLang}
                        style={{ padding: 'clamp(6px, 0.63vw, 12px) clamp(10px, 1.04vw, 20px)', borderRadius: 'clamp(8px, 0.63vw, 12px)', border: '2px solid #e5e7eb', background: '#f9fafb', color: '#374151', fontSize: 'clamp(10px, 1.04vw, 20px)', fontWeight: 900, cursor: 'pointer', letterSpacing: '0.05em' }}>
                        {dt.langToggle}
                    </button>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'clamp(4px, 0.4vw, 8px)' }}>
                        <span style={{ width: 'clamp(6px, 0.6vw, 12px)', height: 'clamp(6px, 0.6vw, 12px)', borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
                        <span style={{ color: '#9ca3af', fontSize: 'clamp(7px, 0.8vw, 16px)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em' }}>{dt.live}</span>
                    </div>
                </div>
            </div>

            {/* GEBETSPLATZ GRID */}
            <div style={{ flex: 1, padding: `clamp(12px, 1.9vw, 36px) clamp(16px, 3.75vw, 72px)`, marginTop: headerHeight || 'clamp(90px, 11.5vw, 220px)', overflow: 'hidden' }}>
                <div ref={carpetScrollRef}
                    style={{ height: '100%', position: 'relative', borderRadius: 'clamp(16px, 2.9vw, 56px)', overflow: 'auto', border: '3px solid #6ee7b7', background: 'linear-gradient(180deg, #ecfdf5 0%, #d1fae5 100%)', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                    <div style={{ position: 'sticky', top: 0, left: 0, right: 0, height: 0, zIndex: 10, pointerEvents: 'none' }}>
                        <div style={{ position: 'absolute', top: 'clamp(10px, 1.46vw, 28px)', left: 'clamp(10px, 1.46vw, 28px)', width: 'clamp(20px, 3.3vw, 64px)', height: 'clamp(20px, 3.3vw, 64px)', borderLeft: `clamp(2px, 0.26vw, 5px) solid #6ee7b7`, borderTop: `clamp(2px, 0.26vw, 5px) solid #6ee7b7`, borderRadius: 'clamp(6px, 0.83vw, 16px) 0 0 0' }} />
                        <div style={{ position: 'absolute', top: 'clamp(10px, 1.46vw, 28px)', right: 'clamp(10px, 1.46vw, 28px)', width: 'clamp(20px, 3.3vw, 64px)', height: 'clamp(20px, 3.3vw, 64px)', borderRight: `clamp(2px, 0.26vw, 5px) solid #6ee7b7`, borderTop: `clamp(2px, 0.26vw, 5px) solid #6ee7b7`, borderRadius: `0 clamp(6px, 0.83vw, 16px) 0 0` }} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`, gap: 'clamp(3px, 0.52vw, 10px)', padding: `clamp(20px, 4.2vw, 80px) clamp(16px, 3.75vw, 72px)` }}>
                        {activeUnits.map((idx) => (
                            <SajadahElement key={idx} index={idx} isBooked={idx < bookedCount} isOverflow={false} delay={(idx % COLS) * 0.003} />
                        ))}
                        {overflowCount > 0 && (
                            <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 'clamp(8px, 1.25vw, 24px)', margin: 'clamp(14px, 2.1vw, 40px) 0 clamp(2px, 0.5vw, 10px)' }}>
                                <div style={{ flex: 1, height: 'clamp(2px, 0.2vw, 4px)', background: 'linear-gradient(90deg, transparent, #f59e0b)', borderRadius: '999px' }} />
                                <span style={{ color: '#b45309', fontSize: 'clamp(10px, 1.4vw, 28px)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.15em', whiteSpace: 'nowrap' }}>
                                    +{overflowCount} {dt.extraLabel}
                                </span>
                                <div style={{ flex: 1, height: 'clamp(2px, 0.2vw, 4px)', background: 'linear-gradient(90deg, #f59e0b, transparent)', borderRadius: '999px' }} />
                            </div>
                        )}
                        {overflowCount > 0 && Array.from({ length: overflowCount }, (_, i) => BASE_GOAL + i).map((idx) => (
                            <SajadahElement key={idx} index={idx} isBooked isOverflow delay={(idx % COLS) * 0.003} />
                        ))}
                    </div>
                    <div style={{ position: 'sticky', bottom: 0, left: 0, right: 0, height: 0, zIndex: 10, pointerEvents: 'none' }}>
                        <div style={{ position: 'absolute', bottom: 'clamp(10px, 1.46vw, 28px)', left: 'clamp(10px, 1.46vw, 28px)', width: 'clamp(20px, 3.3vw, 64px)', height: 'clamp(20px, 3.3vw, 64px)', borderLeft: `clamp(2px, 0.26vw, 5px) solid #6ee7b7`, borderBottom: `clamp(2px, 0.26vw, 5px) solid #6ee7b7`, borderRadius: `0 0 0 clamp(6px, 0.83vw, 16px)` }} />
                        <div style={{ position: 'absolute', bottom: 'clamp(10px, 1.46vw, 28px)', right: 'clamp(10px, 1.46vw, 28px)', width: 'clamp(20px, 3.3vw, 64px)', height: 'clamp(20px, 3.3vw, 64px)', borderRight: `clamp(2px, 0.26vw, 5px) solid #6ee7b7`, borderBottom: `clamp(2px, 0.26vw, 5px) solid #6ee7b7`, borderRadius: `0 0 clamp(6px, 0.83vw, 16px) 0` }} />
                        <div style={{ position: 'absolute', bottom: 'clamp(10px, 1.46vw, 28px)', right: 'clamp(60px, 6.25vw, 120px)', display: 'flex', alignItems: 'center', gap: 'clamp(4px, 0.52vw, 10px)', opacity: 0.5 }}>
                            <span style={{ width: 'clamp(8px, 0.73vw, 14px)', height: 'clamp(8px, 0.73vw, 14px)', borderRadius: '50%', background: '#059669', display: 'inline-block' }} />
                            <span style={{ fontSize: 'clamp(9px, 0.94vw, 18px)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.3em', color: '#065f46' }}>{dt.live}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom Strip */}
            <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 90, height: 'clamp(4px, 0.52vw, 10px)', display: 'flex' }}>
                <motion.div initial={{ width: 0 }} animate={{ width: `${greenPercent}%` }}
                    transition={{ duration: 2, ease: 'easeOut' }}
                    style={{ height: '100%', background: 'linear-gradient(90deg, #059669, #10b981, #34d399)' }} />
            </div>

            {/* Register QR Code */}
            <AnimatePresence>
                {showRegisterQr && (
                    <motion.a
                        href="/register"
                        initial={{ opacity: 0, scale: 0.85, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.85, y: 20 }}
                        transition={{ type: 'spring', damping: 20, stiffness: 200 }}
                        style={{
                            position: 'fixed',
                            bottom: windowWidth < 768 ? '10px' : 'clamp(18px, 2vw, 38px)',
                            right: windowWidth < 768 ? '6px' : 'clamp(16px, 2.5vw, 48px)',
                            zIndex: 95,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: S(8),
                            background: 'rgba(255,255,255,0.95)',
                            backdropFilter: 'blur(12px)',
                            WebkitBackdropFilter: 'blur(12px)',
                            borderRadius: S(16),
                            padding: S(14),
                            boxShadow: '0 8px 40px rgba(0,0,0,0.15)',
                            border: '2px solid rgba(16,185,129,0.25)',
                            textDecoration: 'none',
                            cursor: 'pointer',
                        }}
                    >
                        <QRCode
                            value={window.location.origin + '/register'}
                            size={S(qrSize)}
                            style={{ display: 'block' }}
                            viewBox="0 0 256 256"
                        />
                        <span style={{
                            fontSize: S(Math.max(8, Math.round(qrSize * 0.07))),
                            fontWeight: 900,
                            textTransform: 'uppercase',
                            letterSpacing: '0.15em',
                            color: '#059669',
                        }}>
                            {lang === 'ar' ? 'امسح للتسجيل' : 'Jetzt Registrieren'}
                        </span>
                    </motion.a>
                )}
            </AnimatePresence>
        </div>
    );
};

export default Dashboard;
