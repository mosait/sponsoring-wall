import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Mail, Phone, CreditCard, ChevronRight, CheckCircle2, X, LayoutDashboard } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { sendConfirmationEmail } from '../lib/emailService';
import { isValidIBAN, electronicFormatIBAN } from 'ibantools';

const REG_T = {
    de: {
        badge: 'BETRIEBSKOSTEN\nAKTION',
        heading: 'HILF UNS, DIE MOSCHEE JEDEN MONAT AM LAUFEN ZU HALTEN',
        description: 'Jeden Monat fallen rund 7.500€ an, um unsere Moschee zu betreiben: Miete, Nebenkosten, Instandhaltung, Reinigung, Sanitäranlagen, die Organisation der fünf täglichen Gebete, der Freitagspredigt sowie unserer Bildungs- und Gemeindeangebote.',
        descriptionP2: 'Mit deiner monatlichen Spende trägst du direkt dazu bei, dass unsere Moschee dauerhaft offen und nutzbar bleibt. Mit deinem Dauerauftrag werden deine Spenden zu einer Sadaqah Jariyah, von der du noch lange nach deinem Tod profitierst.',
        whyTitle: 'WARUM 15€ PRO GEBETSPLATZ?',
        whyP1: 'Um unsere monatlichen Betriebskosten von rund 7.500€ greifbar zu machen, haben wir sie in 500 „Gebetsplätze“ à 15€ aufgeteilt – als symbolische Einheit, keine Platzreservierung.',
        whyP2: 'So siehst du genau was dein Beitrag bewirkt: Jeder Gebetsplatz den du übernimmst, hilft die Moschee für die gesamte Gemeinde offen und funktionsfähig zu halten.',
        haditArabic: 'مَنْ بَنَى مَسْجِدًا لِلَّهِ كَمَفْحَصِ قَطَاةٍ أَوْ أَصْغَرَ بَنَى اللَّهُ لَهُ بَيْتًا فِي الْجَنَّةِ',
        haditTranslation: '„Wer eine Moschee um Allahs willen baut, sei es nur ein Spatzennest oder noch kleiner, dem wird Allah ein Haus im Paradies bauen."',
        haditSource: 'Sunan Ibn Majah 738',
        priceUnit: 'pro Gebetsplatz / Monat',
        nameLabel: 'Vollständiger Name',
        namePlaceholder: 'z.B. Abdullah Müller',
        emailLabel: 'E-Mail Adresse',
        emailPlaceholder: 'mail@beispiel.de',
        phoneLabel: 'Telefon',
        phonePlaceholder: '+49 123 45678',
        howLabel: 'Wie möchtest du spenden?',
        selectUnits: 'Gebetsplätze wählen',
        enterEuro: '€/Monat eingeben',
        perMonth: '/ Monat',
        customUnits: 'Eigene Anzahl',
        resultLabel: 'Ergibt:',
        resultUnit: (n) => `${n} Gebetspl.`,
        paymentHeader: 'Bezahlung per Lastschrift',
        ibanLabel: 'IBAN',
        ibanPlaceholder: 'DE00 0000 0000 0000 0000 00',
        anonymousLabel: 'Anonym spenden (Name wird nicht auf der Spenderwand angezeigt)',
        noticeLabel: 'Ich verstehe, dass meine Spende keinen festen, physischen Gebetsplatz reserviert, sondern dazu dient, die monatlichen Betriebskosten der Moschee zu decken.',
        noticeErr: 'Bitte bestätige, dass du die Bedeutung dieser Spende verstanden hast.',
        progressLabel: 'Gebetsplätze gesponsert',
        mandateLabel: 'Ich ermächtige Islamisches Zentrum Stuttgart e.V., Zahlungen von meinem Konto mittels Lastschrift einzuziehen. Zugleich weise ich mein Kreditinstitut an, die vom Islamisches Zentrum Stuttgart e.V. auf mein Konto gezogenen Lastschriften einzulösen.',
        submitBtn: (amount) => `Jetzt Spenden ${amount}€/Monat`,
        successHeading: 'Herzlichen Dank!',
        successText: 'Ihre Spende wurde erfolgreich registriert. Sie finden Ihren Namen in Kürze auf der Spenderwand.',
        nextBtn: 'Nächste Registrierung',
        dashboardBtn: 'Zur Spenderwand',
        errorTitle: 'Registrierung nicht möglich',
        validNameErr: 'Bitte einen gültigen Namen eingeben.',
        validEmailErr: 'Bitte eine gültige E-Mail-Adresse eingeben.',
        validIbanErr: 'Bitte eine valide IBAN eingeben (z.B. DE89370400440532013000)',
        mandateErr: 'Bitte das SEPA-Lastschriftmandat akzeptieren.',
        saveErr: (msg) => `Fehler beim Speichern: ${msg || 'Unbekannter Fehler'}`,
        boostSuccessTitle: 'Jazak Allahu Khairan!',
        boostSuccessText: 'Dein Beitrag wurde erfolgreich erhöht.',
        boostAdminCall: 'Aufruf vom Admin',
        boostEmail: 'Deine E-Mail',
        boostHowMany: 'Um wie viele Gebetsplätze erhöhen?',
        boostCustom: 'Eigene Anzahl',
        boostSaving: 'Speichern...',
        boostIncrease: 'Erhöhen',
        stopFullHeading: 'Jazakumullahu Khairan!',
        stopFullText: 'Wir haben unsere Mitgliederzahl erreicht. Vielen Dank für Ihr Interesse – die Registrierung ist derzeit geschlossen.',
        stopMaintenanceHeading: 'Kurze Pause',
        stopMaintenanceText: 'Die Registrierung ist vorübergehend nicht verfügbar. Bitte versuchen Sie es später erneut.',
        langToggle: 'عربي',
        dir: 'ltr',
    },
    ar: {
        badge: 'حملة التكاليف التشغيلية',
        heading: 'ساعدنا في إبقاء المسجد يعمل كل شهر',
        description: 'كل شهر تنشأ تكاليف تُقدَّر بنحو 7.500 يورو لتشغيل مسجدنا: الإيجار والمرافق والصيانة والتنظيف ودورات المياه، وتنظيم الصلوات الخمس وصلاة الجمعة، إضافةً إلى برامجنا التعليمية والمجتمعية.',
        descriptionP2: 'بتبرعك الشهري تساهم مباشرةً في إبقاء مسجدنا مفتوحاً ومتاحاً دائماً. وبتفويضك للخصم الشهري، تتحول تبرعاتك إلى صدقة جارية ينتفع بها لفترة طويلة بعد وفاتك.',
        whyTitle: 'لماذا 15 يورو لكل مصلى؟',
        whyP1: 'لجعل التكاليف التشغيلية الشهرية البالغة نحو 7.500 يورو ملموسةً، قسّمناها إلى 500 “مصلى” بـ 15 يورو لكل منها – كوحدة رمزية، وليست حجزاً فعلياً لمكان.',
        whyP2: 'هكذا ترى بدقة ما يُحدثه مساهمتك: كل مصلى تتبناه يساعد في إبقاء المسجد مفتوحاً وعاملاً لفائدة الجميع.',
        haditArabic: 'مَنْ بَنَى مَسْجِدًا لِلَّهِ كَمَفْحَصِ قَطَاةٍ أَوْ أَصْغَرَ بَنَى اللَّهُ لَهُ بَيْتًا فِي الْجَنَّةِ',
        haditTranslation: null,
        haditSource: 'سنن ابن ماجه ٧٣٨',
        priceUnit: 'لكل مصلى / شهرياً',
        nameLabel: 'الاسم الكامل',
        namePlaceholder: 'مثال: عبدالله مولر',
        emailLabel: 'البريد الإلكتروني',
        emailPlaceholder: 'mail@beispiel.de',
        phoneLabel: 'رقم الهاتف',
        phonePlaceholder: '+49 123 45678',
        howLabel: 'كيف تريد التبرع؟',
        selectUnits: 'اختر عدد المصليات',
        enterEuro: 'أدخل €/شهر',
        perMonth: '/ شهر',
        customUnits: 'عدد مخصص',
        resultLabel: 'يساوي:',
        resultUnit: (n) => `${n} مصلى`,
        paymentHeader: 'الدفع عبر خصم مباشر',
        ibanLabel: 'IBAN',
        ibanPlaceholder: 'DE00 0000 0000 0000 0000 00',
        anonymousLabel: 'تبرع بشكل مجهول (لن يُعرض اسمك على جدار المتبرعين)',
        noticeLabel: 'أفهم أن تبرعي لا يحجز مصلى فعلياً ثابتاً، بل يُستخدم لتغطية التكاليف التشغيلية الشهرية للمسجد.',
        noticeErr: 'يرجى تأكيد أنك فهمت معنى هذا التبرع.',
        progressLabel: 'مصلى مكفول',
        mandateLabel: 'أفوّض Islamisches Zentrum Stuttgart e.V. بخصم المدفوعات من حسابي مباشرةً. وفي الوقت ذاته أوجّه مصرفي بصرف هذه المدفوعات.',
        submitBtn: (amount) => `تبرع الآن ${amount}€/شهر`,
        successHeading: 'شكراً جزيلاً!',
        successText: 'تم تسجيل تبرعك بنجاح. سيظهر اسمك قريباً على جدار المتبرعين.',
        nextBtn: 'التسجيل التالي',
        dashboardBtn: 'إلى جدار المتبرعين',
        errorTitle: 'التسجيل غير ممكن',
        validNameErr: 'يرجى إدخال اسم صحيح.',
        validEmailErr: 'يرجى إدخال بريد إلكتروني صحيح.',
        validIbanErr: 'يرجى إدخال IBAN صحيح (مثال: DE89370400440532013000)',
        mandateErr: 'يرجى قبول تفويض الخصم المباشر SEPA.',
        saveErr: (msg) => `خطأ في الحفظ: ${msg || 'خطأ غير معروف'}`,
        boostSuccessTitle: 'جزاك الله خيراً!',
        boostSuccessText: 'تم رفع مساهمتك بنجاح.',
        boostAdminCall: 'نداء من المسؤول',
        boostEmail: 'بريدك الإلكتروني',
        boostHowMany: 'كم مصلى تريد إضافة؟',
        boostCustom: 'عدد مخصص',
        boostSaving: 'جارٍ الحفظ...',
        boostIncrease: 'رفع',
        stopFullHeading: 'جزاكم الله خيراً!',
        stopFullText: 'لقد وصلنا إلى عدد الأعضاء المطلوب. شكراً لاهتمامكم – التسجيل مغلق حالياً.',
        stopMaintenanceHeading: 'توقف مؤقت',
        stopMaintenanceText: 'التسجيل غير متاح مؤقتاً. يرجى المحاولة مرة أخرى لاحقاً.',
        langToggle: 'DE',
        dir: 'rtl',
    },
};

