// @ts-nocheck
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import './patient.css';
import './doctor.css';
import emailjs from '@emailjs/browser';
import FloatingChat from './FloatingChat';
import { sendFeedbackWebhook } from './Feedback';
import {
  LayoutGrid,
  Users,
  Calendar,
  Stethoscope,
  Sparkles,
  Bot,
  RefreshCw,
  UserPlus,
  CalendarPlus,
  Search,
  Phone,
  Clock,
  CheckCircle2,
  XCircle,
  Trash2,
  Edit3,
  Plus,
  Copy,
  Check,
  ShieldCheck,
  AlertCircle,
  FileText,
  Activity,
  Send,
} from 'lucide-react';

// ============================================================================
// 1. روابط الـ MockAPI الثابتة الخاصة بك (مستقلة تماماً لمنع أي خطأ 404)
// ============================================================================
const API_ENDPOINTS = {
  SERVICES: 'https://6ae3e1d7933120ae20f941f0.mockapi.io/services',
  PATIENTS: 'https://6ae3e1d7933120ae20f941f0.mockapi.io/patients',
  APPOINTMENTS: 'https://6ae4c8f828393034b08df0d3.mockapi.io/appointments',
};

// مفاتيح التخزين المحلي (كنسخة احتياطية فورية عند انقطاع الإنترنت)
const STORAGE_KEYS = {
  PATIENTS: 'smart_dental_patients_final',
  APPOINTMENTS: 'smart_dental_appointments_final',
  SERVICES: 'smart_dental_services_final',
  VISITS: 'smart_dental_visits_final',
};

// الخدمات الـ 4 الأساسية للعيادة
const DEFAULT_SERVICES = [
  {
    id: '1',
    name: 'كشف عام',
    price: 150,
    duration: '30 دقيقة',
    category: 'عام',
    description: 'فحص شامل للأسنان واللثة مع خطة علاجية متكاملة',
  },
  {
    id: '2',
    name: 'تنظيف وتلميع الأسنان',
    price: 300,
    duration: '45 دقيقة',
    category: 'تجميلي',
    description: 'إزالة الجير والتصبغات وتلميع الأسنان بالموجات فوق الصوتية',
  },
  {
    id: '3',
    name: 'حشو عصب تجميلي',
    price: 600,
    duration: '60 دقيقة',
    category: 'علاجي',
    description: 'علاج الجذور وحشو القنوات العصبية بأحدث الأجهزة الرقمية',
  },
  {
    id: '4',
    name: 'تبييض الأسنان بالليزر',
    price: 850,
    duration: '60 دقيقة',
    category: 'تجميلي',
    description: 'تبييض فوري وآمن للأسنان بالليزر في جلسة واحدة',
  },
];

// ============================================================================
// 2. دوال ذكية لتوحيد البيانات القادمة من n8n (حتى يظهر كل مريض وكل موعد 100%)
// ============================================================================
const normalizeDigits = (val) => {
  if (val === null || val === undefined) return '';
  return String(val)
    .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
};

const normalizePatientRecord = (raw, index = 0) => {
  if (!raw || typeof raw !== 'object') return null;

  const id = String(raw.id || raw._id || index + 1);
  const name =
    raw.name ||
    raw.patientName ||
    raw.fullName ||
    raw.username ||
    `مريض رقم ${id}`;

  const phone =
    normalizeDigits(
      raw.phone || raw.patientPhone || raw.mobile || raw.phoneNumber || ''
    ).replace(/\s+/g, '') || 'غير مسجل';

  const extractedAge = normalizeDigits(
    raw.age || raw.patientAge || '20'
  ).replace(/[^0-9]/g, '');
  const age = extractedAge || '20';

  const rawGender = String(raw.gender || raw.sex || 'ذكر');
  const gender =
    rawGender.includes('أنثى') ||
    rawGender.includes('انثى') ||
    rawGender.toLowerCase() === 'female'
      ? 'أنثى'
      : 'ذكر';

  const notes =
    raw.notes ||
    raw.medicalHistory ||
    raw.description ||
    raw.comment ||
    'تم التسجيل عبر بوت واتساب المتصل بـ n8n';

  const isFromAI =
    raw.action === 'create_patient' ||
    String(raw.source || '')
      .toLowerCase()
      .includes('n8n') ||
    String(raw.source || '').includes('ذكاء') ||
    String(notes).toLowerCase().includes('n8n') ||
    String(notes).includes('بوت') ||
    !raw.source;

  return {
    id,
    name: String(name).trim(),
    phone: String(phone).trim(),
    age: String(age),
    gender,
    notes: String(notes).trim(),
    source: isFromAI ? 'وكيل الذكاء الاصطناعي (n8n)' : raw.source,
    createdAt: raw.createdAt || new Date().toISOString(),
  };
};

const normalizeAppointmentRecord = (
  raw,
  index = 0,
  servicesList = DEFAULT_SERVICES
) => {
  if (!raw || typeof raw !== 'object') return null;

  const id = String(raw.id || raw._id || index + 1);
  const patientName =
    raw.patientName || raw.name || raw.fullName || `مريض رقم ${id}`;

  const phone =
    normalizeDigits(raw.phone || raw.patientPhone || raw.mobile || '').replace(
      /\s+/g,
      ''
    ) || 'غير مسجل';

  const serviceName =
    raw.serviceName || raw.service || raw.type || raw.treatment || 'كشف عام';

  const matchedService = servicesList.find(
    (s) =>
      String(s.name).trim().includes(String(serviceName).trim()) ||
      String(serviceName).trim().includes(String(s.name).trim())
  );

  const rawPrice = normalizeDigits(raw.price || raw.cost || raw.amount || '');
  const price =
    Number(rawPrice) || (matchedService ? matchedService.price : 150);

  const rawDate = normalizeDigits(raw.date || raw.appointmentDate || '');
  const date =
    rawDate && rawDate.length >= 8
      ? rawDate.slice(0, 10)
      : new Date().toISOString().split('T')[0];

  const rawTime = normalizeDigits(raw.time || raw.appointmentTime || '');
  const time = rawTime || '16:00';

  const rawStatus = String(raw.status || 'مؤكد').trim();
  let status = 'مؤكد';
  if (rawStatus.includes('ملغ') || rawStatus.toLowerCase().includes('cancel')) {
    status = 'ملغي';
  } else if (
    rawStatus.includes('مكتمل') ||
    rawStatus.toLowerCase().includes('complet')
  ) {
    status = 'مكتمل';
  } else if (
    rawStatus.includes('انتظار') ||
    rawStatus.includes('معلق') ||
    rawStatus.toLowerCase().includes('pend')
  ) {
    status = 'قيد الانتظار';
  } else {
    status = 'مؤكد';
  }

  const isFromAI =
    !raw.source ||
    String(raw.source).toLowerCase().includes('n8n') ||
    String(raw.source).includes('ذكاء') ||
    String(raw.bookingMethod || '').includes('n8n');

  return {
    id,
    patientName: String(patientName).trim(),
    phone: String(phone).trim(),
    serviceName: String(serviceName).trim(),
    price,
    date,
    time,
    status,
    source: isFromAI ? 'وكيل الذكاء الاصطناعي (n8n)' : raw.source,
    createdAt: raw.createdAt || new Date().toISOString(),
  };
};

const safeReadStorage = (key, fallback) => {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : fallback;
  } catch {
    return fallback;
  }
};

