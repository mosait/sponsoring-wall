import React, { useState, useEffect } from 'react';
import { supabase, subscribeToSponsors } from '../lib/supabaseClient';
import { isValidIBAN, electronicFormatIBAN } from 'ibantools';

export default function Admin() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginLoading, setLoginLoading] = useState(true);
  const [loginError, setLoginError] = useState('');

  // TOTP / MFA States
  const [authStep, setAuthStep] = useState('login'); // 'login' | 'totp-enroll' | 'totp-challenge'
  const [totpFactorId, setTotpFactorId] = useState(null);
  const [totpChallengeId, setTotpChallengeId] = useState(null);
  const [totpCode, setTotpCode] = useState('');
  const [totpError, setTotpError] = useState('');
  const [totpLoading, setTotpLoading] = useState(false);
  const [totpQrSvg, setTotpQrSvg] = useState('');
  const [totpSecret, setTotpSecret] = useState('');

  const [cashAmount, setCashAmount] = useState('');
  const [sqMetersCalc, setSqMetersCalc] = useState(0);
  const [pricePerUnit, setPricePerUnit] = useState(15);
  const [donationStatus, setDonationStatus] = useState('');
  const [inputMode, setInputMode] = useState('euro');

  const [sponsors, setSponsors] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingSponsor, setEditingSponsor] = useState(null);
  const [editForm, setEditForm] = useState({});

  const [deleteModal, setDeleteModal] = useState(null);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState('');

  const [boostMessage, setBoostMessage] = useState('');
  const [boostStatus, setBoostStatus] = useState('');
  const [boostChannelReady, setBoostChannelReady] = useState(false);
  const boostChannelRef = React.useRef(null);

  const [dashboardLocked, setDashboardLocked] = useState(false);
  const [lockLoading, setLockLoading] = useState(false);
  const [registerStopMode, setRegisterStopMode] = useState('open');
  const [stopModeLoading, setStopModeLoading] = useState(false);

  const [deleteAllModal, setDeleteAllModal] = useState(false);
  const [deleteAllPassword, setDeleteAllPassword] = useState('');
  const [deleteAllError, setDeleteAllError] = useState('');

  const [importModal, setImportModal] = useState(false);
  const [importRows, setImportRows] = useState([]);
  const [importError, setImportError] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState(null);

  const filteredSponsors = sponsors.filter(s => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      s.full_name?.toLowerCase().includes(q) ||
      s.email?.toLowerCase().includes(q) ||
      s.phone?.toLowerCase().includes(q) ||
      s.iban?.toLowerCase().includes(q)
    );
  });

  const bankSponsors = sponsors.filter(s => s.iban !== 'CASH');
  const cashSponsors = sponsors.filter(s => s.iban === 'CASH');
  const totalSqMeters = sponsors.reduce((sum, s) => sum + Number(s.sq_meters || 0), 0);
  const totalBankAmount = bankSponsors.reduce((sum, s) => sum + Number(s.total_amount || 0), 0);
  const totalCashAmount = cashSponsors.reduce((sum, s) => sum + Number(s.total_amount || 0), 0);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (aalData?.currentLevel === 'aal2') {
          setIsAuthenticated(true);
          fetchSettings();
          fetchSponsors();
        } else {
          // Session exists but needs TOTP
          try {
            await setupMfa();
          } catch (err) {
            setLoginError('MFA-Fehler: ' + err.message);
          }
        }
      }
      setLoginLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      // AAL-Check handled explicitly in handleLogin — do not auto-set here
    });

    // Boost-Channel persistent offen halten
    const bc = supabase.channel('boost-request', {
      config: { broadcast: { ack: true, self: false } }
    });
    bc.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        boostChannelRef.current = bc;
        setBoostChannelReady(true);
      }
    });

    // Realtime CDC-Listener: Sponsorenliste automatisch aktualisieren
    const unsubCdc = subscribeToSponsors(() => {
      fetchSponsors();
    });

    return () => {
      subscription.unsubscribe();
      bc.unsubscribe();
      unsubCdc();
    };
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);
    const email = e.target.email.value;
    const password = e.target.password.value;

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setLoginError('Falsches E-Mail oder Passwort');
      setLoginLoading(false);
      return;
    }

    try {
      await setupMfa();
    } catch (err) {
      setLoginError('MFA-Fehler: ' + err.message);
    }
    setLoginLoading(false);
  };

  // Shared MFA setup logic used by both handleLogin and the session check on mount
  const setupMfa = async () => {
    const { data: factorsData } = await supabase.auth.mfa.listFactors();
    const verified = factorsData?.totp?.find(f => f.status === 'verified');
    if (verified) {
      const { data: ch } = await supabase.auth.mfa.challenge({ factorId: verified.id });
      setTotpFactorId(verified.id);
      setTotpChallengeId(ch.id);
      setAuthStep('totp-challenge');
    } else {
      // Unenroll ALL stale unverified factors left over from incomplete previous enrollments
      const unverifiedList = factorsData?.totp?.filter(f => f.status === 'unverified') ?? [];
      for (const f of unverifiedList) {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      // Use a unique friendly name to avoid collision if a prior unenroll didn't propagate in time
      const friendlyName = 'Admin-' + Date.now();
      const { data: en, error: enrollErr } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName });
      if (enrollErr || !en) throw new Error(enrollErr?.message || 'TOTP enrollment failed');
      const { data: ch } = await supabase.auth.mfa.challenge({ factorId: en.id });
      setTotpFactorId(en.id);
      setTotpChallengeId(ch.id);
      setTotpQrSvg(en.totp.qr_code);
      setTotpSecret(en.totp.secret);
      setAuthStep('totp-enroll');
    }
  };

  const handleTotpVerify = async () => {
    if (!totpCode.trim()) return;
    setTotpError('');
    setTotpLoading(true);
    const { error } = await supabase.auth.mfa.verify({
      factorId: totpFactorId,
      challengeId: totpChallengeId,
      code: totpCode.trim(),
    });
    if (error) {
      setTotpError('Ungültiger Code. Bitte erneut versuchen.');
      setTotpCode('');
      // Renew challenge for retry
      const { data: ch } = await supabase.auth.mfa.challenge({ factorId: totpFactorId });
      setTotpChallengeId(ch.id);
    } else {
      setIsAuthenticated(true);
      setAuthStep('login');
      fetchSettings();
      fetchSponsors();
    }
    setTotpLoading(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setIsAuthenticated(false);
  };

  const forceLogout = async () => {
    await supabase.auth.signOut();
    setIsAuthenticated(false);
    setAuthStep('login');
  };

  const fetchSettings = async () => {
    const { data, error } = await supabase.from('project_settings').select('price_per_unit, dashboard_locked, register_stop_mode').single();
    if (error?.status === 401) { forceLogout(); return; }
    if (data) {
      setPricePerUnit(data.price_per_unit || 15);
      setDashboardLocked(data.dashboard_locked || false);
      setRegisterStopMode(data.register_stop_mode || 'open');
    }
  };

  const handleToggleLock = async () => {
    setLockLoading(true);
    const newVal = !dashboardLocked;
    await supabase.from('project_settings').update({ dashboard_locked: newVal }).eq('id', 1);
    setDashboardLocked(newVal);
    setLockLoading(false);
  };

  const handleSetStopMode = async (mode) => {
    setStopModeLoading(true);
    await supabase.from('project_settings').update({ register_stop_mode: mode }).eq('id', 1);
    setRegisterStopMode(mode);
    setStopModeLoading(false);
  };

  const fetchSponsors = async () => {
    const { data, error } = await supabase.from('sponsors').select('*').order('created_at', { ascending: false });
    if (error?.status === 401) { forceLogout(); return; }
    if (data) setSponsors(data);
  };

  const handleInputModeChange = (mode) => {
    setInputMode(mode);
    setCashAmount('');
    setSqMetersCalc(0);
  };

  const handleCashChange = (e) => {
    const val = e.target.value;
    if (inputMode === 'euro') {
      setCashAmount(val);
      setSqMetersCalc(Math.floor(parseFloat(val) / (pricePerUnit * 12)) || 0);
    } else {
      const sqm = parseInt(val) || 0;
      setSqMetersCalc(sqm);
      setCashAmount(String(sqm * pricePerUnit * 12));
    }
  };

  const exportBankCSV = () => {
    const data = sponsors.filter(s => s.iban !== 'CASH');
    let csv = 'Name,Email,Telefon,m2,IBAN,Mandat Akzeptiert\n';
    data.forEach(s => {
      csv += `"${s.full_name}","${s.email}","${s.phone || ''}","${s.sq_meters}","${s.iban}","${s.mandate_accepted ? 'Ja' : 'Nein'}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'bank_registrierungen.csv');
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const exportCashCSV = () => {
    const data = sponsors.filter(s => s.iban === 'CASH');
    let csv = 'Datum,Name,m2,Betrag\n';
    data.forEach(s => {
      const date = new Date(s.created_at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      csv += `"${date}","${s.full_name}","${s.sq_meters}","${s.total_amount || ''}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'bar_spenden.csv');
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const parseCSV = (text) => {
    const lines = text.trim().split('\n').filter(l => l.trim());
    if (lines.length < 2) throw new Error('CSV ist leer oder hat keine Daten.');
    const header = lines[0].split(',').map(h => h.replace(/"/g, '').trim().toLowerCase());

    const colIndex = (names) => {
      for (const n of names) {
        const i = header.findIndex(h => h.includes(n));
        if (i !== -1) return i;
      }
      return -1;
    };

    const iName = colIndex(['name']);
    const iEmail = colIndex(['email', 'mail']);
    const iIban = colIndex(['iban']);
    const iSqm = colIndex(['m2', 'sqm', 'quadrat', 'm²']);
    const iAmount = colIndex(['betrag', 'amount', 'euro', '€']);
    const iPhone = colIndex(['tel', 'phone']);

    if (iName === -1) throw new Error('Spalte "Name" nicht gefunden.');

    return lines.slice(1).map((line, idx) => {
      const cols = line.match(/(".*?"|[^,]+|(?<=,)(?=,)|^(?=,)|(?<=,)$)/g) || [];
      const get = (i) => i !== -1 ? (cols[i] || '').replace(/"/g, '').trim() : '';
      const rawIban = iIban !== -1 ? get(iIban).replace(/\s/g, '').toUpperCase() : '';
      const iban = rawIban || 'CASH';
      const ibanInvalid = iban !== 'CASH' && !isValidIBAN(electronicFormatIBAN(iban) || '');
      const sqm = parseInt(get(iSqm)) || 0;
      const amount = parseFloat(get(iAmount)) || sqm * pricePerUnit;
      return {
        _row: idx + 2,
        _ibanInvalid: ibanInvalid,
        full_name: get(iName),
        email: get(iEmail) || (iban === 'CASH' ? 'cash@sponsoring-wall.local' : ''),
        iban,
        phone: get(iPhone) || '',
        sq_meters: sqm,
        total_amount: amount,
        mandate_accepted: true,
        is_anonymous: false,
      };
    }).filter(r => r.full_name);
  };

  const handleImportFile = (e) => {
    setImportError('');
    setImportRows([]);
    setImportResult(null);
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const raw = parseCSV(ev.target.result);
        if (raw.length === 0) throw new Error('Keine gültigen Zeilen gefunden.');

        const invalidIbans = raw.filter(r => r._ibanInvalid);
        if (invalidIbans.length > 0) {
          throw new Error(
            `${invalidIbans.length} ungültige IBAN(s) gefunden:\n` +
            invalidIbans.slice(0, 5).map(r => `Zeile ${r._row}: ${r.iban}`).join('\n') +
            (invalidIbans.length > 5 ? `\n… und ${invalidIbans.length - 5} weitere` : '')
          );
        }

        // Intern gruppieren für Vorschau
        const cashRows = raw.filter(r => r.iban === 'CASH');
        const bankMap = new Map();
        for (const row of raw.filter(r => r.iban !== 'CASH')) {
          if (bankMap.has(row.iban)) {
            const e = bankMap.get(row.iban);
            e.sq_meters += row.sq_meters;
            e.total_amount += row.total_amount;
          } else {
            bankMap.set(row.iban, { ...row });
          }
        }
        setImportRows([...Array.from(bankMap.values()), ...cashRows]);
      } catch (err) {
        setImportError(err.message);
      }
    };
    reader.readAsText(file, 'UTF-8');
    e.target.value = '';
  };

  const handleImportSubmit = async () => {
    setImportLoading(true);
    setImportResult(null);
    let inserted = 0, updated = 0, errors = 0;

    // Schritt 1: CSV intern gruppieren — gleiche IBAN aufsummieren
    const cashRows = importRows.filter(r => r.iban === 'CASH');
    const bankMap = new Map();
    for (const { _row, ...row } of importRows.filter(r => r.iban !== 'CASH')) {
      if (bankMap.has(row.iban)) {
        const existing = bankMap.get(row.iban);
        existing.sq_meters += row.sq_meters;
        existing.total_amount += row.total_amount;
      } else {
        bankMap.set(row.iban, { ...row });
      }
    }
    const bankRows = Array.from(bankMap.values());

    // Schritt 2: Cash — immer neu anlegen
    for (const { _row, ...data } of cashRows) {
      const result = await supabase.from('sponsors').insert([data]);
      if (result.error) errors++; else inserted++;
    }

    // Schritt 3: Bank — mit DB vergleichen und summieren oder neu anlegen
    for (const data of bankRows) {
      const { data: existingRows } = await supabase
        .from('sponsors')
        .select('id, sq_meters, total_amount')
        .eq('iban', data.iban)
        .limit(1);
      const existing = existingRows && existingRows.length > 0 ? existingRows[0] : null;

      let err;
      if (existing) {
        const result = await supabase.from('sponsors').update({
          ...data,
          sq_meters: existing.sq_meters + data.sq_meters,
          total_amount: Number(existing.total_amount) + data.total_amount,
        }).eq('id', existing.id);
        err = result.error;
        if (!err) updated++;
      } else {
        const result = await supabase.from('sponsors').insert([data]);
        err = result.error;
        if (!err) inserted++;
      }
      if (err) errors++;
    }

    setImportLoading(false);
    setImportResult({ inserted, updated, errors });
    setImportRows([]);
    fetchSponsors();
  };

  const handleSaveDonation = async () => {
    if (!cashAmount || parseFloat(cashAmount) <= 0) return;
    const newSponsor = {
      full_name: 'Bar Spende',
      email: 'admin@sponsoring-wall.local',
      phone: '',
      iban: 'CASH',
      mandate_accepted: true,
      sq_meters: sqMetersCalc,
      total_amount: parseFloat(cashAmount),
      is_anonymous: false
    };
    const { error } = await supabase.from('sponsors').insert([newSponsor]);
    if (error) {
      setDonationStatus('Fehler beim Speichern!');
    } else {
      setDonationStatus('Spende erfolgreich eingetragen!');
      setCashAmount('');
      setSqMetersCalc(0);
      fetchSponsors();
      setTimeout(() => setDonationStatus(''), 4000);
    }
  };

  const handleEditClick = (sponsor) => {
    setEditingSponsor(sponsor.id);
    setEditForm({
      full_name: sponsor.full_name,
      email: sponsor.email,
      phone: sponsor.phone || '',
      iban: sponsor.iban,
      sq_meters: sponsor.sq_meters,
      total_amount: sponsor.total_amount || '',
      is_anonymous: sponsor.is_anonymous,
    });
  };

  const handleEditSave = async (id) => {
    const { error } = await supabase.from('sponsors').update({
      full_name: editForm.full_name,
      email: editForm.email,
      phone: editForm.phone,
      iban: editForm.iban,
      sq_meters: parseInt(editForm.sq_meters) || 0,
      total_amount: parseFloat(editForm.total_amount) || 0,
      is_anonymous: editForm.is_anonymous,
    }).eq('id', id);
    if (error) {
      alert('Fehler beim Speichern: ' + error.message);
    } else {
      setEditingSponsor(null);
      fetchSponsors();
    }
  };

  const reAuthUser = async (password) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const { error } = await supabase.auth.signInWithPassword({
      email: user.email,
      password
    });
    return !error;
  };

  const handleDeleteSubmit = async () => {
    const ok = await reAuthUser(deletePassword);
    if (!ok) {
      setDeleteError('Falsches Passwort!');
      return;
    }
    const { error } = await supabase.from('sponsors').delete().eq('id', deleteModal.id);
    if (error) {
      setDeleteError('Fehler: ' + error.message);
    } else {
      setDeleteModal(null);
      setDeletePassword('');
      setDeleteError('');
      fetchSponsors();
    }
  };

  const handleSendBoost = async () => {
    if (!boostChannelRef.current) return;
    const result = await boostChannelRef.current.send({
      type: 'broadcast',
      event: 'boost',
      payload: { message: boostMessage || 'Erhöhe deinen Beitrag für die Moschee!' }
    });
    if (result === 'ok') {
      setBoostStatus('Aufruf gesendet!');
    } else {
      setBoostStatus('Fehler beim Senden: ' + result);
    }
    setTimeout(() => setBoostStatus(''), 3000);
  };

  const handleDeleteAllSubmit = async () => {
    const ok = await reAuthUser(deleteAllPassword);
    if (!ok) {
      setDeleteAllError('Falsches Passwort!');
      return;
    }
    const { error } = await supabase.from('sponsors').delete().neq('id', 0);
    if (error) {
      setDeleteAllError('Fehler: ' + error.message);
    } else {
      setDeleteAllModal(false);
      setDeleteAllPassword('');
      setDeleteAllError('');
      fetchSponsors();
    }
  };

  if (loginLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="w-8 h-8 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  // TOTP Enrollment screen (first-time setup)
  if (authStep === 'totp-enroll') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white font-sans p-4">
        <div className="bg-gray-800 p-8 rounded-2xl shadow-2xl border border-white/5 w-full max-w-sm">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-amber-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-white mb-1">2-Faktor einrichten</h2>
            <p className="text-gray-400 text-sm">Scanne den QR-Code mit Google Authenticator oder Authy</p>
          </div>
          {totpQrSvg && (
            <div className="bg-white p-3 rounded-xl mb-4 flex items-center justify-center">
              <img src={totpQrSvg} alt="TOTP QR Code" className="w-48 h-48" />
            </div>
          )}
          <details className="mb-4 text-xs text-gray-500">
            <summary className="cursor-pointer hover:text-gray-400 transition-colors">Manueller Schlüssel</summary>
            <p className="mt-2 font-mono bg-gray-900 rounded-lg px-3 py-2 break-all text-gray-300 select-all">{totpSecret}</p>
          </details>
          <p className="text-gray-400 text-xs mb-3 text-center">Code aus der App eingeben zur Bestätigung:</p>
          <input
            type="text" inputMode="numeric" maxLength={6} placeholder="000000"
            value={totpCode} onChange={e => setTotpCode(e.target.value.replace(/\D/g, ''))}
            onKeyDown={e => e.key === 'Enter' && handleTotpVerify()}
            className="w-full bg-gray-900 border border-gray-700/50 rounded-lg px-4 py-3 text-white text-center text-2xl font-mono tracking-[0.5em] placeholder-gray-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all mb-3"
            autoFocus
          />
          {totpError && <p className="text-red-400 text-sm mb-3 text-center">{totpError}</p>}
          <button onClick={handleTotpVerify} disabled={totpLoading || totpCode.length < 6}
            className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-800 disabled:opacity-50 text-white font-semibold py-3 px-4 rounded-lg shadow-lg transition-all">
            {totpLoading ? 'Verifiziere...' : 'Einrichten & Anmelden'}
          </button>
          <button onClick={() => { supabase.auth.signOut(); setAuthStep('login'); setTotpCode(''); }}
            className="w-full mt-2 text-gray-500 hover:text-gray-300 text-sm py-2 transition-colors">
            Abbrechen (neu anmelden)
          </button>
        </div>
      </div>
    );
  }

  // TOTP Challenge screen (every login after enrollment)
  if (authStep === 'totp-challenge') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white font-sans">
        <div className="bg-gray-800 p-8 rounded-2xl shadow-2xl border border-white/5 w-full max-w-sm">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-white mb-1">2-Faktor Bestätigung</h2>
            <p className="text-gray-400 text-sm">Code aus Google Authenticator / Authy eingeben</p>
          </div>
          <input
            type="text" inputMode="numeric" maxLength={6} placeholder="000000"
            value={totpCode} onChange={e => setTotpCode(e.target.value.replace(/\D/g, ''))}
            onKeyDown={e => e.key === 'Enter' && handleTotpVerify()}
            className="w-full bg-gray-900 border border-gray-700/50 rounded-lg px-4 py-3 text-white text-center text-2xl font-mono tracking-[0.5em] placeholder-gray-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all mb-3"
            autoFocus
          />
          {totpError && <p className="text-red-400 text-sm mb-3 text-center">{totpError}</p>}
          <button onClick={handleTotpVerify} disabled={totpLoading || totpCode.length < 6}
            className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-800 disabled:opacity-50 text-white font-semibold py-3 px-4 rounded-lg shadow-lg transition-all">
            {totpLoading ? 'Verifiziere...' : 'Bestätigen'}
          </button>
          <button onClick={() => { supabase.auth.signOut(); setAuthStep('login'); }}
            className="w-full mt-2 text-gray-500 hover:text-gray-300 text-sm py-2 transition-colors">
            Abbrechen
          </button>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white font-sans">
        <form onSubmit={handleLogin} className="bg-gray-800 p-8 rounded-2xl shadow-2xl border border-white/5 w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Admin Dashboard</h2>
            <p className="text-gray-400 text-sm">Email + Passwort + 2FA</p>
          </div>
          <div className="space-y-3 mb-6">
            <input
              type="email"
              name="email"
              placeholder="E-Mail"
              required
              className="w-full bg-gray-900 border border-gray-700/50 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
            />
            <input
              type="password"
              name="password"
              placeholder="Passwort"
              required
              className="w-full bg-gray-900 border border-gray-700/50 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-mono"
            />
          </div>
          {loginError && (
            <p className="text-red-400 text-sm mb-4 text-center">{loginError}</p>
          )}
          <button type="submit" disabled={loginLoading}
            className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-800 text-white font-semibold py-3 px-4 rounded-lg shadow-lg transition-all">
            {loginLoading ? 'Anmelden...' : 'Anmelden'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 md:p-8 font-sans">

      {/* Delete Single Modal */}
      {deleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-gray-800 border border-red-500/20 rounded-2xl p-8 w-full max-w-md shadow-2xl">
            <h3 className="text-xl font-bold text-white mb-2">Eintrag löschen</h3>
            <p className="text-gray-400 text-sm mb-4">Du bist dabei folgenden Eintrag zu löschen:</p>
            <div className="bg-gray-900 rounded-xl p-4 mb-6">
              <p className="text-white font-semibold">{deleteModal.full_name}</p>
              <p className="text-gray-400 text-sm">{deleteModal.email} · {deleteModal.sq_meters} m²</p>
            </div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Passwort zur Bestätigung</label>
            <input type="password" value={deletePassword}
              onChange={e => { setDeletePassword(e.target.value); setDeleteError(''); }}
              placeholder="Dein Passwort"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 mb-2 text-white placeholder-gray-500 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-all font-mono"
              autoFocus onKeyDown={e => e.key === 'Enter' && handleDeleteSubmit()} />
            {deleteError && <p className="text-red-400 text-sm mb-3">{deleteError}</p>}
            <div className="flex gap-3 mt-4">
              <button onClick={handleDeleteSubmit} className="flex-1 bg-red-500 hover:bg-red-600 text-white font-bold py-3 rounded-xl transition-all">Löschen bestätigen</button>
              <button onClick={() => { setDeleteModal(null); setDeletePassword(''); setDeleteError(''); }} className="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-300 font-bold py-3 rounded-xl transition-all">Abbrechen</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete All Modal */}
      {deleteAllModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-gray-800 border border-red-500/30 rounded-2xl p-8 w-full max-w-md shadow-2xl">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Alle Einträge löschen</h3>
              <p className="text-red-400 text-sm font-medium">Diese Aktion kann nicht rückgängig gemacht werden!</p>
              <p className="text-gray-400 text-sm mt-1">Es werden <span className="text-white font-bold">{sponsors.length} Einträge</span> permanent gelöscht.</p>
            </div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Passwort zur Bestätigung</label>
            <input type="password" value={deleteAllPassword}
              onChange={e => { setDeleteAllPassword(e.target.value); setDeleteAllError(''); }}
              placeholder="Dein Passwort"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 mb-2 text-white placeholder-gray-500 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-all font-mono"
              autoFocus onKeyDown={e => e.key === 'Enter' && handleDeleteAllSubmit()} />
            {deleteAllError && <p className="text-red-400 text-sm mb-3">{deleteAllError}</p>}
            <div className="flex gap-3 mt-4">
              <button onClick={handleDeleteAllSubmit} className="flex-1 bg-red-500 hover:bg-red-600 text-white font-bold py-3 rounded-xl transition-all">Alle löschen</button>
              <button onClick={() => { setDeleteAllModal(false); setDeleteAllPassword(''); setDeleteAllError(''); }} className="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-300 font-bold py-3 rounded-xl transition-all">Abbrechen</button>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {importModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-gray-800 border border-emerald-500/20 rounded-2xl p-8 w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-xl font-bold text-white">CSV Import</h3>
                <p className="text-gray-400 text-sm mt-1">
                  Erwartete Spalten: <span className="font-mono text-xs text-emerald-400">Name, Email, IBAN, m2, Betrag, Telefon</span>
                </p>
              </div>
              <button onClick={() => setImportModal(false)} className="text-gray-500 hover:text-gray-300 transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {importResult ? (
              <div className="text-center py-8">
                <div className="text-5xl mb-4">✅</div>
                <p className="text-white font-bold text-lg mb-2">Import abgeschlossen</p>
                <div className="flex justify-center gap-6 mt-4">
                  <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 text-center">
                    <p className="text-3xl font-black text-emerald-400">{importResult.inserted}</p>
                    <p className="text-xs text-gray-400 uppercase tracking-wider mt-1">Neu angelegt</p>
                  </div>
                  <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 text-center">
                    <p className="text-3xl font-black text-blue-400">{importResult.updated}</p>
                    <p className="text-xs text-gray-400 uppercase tracking-wider mt-1">Aktualisiert</p>
                  </div>
                  {importResult.errors > 0 && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-center">
                      <p className="text-3xl font-black text-red-400">{importResult.errors}</p>
                      <p className="text-xs text-gray-400 uppercase tracking-wider mt-1">Fehler</p>
                    </div>
                  )}
                </div>
                <button onClick={() => setImportModal(false)} className="mt-6 px-6 py-2.5 bg-emerald-500 text-white font-bold rounded-xl hover:bg-emerald-400 transition-all">
                  Schließen
                </button>
              </div>
            ) : (
              <>
                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-600 rounded-xl cursor-pointer hover:border-emerald-500 transition-colors bg-gray-900/50 mb-4">
                  <svg className="w-8 h-8 text-gray-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                  <span className="text-gray-400 text-sm">CSV-Datei auswählen</span>
                  <input type="file" accept=".csv" className="hidden" onChange={handleImportFile} />
                </label>

                {importError && (
                  <pre className="text-red-400 text-sm mb-4 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 whitespace-pre-wrap font-sans">{importError}</pre>
                )}

                {importRows.length > 0 && (
                  <>
                    <p className="text-gray-400 text-sm mb-3"><span className="text-white font-bold">{importRows.length} Zeilen</span> erkannt — Vorschau:</p>
                    <div className="overflow-y-auto flex-1 rounded-xl border border-gray-700 mb-5">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-gray-900 sticky top-0">
                          <tr className="text-gray-500 uppercase tracking-wider">
                            <th className="px-3 py-2">Name</th>
                            <th className="px-3 py-2">IBAN</th>
                            <th className="px-3 py-2">m²</th>
                            <th className="px-3 py-2">Betrag</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                          {importRows.slice(0, 8).map((r, i) => (
                            <tr key={i} className="text-gray-300">
                              <td className="px-3 py-2 font-medium">{r.full_name}</td>
                              <td className="px-3 py-2 font-mono text-gray-500">{r.iban.slice(0, 8)}…</td>
                              <td className="px-3 py-2 text-emerald-400 font-bold">{r.sq_meters}</td>
                              <td className="px-3 py-2">{r.total_amount.toFixed(2)}€</td>
                            </tr>
                          ))}
                          {importRows.length > 8 && (
                            <tr><td colSpan={4} className="px-3 py-2 text-gray-500 text-center">… und {importRows.length - 8} weitere</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    <button onClick={handleImportSubmit} disabled={importLoading}
                      className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold py-3 rounded-xl transition-all">
                      {importLoading ? 'Importiere...' : `${importRows.length} Einträge importieren`}
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-10 pb-6 border-b border-gray-800">
          <div>
            <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-teal-400 tracking-tight">Admin Interface</h1>
            <p className="text-gray-400 mt-1">Verwaltung von Barspenden und Sponsor-Übersicht</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 mt-4 sm:mt-0">
            {/* Register stop mode */}
            {registerStopMode !== 'open' ? (
              <button onClick={() => handleSetStopMode('open')} disabled={stopModeLoading}
                className="px-5 py-2.5 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 border bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-white">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                Registrierung öffnen
              </button>
            ) : (
              <>
                <button onClick={() => handleSetStopMode('full')} disabled={stopModeLoading}
                  className="px-5 py-2.5 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 border bg-orange-500/10 border-orange-500/20 text-orange-400 hover:bg-orange-500 hover:text-white">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                  Reg. sperren: Voll
                </button>
                <button onClick={() => handleSetStopMode('maintenance')} disabled={stopModeLoading}
                  className="px-5 py-2.5 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 border bg-blue-500/10 border-blue-500/20 text-blue-400 hover:bg-blue-500 hover:text-white">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  Reg. sperren: Wartung
                </button>
              </>
            )}
            <button onClick={handleToggleLock} disabled={lockLoading}
              className={`px-5 py-2.5 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 border ${dashboardLocked ? 'bg-green-500/10 border-green-500/20 text-green-400 hover:bg-green-500 hover:text-white' : 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400 hover:bg-yellow-500 hover:text-white'}`}>
              {dashboardLocked ? (
                <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" /></svg>Dashboard öffnen</>
              ) : (
                <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>Dashboard sperren</>
              )}
            </button>
            <button onClick={() => setDeleteAllModal(true)}
              className="bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500 hover:text-white px-5 py-2.5 rounded-lg font-medium transition-all duration-200 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              Alle löschen
            </button>
            <button onClick={handleLogout} className="bg-gray-700 border border-gray-600 text-gray-300 hover:bg-gray-600 px-5 py-2.5 rounded-lg font-medium transition-all duration-200">
              Logout
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-gray-800/80 rounded-xl border border-white/5 p-5">
            <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">Spender gesamt</p>
            <p className="text-3xl font-extrabold text-white">{sponsors.length}</p>
            <p className="text-xs text-gray-500 mt-1">{bankSponsors.length} Bank · {cashSponsors.length} Bar</p>
          </div>
          <div className="bg-gray-800/80 rounded-xl border border-white/5 p-5">
            <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">Fläche gesamt</p>
            <p className="text-3xl font-extrabold text-emerald-400">{totalSqMeters} <span className="text-lg">m²</span></p>
          </div>
          <div className="bg-gray-800/80 rounded-xl border border-white/5 p-5">
            <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">Bank (monatl.)</p>
            <p className="text-3xl font-extrabold text-indigo-400">{totalBankAmount.toFixed(0)}<span className="text-lg">€</span></p>
            <p className="text-xs text-gray-500 mt-1">{bankSponsors.length} Lastschriften</p>
          </div>
          <div className="bg-gray-800/80 rounded-xl border border-white/5 p-5">
            <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">Bar (einmalig)</p>
            <p className="text-3xl font-extrabold text-amber-400">{totalCashAmount.toFixed(0)}<span className="text-lg">€</span></p>
            <p className="text-xs text-gray-500 mt-1">{cashSponsors.length} Einzahlungen</p>
          </div>
        </div>

        {/* Boost Broadcast */}
        <div className="mb-8 bg-gray-800/80 rounded-xl border border-amber-500/20 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center text-2xl">📢</div>
            <div>
              <h3 className="text-lg font-semibold text-white">Beitrag erhöhen — Aufruf senden</h3>
              <p className="text-sm text-gray-400">Sendet ein Popup an alle registrierten Dashboard-Besucher</p>
            </div>
          </div>
          <div className="flex gap-3">
            <input type="text" value={boostMessage} onChange={e => setBoostMessage(e.target.value)}
              placeholder="Erhöhe deinen Beitrag!"
              className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all" />
            <button onClick={handleSendBoost}
              className="px-6 py-3 bg-amber-500 hover:bg-amber-400 text-white font-bold rounded-lg transition-all whitespace-nowrap">
              📢 Aufruf senden
            </button>
          </div>
          {boostStatus && (
            <p className="mt-3 text-sm text-amber-400 font-medium">{boostStatus}</p>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
          {/* Bar Spende */}
          <div className="lg:col-span-1 bg-gray-800/80 backdrop-blur-sm p-6 sm:p-8 rounded-2xl border border-white/5 shadow-2xl">
            <div className="flex items-center mb-6">
              <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 mr-3">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <h2 className="text-xl font-semibold text-white">Bar Spende eintragen</h2>
            </div>
            <div className="space-y-5">
              <div className="flex bg-gray-900 rounded-xl p-1">
                <button type="button" onClick={() => handleInputModeChange('euro')}
                  className={`flex-1 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${inputMode === 'euro' ? 'bg-emerald-500 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}>
                  € Betrag
                </button>
                <button type="button" onClick={() => handleInputModeChange('sqm')}
                  className={`flex-1 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${inputMode === 'sqm' ? 'bg-emerald-500 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}>
                  m² eingeben
                </button>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  {inputMode === 'euro' ? 'Empfangener Betrag (€)' : 'Anzahl Quadratmeter (m²)'}
                </label>
                <div className="relative">
                  <input type="number" value={inputMode === 'euro' ? cashAmount : (sqMetersCalc || '')}
                    onChange={handleCashChange} min="0" step="1"
                    placeholder={inputMode === 'euro' ? '1000' : '5'}
                    className="w-full bg-gray-200/50 border border-gray-700/50 rounded-xl px-4 py-8 pl-14 text-2xl font-bold text-gray-300 placeholder-gray-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all" />
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-bold text-white">
                    {inputMode === 'euro' ? '€' : 'm²'}
                  </span>
                </div>
              </div>
              <div className="bg-gradient-to-br from-gray-900 to-gray-800 p-5 rounded-xl border border-gray-700/50">
                <p className="text-sm text-gray-400 mb-2 flex justify-between"><span>Preis m²/Monat:</span><span className="font-mono text-gray-300">{pricePerUnit.toFixed(2)} €</span></p>
                <p className="text-sm text-gray-400 mb-4 flex justify-between"><span>Jahreskosten (x12):</span><span className="font-mono text-gray-300">{(pricePerUnit * 12).toFixed(2)} €</span></p>
                <div className="pt-4 border-t border-gray-700/50 grid grid-cols-2 gap-4">
                  <div className="flex flex-col items-center">
                    <span className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">Fläche</span>
                    <div className="flex items-baseline">
                      <span className="text-4xl font-extrabold text-white">{sqMetersCalc}</span>
                      <span className="text-emerald-400 ml-1 font-bold text-lg">m²</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">Betrag</span>
                    <div className="flex items-baseline">
                      <span className="text-4xl font-extrabold text-white">{cashAmount || 0}</span>
                      <span className="text-emerald-400 ml-1 font-bold text-lg">€</span>
                    </div>
                  </div>
                </div>
              </div>
              <button onClick={handleSaveDonation} disabled={!cashAmount || parseFloat(cashAmount) <= 0}
                className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold py-4 px-4 rounded-xl transition-all duration-200">
                Spende in Datenbank speichern
              </button>
              {donationStatus && (
                <div className={`p-3 rounded-lg text-center text-sm font-medium border ${donationStatus.includes('Fehler') ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'}`}>
                  {donationStatus}
                </div>
              )}
            </div>
          </div>

          {/* Sponsoren Liste */}
          <div className="lg:col-span-2 bg-gray-800/80 backdrop-blur-sm rounded-2xl border border-white/5 shadow-2xl overflow-hidden flex flex-col">
            <div className="px-6 sm:px-8 py-6 border-b border-gray-700 bg-gray-800 shrink-0">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-white">Sponsoren Liste</h2>
                  <p className="text-sm text-gray-400 mt-1">Zeile hovern → Bearbeiten / Löschen</p>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <button onClick={fetchSponsors} title="Aktualisieren"
                    className="px-3 py-2 bg-gray-700 text-gray-300 border border-gray-600 rounded-lg hover:bg-gray-600 transition-all">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                  </button>
                  <button onClick={exportBankCSV} className="px-4 py-2 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-lg inline-flex items-center text-xs font-semibold hover:bg-indigo-500/20 transition-all font-mono">
                    <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                    BANK CSV
                  </button>
                  <button onClick={exportCashCSV} className="px-4 py-2 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-lg inline-flex items-center text-xs font-semibold hover:bg-amber-500/20 transition-all font-mono">
                    <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                    CASH CSV
                  </button>
                  <button onClick={() => { setImportModal(true); setImportRows([]); setImportError(''); setImportResult(null); }}
                    className="px-4 py-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg inline-flex items-center text-xs font-semibold hover:bg-emerald-500/20 transition-all font-mono">
                    <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                    CSV IMPORT
                  </button>
                  <span className="px-4 py-1.5 bg-gray-900 border border-gray-700 text-gray-300 rounded-full text-sm font-medium">
                    {filteredSponsors.length} / {sponsors.length} Spender
                  </span>
                </div>
              </div>
              <div className="relative mt-4">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                </div>
                <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Suche nach Name, Email, Telefon oder IBAN..."
                  className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 pl-11 text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all text-sm" />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                )}
              </div>
            </div>

            <div className="overflow-y-auto flex-grow custom-scrollbar max-h-[600px]">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 z-10 bg-gray-900 border-b border-gray-800">
                  <tr className="text-xs uppercase tracking-wider text-gray-500 font-semibold">
                    <th className="px-4 py-4">Datum</th>
                    <th className="px-4 py-4">Name / Email</th>
                    <th className="px-4 py-4">Tel / IBAN</th>
                    <th className="px-4 py-4 text-emerald-400">m²</th>
                    <th className="px-4 py-4">Betrag</th>
                    <th className="px-4 py-4">Art</th>
                    <th className="px-4 py-4 text-right">Aktionen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800 text-sm">
                  {filteredSponsors.length === 0 ? (
                    <tr><td colSpan="7" className="px-6 py-12 text-center text-gray-500">
                      {searchQuery ? `Keine Ergebnisse für "${searchQuery}"` : 'Keine Einträge vorhanden.'}
                    </td></tr>
                  ) : (
                    filteredSponsors.map(sponsor => (
                      editingSponsor === sponsor.id ? (
                        <tr key={sponsor.id} className="bg-gray-700/50">
                          <td colSpan="7" className="px-6 py-5">
                            <div className="grid grid-cols-2 gap-4 mb-4">
                              <div>
                                <label className="block text-xs text-gray-400 font-semibold uppercase tracking-wider mb-1.5">Name</label>
                                <input value={editForm.full_name} onChange={e => setEditForm({ ...editForm, full_name: e.target.value })}
                                  className="w-full bg-gray-900 border border-gray-600 rounded-xl px-4 py-3 text-white text-base focus:outline-none focus:border-emerald-500" placeholder="Name" />
                              </div>
                              <div>
                                <label className="block text-xs text-gray-400 font-semibold uppercase tracking-wider mb-1.5">Email</label>
                                <input value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })}
                                  className="w-full bg-gray-900 border border-gray-600 rounded-xl px-4 py-3 text-white text-base focus:outline-none focus:border-emerald-500" placeholder="Email" />
                              </div>
                              <div>
                                <label className="block text-xs text-gray-400 font-semibold uppercase tracking-wider mb-1.5">Telefon</label>
                                <input value={editForm.phone} onChange={e => setEditForm({ ...editForm, phone: e.target.value })}
                                  className="w-full bg-gray-900 border border-gray-600 rounded-xl px-4 py-3 text-white text-base focus:outline-none focus:border-emerald-500" placeholder="+49 123 456789" />
                              </div>
                              <div>
                                <label className="block text-xs text-gray-400 font-semibold uppercase tracking-wider mb-1.5">IBAN</label>
                                <input value={editForm.iban} onChange={e => setEditForm({ ...editForm, iban: e.target.value.toUpperCase() })}
                                  className="w-full bg-gray-900 border border-gray-600 rounded-xl px-4 py-3 text-white text-base font-mono tracking-widest focus:outline-none focus:border-emerald-500" placeholder="DE89..." />
                              </div>
                              <div>
                                <label className="block text-xs text-gray-400 font-semibold uppercase tracking-wider mb-1.5">Quadratmeter</label>
                                <input type="number" value={editForm.sq_meters} onChange={e => {
                                  const sqm = parseInt(e.target.value) || 0;
                                  setEditForm(prev => ({
                                    ...prev,
                                    sq_meters: e.target.value,
                                    total_amount: prev.iban === 'CASH' ? prev.total_amount : (sqm * pricePerUnit).toFixed(2)
                                  }));
                                }}
                                  className="w-full bg-gray-900 border border-gray-600 rounded-xl px-4 py-3 text-emerald-400 font-bold text-base focus:outline-none focus:border-emerald-500" />
                              </div>
                              <div>
                                <label className="block text-xs text-gray-400 font-semibold uppercase tracking-wider mb-1.5">Betrag (€)</label>
                                <input type="number" value={editForm.total_amount} onChange={e => setEditForm({ ...editForm, total_amount: e.target.value })}
                                  className="w-full bg-gray-900 border border-gray-600 rounded-xl px-4 py-3 text-white text-base font-mono focus:outline-none focus:border-emerald-500" />
                              </div>
                            </div>
                            <label className="flex items-center gap-3 mb-4 cursor-pointer">
                              <input type="checkbox" checked={editForm.is_anonymous}
                                onChange={e => setEditForm({ ...editForm, is_anonymous: e.target.checked })}
                                className="w-4 h-4 rounded border-gray-600 bg-gray-900 text-emerald-500 focus:ring-emerald-500" />
                              <span className="text-sm text-gray-400">Anonym (Name wird auf der Spenderwand nicht angezeigt)</span>
                            </label>
                            <div className="flex gap-3">
                              <button onClick={() => handleEditSave(sponsor.id)}
                                className="px-6 py-2.5 bg-emerald-500 text-white rounded-xl text-sm font-bold hover:bg-emerald-400 transition-all">Speichern</button>
                              <button onClick={() => setEditingSponsor(null)}
                                className="px-6 py-2.5 bg-gray-700 text-gray-300 border border-gray-600 rounded-xl text-sm font-bold hover:bg-gray-600 transition-all">Abbrechen</button>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        <tr key={sponsor.id} className="hover:bg-gray-700/30 transition-colors group">
                          <td className="px-4 py-4 text-gray-400 whitespace-nowrap text-xs">
                            {new Date(sponsor.created_at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="px-4 py-4">
                            <div className="font-medium text-gray-200">
                              {sponsor.full_name}
                              {sponsor.is_anonymous && <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-gray-500/10 text-gray-400 border border-gray-500/20 uppercase tracking-wide">Anonym</span>}
                              {sponsor.iban === 'CASH' && <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 uppercase tracking-wide">Bar</span>}
                            </div>
                            <div className="text-gray-500 text-xs mt-0.5">{sponsor.email}</div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="text-gray-400 text-xs">{sponsor.phone || '—'}</div>
                            <div className="text-gray-500 text-xs font-mono mt-0.5 truncate max-w-[140px]">{sponsor.iban === 'CASH' ? '—' : sponsor.iban}</div>
                          </td>
                          <td className="px-4 py-4 text-emerald-400 font-bold text-base">{sponsor.sq_meters}</td>
                          <td className="px-4 py-4 font-mono text-gray-300">{sponsor.total_amount ? Number(sponsor.total_amount).toFixed(0) + '€' : '—'}</td>
                          <td className="px-4 py-4 font-mono text-gray-500 text-xs">{sponsor.iban === 'CASH' ? 'BAR' : 'BANK'}</td>
                          <td className="px-4 py-4 text-right">
                            <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => handleEditClick(sponsor)}
                                className="px-3 py-1.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-lg text-xs font-semibold hover:bg-blue-500 hover:text-white transition-all">
                                Bearbeiten
                              </button>
                              <button onClick={() => setDeleteModal(sponsor)}
                                className="px-3 py-1.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg text-xs font-semibold hover:bg-red-500 hover:text-white transition-all">
                                Löschen
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="mt-8 text-center text-gray-600 text-xs">
          Al-Rahma Moschee Darmstadt — Admin Interface
        </div>
      </div>
    </div>
  );
}