const Register = () => {
    const navigate = useNavigate();
    const [lang, setLang] = useState(() => localStorage.getItem('lang') || 'de');
    const [loading, setLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [pricePerUnit, setPricePerUnit] = useState(15);
    const [errorMsg, setErrorMsg] = useState('');
    const [fieldErrors, setFieldErrors] = useState({});
    const [registerStopMode, setRegisterStopMode] = useState('open');
    const [boostModal, setBoostModal] = useState(null);
    const [boostAmount, setBoostAmount] = useState('');
    const [boostLoading, setBoostLoading] = useState(false);
    const [boostSuccess, setBoostSuccess] = useState(false);
    const [boostError, setBoostError] = useState('');
    const [totalSqMeters, setTotalSqMeters] = useState(0);
    const [whyOpen, setWhyOpen] = useState(false);
    const BASE_GOAL = 500;
    const [formData, setFormData] = useState(() => {
        const saved = JSON.parse(localStorage.getItem('sponsoring_registered') || 'null');
        return {
            full_name: saved?.name || '',
            email: saved?.email || '',
            phone: saved?.phone || '',
            iban: saved?.iban || '',
            sq_meters: 1,
            mandate_accepted: false,
            is_anonymous: false,
            notice_understood: false,
            inputMode: 'sqm',
            monthlyEuro: ''
        };
    });

    const t = REG_T[lang];

    const toggleLang = () => {
        const next = lang === 'de' ? 'ar' : 'de';
        setLang(next);
        localStorage.setItem('lang', next);
    };

    useEffect(() => {
        supabase.rpc('get_public_settings').then(({ data }) => {
            const s = Array.isArray(data) ? data[0] : data;
            if (s?.price_per_unit) setPricePerUnit(s.price_per_unit);
            if (s?.register_stop_mode) setRegisterStopMode(s.register_stop_mode);
        });

        supabase.from('sponsors_public').select('sq_meters').then(({ data }) => {
            if (data) setTotalSqMeters(data.reduce((sum, r) => sum + Number(r.sq_meters || 0), 0));
        });

        const settingsChannel = supabase
            .channel('register_settings_changes')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'project_settings' }, ({ new: newData }) => {
                if (newData?.register_stop_mode) setRegisterStopMode(newData.register_stop_mode);
            })
            .subscribe();

        // Polling fallback every 3s
        const settingsPoll = setInterval(() => {
            supabase.rpc('get_public_settings').then(({ data }) => {
                const s = Array.isArray(data) ? data[0] : data;
                if (s?.register_stop_mode) setRegisterStopMode(s.register_stop_mode);
            });
        }, 3000);

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
            boostChannel.unsubscribe();
            settingsChannel.unsubscribe();
            clearInterval(settingsPoll);
        };
    }, []);

    const validateIBAN = (iban) => {
        return isValidIBAN(electronicFormatIBAN(iban) || '');
    };

    const sanitize = (str) => str.replace(/[<>]/g, '').trim();

    const clearFieldError = (field) => setFieldErrors(prev => (prev[field] ? { ...prev, [field]: false } : prev));

    const handleSubmit = async (e) => {
        e.preventDefault();
        setErrorMsg('');

        const cleanName = sanitize(formData.full_name);
        const cleanEmail = sanitize(formData.email);
        const cleanPhone = sanitize(formData.phone);
        const cleanIban = formData.iban.replace(/\s/g, '').toUpperCase();

        const errors = {};
        let msg = '';
        if (!cleanName || cleanName.length < 2) { errors.full_name = true; msg = msg || t.validNameErr; }
        if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) { errors.email = true; msg = msg || t.validEmailErr; }
        if (!validateIBAN(cleanIban)) { errors.iban = true; msg = msg || t.validIbanErr; }
        if (!formData.notice_understood) { errors.notice_understood = true; msg = msg || t.noticeErr; }
        if (!formData.mandate_accepted) { errors.mandate_accepted = true; msg = msg || t.mandateErr; }

        if (Object.keys(errors).length > 0) {
            setFieldErrors(errors);
            setErrorMsg(msg);
            return;
        }
        setFieldErrors({});

        setLoading(true);

        const addedSqMeters = formData.sq_meters;
        const addedAmount = formData.inputMode === 'euro'
            ? parseFloat(formData.monthlyEuro || 0)
            : formData.sq_meters * pricePerUnit;

        // Upsert via SECURITY DEFINER Funktion — kein direkter Tabellenzugriff nötig
        const { error } = await supabase.rpc('register_sponsor', {
            p_full_name: cleanName,
            p_email: cleanEmail,
            p_phone: cleanPhone,
            p_iban: cleanIban,
            p_sq_meters: addedSqMeters,
            p_mandate_accepted: formData.mandate_accepted,
            p_is_anonymous: formData.is_anonymous,
            p_total_amount: addedAmount,
        });

        if (!error) {
            setSubmitted(true);
            localStorage.setItem('sponsoring_registered', JSON.stringify({
                name: cleanName,
                email: cleanEmail,
                phone: cleanPhone,
                iban: cleanIban
            }));
            sendConfirmationEmail({
                name: cleanName,
                email: cleanEmail,
                sqMeters: addedSqMeters,
                monthlyAmount: addedAmount,
            });
        } else {
            setErrorMsg(t.saveErr(error.message));
        }
        setLoading(false);
    };

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
            phone: boostModal.phone,
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
                                <h2 className="text-2xl font-black text-green-600 mb-2">{t.boostSuccessTitle}</h2>
                                <p className="text-gray-500">{t.boostSuccessText}</p>
                            </div>
                        ) : (
                            <>
                                <div className="text-center mb-8">
                                    <div className="text-5xl mb-3">&#x1F4E2;</div>
                                    <h2 className="text-2xl font-black text-[#0c151a] mb-3">{t.boostAdminCall}</h2>
                                    <p className="text-lg text-gray-600 bg-gray-50 rounded-2xl p-4 border-2 border-gray-200">
                                        {boostModal.message}
                                    </p>
                                </div>

                                <div className="mb-6">
                                    <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-2 ml-1">
                                        {t.boostEmail}
                                    </label>
                                    <input type="email" readOnly value={boostModal.email}
                                        className="w-full bg-gray-50 border-2 border-gray-200 rounded-xl py-3 px-4 text-gray-500 font-bold" />
                                </div>

                                <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-3 ml-1">
                                    {t.boostHowMany}
                                </label>
                                <div className="flex flex-wrap gap-2 mb-4">
                                    {[1, 2, 5, 10].map(val => (
                                        <button key={val} onClick={() => setBoostAmount(String(val))} disabled={boostLoading}
                                            className={`flex-1 min-w-[60px] py-3.5 rounded-xl border-2 text-lg font-black transition-all disabled:opacity-50 ${
                                                boostAmount === String(val)
                                                    ? 'border-green-600 bg-green-600 text-white'
                                                    : 'border-green-200 bg-green-50 text-green-600 hover:bg-green-100 hover:border-green-300'
                                            }`}>
                                            +{val}
                                        </button>
                                    ))}
                                </div>
                                <div className="flex gap-2.5">
                                    <input type="number" min="1" placeholder={t.boostCustom} value={boostAmount}
                                        onChange={e => setBoostAmount(e.target.value)}
                                        className="flex-1 bg-gray-50 border-2 border-transparent focus:border-[#1a6b3c] focus:bg-white rounded-xl py-3.5 px-4 font-bold text-[#0c151a] outline-none transition-all" />
                                    <button onClick={() => handleBoostSubmit()} disabled={boostLoading || !boostAmount}
                                        className="py-3.5 px-7 rounded-xl bg-[#1a6b3c] text-white font-black uppercase tracking-wider hover:bg-[#155430] transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap">
                                        {boostLoading ? t.boostSaving : t.boostIncrease}
                                    </button>
                                </div>
                                {boostError && (
                                    <p className="mt-3 text-red-600 text-sm font-semibold text-center">{boostError}</p>
                                )}
                            </>
                        )}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );

    if (submitted) {
        return (
            <div className="min-h-screen bg-[#f1f5f9] flex items-center justify-center p-6" dir={t.dir}>
                {boostModalJSX}
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="max-w-md w-full bg-white rounded-3xl p-8 sm:p-12 text-center shadow-[0_0_50px_rgba(255,255,255,0.1)]"
                >
                    <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-8">
                        <CheckCircle2 className="w-10 h-10 text-green-600" />
                    </div>
                    <h2 className="text-3xl font-black text-[#0c151a] mb-4 uppercase tracking-tight">{t.successHeading}</h2>
                    <p className="text-gray-600 mb-8 leading-relaxed">{t.successText}</p>
                    <button
                        onClick={() => {
                            const saved = JSON.parse(localStorage.getItem('sponsoring_registered') || 'null');
                            setFormData({
                                full_name: saved?.name || '',
                                email: saved?.email || '',
                                phone: saved?.phone || '',
                                iban: saved?.iban || '',
                                sq_meters: 1,
                                mandate_accepted: false,
                                is_anonymous: false,
                                notice_understood: false,
                                inputMode: 'sqm',
                                monthlyEuro: '',
                                customSqm: ''
                            });
                            setErrorMsg('');
                            setSubmitted(false);
                        }}
                        className="w-full py-4 bg-[#1a6b3c] text-white rounded-xl font-bold uppercase tracking-widest hover:bg-[#155430] transition-all mb-3"
                    >
                        {t.nextBtn}
                    </button>
                    <button
                        onClick={() => navigate('/dashboard')}
                        className="w-full py-4 bg-white text-[#1a6b3c] rounded-xl font-bold uppercase tracking-widest border-2 border-[#1a6b3c] hover:bg-[#f0fdf4] transition-all flex items-center justify-center gap-2"
                    >
                        <LayoutDashboard className="w-5 h-5" />
                        {t.dashboardBtn}
                    </button>
                </motion.div>
            </div>
        );
    }

    if (registerStopMode === 'full' || registerStopMode === 'maintenance') {
        const isFull = registerStopMode === 'full';
        return (
            <div className="min-h-screen bg-[#f1f5f9] flex items-center justify-center p-6" dir={t.dir}>
                <div className="text-center">
                    <button onClick={toggleLang}
                        className="mb-8 px-4 py-1.5 rounded-lg border border-gray-300 bg-white text-gray-600 text-xs font-black tracking-widest hover:bg-gray-50 transition-all">
                        {t.langToggle}
                    </button>
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="max-w-md w-full bg-white rounded-3xl p-10 text-center shadow-xl mx-auto"
                    >
                        <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 ${isFull ? 'bg-green-100' : 'bg-blue-100'}`}>
                            <span className="text-4xl">{isFull ? '🕌' : '🔧'}</span>
                        </div>
                        <h2 className={`text-2xl font-black mb-4 uppercase tracking-tight ${isFull ? 'text-[#1a6b3c]' : 'text-blue-700'}`}>
                            {isFull ? t.stopFullHeading : t.stopMaintenanceHeading}
                        </h2>
                        <p className="text-gray-500 leading-relaxed">
                            {isFull ? t.stopFullText : t.stopMaintenanceText}
                        </p>
                    </motion.div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#f1f5f9] py-8 sm:py-12 px-4 sm:px-6 flex items-start justify-center" dir={t.dir}>
            {boostModalJSX}
            <div className="max-w-4xl w-full grid md:grid-cols-2 bg-white rounded-[2rem] overflow-hidden shadow-[0_0_80px_rgba(255,255,255,0.05)] border border-white/10">

                {/* Left Side */}
                <div className="bg-[#1a6b3c] p-8 sm:p-12 text-white flex flex-col justify-between relative overflow-hidden">
                    <div className="relative z-10">
                        <div className="flex items-center justify-between gap-2 sm:gap-3 mb-6">
                            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                                <div className="w-10 h-10 sm:w-16 sm:h-16 rounded-full bg-white flex items-center justify-center shrink-0 overflow-hidden">
                                    <img src="/logo.png" alt="IZS Logo" className="w-8 h-8 sm:w-14 sm:h-14 object-contain"
                                        onError={e => { e.target.style.display='none'; e.target.parentNode.innerHTML='<span style="font-size:12px;font-weight:900;color:#1a6b3c">IZS</span>'; }} />
                                </div>
                                <div className="inline-block px-3 py-1 sm:px-4 sm:py-1.5 bg-white/10 rounded-2xl text-[10px] sm:text-xs font-bold tracking-[0.15em] sm:tracking-[0.2em] uppercase border border-white/10 whitespace-pre-line leading-tight">
                                    {t.badge}
                                </div>
                            </div>
                            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                                {/* Dashboard link */}
                                <button onClick={() => navigate('/dashboard')}
                                    title={t.dashboardBtn}
                                    className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-white/10 border border-white/20 text-white hover:bg-white/20 transition-all flex items-center justify-center shrink-0">
                                    <LayoutDashboard className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                </button>
                                {/* Language Toggle */}
                                <button onClick={toggleLang}
                                    className="px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg bg-white/10 border border-white/20 text-white text-[10px] sm:text-xs font-black tracking-widest hover:bg-white/20 transition-all">
                                    {t.langToggle}
                                </button>
                            </div>
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-black mb-4 leading-[1.15] uppercase">{t.heading}</h1>
                        <p className="text-white/80 text-sm sm:text-base leading-relaxed mb-3">
                            {t.description}
                        </p>
                        <p className="text-white/80 text-sm sm:text-base leading-relaxed mb-4">
                            {t.descriptionP2}
                        </p>

                        {/* WARUM 15 € */}
                        <div className="mb-6 border border-white/25 rounded-xl overflow-hidden">
                            <button
                                type="button"
                                onClick={() => setWhyOpen(prev => !prev)}
                                className="flex items-center justify-between w-full text-left px-4 py-3 cursor-pointer hover:bg-white/10 active:bg-white/15 transition-colors"
                            >
                                <p className="text-yellow-300 text-[10px] font-black uppercase tracking-[0.2em]">{t.whyTitle}</p>
                                <ChevronRight className={`w-5 h-5 text-yellow-300 shrink-0 transition-transform duration-200 ${whyOpen ? 'rotate-90' : ''}`} />
                            </button>
                            <AnimatePresence initial={false}>
                                {whyOpen && (
                                    <motion.div
                                        key="why"
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        transition={{ duration: 0.2 }}
                                        style={{ overflow: 'hidden' }}
                                    >
                                        <div className="px-4 pb-4 pt-1 border-t border-white/15">
                                            <p className="text-white/70 text-sm leading-relaxed mb-2">{t.whyP1}</p>
                                            <p className="text-white/70 text-sm leading-relaxed">{t.whyP2}</p>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* Hadith */}
                        <div className="bg-white/10 border border-white/20 rounded-2xl p-5 mb-8">
                            <p className="text-white text-right leading-loose text-base font-bold" dir="rtl">
                                ❝ {t.haditArabic} ❞
                            </p>
                            {t.haditTranslation && (
                                <p className="text-white/85 text-sm leading-relaxed mt-3">
                                    {t.haditTranslation}
                                </p>
                            )}
                            <p className="text-white/50 text-xs mt-2 italic text-right" dir={t.dir}>{t.haditSource}</p>
                        </div>

                        {/* Price + Progress Bar combined */}
                        <div className="bg-white/10 border border-white/20 rounded-2xl p-4">
                            <div className="flex items-center space-x-4 pb-3 mb-3 border-b border-white/10">
                                <div className="text-yellow-300 font-black text-xl sm:text-2xl">{pricePerUnit}€</div>
                                <div className="text-white/70 text-xs sm:text-sm font-medium uppercase tracking-wider">{t.priceUnit}</div>
                            </div>
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-white/70 text-[10px] font-bold uppercase tracking-wider">{t.progressLabel}</span>
                                <span className="text-white font-black text-sm">{totalSqMeters} / {BASE_GOAL}</span>
                            </div>
                            <div className="h-3 bg-white/20 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-gradient-to-r from-yellow-300 to-yellow-400 rounded-full transition-all duration-1000"
                                    style={{ width: `${Math.min((totalSqMeters / BASE_GOAL) * 100, 100).toFixed(1)}%` }}
                                />
                            </div>
                            <div className="text-right mt-1">
                                <span className="text-yellow-300 font-black text-xs">{((totalSqMeters / BASE_GOAL) * 100).toFixed(1)}%</span>
                            </div>
                        </div>
                    </div>
                    <div className="absolute -bottom-20 -right-20 w-64 h-64 bg-white/10 rounded-full blur-[80px]" />
                </div>

                {/* Right Side: Form */}
                <div className="p-6 sm:p-10">
                    <form onSubmit={handleSubmit} noValidate className="space-y-5">
                        <div className="grid grid-cols-1 gap-5">

                            {/* Name */}
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 ml-1">{t.nameLabel}</label>
                                <div className="relative group">
                                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-[#1a6b3c] transition-colors" />
                                    <input
                                        type="text" required
                                        className={`w-full bg-gray-50 border-2 ${fieldErrors.full_name ? 'border-red-400' : 'border-transparent focus:border-[#1a6b3c] focus:bg-white'} rounded-xl py-4 pl-12 pr-4 outline-none transition-all font-bold text-[#0c151a]`}
                                        placeholder={t.namePlaceholder}
                                        value={formData.full_name}
                                        onChange={(e) => { clearFieldError('full_name'); setFormData({ ...formData, full_name: e.target.value }); }}
                                    />
                                </div>
                            </div>

                            {/* Email + Phone */}
                            <div className="grid grid-cols-1 gap-5">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 ml-1">{t.emailLabel}</label>
                                    <div className="relative group">
                                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-[#1a6b3c] transition-colors" />
                                        <input
                                            type="email" required
                                            className={`w-full bg-gray-50 border-2 ${fieldErrors.email ? 'border-red-400' : 'border-transparent focus:border-[#1a6b3c] focus:bg-white'} rounded-xl py-4 pl-12 pr-4 outline-none transition-all font-bold text-[#0c151a]`}
                                            placeholder={t.emailPlaceholder}
                                            value={formData.email}
                                            onChange={(e) => { clearFieldError('email'); setFormData({ ...formData, email: e.target.value }); }}
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 ml-1">{t.phoneLabel}</label>
                                    <div className="relative group">
                                        <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-[#1a6b3c] transition-colors" />
                                        <input
                                            type="tel"
                                            className="w-full bg-gray-50 border-2 border-transparent focus:border-[#1a6b3c] focus:bg-white rounded-xl py-4 pl-12 pr-4 outline-none transition-all font-bold text-[#0c151a]"
                                            placeholder={t.phonePlaceholder}
                                            value={formData.phone}
                                            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Donation mode */}
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 ml-1">{t.howLabel}</label>
                                <div className="flex bg-gray-100 rounded-xl p-1 mb-3">
                                    <button type="button"
                                        onClick={() => setFormData({ ...formData, inputMode: 'sqm' })}
                                        className={`flex-1 py-2.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${formData.inputMode === 'sqm' ? 'bg-[#1a6b3c] text-white shadow-lg' : 'text-gray-500'}`}
                                    >{t.selectUnits}</button>
                                    <button type="button"
                                        onClick={() => setFormData({ ...formData, inputMode: 'euro' })}
                                        className={`flex-1 py-2.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${formData.inputMode === 'euro' ? 'bg-[#1a6b3c] text-white shadow-lg' : 'text-gray-500'}`}
                                    >{t.enterEuro}</button>
                                </div>

                                {formData.inputMode === 'sqm' ? (
                                    <div className="flex flex-col gap-2 w-fit">
                                        <div className="flex gap-2">
                                            {[1, 2, 5, 10, 20].map((val) => (
                                                <button key={val} type="button"
                                                    onClick={() => setFormData({ ...formData, sq_meters: val, customSqm: '' })}
                                                    className={`py-3 px-4 rounded-xl font-black text-sm transition-all border-2 ${!formData.customSqm && formData.sq_meters === val ? 'bg-[#1a6b3c] border-[#1a6b3c] text-white shadow-lg' : 'bg-gray-50 border-transparent text-gray-500 hover:border-gray-200'}`}
                                                >{val}</button>
                                            ))}
                                        </div>
                                        <input type="number"
                                            className={`w-full bg-gray-50 border-2 rounded-xl py-3 px-4 outline-none transition-all font-bold text-[#0c151a] text-sm ${formData.customSqm ? 'border-[#1a6b3c] bg-white' : 'border-transparent focus:border-[#1a6b3c] focus:bg-white'}`}
                                            placeholder={t.customUnits} min="1"
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
                                        <div className="relative" dir="ltr">
                                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-bold text-gray-400">€</span>
                                            <input type="number"
                                                className="w-full bg-gray-50 border-2 border-transparent focus:border-[#1a6b3c] focus:bg-white rounded-xl py-4 pl-12 pr-16 outline-none transition-all font-bold text-xl text-[#0c151a]"
                                                placeholder="30" min="15" step="1"
                                                value={formData.monthlyEuro}
                                                onChange={(e) => {
                                                    const euros = parseFloat(e.target.value) || 0;
                                                    const sqm = Math.floor(euros / pricePerUnit);
                                                    setFormData({ ...formData, monthlyEuro: e.target.value, sq_meters: Math.max(sqm, 1) });
                                                }}
                                            />
                                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400 tracking-wider">{t.perMonth}</span>
                                        </div>
                                        <div className="flex items-center justify-between bg-emerald-50 rounded-xl p-3 px-4 border border-emerald-200/50">
                                            <span className="text-emerald-700 text-xs font-bold">{t.resultLabel}</span>
                                            <span className="text-emerald-800 text-lg font-black">{t.resultUnit(formData.sq_meters)}</span>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* IBAN + checkboxes */}
                            <div className="space-y-4 pt-4 border-t border-gray-100">
                                <div className="flex items-center space-x-2 text-[#1a6b3c] mb-2">
                                    <CreditCard className="w-5 h-5" />
                                    <span className="font-bold uppercase tracking-widest text-[10px]">{t.paymentHeader}</span>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 ml-1">{t.ibanLabel}</label>
                                    <input type="text" required
                                        className={`w-full bg-gray-50 border-2 ${fieldErrors.iban ? 'border-red-400' : 'border-transparent focus:border-[#1a6b3c] focus:bg-white'} rounded-xl py-4 px-4 outline-none transition-all font-bold tracking-widest uppercase text-[#0c151a]`}
                                        placeholder={t.ibanPlaceholder}
                                        value={formData.iban}
                                        onChange={(e) => { setErrorMsg(''); clearFieldError('iban'); setFormData({ ...formData, iban: e.target.value }); }}
                                    />
                                </div>

                                <label className="flex items-start space-x-3 cursor-pointer group">
                                    <div className="relative mt-1 shrink-0">
                                        <input type="checkbox" className="peer hidden"
                                            checked={formData.is_anonymous}
                                            onChange={(e) => setFormData({ ...formData, is_anonymous: e.target.checked })}
                                        />
                                        <div className="w-5 h-5 border-2 border-gray-300 rounded peer-checked:bg-[#1a6b3c] peer-checked:border-[#1a6b3c] transition-all" />
                                        <CheckCircle2 className="absolute top-0 left-0 w-5 h-5 text-white opacity-0 peer-checked:opacity-100 transition-opacity p-0.5" />
                                    </div>
                                    <span className="text-[11px] text-gray-500 font-bold leading-relaxed group-hover:text-gray-700">
                                        {t.anonymousLabel}
                                    </span>
                                </label>

                                <label className="flex items-start space-x-3 cursor-pointer group">
                                    <div className="relative mt-1 shrink-0">
                                        <input type="checkbox" className="peer hidden"
                                            checked={formData.notice_understood}
                                            onChange={(e) => { clearFieldError('notice_understood'); setFormData({ ...formData, notice_understood: e.target.checked }); }}
                                        />
                                        <div className={`w-5 h-5 border-2 ${fieldErrors.notice_understood ? 'border-red-400' : 'border-gray-300'} rounded peer-checked:bg-[#1a6b3c] peer-checked:border-[#1a6b3c] transition-all`} />
                                        <CheckCircle2 className="absolute top-0 left-0 w-5 h-5 text-white opacity-0 peer-checked:opacity-100 transition-opacity p-0.5" />
                                    </div>
                                    <span className={`text-[11px] font-medium leading-relaxed ${fieldErrors.notice_understood ? 'text-red-600' : 'text-gray-500 group-hover:text-gray-700'}`}>
                                        {t.noticeLabel}
                                    </span>
                                </label>

                                <label className="flex items-start space-x-3 cursor-pointer group">
                                    <div className="relative mt-1 shrink-0">
                                        <input type="checkbox" required className="peer hidden"
                                            checked={formData.mandate_accepted}
                                            onChange={(e) => { setErrorMsg(''); clearFieldError('mandate_accepted'); setFormData({ ...formData, mandate_accepted: e.target.checked }); }}
                                        />
                                        <div className={`w-5 h-5 border-2 ${fieldErrors.mandate_accepted ? 'border-red-400' : 'border-gray-300'} rounded peer-checked:bg-[#1a6b3c] peer-checked:border-[#1a6b3c] transition-all`} />
                                        <CheckCircle2 className="absolute top-0 left-0 w-5 h-5 text-white opacity-0 peer-checked:opacity-100 transition-opacity p-0.5" />
                                    </div>
                                    <span className={`text-[11px] font-medium leading-relaxed ${fieldErrors.mandate_accepted ? 'text-red-600' : 'text-gray-500 group-hover:text-gray-700'}`}>
                                        {t.mandateLabel}
                                    </span>
                                </label>
                            </div>
                        </div>

                        {/* Error */}
                        {errorMsg && (
                            <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="flex items-start gap-3 bg-red-50 border border-red-200 text-red-700 rounded-2xl px-5 py-4"
                            >
                                <div className="mt-0.5 w-5 h-5 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                                    <span className="text-red-600 text-xs font-black">!</span>
                                </div>
                                <div>
                                    <p className="font-bold text-sm">{t.errorTitle}</p>
                                    <p className="text-xs mt-0.5 text-red-500">{errorMsg}</p>
                                </div>
                            </motion.div>
                        )}

                        <button
                            type="submit" disabled={loading}
                            className="w-full py-5 bg-[#1a6b3c] text-white rounded-2xl font-black uppercase tracking-[0.2em] hover:bg-[#155430] transition-all flex items-center justify-between px-6 disabled:opacity-50 disabled:cursor-not-allowed group shadow-xl shadow-[#1a6b3c]/20"
                        >
                            {loading ? (
                                <div className="w-6 h-6 border-4 border-white/20 border-t-white rounded-full animate-spin mx-auto" />
                            ) : (
                                <>
                                    <span className="text-4xl leading-none">✓</span>
                                    <span className="flex-1 text-center">{t.submitBtn((formData.sq_meters * pricePerUnit).toFixed(2))}</span>
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