export default function App() {
  //////////////////////////////////////////////////////////////////////////

  //// --- بداية نظام تسجيل الدخول والتفريق بين الدكتور والمريض ---
  const [currentUser, setCurrentUser] = useState<any>(() => {
    const saved = localStorage.getItem('clinic_logged_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authForm, setAuthForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
  });
  const [authError, setAuthError] = useState('');

  const handleLogout = () => {
    localStorage.removeItem('clinic_logged_user');
    setCurrentUser(null);
  };

  // متغيرات نظام كود الأمان (OTP)
  const [showOtpScreen, setShowOtpScreen] = useState(false);
  const [generatedOtp, setGeneratedOtp] = useState('');
  const [userEnteredOtp, setUserEnteredOtp] = useState('');
  const [pendingPatient, setPendingPatient] = useState<any>(null);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [fullSignupData, setFullSignupData] = useState<any>(null);

  // دالة إرسال كود التحقق للإيميل
  const sendOtpEmail = async (userEmail: string, otpCode: string) => {
    try {
      setIsSendingOtp(true);
      await emailjs.send(
        'service_wzi547i', // Service ID
        'template_g3n7nsf', // Template ID
        {
          to_email: userEmail,
          otp_code: otpCode,
        },
        'hZPUVXx24iZV_-KT4' // Public Key
      );
      return true;
    } catch (error) {
      console.error('خطأ في إرسال الإيميل:', error);
      alert('حدث خطأ أثناء إرسال الكود، يرجى المحاولة مرة أخرى.');
      return false;
    } finally {
      setIsSendingOtp(false);
    }
  };

  // دالة مراجعة الكود اللي المريض كتبه
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();

    // لو الكود اللي كتبه هو نفس الكود اللي اتبعتله
    if (userEnteredOtp === generatedOtp) {
      // --- الجديد: حفظ البيانات في قاعدة البيانات (فقط لو كان حساب جديد) ---
      if (fullSignupData) {
        try {
          const SUPABASE_URL =
            import.meta.env.VITE_SUPABASE_URL ||
            import.meta.env.VITE_SUPABASE_PROJECT_URL;
          const SUPABASE_KEY =
            import.meta.env.VITE_SUPABASE_ANON_KEY ||
            import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

          // 1. الحفظ في قاعدة البيانات Supabase
          if (SUPABASE_URL && SUPABASE_KEY) {
            await fetch(`${SUPABASE_URL}/rest/v1/patient_accounts`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                apikey: SUPABASE_KEY,
                Authorization: `Bearer ${SUPABASE_KEY}`,
                Prefer: 'return=representation',
              },
              body: JSON.stringify(fullSignupData),
            });
          }

          // 2. حفظ نسخة محلية احتياطية (عشان يفضل مسجل على الجهاز)
          const registeredPatients = JSON.parse(
            localStorage.getItem('clinic_registered_patients') || '[]'
          );
          registeredPatients.push({
            id: fullSignupData.id,
            name: fullSignupData.name,
            email: fullSignupData.email,
            phone: fullSignupData.phone,
            passwordHash: fullSignupData.password_hash,
            role: 'patient',
          });
          localStorage.setItem(
            'clinic_registered_patients',
            JSON.stringify(registeredPatients)
          );
        } catch (err) {
          console.error('خطأ أثناء حفظ الحساب الجديد:', err);
        }
      }
      // -------------------------------------------------------------

      // الدخول بنجاح بعد التأكيد
      localStorage.setItem(
        'clinic_logged_user',
        JSON.stringify(pendingPatient)
      );
      setCurrentUser(pendingPatient);

      // تصفير الذاكرة وإخفاء شاشة الأرقام
      setShowOtpScreen(false);
      setUserEnteredOtp('');
      setGeneratedOtp('');
      setPendingPatient(null);
      setFullSignupData(null); // مسح الذاكرة المؤقتة بعد الحفظ
    } else {
      // لو الكود غلط
      alert(
        'الكود الذي أدخلته غير صحيح، يرجى مراجعة الإيميل والمحاولة مرة أخرى.'
      );
    }
  };

  /////////////////////////////////////////////////////////////
  // --- متغيرات بوابة المريض الاحترافية --- //

  ///////////////////////////////////////////////////
  // --- متغيرات بوابة المريض الاحترافية ---
  const [portalTab, setPortalTab] = useState<
    'home' | 'book' | 'patients' | 'appointments'
  >('home');
  const [selectedPatientForBook, setSelectedPatientForBook] = useState('');
  const [selectedServiceForBook, setSelectedServiceForBook] = useState('');
  const [selectedDoctorForBook, setSelectedDoctorForBook] =
    useState('د. طارق السعيد');
  const [selectedDateForBook, setSelectedDateForBook] = useState(
    () => new Date().toISOString().split('T')[0]
  );
  const [selectedTimeSlot, setSelectedTimeSlot] = useState('');
  const [newPatientForm, setNewPatientForm] = useState({
    name: '',
    phone: '',
    age: '',
    gender: 'ذكر',
    notes: '',
  });
  const [portalMessage, setPortalMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  /////////////////////////////////////////////////

  // دالة تشفير كلمة المرور (SHA-256) قبل حفظها في localStorage
  const hashPassword = async (password: string): Promise<string> => {
    const msgBuffer = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  };

  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
  //const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY;
  const SUPABASE_KEY =
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    import.meta.env.VITE_SUPABASE_KEY;

  // دالة مساعدة لتشغيل نظام الـ OTP قبل الدخول
  const handlePatientSuccess = async (userObj: any, userEmail: string) => {
    // 1. توليد كود من 6 أرقام
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    setGeneratedOtp(otp);
    setPendingPatient(userObj); // حفظ بيانات المريض مؤقتاً

    // 2. إرسال الإيميل وإظهار الشاشة
    const isSent = await sendOtpEmail(userEmail, otp);
    if (isSent) {
      setShowOtpScreen(true);
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');

    const secretDocEmail = import.meta.env.VITE_DOCTOR_EMAIL;
    const secretDocPass = import.meta.env.VITE_DOCTOR_PASSWORD;

    // تشفير الباسورد الذي أدخله المستخدم بـ SHA-256
    const hashedInputPassword = await hashPassword(authForm.password);
    const cleanEmail = authForm.email.trim().toLowerCase();

    //--- 1. حالة تسجيل الدخول (Login) ---
    if (authMode === 'login') {
      //  أ. هل هو الطبيب؟
      if (
        secretDocEmail &&
        secretDocPass &&
        cleanEmail === secretDocEmail.trim().toLowerCase() &&
        authForm.password === secretDocPass
      ) {
        const doctorUser = {
          id: 'DOC-ADMIN',
          name: 'د. طارق السعيد',
          email: secretDocEmail,
          role: 'doctor',
        };
        localStorage.setItem('clinic_logged_user', JSON.stringify(doctorUser));
        setCurrentUser(doctorUser);
        return;
      }

      // ب. البحث عن حساب المريض في Supabase أولاً (ليعمل من أي هاتف أو جهاز)
      if (SUPABASE_URL && SUPABASE_KEY) {
        try {
          const res = await fetch(
            `${SUPABASE_URL}/rest/v1/patient_accounts?email=eq.${encodeURIComponent(
              cleanEmail
            )}&select=*`,
            {
              headers: {
                apikey: SUPABASE_KEY,
                Authorization: `Bearer ${SUPABASE_KEY}`,
              },
            }
          );
          if (res.ok) {
            const rows = await res.json();
            const cloudPatient = rows[0];

            if (
              cloudPatient &&
              cloudPatient.password_hash === hashedInputPassword
            ) {
              //استرجاع ملفات المريض وحجوزاته المحفوظة على السحابة ووضعها في المتصفح الحالي
              const patKey = `clinic_my_patients_${
                cloudPatient.email || cloudPatient.phone
              }`;
              const aptKey = `clinic_my_apts_${
                cloudPatient.email || cloudPatient.phone
              }`;
              if (
                Array.isArray(cloudPatient.my_patients) &&
                cloudPatient.my_patients.length > 0
              ) {
                localStorage.setItem(
                  patKey,
                  JSON.stringify(cloudPatient.my_patients)
                );
              }
              if (
                Array.isArray(cloudPatient.my_appointments) &&
                cloudPatient.my_appointments.length > 0
              ) {
                localStorage.setItem(
                  aptKey,
                  JSON.stringify(cloudPatient.my_appointments)
                );
              }

              const safeSessionUser = {
                id: cloudPatient.id,
                name: cloudPatient.name,
                email: cloudPatient.email,
                phone: cloudPatient.phone,
                role: 'patient',
              };
              localStorage.setItem(
                'clinic_logged_user',
                JSON.stringify(safeSessionUser)
              );
              setCurrentUser(safeSessionUser);
              //  await handlePatientSuccess(safeSessionUser, cleanEmail);
              return;
            }
          }
        } catch (err) {
          console.error('Supabase Login Error:', err);
        }
      }

      // ج. التحقق الاحتياطي من localStorage لو الحساب قديم على نفس الجهاز
      const registeredPatients = JSON.parse(
        localStorage.getItem('clinic_registered_patients') || '[]'
      );
      const localPatient = registeredPatients.find(
        (p: any) =>
          p.email.toLowerCase() === cleanEmail &&
          (p.passwordHash === hashedInputPassword ||
            p.password === authForm.password)
      );

      if (localPatient) {
        const safeSessionUser = {
          id: localPatient.id,
          name: localPatient.name,
          email: localPatient.email,
          phone: localPatient.phone,
          role: 'patient',
        };
        // localStorage.setItem('clinic_logged_user', JSON.stringify(safeSessionUser));
        await handlePatientSuccess(safeSessionUser, cleanEmail);
        // setCurrentUser(safeSessionUser);
      } else {
        setAuthError(
          'البريد الإلكتروني أو كلمة المرور غير صحيحة. يرجى التأكد أو إنشاء حساب جديد.'
        );
      }
      return;
    }

    // --- 2. حالة إنشاء حساب جديد (Sign Up) ---
    if (authMode === 'signup') {
      if (!authForm.phone.trim()) {
        setAuthError('يرجى إدخال رقم الهاتف لربط حسابك بملفك الطبي');
        return;
      }

      const newPatientId = 'PAT-' + authForm.phone.trim();
      const newPatientName = authForm.name.trim() || 'مريض العيادة';
      const newPatientPhone = authForm.phone.trim();

      // أ. حفظ الحساب الجديد في سحابة Supabase (مع الباسورد المشفر)
      if (SUPABASE_URL && SUPABASE_KEY) {
        try {
          const checkRes = await fetch(
            `${SUPABASE_URL}/rest/v1/patient_accounts?email=eq.${encodeURIComponent(
              cleanEmail
            )}&select=email`,
            {
              headers: {
                apikey: SUPABASE_KEY,
                Authorization: `Bearer ${SUPABASE_KEY}`,
              },
            }
          );
          if (checkRes.ok) {
            const existing = await checkRes.json();
            if (existing.length > 0) {
              setAuthError(
                'هذا البريد الإلكتروني مسجل بالفعل. يرجى تسجيل الدخول.'
              );
              return;
            }
          }
          // تجهيز بيانات المريض في الذاكرة المؤقتة (بدون حفظها الآن)
          const signupPayload = {
            id: newPatientId,
            name: newPatientName,
            email: cleanEmail,
            phone: newPatientPhone,
            password_hash: hashedInputPassword,
            role: 'patient',
            my_patients: [],
            my_appointments: [],
          };
          setFullSignupData(signupPayload);
        } catch (err) {
          console.error('Supabase Signup Error:', err);
        }
      }

      const safeSessionUser = {
        id: newPatientId,
        name: newPatientName,
        email: cleanEmail,
        phone: newPatientPhone,
        role: 'patient',
      };
      // localStorage.setItem('clinic_logged_user', JSON.stringify(safeSessionUser));
      await handlePatientSuccess(safeSessionUser, cleanEmail);
      // setCurrentUser(safeSessionUser);
    }
  };

  // --- نهاية دالة تسجيل الدخول ---

  //////////////////////////////////////////////////////////////////////////////

  // التبويب النشط
  const [activeTab, setActiveTab] = useState('dashboard');

  // البيانات الأساسية (تقرأ مبدئياً من localStorage ثم تتزامن فوراً مع MockAPI كمرجع أساسي)
  const [patients, setPatients] = useState(() =>
    safeReadStorage(STORAGE_KEYS.PATIENTS, [])
  );
  const [appointments, setAppointments] = useState(() =>
    safeReadStorage(STORAGE_KEYS.APPOINTMENTS, [])
  );
  const [services, setServices] = useState(() =>
    safeReadStorage(STORAGE_KEYS.SERVICES, DEFAULT_SERVICES)
  );
  const [visits, setVisits] = useState(() =>
    safeReadStorage(STORAGE_KEYS.VISITS, [])
  );

  // حالات التحميل والاتصال
  const [isSyncing, setIsSyncing] = useState(false);
  const [patientsSynced, setPatientsSynced] = useState(false);
const [apptsSynced, setApptsSynced] = useState(false);
  const [isPushingServices, setIsPushingServices] = useState(false);
  const [apiStatus, setApiStatus] = useState({
    patientsOk: true,
    appointmentsOk: true,
    servicesOk: true,
  });
  const [toast, setToast] = useState(null);
  const [copiedText, setCopiedText] = useState('');

  // البحث والفلترة
  const [patientSearch, setPatientSearch] = useState('');
  const [appointmentFilter, setAppointmentFilter] = useState('الكل');

  // النوافذ المنبثقة (Modals)
  const [patientModal, setPatientModal] = useState({
    open: false,
    editing: null,
  });
  const [appointmentModal, setAppointmentModal] = useState({
    open: false,
    editing: null,
    prefill: null,
  });
  const [serviceModal, setServiceModal] = useState({
    open: false,
    editing: null,
  });
  const [visitModal, setVisitModal] = useState({ open: false, editing: null });

  // دالة إظهار الإشعارات
  const showNotification = useCallback((message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 3500);
  }, []);

  // حفظ تلقائي في localStorage كلما تغيرت الحالة
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.PATIENTS, JSON.stringify(patients));
    } catch {}
  }, [patients]);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEYS.APPOINTMENTS,
        JSON.stringify(appointments)
      );
    } catch {}
  }, [appointments]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.SERVICES, JSON.stringify(services));
    } catch {}
  }, [services]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.VISITS, JSON.stringify(visits));
    } catch {}
  }, [visits]);

  // ============================================================================
  // 3. المزامنة الحقيقية مع MockAPI (إذا كان الـ API = 0 يصبح 0، وإذا فيه 3 يظهر 3)
  // ============================================================================
  const syncAllFromAPI = useCallback(
    async (showMsg = true) => {
      if (showMsg) setIsSyncing(true);

      let currentServices = services;

      // أ) جلب الخدمات من الرابط المستقل فقط
      try {
        const resSrv = await fetch(API_ENDPOINTS.SERVICES, {
          cache: 'no-store',
        });
        if (resSrv.ok) {
          const srvData = await resSrv.json();
          if (Array.isArray(srvData)) {
            setApiStatus((prev) => ({ ...prev, servicesOk: true }));
            if (srvData.length > 0) {
              const normalizedSrv = srvData.map((s, idx) => ({
                id: String(s.id || idx + 1),
                name: s.name || s.serviceName || 'خدمة طبية',
                price: Number(normalizeDigits(s.price || 150)) || 150,
                duration: s.duration || '30 دقيقة',
                category: s.category || 'عام',
                description:
                  s.description || 'خدمة طبية متكاملة بعيادة الأسنان',
              }));
              currentServices = normalizedSrv;
              setServices(normalizedSrv);
            }
          }
        } else if (resSrv.status === 404) {
          setApiStatus((prev) => ({ ...prev, servicesOk: false }));
        }
      } catch {
        // في حال انقطاع الإنترنت نحتفظ بما في الذاكرة
      }

      // ب) جلب المرضى من الرابط المستقل (بدون /services/1/patients نهائياً)
      try {
        await new Promise((r) => setTimeout(r, 1500));
        const resPat = await fetch(API_ENDPOINTS.PATIENTS, {
          cache: 'no-store',
        });
        if (resPat.ok) {
          const patData = await resPat.json();
          if (Array.isArray(patData)) {
            setApiStatus((prev) => ({ ...prev, patientsOk: true }));
            setPatientsSynced(true);
            // هنا الـ API هو المصدر الحقيقي: لو 0 يعرض 0، ولو 3 يعرض الـ 3 كاملين!
            const normalizedPat = patData
              .map((item, idx) => normalizePatientRecord(item, idx))
              .filter(Boolean);
            setPatients(normalizedPat);
            localStorage.setItem(
              STORAGE_KEYS.PATIENTS,
              JSON.stringify(normalizedPat)
            );
          }
        } else if (resPat.status === 404) {
          setApiStatus((prev) => ({ ...prev, patientsOk: false }));
        }
      } catch {
        // في حال خطأ الشبكة نحتفظ بالنسخة المحلية
      }

      // ج) جلب المواعيد من الرابط المستقل
      try {
        const resApp = await fetch(API_ENDPOINTS.APPOINTMENTS, {
          cache: 'no-store',
        });
        if (resApp.ok) {
          const appData = await resApp.json();
          if (Array.isArray(appData)) {
            setApiStatus((prev) => ({ ...prev, appointmentsOk: true }));
            setApptsSynced(true);
            const normalizedApp = appData
              .map((item, idx) =>
                normalizeAppointmentRecord(item, idx, currentServices)
              )
              .filter(Boolean);
            setAppointments(normalizedApp);
            localStorage.setItem(
              STORAGE_KEYS.APPOINTMENTS,
              JSON.stringify(normalizedApp)
            );

            // تحديث الزيارات تلقائياً لأي موعد حالته "مكتمل"
            const completedApps = normalizedApp.filter(
              (a) => a.status === 'مكتمل'
            );
            if (completedApps.length > 0) {
              setVisits((prevVisits) => {
                const visitMap = new Map(
                  prevVisits.map((v) => [String(v.id), v])
                );
                completedApps.forEach((ca) => {
                  const vId = `app_${ca.id}`;
                  if (!visitMap.has(vId)) {
                    visitMap.set(vId, {
                      id: vId,
                      patientName: ca.patientName,
                      phone: ca.phone,
                      serviceName: ca.serviceName,
                      date: ca.date,
                      paidAmount: ca.price || 150,
                      notes: 'زيارة مكتملة مسجلة من جدول المواعيد',
                    });
                  }
                });
                return Array.from(visitMap.values());
              });
            } else if (normalizedApp.length === 0) {
              // إذا تم تصفير المواعيد في الـ API، نصفر الزيارات المرتبطة بها
              setVisits((prevVisits) =>
                prevVisits.filter((v) => !String(v.id).startsWith('app_'))
              );
            }
          }
        } else if (resApp.status === 404) {
          setApiStatus((prev) => ({ ...prev, appointmentsOk: false }));
        }
      } catch {
        // في حال خطأ الشبكة نحتفظ بالنسخة المحلية
      }

      if (showMsg) {
        setIsSyncing(false);
        showNotification('تمت المزامنة الكاملة مع MockAPI بنجاح!');
      }
    },
    [showNotification]
  );

  // جلب البيانات تلقائياً عند فتح الصفحة (Reload) وكل 12 ثانية لالتقاط أي حجز جديد من بوت n8n
  useEffect(() => {
    syncAllFromAPI(false);
    const timer = setInterval(() => syncAllFromAPI(false), 15000);
    const onFocus = () => {
      if (document.visibilityState === 'visible') syncAllFromAPI(false);
    };
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  // ============================================================================
  // 4. إرسال الخدمات الـ 4 إلى MockAPI بنقرة زر
  // ============================================================================
  const handlePushServicesToAPI = async () => {
    setIsPushingServices(true);
    try {
      const checkRes = await fetch(API_ENDPOINTS.SERVICES, {
        cache: 'no-store',
      });
      if (checkRes.status === 404) {
        showNotification(
          'تنبيه: جدول services غير موجود في MockAPI، تأكد من إنشائه باسم services',
          'error'
        );
        setIsPushingServices(false);
        return;
      }

      const existing = checkRes.ok ? await checkRes.json() : [];
      if (Array.isArray(existing) && existing.length === 0) {
        const uploaded = [];
        for (const srv of services) {
          const postRes = await fetch(API_ENDPOINTS.SERVICES, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: srv.name,
              price: Number(srv.price),
              duration: srv.duration,
              category: srv.category,
              description: srv.description,
            }),
          });
          if (postRes.ok) {
            const created = await postRes.json();
            uploaded.push(created);
          }
        }
        if (uploaded.length > 0) {
          setServices(uploaded);
        }
        showNotification(
          `تم إرسال ${services.length} خدمات إلى MockAPI بنجاح!`
        );
      } else {
        showNotification(
          `الخدمات موجودة ومرفوعة بالفعل في MockAPI (${existing.length} خدمات)!`
        );
      }
    } catch {
      showNotification(
        'تعذر الاتصال بـ MockAPI حالياً، الخدمات محفوظة محلياً.',
        'error'
      );
    } finally {
      setIsPushingServices(false);
    }
  };

  // ============================================================================
  // 5. إدارة المرضى (إضافة / تعديل / حذف مباشر في MockAPI + الذاكرة معاً)
  // ============================================================================
  const handleSavePatient = async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);

    const payload = {
      name: form.get('name').trim(),
      phone: normalizeDigits(form.get('phone').trim()),
      age: normalizeDigits(form.get('age').trim()),
      gender: form.get('gender'),
      notes: form.get('notes').trim() || 'تم التسجيل من الاستقبال',
      source: form.get('source') || 'يدوي - الاستقبال',
      createdAt: new Date().toISOString(),
    };

    if (patientModal.editing) {
      const targetId = String(patientModal.editing.id);
      const optimisticPatient = {
        ...patientModal.editing,
        ...payload,
        id: targetId,
      };

      setPatients((prev) =>
        prev.map((p) => (String(p.id) === targetId ? optimisticPatient : p))
      );
      setPatientModal({ open: false, editing: null });

      try {
        const res = await fetch(`${API_ENDPOINTS.PATIENTS}/${targetId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(optimisticPatient),
        });
        if (res.ok) {
          const saved = await res.json();
          const norm = normalizePatientRecord(saved);
          setPatients((prev) =>
            prev.map((p) => (String(p.id) === targetId ? norm : p))
          );
        }
        showNotification('تم تعديل بيانات المريض وحفظها في الـ API بنجاح!');
      } catch {
        showNotification('تم حفظ التعديل محلياً.', 'info');
      }
    } else {
      setPatientModal({ open: false, editing: null });
      try {
        const res = await fetch(API_ENDPOINTS.PATIENTS, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const created = await res.json();
          const norm = normalizePatientRecord(created);
          setPatients((prev) => [...prev, norm]);
          showNotification('تم تسجيل المريض الجديد في الـ API بنجاح!');
        } else {
          const fallbackPat = normalizePatientRecord({
            ...payload,
            id: String(Date.now()),
          });
          setPatients((prev) => [...prev, fallbackPat]);
          showNotification(
            'تمت إضافة المريض محلياً (تحقق من جدول patients في MockAPI).',
            'info'
          );
        }
      } catch {
        const fallbackPat = normalizePatientRecord({
          ...payload,
          id: String(Date.now()),
        });
        setPatients((prev) => [...prev, fallbackPat]);
        showNotification('تمت إضافة المريض محلياً.', 'info');
      }
    }
  };

  // const handleDeletePatient = async (id) => {
  // const strId = String(id);
  // setPatients((prev) => prev.filter((p) => String(p.id) !== strId));
  // try {
  //  await fetch(`${API_ENDPOINTS.PATIENTS}/${strId}`, { method: 'DELETE' });
  //  showNotification('تم حذف ملف المريض نهائياً من التطبيق ومن MockAPI!');
  // } catch {
  //  showNotification('تم حذف المريض.', 'info');
  // }
  //};

  const handleDeletePatient = async (id: any) => {
    const strId = String(id);

    // 1. البحث عن المريض بالـ ID لمعرفة رقم تليفونه
    const patientToDelete = patients.find((p: any) => String(p.id) === strId);
    if (!patientToDelete) return;

    // 2. مسح المريض من الشاشة فوراً
    setPatients((prev: any) => prev.filter((p: any) => String(p.id) !== strId));

    try {
      // 3. مسح المريض من الـ API
      await fetch(`${API_ENDPOINTS.PATIENTS}/${strId}`, { method: 'DELETE' });

      const cleanP = (n: any) => normalizeDigits(n).replace(/\D/g, '');
      const phoneShared = patients.some((p: any) => String(p.id) !== strId && cleanP(p.phone) === cleanP(patientToDelete.phone));
      const isHis = (apt: any) =>
        String(apt.patientName || '').trim().toLowerCase() === String(patientToDelete.name || '').trim().toLowerCase() ||
        (!phoneShared && cleanP(apt.phone) && cleanP(apt.phone) === cleanP(patientToDelete.phone));

      // 4. الحذف المتسلسل للمواعيد: (البحث برقم التليفون فقط)
      const aptsToDelete = appointments.filter(
        //(apt: any) => apt.phone === patientToDelete.phone
        (apt: any) => isHis(apt)
      );

      // مسح مواعيده من الشاشة (باستثناء اللي تليفونهم مش مطابق)
      setAppointments((prev: any) =>
        prev.filter((apt: any) => !isHis(apt))
      );

      // مسح مواعيده من الـ API
      for (const apt of aptsToDelete) {
        const cleanAptId = String(apt.id).replace(/\D/g, '');
        if (cleanAptId) {
          await fetch(
            `https://6ae4c8f828393034b08df0d3.mockapi.io/appointments/${cleanAptId}`,
            {
              method: 'DELETE',
            }
          );
        }
      }

      showNotification('تم الحذف بنجاح!');
    } catch (error) {
      console.error(error);
      showNotification('حدث خطأ أثناء الاتصال بقاعدة البيانات');
    }
  };

  // ============================================================================
  // 6. إدارة المواعيد (إضافة / تعديل / تغيير حالة / حذف مباشر في MockAPI)
  // ============================================================================
  const handleSaveAppointment = async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    const srvName = form.get('serviceName');
    const foundService = services.find((s) => s.name === srvName);

    const payload = {
      patientName: form.get('patientName').trim(),
      phone: normalizeDigits(form.get('phone').trim()),
      serviceName: srvName,
      price: foundService
        ? foundService.price
        : Number(normalizeDigits(form.get('price') || 150)),
      date: normalizeDigits(form.get('date')),
      time: normalizeDigits(form.get('time')),
      status: form.get('status') || 'مؤكد',
      source: form.get('source') || 'يدوي - الاستقبال',
      createdAt: new Date().toISOString(),
    };

    if (appointmentModal.editing) {
      const targetId = String(appointmentModal.editing.id);
      const updatedObj = {
        ...appointmentModal.editing,
        ...payload,
        id: targetId,
      };

      setAppointments((prev) =>
        prev.map((a) => (String(a.id) === targetId ? updatedObj : a))
      );
      setAppointmentModal({ open: false, editing: null, prefill: null });

      try {
        const res = await fetch(`${API_ENDPOINTS.APPOINTMENTS}/${targetId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedObj),
        });
        if (res.ok) {
          const saved = await res.json();
          const norm = normalizeAppointmentRecord(saved, 0, services);
          setAppointments((prev) =>
            prev.map((a) => (String(a.id) === targetId ? norm : a))
          );
        }
        showNotification('تم تعديل الموعد وحفظه في الـ API بنجاح!');
      } catch {
        showNotification('تم تعديل الموعد.', 'info');
      }
    } else {
      setAppointmentModal({ open: false, editing: null, prefill: null });
      try {
        const res = await fetch(API_ENDPOINTS.APPOINTMENTS, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const created = await res.json();
          const norm = normalizeAppointmentRecord(created, 0, services);
          setAppointments((prev) => [...prev, norm]);
          showNotification('تم حجز الموعد وحفظه في MockAPI بنجاح!');
        } else {
          const fallbackApp = normalizeAppointmentRecord(
            { ...payload, id: String(Date.now()) },
            0,
            services
          );
          setAppointments((prev) => [...prev, fallbackApp]);
          showNotification('تم حجز الموعد محلياً.', 'info');
        }
      } catch {
        const fallbackApp = normalizeAppointmentRecord(
          { ...payload, id: String(Date.now()) },
          0,
          services
        );
        setAppointments((prev) => [...prev, fallbackApp]);
        showNotification('تم حجز الموعد محلياً.', 'info');
      }
    }
  };

  const handleStatusUpdate = async (app, newStatus) => {
    const targetId = String(app.id);
    const updatedApp = { ...app, status: newStatus };

    setAppointments((prev) =>
      prev.map((a) => (String(a.id) === targetId ? updatedApp : a))
    );

    if (newStatus === 'مكتمل') {
      const visitId = `app_${targetId}`;
      setVisits((prev) => {
        const exists = prev.some((v) => String(v.id) === visitId);
        if (exists) return prev;
        return [
          {
            id: visitId,
            patientName: app.patientName,
            phone: app.phone,
            serviceName: app.serviceName,
            date: app.date,
            paidAmount: app.price || 150,
            notes: 'تم إكمال الموعد وتحويله تلقائياً لقسم الزيارات والمتابعة',
          },
          ...prev,
        ];
      });
      sendFeedbackWebhook(app);
    }

    try {
      await fetch(`${API_ENDPOINTS.APPOINTMENTS}/${targetId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedApp),
      });
      showNotification(`تم تحديث حالة الحجز إلى "${newStatus}" في MockAPI!`);
    } catch {
      showNotification(`تم تغيير الحالة إلى "${newStatus}".`);
    }
  };

  const handleDeleteAppointment = async (id) => {
    const strId = String(id);
    setAppointments((prev) => prev.filter((a) => String(a.id) !== strId));
    setVisits((prev) => prev.filter((v) => String(v.id) !== `app_${strId}`));

    try {
      await fetch(`${API_ENDPOINTS.APPOINTMENTS}/${strId}`, {
        method: 'DELETE',
      });
      showNotification('تم حذف الموعد نهائياً من التطبيق ومن MockAPI!');
    } catch {
      showNotification('تم حذف الموعد.', 'info');
    }
  };

  // ============================================================================
  // 7. إدارة الزيارات والخدمات
  // ============================================================================
  const handleSaveVisit = (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    const payload = {
      patientName: form.get('patientName').trim(),
      phone: normalizeDigits(form.get('phone').trim()),
      serviceName: form.get('serviceName'),
      date: normalizeDigits(form.get('date')),
      paidAmount: Number(normalizeDigits(form.get('paidAmount'))) || 150,
      notes: form.get('notes').trim() || 'زيارة علاجية مكتملة',
    };

    if (visitModal.editing) {
      const targetId = String(visitModal.editing.id);
      setVisits((prev) =>
        prev.map((v) => (String(v.id) === targetId ? { ...v, ...payload } : v))
      );
      showNotification('تم تعديل سجل الزيارة بنجاح!');
    } else {
      setVisits((prev) => [{ id: String(Date.now()), ...payload }, ...prev]);
      showNotification('تمت إضافة الزيارة الطبية بنجاح!');
    }
    setVisitModal({ open: false, editing: null });
  };

  // const handleDeleteVisit = (id) => {
  // setVisits((prev) => prev.filter((v) => String(v.id) !== String(id)));
  //  showNotification('تم حذف سجل الزيارة.');
  // };

  const handleDeleteVisit = async (id: any) => {
    // 1. تنظيف الـ ID: استخراج الرقم الصافي فقط (عشان MockAPI يفهمه)
    const cleanId = String(id).replace(/\D/g, '');

    // 2. مسح الزيارة من الشاشة ومن LocalStorage فوراً عشان مترجعش مع الـ Reload
    setVisits((prev: any) => {
      const updatedVisits = prev.filter(
        (v: any) => String(v.id) !== String(id)
      );
      localStorage.setItem(STORAGE_KEYS.VISITS, JSON.stringify(updatedVisits));
      return updatedVisits;
    });

    // 3. إرسال أمر الحذف للـ API بالرقم الصافي
    try {
      if (cleanId) {
        await fetch(
          `https://6ae4c8f828393034b08df0d3.mockapi.io/appointments/${cleanId}`,
          {
            method: 'DELETE',
          }
        );
      }
      showNotification('تم حذف سجل الزيارة نهائياً بنجاح');
    } catch (error) {
      console.error('Error deleting from API:', error);
    }
  };

  const handleSaveService = async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    const payload = {
      name: form.get('name').trim(),
      price: Number(normalizeDigits(form.get('price'))) || 150,
      duration: form.get('duration').trim() || '30 دقيقة',
      category: form.get('category') || 'عام',
      description: form.get('description').trim() || 'خدمة طبية متميزة',
    };

    if (serviceModal.editing) {
      const targetId = String(serviceModal.editing.id);
      const updated = { ...serviceModal.editing, ...payload, id: targetId };
      setServices((prev) =>
        prev.map((s) => (String(s.id) === targetId ? updated : s))
      );
      setServiceModal({ open: false, editing: null });
      try {
        await fetch(`${API_ENDPOINTS.SERVICES}/${targetId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updated),
        });
      } catch {}
      showNotification('تم تحديث الخدمة في النظام و MockAPI!');
    } else {
      setServiceModal({ open: false, editing: null });
      try {
        const res = await fetch(API_ENDPOINTS.SERVICES, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const created = await res.json();
          setServices((prev) => [
            ...prev,
            { ...payload, id: String(created.id) },
          ]);
        } else {
          setServices((prev) => [
            ...prev,
            { ...payload, id: String(Date.now()) },
          ]);
        }
      } catch {
        setServices((prev) => [
          ...prev,
          { ...payload, id: String(Date.now()) },
        ]);
      }
      showNotification('تمت إضافة الخدمة الجديدة بنجاح!');
    }
  };

  const handleDeleteService = async (id) => {
    const strId = String(id);
    setServices((prev) => prev.filter((s) => String(s.id) !== strId));
    try {
      await fetch(`${API_ENDPOINTS.SERVICES}/${strId}`, { method: 'DELETE' });
    } catch {}
    showNotification('تم حذف الخدمة بنجاح.');
  };

  // نسخ الروابط
  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    showNotification('تم نسخ الرابط بنجاح!');
    setTimeout(() => setCopiedText(''), 2000);
  };

  // ============================================================================
  // 8. الإحصائيات والفلاتر الذكية
  // ============================================================================
  const filteredPatients = useMemo(() => {
    const q = patientSearch.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter(
      (p) =>
        String(p.name).toLowerCase().includes(q) ||
        String(p.phone).toLowerCase().includes(q) ||
        String(p.notes).toLowerCase().includes(q)
    );
  }, [patients, patientSearch]);

  // const filteredAppointments = useMemo(() => {
  //if (appointmentFilter === 'الكل') return appointments;
  // return appointments.filter((a) => a.status === appointmentFilter);
  //}, [appointments, appointmentFilter]);
  const filteredAppointments = useMemo(() => {
    const activeAppointments = appointments.filter(
      (a: any) => a.status !== 'مكتمل'
    );
    if (appointmentFilter === 'الكل') return activeAppointments;
    return activeAppointments.filter(
      (a: any) => a.status === appointmentFilter
    );
  }, [appointments, appointmentFilter]);

  const dashboardStats = useMemo(() => {
    const confirmed = appointments.filter((a) => a.status === 'مؤكد').length;
    const pending = appointments.filter(
      (a) => a.status === 'قيد الانتظار'
    ).length;
    const todayStr = new Date().toISOString().split('T')[0];
    const todayCount = appointments.filter((a) => a.date === todayStr).length;

    const aiPatients = patients.filter(
      (p) =>
        String(p.source).includes('n8n') || String(p.source).includes('ذكاء')
    ).length;
    const aiAppointments = appointments.filter(
      (a) =>
        String(a.source).includes('n8n') || String(a.source).includes('ذكاء')
    ).length;

    const totalRevenue = visits.reduce(
      (sum, v) => sum + (Number(v.paidAmount) || 0),
      0
    );

    return {
      confirmed,
      pending,
      todayCount,
      aiTotal: aiPatients + aiAppointments,
      aiAppointments,
      totalRevenue,
    };
  }, [patients, appointments, visits]);

  // تحديد عنوان الرابط المعروض في البانر العلوي حسب التبويب
  const currentBannerInfo = useMemo(() => {
    if (activeTab === 'patients') {
      return {
        title: 'ملفات المرضى',
        badge: `متصل بـ MockAPI (${patients.length} ملفات مرضى)`,
        url: API_ENDPOINTS.PATIENTS,
        syncBtnText: 'تحديث المرضى من الـ API الآن',
      };
    }
    if (activeTab === 'appointments') {
      return {
        title: 'حجز المواعيد',
        badge: 'متصل بـ MockAPI (جلب وحجز المواعيد لـ n8n)',
        url: API_ENDPOINTS.APPOINTMENTS,
        syncBtnText: 'تحديث المواعيد من الـ API الآن',
      };
    }
    if (activeTab === 'visits') {
      return {
        title: 'الزيارات والمتابعة',
        badge: `متصل بـ MockAPI (${visits.length} زيارات مسجلة)`,
        url: API_ENDPOINTS.APPOINTMENTS,
        syncBtnText: 'تحديث الزيارات من الـ API الآن',
      };
    }
    if (activeTab === 'services') {
      return {
        title: 'الخدمات والأسعار',
        badge: `متصل بـ MockAPI (${services.length} خدمات جاهزة لـ n8n)`,
        url: API_ENDPOINTS.SERVICES,
        syncBtnText: 'تحديث الخدمات من الـ API الآن',
      };
    }
    if (activeTab === 'n8n') {
      return {
        title: 'الربط الذكي (n8n & AI)',
        badge: 'متصل بـ MockAPI و Webhook نشط',
        url: API_ENDPOINTS.PATIENTS,
        syncBtnText: 'تحديث البيانات من الـ API الآن',
      };
    }
    return {
      title: 'لوحة التحكم',
      badge: `متصل بـ MockAPI (${services.length} خدمات جاهزة لـ n8n)`,
      url: API_ENDPOINTS.SERVICES,
      syncBtnText: 'تحديث المرضى من الـ API الآن',
    };
  }, [activeTab, patients.length, visits.length, services.length]);

  //////////////////////////////////////////////////////
  // 1. لو مفيش حد مسجل دخول -> اعرض شاشة Login / Sign Up
  if (!currentUser) {
    // --- شاشة إدخال كود التحقق (OTP) ---
    // --- شاشة إدخال كود التحقق (OTP) ---
    if (showOtpScreen) {
      return (
        <div
          className="min-h-screen bg-slate-900 flex items-center justify-center p-4"
          dir="rtl"
        >
          <div className="max-w-md w-full bg-slate-800 rounded-2xl p-8 border border-slate-700 shadow-2xl relative overflow-hidden">
            {/* تأثير الإضاءة في الخلفية */}
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-sky-500 to-indigo-500"></div>

            <div className="text-center mb-8">
              <div className="bg-sky-500/10 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 border border-sky-500/20">
                <ShieldCheck className="w-10 h-10 text-sky-400" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">
                كود الأمان (OTP)
              </h2>
              <p className="text-sm text-slate-400">
                تم إرسال كود من 6 أرقام إلى بريدك الإلكتروني.
                <br /> يرجى إدخاله هنا لإتمام تسجيل الدخول.
              </p>
              <div className="mt-3 p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                <p className="text-xs text-amber-400">
                  ⚠️ تنبيه: يرجى التحقق من مجلد الرسائل المزعجة (Spam) إذا لم
                  تجد الكود في البريد الوارد.
                </p>
              </div>
            </div>

            <form onSubmit={handleVerifyOtp} className="space-y-5">
              <div>
                <input
                  type="text"
                  maxLength={6}
                  placeholder="أدخل الـ 6 أرقام"
                  className="w-full text-center tracking-[0.5em] text-3xl font-bold px-4 py-4 rounded-xl bg-slate-900 border border-slate-600 text-white focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all placeholder:text-slate-600 placeholder:text-lg placeholder:tracking-normal placeholder:font-normal"
                  value={userEnteredOtp}
                  onChange={(e) =>
                    setUserEnteredOtp(e.target.value.replace(/\D/g, ''))
                  } // السماح بالأرقام فقط
                  required
                />
              </div>

              <button
                type="submit"
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-500 hover:from-sky-400 hover:to-indigo-400 text-white font-semibold shadow-lg shadow-sky-500/25 transition-all flex items-center justify-center gap-2"
              >
                تأكيد الدخول
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowOtpScreen(false);
                  setIsSendingOtp(false);
                }}
                className="w-full py-3 rounded-xl bg-transparent border-2 border-slate-700 hover:bg-slate-800 text-slate-300 font-semibold transition-all"
              >
                الرجوع وتعديل البيانات
              </button>
            </form>
          </div>
        </div>
      );
    }

    return (
      <div
        dir="rtl"
        className="min-h-screen bg-slate-950 flex items-center justify-center p-4 font-sans text-white"
      >
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl">
          <div className="text-center mb-6">
            <div className="w-14 h-14 bg-teal-500/20 text-teal-400 rounded-2xl flex items-center justify-center mx-auto mb-3 border border-teal-500/30">
              <Stethoscope className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold text-white">
              عيادة الابتسامة الذكية
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              تسجيل الدخول للمرضى والأطباء
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-800 rounded-xl mb-6">
            <button
              type="button"
              onClick={() => {
                setAuthMode('login');
                setAuthError('');
              }}
              className={`py-2.5 rounded-lg text-sm font-bold transition ${
                authMode === 'login'
                  ? 'bg-teal-500 text-slate-950'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              تسجيل دخول (Login)
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMode('signup');
                setAuthError('');
              }}
              className={`py-2.5 rounded-lg text-sm font-bold transition ${
                authMode === 'signup'
                  ? 'bg-teal-500 text-slate-950'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              حساب جديد (Sign Up)
            </button>
          </div>

          {authError && (
            <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
              {authError}
            </div>
          )}

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            {authMode === 'signup' && (
              <div>
                <label className="block text-xs text-slate-300 mb-1">
                  اسم{' '}
                </label>
                <input
                  type="text"
                  required
                  placeholder="name"
                  value={authForm.name}
                  onChange={(e) =>
                    setAuthForm({ ...authForm, name: e.target.value })
                  }
                  className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm"
                />
              </div>
            )}

            <div>
              <label className="block text-xs text-slate-300 mb-1">
                البريد الإلكتروني
              </label>
              <input
                type="email"
                required
                placeholder="email"
                value={authForm.email}
                onChange={(e) =>
                  setAuthForm({ ...authForm, email: e.target.value })
                }
                className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm"
              />
            </div>
            {authMode === 'signup' && (
              <div>
                <label className="block text-xs text-slate-300 mb-1">
                  رقم الهاتف (للمريض لربط ملفه)
                </label>
                <input
                  type="tel"
                  placeholder="phone"
                  value={authForm.phone}
                  onChange={(e) =>
                    setAuthForm({ ...authForm, phone: e.target.value })
                  }
                  className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700"
                />
              </div>
            )}

            <div>
              <label className="block text-xs text-slate-300 mb-1">
                كلمة المرور
              </label>
              <input
                type="password"
                required
                placeholder="password"
                value={authForm.password}
                onChange={(e) =>
                  setAuthForm({ ...authForm, password: e.target.value })
                }
                className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-sm transition"
            >
              {authMode === 'login' ? 'دخول للنظام' : 'إنشاء حساب'}
            </button>
          </form>

          {/* أزرار سريعة للتجربة بضغطة واحدة */}
        </div>
      </div>
    );
  }

  // 2. لو اللي مسجل دخول هو "مريض" (role === 'patient') -> يفتح له Patient Portal خاص بيه فقط
  // 2. بوابة المريض الاحترافية (Professional Patient Portal)
  if (currentUser.role === 'patient') {
    const CLINIC_TIME_SLOTS = [
      '10:00 ص',
      '10:30 ص',
      '11:00 ص',
      '11:30 ص',
      '12:00 م',
      '12:30 م',
      '01:00 م',
      '01:30 م',
      '04:00 م',
      '04:30 م',
      '05:00 م',
      '05:30 م',
      '06:00 م',
      '06:30 م',
      '07:00 م',
      '07:30 م',
      '08:00 م',
      '08:30 م',
      '09:00 م',
    ];

    // فحص هل المريض حضر العيادة وتم تسجيل زيارته في قسم "الزيارات والمتابعة" لدى الدكتور؟
    const isAppointmentCompletedInVisits = (apt: any) => {
      if (apt.status === 'مكتمل' || apt.status === 'Completed') return true;
      return visits.some(
        (v: any) =>
          (v.patientName?.trim() === apt.patientName?.trim() ||
            v.patientId === apt.patientId) &&
          (!v.date || !apt.date || v.date >= apt.date)
      );
    };

    // فحص هل المريض لديه حجز نشط لم يكتمل بعد؟
    const hasActiveUncompletedBooking = (patientName: string) => {
      if (!patientName) return false;
      return appointments.some(
        (apt: any) =>
          apt.patientName?.trim().toLowerCase() ===
            patientName.trim().toLowerCase() &&
          (apt.status === 'قيد الانتظار' || apt.status === 'مؤكد')
      );
    };

    // 1. استرجاع ودمج ملفات المرضى الخاصة بحساب العميل (ثابتة ضد الـ Reload وبدون Hooks)
    const storagePatientsKey = `clinic_my_patients_${
      currentUser.email || currentUser.phone
    }`;
    const savedPortalPatients = JSON.parse(
      localStorage.getItem(storagePatientsKey) || '[]'
    );
    const myRegisteredPatients = [
      ...savedPortalPatients,
      ...patients.filter((p: any) => {
        // 1. تأمين الإيميل ورقم التليفون عشان لو العميل مسجل بواحد فيهم بس الكود ميضربش
        const userEmail = currentUser?.email
          ? String(currentUser.email).trim().toLowerCase()
          : null;
        const userPhone = currentUser?.phone
          ? String(currentUser.phone).trim()
          : null;

        // 2. مطابقة بيانات MockAPI مع العميل الحالي
        const matchEmail = userEmail
          ? String(p.createdByAccount).trim().toLowerCase() === userEmail ||
            String(p.notes).toLowerCase().includes(userEmail)
          : false;
        const matchPhone = userPhone
          ? String(p.phone).trim() === userPhone
          : false;

        // 3. لغينا فحص الـ (id) عشان نمنع تصادم MockAPI مع الـ LocalStorage واعتمدنا على الاسم
        const isDuplicate = savedPortalPatients.some(
          (sp: any) => sp.name === p.name
        );

        return (matchEmail || matchPhone) && !isDuplicate;
      }),
    ].reverse();

    const myPatientNames = new Set([
      currentUser.name?.trim().toLowerCase(),
      ...myRegisteredPatients.map((p: any) => p.name?.trim().toLowerCase()),
    ]);

    // 2. استرجاع ودمج حجوزات العميل (ثابتة ضد الـ Reload وبدون Hooks)
    const storageAptsKey = `clinic_my_apts_${
      currentUser.email || currentUser.phone
    }`;
    const savedPortalApts = JSON.parse(
      localStorage.getItem(storageAptsKey) || '[]'
    );
    const myAppointments = [
      ...savedPortalApts,
      ...appointments.filter((apt: any) => {
        // 1. تأمين بيانات العميل الحالي
        const userEmail = currentUser?.email
          ? String(currentUser.email).trim().toLowerCase()
          : null;
        const userPhone = currentUser?.phone
          ? String(currentUser.phone).trim()
          : null;

        // 2. مطابقة الموعد مع العميل (بالإيميل في خانتين، أو برقم التليفون)
        const matchEmail = userEmail
          ? String(apt.createdByAccount).trim().toLowerCase() === userEmail ||
            String(apt.notes).toLowerCase().includes(userEmail)
          : false;

        const matchPhone = userPhone
          ? String(apt.phone).trim() === userPhone
          : false;

        // 3. الاحتفاظ بالفلتر القديم (عشان لو الموعد متسجل باسم مريض من عيلة العميل)
        const matchName = myPatientNames.has(
          apt.patientName?.trim().toLowerCase()
        );

        // 4. منع التكرار
        const isDuplicate = savedPortalApts.some((sa: any) => sa.id === apt.id);

        return (matchEmail || matchPhone || matchName) && !isDuplicate;
      }),
    ].reverse(); // الـ reverse هنا عشان الموعد الجديد يظهر أول واحد فوق

    //////////////////////
    // 1. دالة تسجيل ملف مريض جديد من بوابة العميل + حفظه في الـ API الخاص بالدكتور
    const handleAddPatientFromPortal = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newPatientForm.name.trim() || !newPatientForm.phone.trim()) {
        setPortalMessage({
          type: 'error',
          text: 'يرجى إدخال اسم المريض ورقم الهاتف!',
        });
        return;
      }

      const exists = patients.some(
        (p: any) =>
          p.name?.trim().toLowerCase() ===
          newPatientForm.name.trim().toLowerCase()
      );
      if (exists) {
        setPortalMessage({
          type: 'error',
          text: 'هذا الاسم مسجل بالفعل في ملفات المرضى، يمكنك الحجز له مباشرة.',
        });
        return;
      }

      const newPatPayload = {
        id: 'PAT-' + Date.now().toString().slice(-5),
        name: newPatientForm.name.trim(),
        phone: newPatientForm.phone.trim(),
        age: Number(newPatientForm.age) || 25,
        gender: newPatientForm.gender,
        notes: newPatientForm.notes.trim() || 'تم التسجيل من بوابة المريض',
        createdByAccount: currentUser.email,
        createdAt: new Date().toISOString().split('T')[0],
      };

      try {
        // إرسال المريض الجديد مباشرة إلى الـ API الخاص بصفحة الدكتور
        let savedPat = newPatPayload;
        if (typeof API_ENDPOINTS !== 'undefined' && API_ENDPOINTS.PATIENTS) {
          const res = await fetch(API_ENDPOINTS.PATIENTS, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newPatPayload),
          });
          if (res.ok) {
            savedPat = await res.json();
          }
        }

        const updatedPatients = [savedPat, ...patients];
        setPatients(updatedPatients);

        localStorage.setItem(
          storagePatientsKey,
          JSON.stringify([savedPat, ...myRegisteredPatients])
        );

        localStorage.setItem(
          STORAGE_KEYS.PATIENTS,
          JSON.stringify(updatedPatients)
        );

        ////////////////////

        if (SUPABASE_URL && SUPABASE_KEY) {
          fetch(
            `${SUPABASE_URL}/rest/v1/patient_accounts?email=eq.${encodeURIComponent(
              currentUser.email.toLowerCase()
            )}`,
            {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                apikey: SUPABASE_KEY,
                Authorization: `Bearer ${SUPABASE_KEY}`,
              },
              // body: JSON.stringify({ my_appointments: [savedApt, ...myAppointments] }),
              body: JSON.stringify({
                my_patients: [savedPat, ...myRegisteredPatients],
              }),
            }
          ).catch(() => {});
        }

        ///////////////////////
        setSelectedPatientForBook(savedPat.name);
        setNewPatientForm({
          name: '',
          phone: '',
          age: '',
          gender: 'ذكر',
          notes: '',
        });
        setPortalMessage({
          type: 'success',
          text: `تم فتح ملف طبي للمريض "${savedPat.name}" وحفظه في قاعدة البيانات السحابية بنجاح!`,
        });
        setPortalTab('book');
      } catch (err) {
        setPortalMessage({
          type: 'error',
          text: 'حدث خطأ أثناء الاتصال بالـ API، يرجى المحاولة مرة أخرى.',
        });
      }
    };

    // 2. دالة تأكيد حجز الموعد من الجدول + حفظه في الـ API الخاص بالدكتور
    const handleBookFromPortal = async (e: React.FormEvent) => {
      e.preventDefault();
      setPortalMessage(null);

      if (!selectedPatientForBook) {
        setPortalMessage({
          type: 'error',
          text: 'يجب اختيار اسم المريض أولاً (أو تسجيل ملف مريض جديد قبل الحجز)!',
        });
        return;
      }
      if (!selectedServiceForBook) {
        setPortalMessage({
          type: 'error',
          text: 'يرجى اختيار الخدمة المطلوبة!',
        });
        return;
      }
      if (!selectedTimeSlot) {
        setPortalMessage({
          type: 'error',
          text: 'يرجى اختيار ساعة الموعد من جدول المواعيد المتاحة بالأسفل!',
        });
        return;
      }

      if (hasActiveUncompletedBooking(selectedPatientForBook)) {
        setPortalMessage({
          type: 'error',
          text: `عفواً، المريض (${selectedPatientForBook}) لديه حجز نشط بالفعل! لا يمكن حجز موعد آخر لنفس المريض إلا بعد حضوره العيادة وتسجيل الزيارة والمتابعة لدى الطبيب. يمكنك تسجيل مريض آخر والحجز له.`,
        });
        return;
      }

      const slotTaken = appointments.some(
        (apt: any) =>
          apt.date === selectedDateForBook &&
          apt.time === selectedTimeSlot &&
          apt.status !== 'ملغي'
      );
      if (slotTaken) {
        setPortalMessage({
          type: 'error',
          text: 'هذا التوقيت تم حجزه للتو، يرجى اختيار توقيت آخر متاح من الجدول.',
        });
        return;
      }

      const patObj = patients.find(
        (p: any) => p.name === selectedPatientForBook
      );
      const srvObj = services.find(
        (s: any) => s.name === selectedServiceForBook
      );

      const newAptPayload = {
        id: 'APT-' + Date.now().toString().slice(-5),
        patientId: patObj?.id || 'PAT-PORTAL',
        patientName: selectedPatientForBook,
        phone: patObj?.phone || currentUser.phone,
        doctor: selectedDoctorForBook,
        service: selectedServiceForBook,
        price: srvObj?.price || 300,
        date: selectedDateForBook,
        time: selectedTimeSlot,
        status: 'قيد الانتظار',
        source: 'بوابة المريض',
      };

      try {
        // إرسال الحجز الجديد مباشرة إلى الـ API الخاص بصفحة الدكتور
        let savedApt = newAptPayload;
        if (
          typeof API_ENDPOINTS !== 'undefined' &&
          API_ENDPOINTS.APPOINTMENTS
        ) {
          const res = await fetch(API_ENDPOINTS.APPOINTMENTS, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newAptPayload),
          });
          if (res.ok) {
            savedApt = await res.json();
          }
        }

        const updatedApts = [savedApt, ...appointments];
        setAppointments(updatedApts);

        localStorage.setItem(
          storageAptsKey,
          JSON.stringify([savedApt, ...myAppointments])
        );

        localStorage.setItem(
          STORAGE_KEYS.APPOINTMENTS,
          JSON.stringify(updatedApts)
        );
        setSelectedTimeSlot('');
        setPortalMessage({
          type: 'success',
          text: `تم حجز موعد للمريض "${selectedPatientForBook}" يوم ${selectedDateForBook} الساعة ${selectedTimeSlot} وحفظه في السحابة بنجاح!`,
        });
        setPortalTab('appointments');
      } catch (err) {
        setPortalMessage({
          type: 'error',
          text: 'حدث خطأ أثناء حفظ الموعد في الـ API.',
        });
      }
    };

    /////////////////////

    // ============================================================
    // استبدل الـ return القديم كله (اللي بيبدأ بـ <div dir="rtl" className="min-h-screen bg-slate-950 ...>)
    // بالكود ده. يبدأ من أول سطر const وينتهي بـ );  قبل القوس } اللي بيقفل if (currentUser.role === 'patient')
    // ============================================================

    const statusMeta = (s: string) =>
      s === 'مؤكد'
        ? { t: 'حجز مؤكد', c: 'ok' }
        : s === 'مكتمل'
        ? { t: 'تم الكشف', c: 'done' }
        : s === 'Cancelled' || s === 'ملغي' || s === 'إلغاء'
        ? { t: 'حجز ملغي', c: 'bad' }
        : { t: 'قيد الانتظار', c: 'wait' };

    const liveStatusOf = (apt: any) =>
      appointments.find(
        (a: any) =>
          a.id === apt.id ||
          (a.patientName === apt.patientName && a.date === apt.date)
      )?.status || apt.status;

    //const nextApt = myAppointments.find((a: any) => {
     // const s = liveStatusOf(a);
    //  return s === 'قيد الانتظار' || s === 'مؤكد';
  //  });

  const cleanDigits = (n: any) =>
  String(n || '').replace(/[٠-٩]/g, (d: any) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/\D/g, '');

//const existsAtClinic = (a: any) => {
 // const aptOk = !apptsSynced || !/^\d+$/.test(String(a.id)) || appointments.some((x: any) => String(x.id) === String(a.id));
 // const patOk = !patientsSynced || patients.some((p: any) =>
 // (a.patientId && String(p.id) === String(a.patientId)) ||
  //(String(p.name || '').trim().toLowerCase() === String(a.patientName || '').trim().toLowerCase() &&
  // (!cleanDigits(a.phone) || cleanDigits(p.phone) === cleanDigits(a.phone))));
 /// return aptOk && patOk;
//};

const existsAtClinic = (a: any) => {
  const aptName = String(a.patientName || '').trim().toLowerCase();
  const aptPhone = cleanDigits(a.phone);
  const aptOk = !apptsSynced || !/^\d+$/.test(String(a.id)) || appointments.some((x: any) =>
    String(x.id) === String(a.id) &&
    String(x.patientName || '').trim().toLowerCase() === aptName
  );
  const patOk = !patientsSynced || patients.some((p: any) =>
    String(p.name || '').trim().toLowerCase() === aptName &&
    (!aptPhone || !cleanDigits(p.phone) || cleanDigits(p.phone) === aptPhone)
  );
  return aptOk && patOk;
};

//const patientAccepted = (pat: any) => !patientsSynced || patients.some((p: any) =>
 // String(p.id) === String(pat.id) ||
//  (cleanDigits(p.phone) && cleanDigits(p.phone) === cleanDigits(pat.phone) &&
 //  String(p.name || '').trim().toLowerCase() === String(pat.name || '').trim().toLowerCase()));

 const patientAccepted = (pat: any) => !patientsSynced || patients.some((p: any) =>
  String(p.name || '').trim().toLowerCase() === String(pat.name || '').trim().toLowerCase() &&
  cleanDigits(p.phone) === cleanDigits(pat.phone)
);

const selectedPatRemoved = !!selectedPatientForBook && myRegisteredPatients.some((p: any) => p.name === selectedPatientForBook && !patientAccepted(p));


const nextApt = myAppointments.find((a: any) => {
  const s = liveStatusOf(a);
  return existsAtClinic(a) && (s === 'قيد الانتظار' || s === 'مؤكد');
});


    const selectedSrv = services.find(
      (s: any) => s.name === selectedServiceForBook
    );
    const selectedPatLocked =
      selectedPatientForBook &&
      hasActiveUncompletedBooking(selectedPatientForBook);

    const tabs = [
      { id: 'home', label: 'الخدمات', count: services.length },
      {
        id: 'patients',
        label: 'ملفات المرضى',
        count: myRegisteredPatients.length,
      },
      { id: 'book', label: 'حجز موعد', count: null },
      { id: 'appointments', label: 'حجوزاتي', count: myAppointments.length },
    ];

    const renderSlots = (list: string[]) => (
      <div className="pp-slots">
        {list.map((slot) => {
          const bookedApt = appointments.find(
            (apt: any) =>
              apt.date === selectedDateForBook &&
              apt.time === slot &&
              (apt.status === 'قيد الانتظار' || apt.status === 'مؤكد')
          );
          const isBooked = !!bookedApt;
          const isSelected = selectedTimeSlot === slot;
          return (
            <button
              key={slot}
              type="button"
              disabled={isBooked}
              onClick={() => setSelectedTimeSlot(slot)}
              className={`pp-slot ${isSelected ? 'sel' : ''}`}
            >
              {slot}
            </button>
          );
        })}
      </div>
    );

    return (
      <div dir="rtl" className="pp">
        <FloatingChat
          patientId={
            currentUser ? currentUser.email || currentUser.phone : 'test-user'
          }
        />

        <header className="pp-top">
          <div className="pp-top-in">
            <div className="pp-brand">
              <div className="pp-mark">
                <Stethoscope size={19} />
              </div>
              <span className="t">عيادة الأسنان الذكية</span>
            </div>
            <nav className="pp-nav">
              {tabs.map((t: any) => (
                <button
                  key={t.id}
                  className={portalTab === t.id ? 'on' : ''}
                  onClick={() => {
                    setPortalTab(t.id as any);
                    setPortalMessage(null);
                  }}
                >
                  {t.label}
                  {t.count !== null && (
                    <span className="pp-badge">{t.count}</span>
                  )}
                </button>
              ))}
            </nav>
            <div className="pp-user">
              <span>{currentUser.name}</span>
              <button className="pp-out" onClick={handleLogout}>
                خروج
              </button>
            </div>
          </div>
        </header>

        <main className="pp-wrap">
          {portalMessage && (
            <div className={`pp-note ${portalMessage.type}`}>
              <span>{portalMessage.text}</span>
              <button onClick={() => setPortalMessage(null)} aria-label="إغلاق">
                ✕
              </button>
            </div>
          )}

          {/* ===================== الخدمات ===================== */}
          {portalTab === 'home' && (
            <>
              <section className="pp-hero">
                <div className="pp-hero-main">
                  <h1>أهلاً {currentUser.name}، ابتسامتك في أيدٍ أمينة</h1>
                  <p>
                    اختر الخدمة، وحدد الوقت المناسب من جدول العيادة، وتابع
                    حجوزاتك من مكان واحد.
                  </p>
                  <button
                    className="pp-cta"
                    onClick={() => setPortalTab('book')}
                  >
                    احجز موعدك الآن
                  </button>
                </div>
                <div className="pp-next">
                  {nextApt ? (
                    <>
                      <small>موعدك القادم</small>
                      <div className="big">
                        {nextApt.service || nextApt.serviceName}
                      </div>
                      <div className="meta">
                        <span>
                          <Calendar size={14} /> {nextApt.date}
                        </span>
                        <span>
                          <Clock size={14} /> {nextApt.time}
                        </span>
                        <span>
                          <Users size={14} /> {nextApt.patientName}
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      <small>موعدك القادم</small>
                      <div className="big">لا يوجد حجز نشط</div>
                      <div className="meta">
                        <span>اختر خدمة من القائمة وابدأ الحجز.</span>
                      </div>
                    </>
                  )}
                </div>
              </section>

              <div className="pp-sec">
                <div>
                  <h2>خدمات العيادة</h2>
                  <p>الأسعار بالجنيه المصري، والمدة التقريبية لكل جلسة.</p>
                </div>
                <button
                  className="pp-ghost"
                  onClick={() => setPortalTab('patients')}
                >
                  إضافة ملف مريض
                </button>
              </div>

              <div className="pp-list">
                {services.map((srv: any) => (
                  <div key={srv.id} className="pp-srv">
                    <div>
                      <h3>
                        {srv.name}{' '}
                        <span className="pp-chip">
                          {srv.category || 'خدمة طبية'}
                        </span>
                      </h3>
                      <p>
                        <Clock size={13} /> {srv.duration || '30 دقيقة'}
                      </p>
                    </div>
                    <div className="pp-price">
                      {srv.price}
                      <small>ج.م</small>
                    </div>
                    <button
                      className="pp-btn"
                      onClick={() => {
                        setSelectedServiceForBook(srv.name);
                        setPortalTab('book');
                      }}
                    >
                      احجز
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ===================== ملفات المرضى ===================== */}
          {portalTab === 'patients' && (
            <div className="pp-grid2">
              <div className="pp-card">
                <h3>فتح ملف مريض جديد</h3>
                <p className="sub">
                  سجّل ملف المريض أولاً قبل الحجز. يمكنك تسجيل نفسك أو أي فرد من
                  عائلتك.
                </p>
                <form onSubmit={handleAddPatientFromPortal} className="pp-f">
                  <label>
                    اسم المريض الثلاثي *
                    <input
                      className="pp-in"
                      type="text"
                      required
                      placeholder="أحمد محمد علي"
                      value={newPatientForm.name}
                      onChange={(e) =>
                        setNewPatientForm({
                          ...newPatientForm,
                          name: e.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    رقم الهاتف *
                    <input
                      className="pp-in"
                      type="tel"
                      required
                      placeholder="01012345678"
                      value={newPatientForm.phone}
                      onChange={(e) =>
                        setNewPatientForm({
                          ...newPatientForm,
                          phone: e.target.value,
                        })
                      }
                    />
                  </label>
                  <div className="pp-row2">
                    <label>
                      السن
                      <input
                        className="pp-in"
                        type="number"
                        placeholder="28"
                        value={newPatientForm.age}
                        onChange={(e) =>
                          setNewPatientForm({
                            ...newPatientForm,
                            age: e.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      النوع
                      <select
                        className="pp-in"
                        value={newPatientForm.gender}
                        onChange={(e) =>
                          setNewPatientForm({
                            ...newPatientForm,
                            gender: e.target.value,
                          })
                        }
                      >
                        <option value="ذكر">ذكر</option>
                        <option value="أنثى">أنثى</option>
                      </select>
                    </label>
                  </div>
                  <label>
                    ملاحظات صحية أو شكوى
                    <textarea
                      className="pp-in"
                      rows={3}
                      placeholder="أي حساسية أو أمراض مزمنة..."
                      value={newPatientForm.notes}
                      onChange={(e) =>
                        setNewPatientForm({
                          ...newPatientForm,
                          notes: e.target.value,
                        })
                      }
                    />
                  </label>
                  <button type="submit" className="pp-btn wide">
                    حفظ الملف والانتقال للحجز
                  </button>
                </form>
              </div>

              <div>
                <div className="pp-sec">
                  <div>
                    <h2>ملفاتك المسجلة</h2>
                  </div>
                </div>
                {myRegisteredPatients.length === 0 ? (
                  <div className="pp-empty">
                    لم تسجّل أي ملف مريض بعد.
                    <br />
                    املأ النموذج المجاور لتتمكن من الحجز.
                  </div>
                ) : (
                  <div className="pp-plist">
                    {myRegisteredPatients.map((pat: any, idx: number) => {
                      const activeBooking = appointments.find(
                        (apt: any) =>
                          apt.patientName?.trim().toLowerCase() ===
                            pat.name.trim().toLowerCase() &&
                          (apt.status === 'قيد الانتظار' ||
                            apt.status === 'مؤكد')
                      );
                      const hasActive = activeBooking ? true : false;
                     // const isAcceptedByDoctor = patients.some((p: any) => {
                        const isAcceptedByDoctor = !patientsSynced || patients.some((p: any) => {
                        if (!p.phone || !pat.phone) return false;
                        const cleanPhone = (num: any) =>
                          String(num)
                            .replace(/[٠-٩]/g, (d: any) =>
                              String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))
                            )
                            .replace(/\D/g, '');
                      // return cleanPhone(p.phone) === cleanPhone(pat.phone);
                      return String(p.id) === String(pat.id) || (cleanPhone(p.phone) === cleanPhone(pat.phone) && String(p.name || '').trim().toLowerCase() === String(pat.name || '').trim().toLowerCase());
                      });

                      return isAcceptedByDoctor ? (
                        <div key={`${pat.id}-${idx}`} className="pp-pcard">
                          <div className="pp-phead">
                            <div className="pp-av">
                              {String(pat.name).trim().charAt(0)}
                            </div>
                            <div>
                              <h3>{pat.name}</h3>
                              <div
                                className="pp-pmeta"
                                dir="ltr"
                                style={{ textAlign: 'right' }}
                              >
                                {pat.phone} · {pat.age || '-'}
                              </div>
                            </div>
                            {hasActive && (
                              <span
                                className={`pp-pill ${
                                  activeBooking?.status === 'مؤكد'
                                    ? 'ok'
                                    : 'wait'
                                }`}
                              >
                                {activeBooking?.status === 'مؤكد'
                                  ? 'حجز مؤكد'
                                  : 'قيد الانتظار'}
                              </span>
                            )}
                          </div>
                          {pat.notes && (
                            <div className="pp-pnote">{pat.notes}</div>
                          )}
                          <button
                            className="pp-btn"
                            disabled={hasActive}
                            onClick={() => {
                              setSelectedPatientForBook(pat.name);
                              setPortalTab('book');
                            }}
                          >
                            {hasActive
                              ? 'لا يمكن الحجز قبل إتمام الزيارة'
                              : 'حجز موعد لهذا المريض'}
                          </button>
                        </div>
                      ) : (
                        <div key={`${pat.id}-${idx}`} className="pp-pcard gone">
                          <div>
                            <h3>{pat.name}</h3>
                            <div className="pp-pmeta" dir="ltr">
                              {pat.phone}
                            </div>
                          </div>
                          <div>
                            <b style={{ color: 'var(--red)', fontSize: 13 }}>
                              تم رفض أو حذف ملف المريض
                            </b>
                            <p className="pp-pmeta" style={{ marginTop: 4 }}>
                              قامت العيادة بإلغاء تسجيل هذا المريض.
                            </p>
                          </div>
                          <div className="pp-acts">
                            <button
                              className="pp-danger"
                              onClick={async (e) => {
                                const card = e.currentTarget.closest(
                                  '.pp-pcard'
                                ) as HTMLElement;
                                if (card) card.style.display = 'none';
                                const clean = (num: any) =>
                                  String(num || '')
                                    .replace(/[٠-٩]/g, (d: any) =>
                                      String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))
                                    )
                                    .replace(/\D/g, '');
                                const targetPhone = clean(pat.phone);
                                const storageKey = `clinic_my_patients_${
                                  currentUser?.email || currentUser?.phone
                                }`;
                                const savedList = JSON.parse(
                                  localStorage.getItem(storageKey) || '[]'
                                );
                                const updatedList = savedList.filter(
                                  (item: any) => {
                                    const isSamePhone =
                                      item.phone &&
                                      clean(item.phone) === targetPhone;
                                    const isSameName =
                                      item.name && item.name === pat.name;
                                    return !(isSamePhone || isSameName);
                                  }
                                );
                                localStorage.setItem(
                                  storageKey,
                                  JSON.stringify(updatedList)
                                );
                                if (
                                  SUPABASE_URL &&
                                  SUPABASE_KEY &&
                                  currentUser?.email
                                ) {
                                  try {
                                    const userEmail = currentUser.email
                                      .trim()
                                      .toLowerCase();
                                    await fetch(
                                      `${SUPABASE_URL}/rest/v1/patient_accounts?email=eq.${encodeURIComponent(
                                        userEmail
                                      )}`,
                                      {
                                        method: 'PATCH',
                                        headers: {
                                          apikey: SUPABASE_KEY,
                                          Authorization: `Bearer ${SUPABASE_KEY}`,
                                          'Content-Type': 'application/json',
                                        },
                                        body: JSON.stringify({
                                          my_patients: updatedList,
                                        }),
                                      }
                                    );
                                  } catch (err) {
                                    console.error(
                                      'Supabase Delete Error:',
                                      err
                                    );
                                  }
                                }
                              }}
                            >
                              حذف السجل
                            </button>
                            <button
                              className="pp-soft"
                              onClick={async () => {
                                try {
                                  const { id, ...patientData } = pat;
                                  const response = await fetch(
                                    API_ENDPOINTS.PATIENTS,
                                    {
                                      method: 'POST',
                                      headers: {
                                        'Content-Type': 'application/json',
                                      },
                                      body: JSON.stringify({
                                        ...patientData,
                                        notes:
                                          pat.notes ||
                                          'تم إعادة التسجيل من بوابة المريض',
                                        createdAt: new Date()
                                          .toISOString()
                                          .split('T')[0],
                                      }),
                                    }
                                  );
                                  if (response.ok) {
                                    const newPatient = await response.json();
                                    setPatients((prev: any) => [
                                      ...prev,
                                      newPatient,
                                    ]);
                                  } else {
                                    alert(
                                      'حدث خطأ أثناء إرسال البيانات للعيادة'
                                    );
                                  }
                                } catch (error) {
                                  alert('حدث خطأ، تأكد من اتصالك بالإنترنت');
                                }
                              }}
                            >
                              إعادة تسجيل
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ===================== الحجز ===================== */}
          {portalTab === 'book' && (
            <form onSubmit={handleBookFromPortal} className="pp-book">
              <div>
                <div className="pp-sec">
                  <div>
                    <h2>حجز موعد</h2>
                    <p>
                      لكل مريض حجز نشط واحد، حتى يحضر الكشف ويسجّل الطبيب
                      زيارته.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="pp-ghost"
                    onClick={() => setPortalTab('patients')}
                  >
                    مريض جديد
                  </button>
                </div>

                <div className="pp-step">
                  <h3>
                    <i>1</i> المريض والخدمة
                  </h3>
                  <div className="pp-row2">
                    <select
                      className="pp-in"
                      required
                      value={selectedPatientForBook}
                      onChange={(e) =>
                        setSelectedPatientForBook(e.target.value)
                      }
                    >
                      <option value="">اختر المريض</option>
                      {myRegisteredPatients.map((p: any, idx: number) => {
  const locked = hasActiveUncompletedBooking(p.name);
  const removed = !patientAccepted(p);
  return (
    <option key={`${p.id}-${idx}`} value={p.name} disabled={removed}>
      {p.name}
      {removed ? ' (محذوف من العيادة)' : locked ? ' (لديه حجز نشط)' : ''}
    </option>
  );
})}
                    </select>
                    <select
                      className="pp-in"
                      required
                      value={selectedServiceForBook}
                      onChange={(e) =>
                        setSelectedServiceForBook(e.target.value)
                      }
                    >
                      <option value="">اختر الخدمة</option>
                      {services.map((s: any) => (
                        <option key={s.id} value={s.name}>
                          {s.name} ({s.price} ج.م)
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="pp-step">
                  <h3>
                    <i>2</i> اليوم
                  </h3>
                  <input
                    className="pp-in"
                    style={{ maxWidth: 240 }}
                    type="date"
                    required
                    min={new Date().toISOString().split('T')[0]}
                    value={selectedDateForBook}
                    onChange={(e) => {
                      setSelectedDateForBook(e.target.value);
                      setSelectedTimeSlot('');
                    }}
                  />
                </div>

                <div className="pp-step">
                  <h3>
                    <i>3</i> الوقت المتاح
                  </h3>
                  <div className="pp-period">الصباح والظهر</div>
                  {renderSlots(CLINIC_TIME_SLOTS.slice(0, 8))}
                  <div className="pp-period">المساء</div>
                  {renderSlots(CLINIC_TIME_SLOTS.slice(8))}
                </div>
              </div>

              <aside className="pp-card pp-sum">
                <h3>ملخص الحجز</h3>
                <dl>
                  <div>
                    <dt>المريض</dt>
                    <dd className={selectedPatientForBook ? '' : 'none'}>
                      {selectedPatientForBook || 'لم يُحدد'}
                    </dd>
                  </div>
                  <div>
                    <dt>الخدمة</dt>
                    <dd className={selectedServiceForBook ? '' : 'none'}>
                      {selectedServiceForBook
                        ? `${selectedServiceForBook}${
                            selectedSrv ? ` · ${selectedSrv.price} ج.م` : ''
                          }`
                        : 'لم تُحدد'}
                    </dd>
                  </div>
                  <div>
                    <dt>الطبيب</dt>
                    <dd>{selectedDoctorForBook}</dd>
                  </div>
                  <div>
                    <dt>الموعد</dt>
                    <dd className={selectedTimeSlot ? '' : 'none'}>
                      {selectedTimeSlot
                        ? `${selectedDateForBook} · ${selectedTimeSlot}`
                        : 'اختر وقتاً من الجدول'}
                    </dd>
                  </div>
                </dl>
                {selectedPatLocked && (
                  <div className="pp-warn">
                    المريض ({selectedPatientForBook}) لديه حجز لم يُكشف عليه
                    بعد. اختر مريضاً آخر أو انتظر إتمام الزيارة.
                  </div>
                )}
                <button
                  type="submit"
                  className="pp-btn wide"
                  disabled={
                    !selectedPatientForBook ||
                    hasActiveUncompletedBooking(selectedPatientForBook)
                  }
                >
                  تأكيد الحجز
                </button>
              </aside>
            </form>
          )}

          {/* ===================== حجوزاتي ===================== */}
          {portalTab === 'appointments' && (
            <>
              <div className="pp-sec">
                <div>
                  <h2>حجوزاتي</h2>
                  <p>حالة كل حجز وزيارة، محدّثة من سجل العيادة.</p>
                </div>
              </div>
              {myAppointments.length === 0 ? (
                <div className="pp-empty">
                  لا توجد حجوزات حتى الآن.
                  <br />
                  ابدأ بحجز أول موعد من تبويب «حجز موعد».
                </div>
              ) : (
                <div className="pp-tl">
                  {myAppointments.map((apt: any, idx: number) => {
                    const aptKey = `${apt.patientName}-${apt.date}-${apt.time}`;
                    const completedHistory = JSON.parse(
                      localStorage.getItem('clinic_completed_apts') || '[]'
                    );
                    const isVisitedNow =
                      isAppointmentCompletedInVisits(apt) ||
                      apt.status === 'مكتمل';
                    if (isVisitedNow && !completedHistory.includes(aptKey)) {
                      completedHistory.push(aptKey);
                      localStorage.setItem(
                        'clinic_completed_apts',
                        JSON.stringify(completedHistory)
                      );
                    }
                    const visited =
                      isVisitedNow || completedHistory.includes(aptKey);
                  //  const meta = visited
                    
                    //  ? { t: 'تمت الزيارة', c: 'done' }
                   //   : statusMeta(liveStatusOf(apt));
                   const isGone = !visited && !existsAtClinic(apt);
const meta = isGone ? { t: 'حُذف من العيادة', c: 'bad' } : visited ? { t: 'تمت الزيارة', c: 'done' } : statusMeta(liveStatusOf(apt));

                    return (
                      <div key={`${apt.id}-${apt.patientName}-${idx}`} className="pp-apt">
                        <div className="pp-date">
                          <b>{apt.date}</b>
                          <span>{apt.time}</span>
                        </div>
                        <div>
                          <h3>{apt.service || apt.serviceName}</h3>
                          <p>
                            {apt.patientName} · {apt.doctor || 'د. طارق السعيد'}
                            {isGone ? ' · تم حذف هذا الموعد من قبل العيادة' : visited ? ' · يمكنه الحجز مجدداً' : ''}
                          </p>
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
  <span className={`pp-pill ${meta.c}`} style={{ marginRight: 0 }}>{meta.t}</span>
  {isGone && (
    <button className="pp-danger" style={{ border: 0, borderRadius: 10, padding: '7px 12px', fontSize: 12, fontWeight: 700 }}
      onClick={async () => {
        const left = savedPortalApts.filter((x: any) => String(x.id) !== String(apt.id));
        localStorage.setItem(storageAptsKey, JSON.stringify(left));
        if (SUPABASE_URL && SUPABASE_KEY && currentUser?.email) {
          try {
            await fetch(`${SUPABASE_URL}/rest/v1/patient_accounts?email=eq.${encodeURIComponent(currentUser.email.trim().toLowerCase())}`, {
              method: 'PATCH',
              headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ my_appointments: left }),
            });
          } catch (err) { console.error('Supabase Delete Error:', err); }
        }
        setPortalMessage({ type: 'success', text: 'تمت إزالة الحجز من قائمتك.' });
      }}>
      إزالة
    </button>
  )}
</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </main>
      </div>
    );
  }

  ///////////////////////////////////////////////////////

   // ============================================================
  // استبدل الـ return الأخير في App (اللي بيبدأ بـ <div dir="rtl" className="min-h-screen bg-[#f3f5f1] ...>)
  // لحد آخر ); قبل القوس } اللي بيقفل function App.
  // الصق الكود ده مكانه من أول const todayStr لحد );
  // ============================================================

  const todayStr = new Date().toISOString().split('T')[0];
  const pillOf = (s: string) => (s === 'مؤكد' ? 'ok' : s === 'مكتمل' ? 'done' : s === 'ملغي' ? 'bad' : 'wait');
  const pendingList = appointments.filter((a: any) => a.status === 'قيد الانتظار');
  const recentList = appointments.slice(0, 6);

  const navItems = [
    { id: 'dashboard', label: 'لوحة التحكم', icon: <LayoutGrid size={18} />, count: null },
    { id: 'appointments', label: 'المواعيد', icon: <Calendar size={18} />, count: appointments.filter((a: any) => a.status !== 'مكتمل').length },
    { id: 'patients', label: 'المرضى', icon: <Users size={18} />, count: patients.length },
    { id: 'visits', label: 'الزيارات والتحصيل', icon: <Stethoscope size={18} />, count: visits.length },
    { id: 'services', label: 'الخدمات والأسعار', icon: <Sparkles size={18} />, count: services.length },
  ];

  const subtitles: any = {
    dashboard: 'نظرة سريعة على نشاط العيادة اليوم',
    appointments: 'تأكيد الحجوزات وتحديث حالتها',
    patients: 'ملفات المرضى وبياناتهم',
    visits: 'الزيارات المكتملة والمبالغ المحصلة',
    services: 'الخدمات المعتمدة وأسعارها',
  };

  const shell = (title: string, onClose: () => void, body: any) => (
    <div className="dd-modal">
      <div className="dd-dialog">
        <div className="dd-dhead">
          <h3>{title}</h3>
          <button type="button" className="dd-x" onClick={onClose} aria-label="إغلاق">✕</button>
        </div>
        {body}
      </div>
    </div>
  );

  const field = (label: string, el: any) => <label className="dd-fl">{label}{el}</label>;

  const aptActions = (app: any) => (
    <div className="dd-ops">
      {app.status !== 'مؤكد' && <button className="dd-btn sm ok" onClick={() => handleStatusUpdate(app, 'مؤكد')}>تأكيد</button>}
      {app.status !== 'مكتمل' && <button className="dd-btn sm" onClick={() => handleStatusUpdate(app, 'مكتمل')}>مكتمل</button>}
      {app.status !== 'ملغي' && <button className="dd-btn sm bad" onClick={() => handleStatusUpdate(app, 'ملغي')}>إلغاء</button>}
    </div>
  );

  return (
    <div dir="rtl" className="dd">
      {toast && (
        <div className={`dd-toast ${toast.type === 'error' ? 'error' : ''}`}>
          <i /> <span>{toast.message}</span>
        </div>
      )}

      {/* ===================== الشريط الجانبي ===================== */}
      <aside className="dd-side">
        <div className="dd-logo">
          <div className="mk"><Stethoscope size={21} /></div>
          <div>
            <b>عيادة الأسنان الذكية</b>
            <small><span className="dd-live" /> متصلة بالقاعدة السحابية</small>
          </div>
        </div>
        <nav className="dd-nav">
          {navItems.map((n: any) => (
            <button key={n.id} className={activeTab === n.id ? 'on' : ''} onClick={() => setActiveTab(n.id)}>
              {n.icon}
              <span>{n.label}</span>
              {n.count !== null && <span className="c num">{n.count}</span>}
            </button>
          ))}
        </nav>
        <div className="dd-me">
          <div className="av">{String(currentUser?.name || 'د').replace('د.', '').trim().charAt(0)}</div>
          <span>{currentUser?.name || 'الطبيب'}</span>
          <button onClick={handleLogout}>خروج</button>
        </div>
      </aside>

      {/* ===================== المحتوى ===================== */}
      <main className="dd-main">
        <div className="dd-head">
          <div>
            <h1>{currentBannerInfo.title}</h1>
            <p>{subtitles[activeTab] || ''}</p>
          </div>
          <div className="dd-acts">
            <button className="dd-btn icon" onClick={() => syncAllFromAPI(true)} disabled={isSyncing} title="تحديث البيانات من الـ API" aria-label="تحديث">
              <RefreshCw size={16} className={isSyncing ? 'animate-spin' : ''} />
            </button>
            <button className="dd-btn" onClick={() => setPatientModal({ open: true, editing: null })}>
              <UserPlus size={15} /> مريض جديد
            </button>
            <button className="dd-btn pri" onClick={() => setAppointmentModal({ open: true, editing: null, prefill: null })}>
              <CalendarPlus size={15} /> حجز موعد
            </button>
          </div>
        </div>

        {/* ---------- لوحة التحكم ---------- */}
        {activeTab === 'dashboard' && (
          <>
            <div className="dd-kpis">
              <div className="dd-kpi">
                <small>ملفات المرضى</small>
                <div className="v num">{patients.length}</div>
                <div className="s">مسجلين في قاعدة البيانات</div>
              </div>
              <div className="dd-kpi">
                <small>مؤكد / بانتظار التأكيد</small>
                <div className="v num">{dashboardStats.confirmed} <i>/ {dashboardStats.pending}</i></div>
                <div className="s">مواعيد اليوم: {dashboardStats.todayCount}</div>
              </div>
              <div className="dd-kpi">
                <small>إجمالي التحصيل</small>
                <div className="v num">{dashboardStats.totalRevenue} <i style={{ color: 'var(--muted)' }}>ج.م</i></div>
                <div className="s">من {visits.length} زيارة مكتملة</div>
              </div>
              <div className="dd-kpi ai">
                <small>عمليات الذكاء الاصطناعي</small>
                <div className="v num">{dashboardStats.aiTotal}</div>
                <div className="s">حجوزات عبر البوت: {dashboardStats.aiAppointments}</div>
              </div>
            </div>

            <div className="dd-grid">
              <section className="dd-panel">
                <div className="dd-ph">
                  <h2>أحدث الحجوزات</h2>
                  <button className="dd-link" onClick={() => setActiveTab('appointments')}>عرض الكل</button>
                </div>
                {recentList.length === 0 ? (
                  <div className="dd-empty">لا توجد مواعيد مسجلة حالياً.</div>
                ) : recentList.map((app: any) => (
                  <div key={app.id} className="dd-row">
                    <div className="dd-who">
                      <div className="dd-av">{String(app.patientName).charAt(0)}</div>
                      <div>
                        <b>{app.patientName}</b>
                        <small>{app.serviceName} · {app.price} ج.م</small>
                      </div>
                    </div>
                    <div className="dd-when num"><b>{app.date === todayStr ? 'اليوم' : app.date}</b>{app.time}</div>
                    <span className={`dd-pill ${pillOf(app.status)}`}>{app.status}</span>
                  </div>
                ))}
              </section>

              <section className="dd-panel">
                <div className="dd-ph">
                  <h2>بانتظار التأكيد</h2>
                  <span className="dd-pill wait num">{pendingList.length}</span>
                </div>
                {pendingList.length === 0 ? (
                  <div className="dd-empty">لا توجد حجوزات تنتظر ردك.</div>
                ) : pendingList.slice(0, 5).map((app: any) => (
                  <div key={app.id} className="dd-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
                    <div className="dd-who">
                      <div className="dd-av">{String(app.patientName).charAt(0)}</div>
                      <div>
                        <b>{app.patientName}</b>
                        <small className="num">{app.date} · {app.time} · {app.serviceName}</small>
                      </div>
                    </div>
                    <div className="dd-ops">
                      <button className="dd-btn sm ok" onClick={() => handleStatusUpdate(app, 'مؤكد')}>تأكيد</button>
                      <button className="dd-btn sm bad" onClick={() => handleStatusUpdate(app, 'ملغي')}>إلغاء</button>
                    </div>
                  </div>
                ))}
              </section>
            </div>
          </>
        )}

        {/* ---------- المواعيد ---------- */}
        {activeTab === 'appointments' && (
          <>
            <div className="dd-bar">
              <div className="dd-tabs">
                {['الكل', 'قيد الانتظار', 'مؤكد', 'مكتمل', 'ملغي'].map((tab) => (
                  <button key={tab} className={appointmentFilter === tab ? 'on' : ''} onClick={() => setAppointmentFilter(tab)}>{tab}</button>
                ))}
              </div>
            </div>
            <div className="dd-panel">
              <div className="dd-tw">
                <table className="dd-table">
                  <thead>
                    <tr>
                      <th>المريض</th><th>الخدمة</th><th>الموعد</th><th>طريقة الحجز</th><th>الحالة</th><th>تغيير الحالة</th><th>إدارة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAppointments.length === 0 ? (
                      <tr><td colSpan={7}><div className="dd-empty">لا توجد مواعيد في هذا القسم.</div></td></tr>
                    ) : filteredAppointments.map((app: any) => (
                      <tr key={app.id}>
                        <td><b>{app.patientName}</b><small dir="ltr" style={{ textAlign: 'right' }}>{app.phone}</small></td>
                        <td><b>{app.serviceName}</b><small>{app.price} ج.م</small></td>
                        <td className="num"><b>{app.date}</b><small><Clock size={11} style={{ verticalAlign: '-1px' }} /> {app.time}</small></td>
                        <td><span className="dd-src"><Bot size={12} /> {app.source}</span></td>
                        <td><span className={`dd-pill ${pillOf(app.status)}`}>{app.status}</span></td>
                        <td>{aptActions(app)}</td>
                        <td>
                          <div className="dd-ops">
                            <button className="dd-btn sm icon" title="تعديل" onClick={() => setAppointmentModal({ open: true, editing: app, prefill: null })}><Edit3 size={14} /></button>
                            <button className="dd-btn sm icon bad" title="حذف نهائي" onClick={() => handleDeleteAppointment(app.id)}><Trash2 size={14} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ---------- المرضى ---------- */}
        {activeTab === 'patients' && (
          <>
            <div className="dd-bar">
              <div className="dd-search">
                <Search size={16} />
                <input className="dd-in" value={patientSearch} onChange={(e) => setPatientSearch(e.target.value)} placeholder="ابحث باسم المريض أو رقم الجوال..." />
              </div>
              <button className="dd-btn pri" onClick={() => setPatientModal({ open: true, editing: null })}><Plus size={15} /> ملف مريض جديد</button>
            </div>
            <div className="dd-panel">
              <div className="dd-tw">
                <table className="dd-table">
                  <thead>
                    <tr><th>المريض</th><th>الجوال</th><th>السن والنوع</th><th>التسجيل</th><th>التاريخ الطبي</th><th>إجراءات</th></tr>
                  </thead>
                  <tbody>
                    {filteredPatients.length === 0 ? (
                      <tr><td colSpan={6}><div className="dd-empty">لا توجد ملفات مرضى مطابقة.<br />أضف مريضاً جديداً أو انتظر تسجيلاً من البوت.</div></td></tr>
                    ) : filteredPatients.map((p: any) => (
                      <tr key={p.id}>
                        <td><div className="dd-who"><div className="dd-av">{String(p.name).trim().charAt(0)}</div><b>{p.name}</b></div></td>
                        <td className="num" dir="ltr" style={{ textAlign: 'right' }}>{p.phone}</td>
                        <td className="num">{p.age} سنة · {p.gender}</td>
                        <td><span className="dd-src">{p.source}</span></td>
                        <td style={{ maxWidth: 240, color: 'var(--muted)', fontSize: 12 }}>{p.notes}</td>
                        <td>
                          <div className="dd-ops">
                            <button className="dd-btn sm ok" onClick={() => setAppointmentModal({ open: true, editing: null, prefill: { patientName: p.name, phone: p.phone } })}>
                              <CalendarPlus size={13} /> حجز
                            </button>
                            <button className="dd-btn sm icon" title="تعديل" onClick={() => setPatientModal({ open: true, editing: p })}><Edit3 size={14} /></button>
                            <button className="dd-btn sm icon bad" title="حذف" onClick={() => handleDeletePatient(p.id)}><Trash2 size={14} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ---------- الزيارات ---------- */}
        {activeTab === 'visits' && (
          <>
            <div className="dd-bar">
              <p style={{ color: 'var(--muted)', fontSize: 13 }}>أي موعد تضغط عليه «مكتمل» ينتقل هنا تلقائياً ويُحسب في التحصيل.</p>
              <button className="dd-btn pri" onClick={() => setVisitModal({ open: true, editing: null })}><Plus size={15} /> تسجيل زيارة</button>
            </div>
            <div className="dd-panel">
              <div className="dd-tw">
                <table className="dd-table">
                  <thead><tr><th>المريض</th><th>الخدمة</th><th>التاريخ</th><th>المحصّل</th><th>ملاحظات الطبيب</th><th>إجراءات</th></tr></thead>
                  <tbody>
                    {visits.length === 0 ? (
                      <tr><td colSpan={6}><div className="dd-empty">لا توجد زيارات مكتملة بعد.</div></td></tr>
                    ) : visits.map((v: any) => (
                      <tr key={v.id}>
                        <td><b>{v.patientName}</b><small dir="ltr" style={{ textAlign: 'right' }}>{v.phone}</small></td>
                        <td>{v.serviceName}</td>
                        <td className="num">{v.date}</td>
                        <td className="num"><b style={{ color: 'var(--teal-d)' }}>{v.paidAmount} ج.م</b></td>
                        <td style={{ maxWidth: 260, color: 'var(--muted)', fontSize: 12 }}>{v.notes}</td>
                        <td>
                          <div className="dd-ops">
                            <button className="dd-btn sm icon" title="تعديل" onClick={() => setVisitModal({ open: true, editing: v })}><Edit3 size={14} /></button>
                            <button className="dd-btn sm icon bad" title="حذف" onClick={() => handleDeleteVisit(v.id)}><Trash2 size={14} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ---------- الخدمات ---------- */}
        {activeTab === 'services' && (
          <>
            <div className="dd-bar">
              <p style={{ color: 'var(--muted)', fontSize: 13 }}>عدّل الأسعار أو أضف خدمة، والبوت يقرأ القائمة من الـ API.</p>
              <button className="dd-btn pri" onClick={() => setServiceModal({ open: true, editing: null })}><Plus size={15} /> خدمة جديدة</button>
            </div>
            <div className="dd-svc">
              {services.map((srv: any) => (
                <div key={srv.id} className="dd-sc">
                  <div className="top">
                    <div>
                      <span className="dd-pill ok">{srv.category}</span>
                      <h3 style={{ marginTop: 8 }}>{srv.name}</h3>
                    </div>
                    <div className="pr num">{srv.price} <small>ج.م</small></div>
                  </div>
                  <p>{srv.description}</p>
                  <div className="ft">
                    <span><Clock size={12} style={{ verticalAlign: '-2px' }} /> {srv.duration}</span>
                    <div className="dd-ops">
                      <button className="dd-btn sm icon" title="تعديل" onClick={() => setServiceModal({ open: true, editing: srv })}><Edit3 size={14} /></button>
                      <button className="dd-btn sm icon bad" title="حذف" onClick={() => handleDeleteService(srv.id)}><Trash2 size={14} /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </main>

      {/* ===================== نافذة المريض ===================== */}
      {patientModal.open && shell(
        patientModal.editing ? 'تعديل بيانات المريض' : 'إضافة ملف مريض جديد',
        () => setPatientModal({ open: false, editing: null }),
        <form onSubmit={handleSavePatient} className="dd-form">
          {field('الاسم', <input className="dd-in" name="name" required defaultValue={patientModal.editing?.name || ''} placeholder="مثال: يسي حلمي جاد" />)}
          <div className="dd-r2">
            {field('رقم الجوال', <input className="dd-in" name="phone" required defaultValue={patientModal.editing?.phone || ''} placeholder="01278479297" />)}
            {field('العمر', <input className="dd-in" name="age" required defaultValue={patientModal.editing?.age || '19'} />)}
          </div>
          <div className="dd-r2">
            {field('النوع', <select className="dd-in" name="gender" defaultValue={patientModal.editing?.gender || 'ذكر'}><option value="ذكر">ذكر</option><option value="أنثى">أنثى</option></select>)}
            {field('طريقة التسجيل', <select className="dd-in" name="source" defaultValue={patientModal.editing?.source || 'وكيل الذكاء الاصطناعي (n8n)'}><option value="وكيل الذكاء الاصطناعي (n8n)">وكيل الذكاء الاصطناعي (n8n)</option><option value="يدوي - الاستقبال">يدوي - الاستقبال</option></select>)}
          </div>
          {field('التاريخ الطبي والملاحظات', <textarea className="dd-in" name="notes" rows={3} defaultValue={patientModal.editing?.notes || 'تم التسجيل عبر بوت'} />)}
          <div className="dd-fa">
            <button type="button" className="dd-btn" onClick={() => setPatientModal({ open: false, editing: null })}>إلغاء</button>
            <button type="submit" className="dd-btn pri">حفظ</button>
          </div>
        </form>
      )}

      {/* ===================== نافذة الموعد ===================== */}
      {appointmentModal.open && shell(
        appointmentModal.editing ? 'تعديل بيانات الموعد' : 'حجز موعد جديد',
        () => setAppointmentModal({ open: false, editing: null, prefill: null }),
        <form onSubmit={handleSaveAppointment} className="dd-form">
          {field('اسم المريض',
            <select className="dd-in" name="patientName" required defaultValue={appointmentModal.editing?.patientName || appointmentModal.prefill?.patientName || ''}>
              <option value="" disabled>اختر مريضاً من القائمة...</option>
              {patients.map((patient: any) => <option key={patient.id} value={patient.name}>{patient.name}</option>)}
            </select>
          )}
          {field('رقم الجوال', <input className="dd-in" name="phone" required defaultValue={appointmentModal.editing?.phone || appointmentModal.prefill?.phone || ''} placeholder="01278479297" />)}
          {field('الخدمة المطلوبة',
            <select className="dd-in" name="serviceName" defaultValue={appointmentModal.editing?.serviceName || 'كشف عام'}>
              {services.map((s: any) => <option key={s.id} value={s.name}>{s.name} ({s.price} ج.م)</option>)}
            </select>
          )}
          <div className="dd-r2">
            {field('التاريخ', <input className="dd-in" type="date" name="date" required defaultValue={appointmentModal.editing?.date || new Date().toISOString().split('T')[0]} />)}
            {field('الوقت', <input className="dd-in" type="time" name="time" required defaultValue={appointmentModal.editing?.time || '16:00'} />)}
          </div>
          <div className="dd-r2">
            {field('الحالة', <select className="dd-in" name="status" defaultValue={appointmentModal.editing?.status || 'مؤكد'}><option value="مؤكد">مؤكد</option><option value="قيد الانتظار">قيد الانتظار</option><option value="مكتمل">مكتمل</option><option value="ملغي">ملغي</option></select>)}
            {field('طريقة الحجز', <select className="dd-in" name="source" defaultValue={appointmentModal.editing?.source || 'وكيل الذكاء الاصطناعي (n8n)'}><option value="وكيل الذكاء الاصطناعي (n8n)">وكيل الذكاء الاصطناعي (n8n)</option><option value="يدوي - الاستقبال">يدوي - الاستقبال</option></select>)}
          </div>
          <div className="dd-fa">
            <button type="button" className="dd-btn" onClick={() => setAppointmentModal({ open: false, editing: null, prefill: null })}>إلغاء</button>
            <button type="submit" className="dd-btn pri">حفظ</button>
          </div>
        </form>
      )}

      {/* ===================== نافذة الزيارة ===================== */}
      {visitModal.open && shell(
        visitModal.editing ? 'تعديل سجل الزيارة' : 'تسجيل زيارة طبية جديدة',
        () => setVisitModal({ open: false, editing: null }),
        <form onSubmit={handleSaveVisit} className="dd-form">
          {field('اسم المريض', <input className="dd-in" name="patientName" required defaultValue={visitModal.editing?.patientName || ''} />)}
          <div className="dd-r2">
            {field('رقم الهاتف', <input className="dd-in" name="phone" required defaultValue={visitModal.editing?.phone || ''} />)}
            {field('المبلغ المحصل (ج.م)', <input className="dd-in" type="number" name="paidAmount" required defaultValue={visitModal.editing?.paidAmount || 150} />)}
          </div>
          <div className="dd-r2">
            {field('الخدمة المنفذة', <input className="dd-in" name="serviceName" required defaultValue={visitModal.editing?.serviceName || 'كشف عام'} />)}
            {field('التاريخ', <input className="dd-in" type="date" name="date" required defaultValue={visitModal.editing?.date || new Date().toISOString().split('T')[0]} />)}
          </div>
          {field('التشخيص والملاحظات', <textarea className="dd-in" name="notes" rows={3} defaultValue={visitModal.editing?.notes || ''} />)}
          <div className="dd-fa">
            <button type="button" className="dd-btn" onClick={() => setVisitModal({ open: false, editing: null })}>إلغاء</button>
            <button type="submit" className="dd-btn pri">حفظ الزيارة</button>
          </div>
        </form>
      )}

      {/* ===================== نافذة الخدمة ===================== */}
      {serviceModal.open && shell(
        serviceModal.editing ? 'تعديل الخدمة' : 'إضافة خدمة جديدة',
        () => setServiceModal({ open: false, editing: null }),
        <form onSubmit={handleSaveService} className="dd-form">
          {field('اسم الخدمة', <input className="dd-in" name="name" required defaultValue={serviceModal.editing?.name || ''} />)}
          <div className="dd-r2">
            {field('السعر (ج.م)', <input className="dd-in" type="number" name="price" required defaultValue={serviceModal.editing?.price || 150} />)}
            {field('المدة', <input className="dd-in" name="duration" defaultValue={serviceModal.editing?.duration || '30 دقيقة'} />)}
          </div>
          {field('التصنيف', <select className="dd-in" name="category" defaultValue={serviceModal.editing?.category || 'عام'}><option value="عام">عام</option><option value="تجميلي">تجميلي</option><option value="علاجي">علاجي</option><option value="جراحة">جراحة</option></select>)}
          {field('وصف الخدمة', <textarea className="dd-in" name="description" rows={3} defaultValue={serviceModal.editing?.description || ''} />)}
          <div className="dd-fa">
            <button type="button" className="dd-btn" onClick={() => setServiceModal({ open: false, editing: null })}>إلغاء</button>
            <button type="submit" className="dd-btn pri">حفظ الخدمة</button>
          </div>
        </form>
      )}
    </div>
  );

}
