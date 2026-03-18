import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Mail, Phone, CreditCard, ChevronRight, CheckCircle2, Building2, X } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { isValidIBAN, electronicFormatIBAN } from 'ibantools';

const Register = () => {
    const [loading, setLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [pricePerUnit, setPricePerUnit] = useState(15);
    const [errorMsg, setErrorMsg] = useState('');
    const [boostModal, setBoostModal] = useState(null);
    const [boostAmount, setBoostAmount] = useState('');
    const [boostLoading, setBoostLoading] = useState(false);
    const [boostSuccess, setBoostSuccess] = useState(false);
    const [formData, setFormData] = useState({
        full_name: '',
        email: '',
        phone: '',
        iban: '',
        sq_meters: 1,
        mandate_accepted: false,
        is_anonymous: false,
        inputMode: 'sqm',
        monthlyEuro: ''
    });

    useEffect(() => {
        supabase.rpc('get_public_settings').then(({ data }) => {
            const s = Array.isArray(data) ? data[0] : data;
            if (s?.price_per_unit) setPricePerUnit(s.price_per_unit);
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

        return () => boostChannel.unsubscribe();
    }, []);

    const validateIBAN = (iban) => {
        return isValidIBAN(electronicFormatIBAN(iban) || '');
    };

    const sanitize = (str) => str.replace(/[<>]/g, '').trim();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setErrorMsg('');

        const cleanName = sanitize(formData.full_name);
        const cleanEmail = sanitize(formData.email);
        const cleanPhone = sanitize(formData.phone);
        const cleanIban = formData.iban.replace(/\s/g, '').toUpperCase();

        if (!cleanName || cleanName.length < 2) {
            setErrorMsg("Bitte einen gültigen Namen eingeben.");
            return;
        }

        if (!validateIBAN(cleanIban)) {
            setErrorMsg("Bitte eine valide IBAN eingeben (z.B. DE89370400440532013000)");
            return;
        }

        if (!formData.mandate_accepted) {
            setErrorMsg("Bitte das SEPA-Lastschriftmandat akzeptieren.");
            return;
        }

        setLoading(true);

        const addedSqMeters = formData.sq_meters;
        const addedAmount = formData.inputMode === 'euro'
            ? parseFloat(formData.monthlyEuro || 0)
            : formData.sq_meters * pricePerUnit;

        // Prüfen ob IBAN bereits existiert (via SECURITY DEFINER Funktion — kein direkter SELECT)
        const { data: existingRows } = await supabase
            .rpc('get_sponsor_for_registration', { p_iban: cleanIban });
        const existing = existingRows && existingRows.length > 0 ? existingRows[0] : null;

        let error;
        if (existing) {
            // Bestehenden Eintrag aktualisieren: m² und Betrag summieren
            const result = await supabase
                .from('sponsors')
                .update({
                    full_name: cleanName,
                    email: cleanEmail,
                    phone: cleanPhone,
                    sq_meters: existing.sq_meters + addedSqMeters,
                    total_amount: Number(existing.total_amount) + addedAmount,
                    mandate_accepted: formData.mandate_accepted,
                    is_anonymous: formData.is_anonymous,
                })
                .eq('id', existing.id);
            error = result.error;
        } else {
            // Neuen Eintrag erstellen
            const result = await supabase.from('sponsors').insert([{
                full_name: cleanName,
                email: cleanEmail,
                phone: cleanPhone,
                iban: cleanIban,
                sq_meters: addedSqMeters,
                mandate_accepted: formData.mandate_accepted,
                is_anonymous: formData.is_anonymous,
                total_amount: addedAmount,
            }]);
            error = result.error;
        }

        if (!error) {
            setSubmitted(true);
            localStorage.setItem('sponsoring_registered', JSON.stringify({
                name: cleanName,
                email: cleanEmail,
                iban: cleanIban
            }));
        } else {
            setErrorMsg(`Fehler beim Speichern: ${error.message || 'Unbekannter Fehler'}`);
        }
        setLoading(false);
    };

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
                    className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <motion.div
                        initial={{ scale: 0.8, y: 40 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.8, y: 40 }}
                        transition={{ type: 'spring', damping: 20, stiffness: 200 }}
                        className="bg-white rounded-3xl p-10 w-[540px] max-w-[90vw] relative shadow-2xl">
                        <button onClick={() => setBoostModal(null)}
                            className="absolute top-5 right-5 bg-gray-100 rounded-full w-10 h-10 flex items-center justify-center hover:bg-gray-200 transition-colors">
                            <X size={20} className="text-gray-500" />
                        </button>

                        {boostSuccess ? (
                            <div className="text-center py-5">
                                <div className="text-6xl mb-4">&#x2705;</div>
                                <h2 className="text-2xl font-black text-green-600 mb-2">Jazak Allahu Khairan!</h2>
                                <p className="text-gray-500">Dein Beitrag wurde erfolgreich erhöht.</p>
                            </div>
                        ) : (
                            <>
                                <div className="text-center mb-8">
                                    <div className="text-5xl mb-3">&#x1F4E2;</div>
                                    <h2 className="text-2xl font-black text-[#0c151a] mb-3">Aufruf vom Admin</h2>
                                    <p className="text-lg text-gray-600 bg-gray-50 rounded-2xl p-4 border-2 border-gray-200">
                                        {boostModal.message}
                                    </p>
                                </div>

                                <div className="mb-6">
                                    <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-2 ml-1">
                                        Deine E-Mail
                                    </label>
                                    <input type="email" readOnly value={boostModal.email}
                                        className="w-full bg-gray-50 border-2 border-gray-200 rounded-xl py-3 px-4 text-gray-500 font-bold" />
                                </div>

                                <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-3 ml-1">
                                    Um wie viele m² erhöhen?
                                </label>
                                <div className="flex gap-2.5 mb-4">
                                    {[1, 2, 5, 10].map(val => (
                                        <button key={val} onClick={() => handleBoostSubmit(val)} disabled={boostLoading}
                                            className="flex-1 py-3.5 rounded-xl border-2 border-green-200 bg-green-50 text-green-600 text-lg font-black hover:bg-green-100 hover:border-green-300 transition-all disabled:opacity-50">
                                            +{val} m²
                                        </button>
                                    ))}
                                </div>
                                <div className="flex gap-2.5">
                                    <input type="number" min="1" placeholder="Eigene m²" value={boostAmount}
                                        onChange={e => setBoostAmount(e.target.value)}
                                        className="flex-1 bg-gray-50 border-2 border-transparent focus:border-[#0c151a] focus:bg-white rounded-xl py-3.5 px-4 font-bold text-[#0c151a] outline-none transition-all" />
                                    <button onClick={() => handleBoostSubmit()} disabled={boostLoading || !boostAmount}
                                        className="py-3.5 px-7 rounded-xl bg-[#0c151a] text-white font-black uppercase tracking-wider hover:bg-[#1a2d38] transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap">
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

    if (submitted) {
        return (
            <div className="min-h-screen bg-[#050505] flex items-center justify-center p-6 mt-16 md:mt-0">
                {boostModalJSX}
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="max-w-md w-full bg-white rounded-3xl p-12 text-center shadow-[0_0_50px_rgba(255,255,255,0.1)]"
                >
                    <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-8">
                        <CheckCircle2 className="w-10 h-10 text-green-600" />
                    </div>
                    <h2 className="text-3xl font-black text-[#0c151a] mb-4 uppercase tracking-tight">Herzlichen Dank!</h2>
                    <p className="text-gray-600 mb-8 leading-relaxed">
                        Ihre Spende wurde erfolgreich registriert. Sie finden Ihren Namen in Kürze auf der Spenderwand.
                    </p>
                    <button
                        onClick={() => {
                            setFormData({
                                full_name: '', email: '', phone: '', iban: '',
                                sq_meters: 1, mandate_accepted: false,
                                is_anonymous: false, inputMode: 'sqm', monthlyEuro: '', customSqm: ''
                            });
                            setErrorMsg('');
                            setSubmitted(false);
                        }}
                        className="w-full py-4 bg-[#0c151a] text-white rounded-xl font-bold uppercase tracking-widest hover:bg-[#1a2d38] transition-all"
                    >
                        Nächste Registrierung
                    </button>
                </motion.div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#050505] py-12 px-6 flex items-center justify-center mt-16 md:mt-0">
            {boostModalJSX}
            <div className="max-w-4xl w-full grid md:grid-cols-2 bg-white rounded-[2rem] overflow-hidden shadow-[0_0_80px_rgba(255,255,255,0.05)] border border-white/10">

                {/* Left Side */}
                <div className="bg-[#0c151a] p-12 text-white flex flex-col justify-between relative overflow-hidden">
                    <div className="relative z-10">
                        <div className="inline-block px-4 py-1.5 bg-white/10 rounded-full text-xs font-bold tracking-[0.2em] uppercase mb-8 border border-white/10">
                            Sajadah Spendenaktion
                        </div>
                        <h1 className="text-5xl font-black mb-6 leading-[1.1] uppercase">Ein Teil der Moschee werden</h1>
                        <p className="text-gray-400 text-lg leading-relaxed mb-8">
                            Sichern Sie sich einen oder mehrere Quadratmeter des neuen Teppichs und hinterlassen Sie ein bleibendes Erbe.
                        </p>
                        <div className="flex items-center space-x-4 bg-white/5 p-4 rounded-2xl border border-white/5">
                            <div className="text-green-400 font-black text-2xl">{pricePerUnit}€</div>
                            <div className="text-gray-400 text-sm font-medium uppercase tracking-wider">pro Quadratmeter / Monat</div>
                        </div>
                    </div>
                    <div className="mt-12 pt-12 border-t border-white/10 relative z-10">
                        <div className="flex items-center space-x-4">
                            <Building2 className="w-8 h-8 text-gray-500" />
                            <div>
                                <div className="font-bold uppercase tracking-widest text-xs opacity-50">Projekt</div>
                                <div className="font-black text-sm">Moschee Teppich 2024</div>
                            </div>
                        </div>
                    </div>
                    <div className="absolute -bottom-20 -right-20 w-64 h-64 bg-green-500/10 rounded-full blur-[80px]" />
                </div>

                {/* Right Side: Form */}
                <div className="p-12 overflow-y-auto max-h-[90vh] custom-scrollbar">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="grid grid-cols-1 gap-6">

                            {/* Name */}
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 ml-1">Vollständiger Name</label>
                                <div className="relative group">
                                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-[#0c151a] transition-colors" />
                                    <input
                                        type="text" required
                                        className="w-full bg-gray-50 border-2 border-transparent focus:border-[#0c151a] focus:bg-white rounded-xl py-4 pl-12 pr-4 outline-none transition-all font-bold text-[#0c151a]"
                                        placeholder="z.B. Abdullah Müller"
                                        value={formData.full_name}
                                        onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                                    />
                                </div>
                            </div>

                            {/* Email + Telefon */}
                            <div className="grid md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 ml-1">E-Mail Adresse</label>
                                    <div className="relative group">
                                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-[#0c151a] transition-colors" />
                                        <input
                                            type="email" required
                                            className="w-full bg-gray-50 border-2 border-transparent focus:border-[#0c151a] focus:bg-white rounded-xl py-4 pl-12 pr-4 outline-none transition-all font-bold text-[#0c151a]"
                                            placeholder="mail@beispiel.de"
                                            value={formData.email}
                                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 ml-1">Telefon</label>
                                    <div className="relative group">
                                        <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-[#0c151a] transition-colors" />
                                        <input
                                            type="tel"
                                            className="w-full bg-gray-50 border-2 border-transparent focus:border-[#0c151a] focus:bg-white rounded-xl py-4 pl-12 pr-4 outline-none transition-all font-bold text-[#0c151a]"
                                            placeholder="+49 123 45678"
                                            value={formData.phone}
                                            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Spendenmodus */}
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 ml-1">Wie möchten Sie spenden?</label>
                                <div className="flex bg-gray-100 rounded-xl p-1 mb-3">
                                    <button type="button"
                                        onClick={() => setFormData({ ...formData, inputMode: 'sqm' })}
                                        className={`flex-1 py-2.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${formData.inputMode === 'sqm' ? 'bg-[#0c151a] text-white shadow-lg' : 'text-gray-500'}`}
                                    >m² auswählen</button>
                                    <button type="button"
                                        onClick={() => setFormData({ ...formData, inputMode: 'euro' })}
                                        className={`flex-1 py-2.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${formData.inputMode === 'euro' ? 'bg-[#0c151a] text-white shadow-lg' : 'text-gray-500'}`}
                                    >€/Monat eingeben</button>
                                </div>

                                {formData.inputMode === 'sqm' ? (
                                    <div className="flex space-x-3">
                                        {[1, 2, 5, 10, 20].map((val) => (
                                            <button key={val} type="button"
                                                onClick={() => setFormData({ ...formData, sq_meters: val, customSqm: '' })}
                                                className={`flex-1 py-3 rounded-xl font-black text-sm transition-all border-2 ${!formData.customSqm && formData.sq_meters === val ? 'bg-[#0c151a] border-[#0c151a] text-white shadow-lg' : 'bg-gray-50 border-transparent text-gray-500 hover:border-gray-200'}`}
                                            >{val}m²</button>
                                        ))}
                                        <input type="number"
                                            className={`w-36 bg-gray-50 border-2 rounded-xl py-3 px-3 outline-none transition-all font-bold text-center text-[#0c151a] text-sm placeholder:text-xs ${formData.customSqm ? 'border-[#0c151a] bg-white' : 'border-transparent focus:border-[#0c151a] focus:bg-white'}`}
                                            placeholder="Eigene m²" min="1"
                                            value={formData.customSqm || ''}
                                            onChange={(e) => {
                                                const raw = e.target.value;
                                                const parsed = parseInt(raw) || 0;
                                                setFormData({ ...formData, customSqm: raw, sq_meters: parsed > 0 ? parsed : 1 });
                                            }}
                                        />
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        <div className="relative">
                                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-bold text-gray-400">€</span>
                                            <input type="number"
                                                className="w-full bg-gray-50 border-2 border-transparent focus:border-[#0c151a] focus:bg-white rounded-xl py-4 pl-12 pr-4 outline-none transition-all font-bold text-xl text-[#0c151a]"
                                                placeholder="z.B. 30" min="15" step="1"
                                                value={formData.monthlyEuro}
                                                onChange={(e) => {
                                                    const euros = parseFloat(e.target.value) || 0;
                                                    const sqm = Math.floor(euros / pricePerUnit);
                                                    setFormData({ ...formData, monthlyEuro: e.target.value, sq_meters: Math.max(sqm, 1) });
                                                }}
                                            />
                                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400 uppercase tracking-wider">pro Monat</span>
                                        </div>
                                        <div className="flex items-center justify-between bg-emerald-50 rounded-xl p-3 px-4 border border-emerald-200/50">
                                            <span className="text-emerald-700 text-xs font-bold">Ergibt:</span>
                                            <span className="text-emerald-800 text-lg font-black">{formData.sq_meters} m²</span>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* IBAN + Checkboxen */}
                            <div className="space-y-4 pt-4 border-t border-gray-100">
                                <div className="flex items-center space-x-2 text-[#0c151a] mb-2">
                                    <CreditCard className="w-5 h-5" />
                                    <span className="font-bold uppercase tracking-widest text-[10px]">Bezahlung per Lastschrift</span>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 ml-1">IBAN</label>
                                    <input type="text" required
                                        className="w-full bg-gray-50 border-2 border-transparent focus:border-[#0c151a] focus:bg-white rounded-xl py-4 px-4 outline-none transition-all font-bold tracking-widest uppercase text-[#0c151a]"
                                        placeholder="DE00 0000 0000 0000 0000 00"
                                        value={formData.iban}
                                        onChange={(e) => { setErrorMsg(''); setFormData({ ...formData, iban: e.target.value }); }}
                                    />
                                </div>

                                <label className="flex items-start space-x-3 cursor-pointer group">
                                    <div className="relative mt-1">
                                        <input type="checkbox" className="peer hidden"
                                            checked={formData.is_anonymous}
                                            onChange={(e) => setFormData({ ...formData, is_anonymous: e.target.checked })}
                                        />
                                        <div className="w-5 h-5 border-2 border-gray-300 rounded peer-checked:bg-[#0c151a] peer-checked:border-[#0c151a] transition-all" />
                                        <CheckCircle2 className="absolute top-0 left-0 w-5 h-5 text-white opacity-0 peer-checked:opacity-100 transition-opacity p-0.5" />
                                    </div>
                                    <span className="text-[11px] text-gray-500 font-bold leading-relaxed group-hover:text-gray-700">
                                        Anonym spenden (Name wird nicht auf der Spenderwand angezeigt)
                                    </span>
                                </label>

                                <label className="flex items-start space-x-3 cursor-pointer group">
                                    <div className="relative mt-1">
                                        <input type="checkbox" required className="peer hidden"
                                            checked={formData.mandate_accepted}
                                            onChange={(e) => { setErrorMsg(''); setFormData({ ...formData, mandate_accepted: e.target.checked }); }}
                                        />
                                        <div className="w-5 h-5 border-2 border-gray-300 rounded peer-checked:bg-[#0c151a] peer-checked:border-[#0c151a] transition-all" />
                                        <CheckCircle2 className="absolute top-0 left-0 w-5 h-5 text-white opacity-0 peer-checked:opacity-100 transition-opacity p-0.5" />
                                    </div>
                                    <span className="text-[11px] text-gray-500 font-medium leading-relaxed group-hover:text-gray-700">
                                        Ich ermächtige Al-Rahma e.V., Zahlungen von meinem Konto mittels Lastschrift einzuziehen. Zugleich weise ich mein Kreditinstitut an, die vom Al-Rahma e.V. auf mein Konto gezogenen Lastschriften einzulösen.
                                    </span>
                                </label>
                            </div>
                        </div>

                        {/* Fehlermeldung */}
                        {errorMsg && (
                            <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="flex items-start gap-3 bg-red-50 border border-red-200 text-red-700 rounded-2xl px-5 py-4"
                            >
                                <div className="mt-0.5 w-5 h-5 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                                    <span className="text-red-600 text-xs font-black">!</span>
                                </div>
                                <div>
                                    <p className="font-bold text-sm">Registrierung nicht möglich</p>
                                    <p className="text-xs mt-0.5 text-red-500">{errorMsg}</p>
                                </div>
                            </motion.div>
                        )}

                        <button
                            type="submit" disabled={loading}
                            className="w-full py-5 bg-[#0c151a] text-white rounded-2xl font-black uppercase tracking-[0.2em] hover:bg-[#1a2d38] transition-all flex items-center justify-center space-x-3 disabled:opacity-50 disabled:cursor-not-allowed group shadow-xl shadow-[#0c151a]/20"
                        >
                            {loading ? (
                                <div className="w-6 h-6 border-4 border-white/20 border-t-white rounded-full animate-spin" />
                            ) : (
                                <>
                                    <span>Jetzt Spenden: {(formData.sq_meters * pricePerUnit).toFixed(2)}€/Monat</span>
                                    <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                                </>
                            )}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default Register;