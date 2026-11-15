// @ts-nocheck
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import emailjs from '@emailjs/browser';
import FloatingChat from './FloatingChat';
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
        'service_wzi547i',      // Service ID
        'template_g3n7nsf',     // Template ID
        {
          to_email: userEmail,
          otp_code: otpCode,
        },
        'hZPUVXx24iZV_-KT4'      // Public Key
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
        const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || import.meta.env.VITE_SUPABASE_PROJECT_URL;
        const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

        // 1. الحفظ في قاعدة البيانات Supabase
        if (SUPABASE_URL && SUPABASE_KEY) {
          await fetch(`${SUPABASE_URL}/rest/v1/patient_accounts`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': SUPABASE_KEY,
              'Authorization': `Bearer ${SUPABASE_KEY}`,
              'Prefer': 'return=representation'
            },
            body: JSON.stringify(fullSignupData)
          });
        }

        // 2. حفظ نسخة محلية احتياطية (عشان يفضل مسجل على الجهاز)
        const registeredPatients = JSON.parse(localStorage.getItem('clinic_registered_patients') || '[]');
        registeredPatients.push({
          id: fullSignupData.id,
          name: fullSignupData.name,
          email: fullSignupData.email,
          phone: fullSignupData.phone,
          passwordHash: fullSignupData.password_hash,
          role: 'patient'
        });
        localStorage.setItem('clinic_registered_patients', JSON.stringify(registeredPatients));
      } catch (err) {
        console.error('خطأ أثناء حفظ الحساب الجديد:', err);
      }
    }
    // -------------------------------------------------------------

    // الدخول بنجاح بعد التأكيد
    localStorage.setItem('clinic_logged_user', JSON.stringify(pendingPatient));
    setCurrentUser(pendingPatient);
    
    // تصفير الذاكرة وإخفاء شاشة الأرقام
    setShowOtpScreen(false);
    setUserEnteredOtp('');
    setGeneratedOtp('');
    setPendingPatient(null);
    setFullSignupData(null); // مسح الذاكرة المؤقتة بعد الحفظ
  } else {
    // لو الكود غلط
    alert('الكود الذي أدخلته غير صحيح، يرجى مراجعة الإيميل والمحاولة مرة أخرى.');
  }
};

  /////////////////////////////////////////////////////////////
  // --- متغيرات بوابة المريض الاحترافية --- //


  ///////////////////////////////////////////////////
// --- متغيرات بوابة المريض الاحترافية ---
const [portalTab, setPortalTab] = useState<'home' | 'book' | 'patients' | 'appointments'>('home');
const [selectedPatientForBook, setSelectedPatientForBook] = useState('');
const [selectedServiceForBook, setSelectedServiceForBook] = useState('');
const [selectedDoctorForBook, setSelectedDoctorForBook] = useState('د. طارق السعيد');
const [selectedDateForBook, setSelectedDateForBook] = useState(() => new Date().toISOString().split('T')[0]);
const [selectedTimeSlot, setSelectedTimeSlot] = useState('');
const [newPatientForm, setNewPatientForm] = useState({ name: '', phone: '', age: '', gender: 'ذكر', notes: '' });
const [portalMessage, setPortalMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);



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
  const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_KEY;

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
        const doctorUser = { id: 'DOC-ADMIN', name: 'د. طارق السعيد', email: secretDocEmail, role: 'doctor' };
        localStorage.setItem('clinic_logged_user', JSON.stringify(doctorUser));
        setCurrentUser(doctorUser);
        return;
      }

      // ب. البحث عن حساب المريض في Supabase أولاً (ليعمل من أي هاتف أو جهاز)
      if (SUPABASE_URL && SUPABASE_KEY) {
       try {
          const res = await fetch(
            `${SUPABASE_URL}/rest/v1/patient_accounts?email=eq.${encodeURIComponent(cleanEmail)}&select=*`,
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

            if (cloudPatient && cloudPatient.password_hash === hashedInputPassword) {
               //استرجاع ملفات المريض وحجوزاته المحفوظة على السحابة ووضعها في المتصفح الحالي
              const patKey = `clinic_my_patients_${cloudPatient.email || cloudPatient.phone}`;
              const aptKey = `clinic_my_apts_${cloudPatient.email || cloudPatient.phone}`;
              if (Array.isArray(cloudPatient.my_patients) && cloudPatient.my_patients.length > 0) {
                localStorage.setItem(patKey, JSON.stringify(cloudPatient.my_patients));
              }
              if (Array.isArray(cloudPatient.my_appointments) && cloudPatient.my_appointments.length > 0) {
                localStorage.setItem(aptKey, JSON.stringify(cloudPatient.my_appointments));
              }

              const safeSessionUser = {
                id: cloudPatient.id,
                name: cloudPatient.name,
               email: cloudPatient.email,
                phone: cloudPatient.phone,
                role: 'patient',
              };
             localStorage.setItem('clinic_logged_user', JSON.stringify(safeSessionUser));
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
      const registeredPatients = JSON.parse(localStorage.getItem('clinic_registered_patients') || '[]');
      const localPatient = registeredPatients.find(
        (p: any) =>
          p.email.toLowerCase() === cleanEmail &&
          (p.passwordHash === hashedInputPassword || p.password === authForm.password)
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
        setAuthError('البريد الإلكتروني أو كلمة المرور غير صحيحة. يرجى التأكد أو إنشاء حساب جديد.');
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
            `${SUPABASE_URL}/rest/v1/patient_accounts?email=eq.${encodeURIComponent(cleanEmail)}&select=email`,
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
              setAuthError('هذا البريد الإلكتروني مسجل بالفعل. يرجى تسجيل الدخول.');
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
  my_appointments: []
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
        await new Promise(r => setTimeout(r, 1500));
        const resPat = await fetch(API_ENDPOINTS.PATIENTS, {
          cache: 'no-store',
        });
        if (resPat.ok) {
          const patData = await resPat.json();
          if (Array.isArray(patData)) {
            setApiStatus((prev) => ({ ...prev, patientsOk: true }));
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
    const timer = setInterval(() => {
      syncAllFromAPI(false);
    }, 60000);
    return () => clearInterval(timer);
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

  const handleDeletePatient = async (id) => {
    const strId = String(id);
    setPatients((prev) => prev.filter((p) => String(p.id) !== strId));
    try {
      await fetch(`${API_ENDPOINTS.PATIENTS}/${strId}`, { method: 'DELETE' });
      showNotification('تم حذف ملف المريض نهائياً من التطبيق ومن MockAPI!');
    } catch {
      showNotification('تم حذف المريض.', 'info');
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

  const handleDeleteVisit = (id) => {
    setVisits((prev) => prev.filter((v) => String(v.id) !== String(id)));
    showNotification('تم حذف سجل الزيارة.');
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

  const filteredAppointments = useMemo(() => {
    if (appointmentFilter === 'الكل') return appointments;
    return appointments.filter((a) => a.status === appointmentFilter);
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
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4" dir="rtl">
      <div className="max-w-md w-full bg-slate-800 rounded-2xl p-8 border border-slate-700 shadow-2xl relative overflow-hidden">
        {/* تأثير الإضاءة في الخلفية */}
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-sky-500 to-indigo-500"></div>
        
        <div className="text-center mb-8">
          <div className="bg-sky-500/10 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 border border-sky-500/20">
            <ShieldCheck className="w-10 h-10 text-sky-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">كود الأمان (OTP)</h2>
          <p className="text-sm text-slate-400">
            تم إرسال كود من 6 أرقام إلى بريدك الإلكتروني.
            <br /> يرجى إدخاله هنا لإتمام تسجيل الدخول.
          </p>
          <div className="mt-3 p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg">
            <p className="text-xs text-amber-400">
              ⚠️ تنبيه: يرجى التحقق من مجلد الرسائل المزعجة (Spam) إذا لم تجد الكود في البريد الوارد.
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
              onChange={(e) => setUserEnteredOtp(e.target.value.replace(/\D/g, ''))} // السماح بالأرقام فقط
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
      <div dir="rtl" className="min-h-screen bg-slate-950 flex items-center justify-center p-4 font-sans text-white">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl">
          <div className="text-center mb-6">
            <div className="w-14 h-14 bg-teal-500/20 text-teal-400 rounded-2xl flex items-center justify-center mx-auto mb-3 border border-teal-500/30">
              <Stethoscope className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold text-white">عيادة الابتسامة الذكية</h1>
            <p className="text-slate-400 text-sm mt-1">تسجيل الدخول للمرضى والأطباء</p>
          </div>

          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-800 rounded-xl mb-6">
            <button
              type="button"
              onClick={() => { setAuthMode('login'); setAuthError(''); }}
              className={`py-2.5 rounded-lg text-sm font-bold transition ${
                authMode === 'login' ? 'bg-teal-500 text-slate-950' : 'text-slate-400 hover:text-white'
              }`}
            >
              تسجيل دخول (Login)
            </button>
            <button
              type="button"
              onClick={() => { setAuthMode('signup'); setAuthError(''); }}
              className={`py-2.5 rounded-lg text-sm font-bold transition ${
                authMode === 'signup' ? 'bg-teal-500 text-slate-950' : 'text-slate-400 hover:text-white'
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
                <label className="block text-xs text-slate-300 mb-1">اسم </label>
                <input
                  type="text"
                  required
                  placeholder="name"
                  value={authForm.name}
                  onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm"
                />
              </div>
            )}

            <div>
              <label className="block text-xs text-slate-300 mb-1">البريد الإلكتروني</label>
              <input
                type="email"
                required
                placeholder="email"
                value={authForm.email}
                onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
                className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm"
              />
            </div>
            {authMode === 'signup' && (
  <div>
    <label className="block text-xs text-slate-300 mb-1">رقم الهاتف (للمريض لربط ملفه)</label>
    <input
      type="tel"
      placeholder="phone"
      value={authForm.phone}
      onChange={(e) => setAuthForm({ ...authForm, phone: e.target.value })}
      className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700"
    />
  </div>
)}

            <div>
              <label className="block text-xs text-slate-300 mb-1">كلمة المرور</label>
              <input
                type="password"
                required
                placeholder="password"
                value={authForm.password}
                onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
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
    '10:00 ص', '10:30 ص', '11:00 ص', '11:30 ص',
    '12:00 م', '12:30 م', '01:00 م', '01:30 م',
    '04:00 م', '04:30 م', '05:00 م', '05:30 م',
    '06:00 م', '06:30 م', '07:00 م', '07:30 م',
    '08:00 م', '08:30 م', '09:00 م'
  ];

  // فحص هل المريض حضر العيادة وتم تسجيل زيارته في قسم "الزيارات والمتابعة" لدى الدكتور؟
  const isAppointmentCompletedInVisits = (apt: any) => {
    if (apt.status === 'مكتمل' || apt.status === 'Completed') return true;
    return visits.some(
      (v: any) =>
        (v.patientName?.trim() === apt.patientName?.trim() || v.patientId === apt.patientId) &&
        (!v.date || !apt.date || v.date >= apt.date)
    );
  };

  // فحص هل المريض لديه حجز نشط لم يكتمل بعد؟
  const hasActiveUncompletedBooking = (patientName: string) => {
    if (!patientName) return false;
    return appointments.some(
      (apt: any) =>
        apt.patientName?.trim().toLowerCase() === patientName.trim().toLowerCase() &&
        apt.status !== 'ملغي' &&
        apt.status !== 'Cancelled' &&
        !isAppointmentCompletedInVisits(apt)
    );
  };





// 1. استرجاع ودمج ملفات المرضى الخاصة بحساب العميل (ثابتة ضد الـ Reload وبدون Hooks)
const storagePatientsKey = `clinic_my_patients_${currentUser.email || currentUser.phone}`;
const savedPortalPatients = JSON.parse(localStorage.getItem(storagePatientsKey) || '[]');
const myRegisteredPatients = [
  ...savedPortalPatients,
  ...patients.filter(
    (p: any) =>
      (String(p.phone).trim() === String(currentUser.phone).trim() ||
        String(p.createdByAccount).trim().toLowerCase() === String(currentUser.email).trim().toLowerCase()) &&
      !savedPortalPatients.some((sp: any) => sp.id === p.id || sp.name === p.name)
  ),
];

const myPatientNames = new Set([
  currentUser.name?.trim().toLowerCase(),
  ...myRegisteredPatients.map((p: any) => p.name?.trim().toLowerCase()),
]);

// 2. استرجاع ودمج حجوزات العميل (ثابتة ضد الـ Reload وبدون Hooks)
const storageAptsKey = `clinic_my_apts_${currentUser.email || currentUser.phone}`;
const savedPortalApts = JSON.parse(localStorage.getItem(storageAptsKey) || '[]');
const myAppointments = [
  ...savedPortalApts,
  ...appointments.filter(
    (apt: any) =>
      (String(apt.phone).trim() === String(currentUser.phone).trim() ||
        myPatientNames.has(apt.patientName?.trim().toLowerCase())) &&
      !savedPortalApts.some((sa: any) => sa.id === apt.id)
  ),
];





  //////////////////////
// 1. دالة تسجيل ملف مريض جديد من بوابة العميل + حفظه في الـ API الخاص بالدكتور
const handleAddPatientFromPortal = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!newPatientForm.name.trim() || !newPatientForm.phone.trim()) {
    setPortalMessage({ type: 'error', text: 'يرجى إدخال اسم المريض ورقم الهاتف!' });
    return;
  }

  const exists = patients.some(
    (p: any) => p.name?.trim().toLowerCase() === newPatientForm.name.trim().toLowerCase()
  );
  if (exists) {
    setPortalMessage({ type: 'error', text: 'هذا الاسم مسجل بالفعل في ملفات المرضى، يمكنك الحجز له مباشرة.' });
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

    localStorage.setItem(storagePatientsKey, JSON.stringify([savedPat, ...myRegisteredPatients]));

    localStorage.setItem(STORAGE_KEYS.PATIENTS, JSON.stringify(updatedPatients));

    ////////////////////

    if (SUPABASE_URL && SUPABASE_KEY) {
      fetch(
        `${SUPABASE_URL}/rest/v1/patient_accounts?email=eq.${encodeURIComponent(currentUser.email.toLowerCase())}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
          },
         // body: JSON.stringify({ my_appointments: [savedApt, ...myAppointments] }),
         body: JSON.stringify({ my_patients: [savedPat, ...myRegisteredPatients] }),
        }
      ).catch(() => {});
    }

    ///////////////////////
    setSelectedPatientForBook(savedPat.name);
    setNewPatientForm({ name: '', phone: '', age: '', gender: 'ذكر', notes: '' });
    setPortalMessage({ type: 'success', text: `تم فتح ملف طبي للمريض "${savedPat.name}" وحفظه في قاعدة البيانات السحابية بنجاح!` });
    setPortalTab('book');
  } catch (err) {
    setPortalMessage({ type: 'error', text: 'حدث خطأ أثناء الاتصال بالـ API، يرجى المحاولة مرة أخرى.' });
  }
};

// 2. دالة تأكيد حجز الموعد من الجدول + حفظه في الـ API الخاص بالدكتور
const handleBookFromPortal = async (e: React.FormEvent) => {
  e.preventDefault();
  setPortalMessage(null);

  if (!selectedPatientForBook) {
    setPortalMessage({ type: 'error', text: 'يجب اختيار اسم المريض أولاً (أو تسجيل ملف مريض جديد قبل الحجز)!' });
    return;
  }
  if (!selectedServiceForBook) {
    setPortalMessage({ type: 'error', text: 'يرجى اختيار الخدمة المطلوبة!' });
    return;
  }
  if (!selectedTimeSlot) {
    setPortalMessage({ type: 'error', text: 'يرجى اختيار ساعة الموعد من جدول المواعيد المتاحة بالأسفل!' });
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
    setPortalMessage({ type: 'error', text: 'هذا التوقيت تم حجزه للتو، يرجى اختيار توقيت آخر متاح من الجدول.' });
    return;
  }

  const patObj = patients.find((p: any) => p.name === selectedPatientForBook);
  const srvObj = services.find((s: any) => s.name === selectedServiceForBook);

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
    if (typeof API_ENDPOINTS !== 'undefined' && API_ENDPOINTS.APPOINTMENTS) {
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

    localStorage.setItem(storageAptsKey, JSON.stringify([savedApt, ...myAppointments]));


    localStorage.setItem(STORAGE_KEYS.APPOINTMENTS, JSON.stringify(updatedApts));
    setSelectedTimeSlot('');
    setPortalMessage({
      type: 'success',
      text: `تم حجز موعد للمريض "${selectedPatientForBook}" يوم ${selectedDateForBook} الساعة ${selectedTimeSlot} وحفظه في السحابة بنجاح!`,
    });
    setPortalTab('appointments');
  } catch (err) {
    setPortalMessage({ type: 'error', text: 'حدث خطأ أثناء حفظ الموعد في الـ API.' });
  }
};


  /////////////////////

  return (
    <div dir="rtl" className="min-h-screen bg-slate-950 text-white font-sans pb-16">
      <div className="bg-gradient-to-l from-teal-900/50 via-slate-900 to-slate-950 border-b border-slate-800">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-teal-400 to-emerald-600 text-slate-950 flex items-center justify-center shadow-lg shadow-teal-500/20">
                <Stethoscope className="w-9 h-9" />
              </div>
              <div>
                <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30">
                  ✨ البوابة الذكية للمرضى والحجوزات الفورية
                </span>
                <h1 className="text-2xl md:text-3xl font-extrabold text-white mt-2">
                  أهلاً بك، {currentUser.name} 👋
                </h1>
                <p className="text-slate-400 text-xs mt-1">
                  إدارة ملفات عائلتك الطبية، استعراض الخدمات، وحجز المواعيد المباشرة من جدول العيادة
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setPortalTab('book')}
                className="px-5 py-3 rounded-2xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-extrabold text-xs shadow-lg shadow-teal-500/20 transition cursor-pointer"
              >
                📅 احجز موعداً الآن
              </button>
              <button
                onClick={handleLogout}
                className="px-4 py-3 rounded-2xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 font-bold text-xs transition cursor-pointer"
              >
                🚪 تسجيل الخروج
              </button>
            </div>
            <FloatingChat patientId={currentUser ? currentUser.id : "test-user"} />
          </div>

          <div className="flex flex-wrap gap-2 mt-8 pt-6 border-t border-slate-800/80">
            {[
              { id: 'home', label: '✨ خدمات العيادة والأسعار', count: services.length },
              { id: 'patients', label: '👥 تسجيل وملفات المرضى', count: myRegisteredPatients.length },
              { id: 'book', label: '🕒 جدول المواعيد والحجز', count: null },
              { id: 'appointments', label: '📋 حجوزاتي ومتابعة الزيارات', count: myAppointments.length },
            ].map((t: any) => (
              <button
                key={t.id}
                onClick={() => { setPortalTab(t.id as any); setPortalMessage(null); }}
                className={`px-5 py-3 rounded-2xl text-xs font-bold flex items-center gap-2 transition cursor-pointer ${
                  portalTab === t.id
                    ? 'bg-teal-500 text-slate-950 shadow-lg shadow-teal-500/20'
                    : 'bg-slate-900/90 text-slate-300 hover:bg-slate-800 border border-slate-800'
                }`}
              >
                <span>{t.label}</span>
                {t.count !== null && (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] ${
                    portalTab === t.id ? 'bg-slate-950 text-teal-400' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {t.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 mt-8 space-y-8">
        {portalMessage && (
          <div className={`p-4 rounded-2xl border text-xs font-bold flex items-center justify-between ${
            portalMessage.type === 'error'
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
          }`}>
            <span>{portalMessage.text}</span>
            <button onClick={() => setPortalMessage(null)} className="text-slate-400 hover:text-white">✕</button>
          </div>
        )}

        {portalTab === 'home' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-extrabold text-white">🦷 خدمات العيادة التخصصية</h2>
                <p className="text-xs text-slate-400 mt-1">اختر الخدمة المناسبة لك واحجز موعدك مباشرة من الجدول التفاعلي</p>
              </div>
              <button
                onClick={() => setPortalTab('patients')}
                className="px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-teal-400 text-xs font-bold hover:bg-slate-800"
              >
                + تسجيل ملف مريض جديد
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {services.map((srv: any) => (
                <div
                  key={srv.id}
                  className="group bg-slate-900/90 border border-slate-800 hover:border-teal-500/50 rounded-3xl p-6 transition-all duration-300 flex flex-col justify-between shadow-xl"
                >
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-teal-500/10 text-teal-400 border border-teal-500/20">
                        {srv.category || 'خدمة طبية'}
                      </span>
                      <span className="text-xs text-slate-400 flex items-center gap-1">
                        ⏱ {srv.duration || '30 دقيقة'}
                      </span>
                    </div>
                    <h3 className="text-lg font-extrabold text-white group-hover:text-teal-400 transition">
                      {srv.name}
                    </h3>
                    <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                      رعاية طبية متكاملة بأحدث أجهزة طب الأسنان مع متابعة دقيقة لملفك الطبي.
                    </p>
                  </div>

                  <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-slate-400 block">تكلفة الجلسة</span>
                      <span className="text-xl font-black text-teal-400">{srv.price} <small className="text-xs">ج.م</small></span>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedServiceForBook(srv.name);
                        setPortalTab('book');
                      }}
                      className="px-4 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs transition cursor-pointer"
                    >
                      احجز هذه الخدمة ←
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {portalTab === 'patients' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 bg-slate-900 border border-slate-800 rounded-3xl p-6">
              <h3 className="text-base font-extrabold text-white mb-1">➕ فتح ملف مريض جديد</h3>
              <p className="text-xs text-slate-400 mb-5">
                يجب تسجيل ملف المريض أولاً قبل حجز موعد له (يمكنك تسجيل نفسك أو أي فرد من عائلتك).
              </p>

              <form onSubmit={handleAddPatientFromPortal} className="space-y-4 text-xs">
                <div>
                  <label className="block text-slate-300 mb-1 font-bold">اسم المريض الثلاثي *</label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: أحمد محمد علي"
                    value={newPatientForm.name}
                    onChange={(e) => setNewPatientForm({ ...newPatientForm, name: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1 font-bold">رقم الهاتف *</label>
                  <input
                    type="tel"
                    required
                    placeholder="01012345678"
                    value={newPatientForm.phone}
                    onChange={(e) => setNewPatientForm({ ...newPatientForm, phone: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 mb-1 font-bold">السن</label>
                    <input
                      type="number"
                      placeholder="28"
                      value={newPatientForm.age}
                      onChange={(e) => setNewPatientForm({ ...newPatientForm, age: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 mb-1 font-bold">النوع</label>
                    <select
                      value={newPatientForm.gender}
                      onChange={(e) => setNewPatientForm({ ...newPatientForm, gender: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white"
                    >
                      <option value="ذكر">ذكر</option>
                      <option value="أنثى">أنثى</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-slate-300 mb-1 font-bold">ملاحظات صحية أو شكوى</label>
                  <textarea
                    rows={2}
                    placeholder="أي حساسية أو أمراض مزمنة..."
                    value={newPatientForm.notes}
                    onChange={(e) => setNewPatientForm({ ...newPatientForm, notes: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-3.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-extrabold transition cursor-pointer"
                >
                  حفظ ملف المريض والانتقال للحجز
                </button>
              </form>
            </div>

            <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-3xl p-6">
              <h3 className="text-base font-extrabold text-white mb-4">👥 ملفات المرضى المسجلة لديك</h3>
              {myRegisteredPatients.length === 0 ? (
                <div className="text-center py-12 bg-slate-950/60 rounded-2xl border border-slate-800/80">
                  <p className="text-sm text-slate-400">لم تقم بتسجيل أي ملف مريض بعد.</p>
                  <p className="text-xs text-slate-500 mt-1">سجّل ملف المريض من النموذج الجانبي لتتمكن من الحجز له.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {myRegisteredPatients.map((pat: any) => {
                    const hasActive = hasActiveUncompletedBooking(pat.name);
                    return (
                      <div key={pat.id} className="p-5 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between">
                            <span className="font-extrabold text-sm text-white">{pat.name}</span>
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                              hasActive ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/20 text-emerald-300'
                            }`}>
                              {hasActive ? 'لديه حجز قيد الانتظار' : 'متاح لحجز موعد'}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 mt-2">📱 الهاتف: {pat.phone} | السن: {pat.age || '-'}</p>
                          {pat.notes && <p className="text-[11px] text-slate-500 mt-1">📝 {pat.notes}</p>}
                        </div>

                        <button
                          onClick={() => {
                            setSelectedPatientForBook(pat.name);
                            setPortalTab('book');
                          }}
                          disabled={hasActive}
                          className={`mt-4 w-full py-2.5 rounded-xl text-xs font-bold transition ${
                            hasActive
                              ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                              : 'bg-teal-500/20 text-teal-300 hover:bg-teal-500 hover:text-slate-950 cursor-pointer'
                          }`}
                        >
                          {hasActive ? '⏳ لا يمكن الحجز قبل إتمام الزيارة الحالية' : '📅 حجز موعد لهذا المريض'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {portalTab === 'book' && (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-5 border-b border-slate-800">
              <div>
                <h2 className="text-xl font-extrabold text-white">🕒 حجز موعد من جدول العيادة المباشر</h2>
                <p className="text-xs text-slate-400 mt-1">
                  ملاحظة: كل مريض يحق له حجز موعد واحد فقط حتى يحضر العيادة ويسجل الطبيب زيارته في قسم المتابعة.
                </p>
              </div>
              <button
                onClick={() => setPortalTab('patients')}
                className="px-4 py-2.5 rounded-xl bg-teal-500/10 border border-teal-500/30 text-teal-300 text-xs font-bold hover:bg-teal-500/20"
              >
                + تسجيل مريض جديد غير موجود بالقائمة
              </button>
            </div>

            <form onSubmit={handleBookFromPortal} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <div>
                  <label className="block text-slate-300 mb-2 font-bold">1. اختر اسم المريض المسجل *</label>
                  <select
                    required
                    value={selectedPatientForBook}
                    onChange={(e) => setSelectedPatientForBook(e.target.value)}
                    className="w-full px-4 py-3.5 rounded-xl bg-slate-800 border border-slate-700 text-white font-bold"
                  >
                    <option value="">-- اختر مريضاً من ملفاتك --</option>
                    {myRegisteredPatients.map((p: any) => {
                      const locked = hasActiveUncompletedBooking(p.name);
                      return (
                        <option key={p.id} value={p.name}>
                          {p.name} {locked ? '(لديه موعد نشط - ينتظر الكشف)' : '(متاح للحجز ✅)'}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 mb-2 font-bold">2. اختر الخدمة الطبية *</label>
                  <select
                    required
                    value={selectedServiceForBook}
                    onChange={(e) => setSelectedServiceForBook(e.target.value)}
                    className="w-full px-4 py-3.5 rounded-xl bg-slate-800 border border-slate-700 text-white font-bold"
                  >
                    <option value="">-- اختر الخدمة --</option>
                    {services.map((s: any) => (
                      <option key={s.id} value={s.name}>
                        {s.name} ({s.price} ج.م)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 mb-2 font-bold">3. اختر تاريخ اليوم لعرض الجدول *</label>
                  <input
                    type="date"
                    required
                    min={new Date().toISOString().split('T')[0]}
                    value={selectedDateForBook}
                    onChange={(e) => {
                      setSelectedDateForBook(e.target.value);
                      setSelectedTimeSlot('');
                    }}
                    className="w-full px-4 py-3.5 rounded-xl bg-slate-800 border border-slate-700 text-white font-bold"
                  />
                </div>
              </div>

              {selectedPatientForBook && hasActiveUncompletedBooking(selectedPatientForBook) && (
                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-bold">
                  ⚠️ تنبيه: المريض ({selectedPatientForBook}) لديه حجز قادم لم يتم الكشف عليه بعد في سجل زيارات الطبيب! لا يمكن حجز موعد ثانٍ له إلا بعد إتمام زيارته الحالية، أو يمكنك اختيار/تسجيل مريض آخر.
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-xs font-bold text-slate-300">
                    4. جدول مواعيد يوم ({selectedDateForBook}) - اختر التوقيت المتاح:
                  </label>
                  <div className="flex items-center gap-4 text-[11px]">
                    <span className="flex items-center gap-1.5 text-emerald-400">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span> متاح للحجز
                    </span>
                    <span className="flex items-center gap-1.5 text-rose-400">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block"></span> محجوز (غير متاح)
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3 p-4 rounded-2xl bg-slate-950 border border-slate-800">
                  {CLINIC_TIME_SLOTS.map((slot) => {
                    const bookedApt = appointments.find(
                      (apt: any) =>
                        apt.date === selectedDateForBook &&
                        apt.time === slot &&
                        apt.status !== 'ملغي'
                    );
                    const isBooked = Boolean(bookedApt);
                    const isSelected = selectedTimeSlot === slot;

                    return (
                      <button
                        key={slot}
                        type="button"
                        disabled={isBooked}
                        onClick={() => setSelectedTimeSlot(slot)}
                        className={`py-3 px-3 rounded-xl text-xs font-bold border transition flex flex-col items-center justify-center gap-1 ${
                          isBooked
                            ? 'bg-rose-500/10 border-rose-500/30 text-rose-400 opacity-60 cursor-not-allowed'
                            : isSelected
                            ? 'bg-teal-500 border-teal-400 text-slate-950 shadow-lg shadow-teal-500/30 scale-105 cursor-pointer'
                            : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300 hover:bg-emerald-500/20 cursor-pointer'
                        }`}
                      >
                        <span>{slot}</span>
                        <span className="text-[10px] font-normal">
                          {isBooked ? '❌ غير متاح' : isSelected ? '✓ تم الاختيار' : '🟢 متاح'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                type="submit"
                disabled={!selectedPatientForBook || hasActiveUncompletedBooking(selectedPatientForBook)}
                className="w-full py-4 rounded-2xl bg-teal-500 hover:bg-teal-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-extrabold text-sm transition cursor-pointer"
              >
                تأكيد حجز الموعد في الجدول
              </button>
            </form>
          </div>
        )}

        {portalTab === 'appointments' && (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
            <h2 className="text-lg font-extrabold text-white mb-4">📋 سجل حجوزاتك وحالة الكشف والزيارات</h2>
            {myAppointments.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-10 bg-slate-950 rounded-2xl">
                لا توجد حجوزات مسجلة حتى الآن.
              </p>
            ) : (
              <div className="space-y-3">
                {myAppointments.map((apt: any) => {
                  const visited = isAppointmentCompletedInVisits(apt);
                  return (
                    <div
                      key={apt.id}
                      className="p-5 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-base text-white">المريض: {apt.patientName}</span>
                          <span className="text-xs text-teal-400 font-bold">({apt.service})</span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">
                          📅 التاريخ: {apt.date} | 🕒 الساعة: {apt.time} | 👨‍⚕️ {apt.doctor || 'د. طارق السعيد'}
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        {visited ? (
                          <span className="px-4 py-1.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            ✅ حضر العيادة وتم تسجيل الزيارة (يمكنه الحجز مجدداً)
                          </span>
                        ) : (
                          <span className="px-4 py-1.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            ⏳ حجز نشط ({apt.status || 'بانتظار حضور المريض للكشف'})
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}





///////////////////////////////////////////////////////




  return (
    <div
      dir="rtl"
      className="min-h-screen bg-[#f3f5f1] text-slate-800 flex flex-col md:flex-row font-sans"
    >
      {/* إشعار عائم في أسفل الشاشة */}
      {toast && (
        <div className="fixed bottom-6 left-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-xl border bg-white border-emerald-200 text-slate-800">
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              toast.type === 'error' ? 'bg-rose-500' : 'bg-[#14805e]'
            }`}
          />
          <span className="text-sm font-bold">{toast.message}</span>
        </div>
      )}

      {/* ====================================================================
          القائمة الجانبية اليمنى (مطابقة للصورة 100%)
      ==================================================================== */}
      <aside className="w-full md:w-72 bg-[#fafbf9] border-l border-slate-200/80 flex flex-col justify-between p-5 shrink-0">
        <div>
          {/* رأس القائمة والشعار */}
          <div className="flex items-center justify-between pb-6 mb-5 border-b border-slate-200/70">
            <div>
              <h1 className="font-extrabold text-lg text-slate-800">
                عيادة الأسنان الذكية
              </h1>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs text-slate-500 font-medium">
                  متصل بالقاعدة السحابية
                </span>
              </div>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-[#147a60] flex items-center justify-center text-white shadow-sm">
              <Stethoscope className="w-6 h-6" />
            </div>
          </div>



          <button
            onClick={handleLogout}
            className="w-full mb-4 py-2.5 px-4 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold text-xs flex items-center justify-center gap-2 border border-rose-200 transition cursor-pointer"
          >
            🚪 تسجيل الخروج من الحساب
          </button>






          <div className="text-xs font-bold text-slate-400 px-2 mb-3">
            القائمة الرئيسية
          </div>

          {/* عناصر التنقل */}
          <nav className="space-y-2">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`w-full flex items-center justify-between px-4 py-3.5 rounded-2xl text-sm font-bold transition-all ${
                activeTab === 'dashboard'
                  ? 'bg-[#147a60] text-white shadow-md shadow-teal-900/10'
                  : 'text-slate-700 hover:bg-slate-200/50'
              }`}
            >
              <span>لوحة التحكم</span>
              <LayoutGrid className="w-5 h-5" />
            </button>

            <button
              onClick={() => setActiveTab('patients')}
              className={`w-full flex items-center justify-between px-4 py-3.5 rounded-2xl text-sm font-bold transition-all ${
                activeTab === 'patients'
                  ? 'bg-[#147a60] text-white shadow-md shadow-teal-900/10'
                  : 'text-slate-700 hover:bg-slate-200/50'
              }`}
            >
              <span
                className={`px-2.5 py-0.5 text-xs rounded-full font-extrabold ${
                  activeTab === 'patients'
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-200/80 text-slate-700'
                }`}
              >
                {patients.length}
              </span>
              <div className="flex items-center gap-3">
                <span>ملفات المرضى</span>
                <Users className="w-5 h-5" />
              </div>
            </button>

            <button
              onClick={() => setActiveTab('appointments')}
              className={`w-full flex items-center justify-between px-4 py-3.5 rounded-2xl text-sm font-bold transition-all ${
                activeTab === 'appointments'
                  ? 'bg-[#147a60] text-white shadow-md shadow-teal-900/10'
                  : 'text-slate-700 hover:bg-slate-200/50'
              }`}
            >
              <span
                className={`px-2.5 py-0.5 text-xs rounded-full font-extrabold ${
                  activeTab === 'appointments'
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-200/80 text-slate-700'
                }`}
              >
                {appointments.length}
              </span>
              <div className="flex items-center gap-3">
                <span>حجز المواعيد</span>
                <Calendar className="w-5 h-5" />
              </div>
            </button>

            <button
              onClick={() => setActiveTab('visits')}
              className={`w-full flex items-center justify-between px-4 py-3.5 rounded-2xl text-sm font-bold transition-all ${
                activeTab === 'visits'
                  ? 'bg-[#147a60] text-white shadow-md shadow-teal-900/10'
                  : 'text-slate-700 hover:bg-slate-200/50'
              }`}
            >
              <span
                className={`px-2.5 py-0.5 text-xs rounded-full font-extrabold ${
                  activeTab === 'visits'
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-200/80 text-slate-700'
                }`}
              >
                {visits.length}
              </span>
              <div className="flex items-center gap-3">
                <span>الزيارات والمتابعة</span>
                <Stethoscope className="w-5 h-5" />
              </div>
            </button>

            <button
              onClick={() => setActiveTab('services')}
              className={`w-full flex items-center justify-between px-4 py-3.5 rounded-2xl text-sm font-bold transition-all ${
                activeTab === 'services'
                  ? 'bg-[#147a60] text-white shadow-md shadow-teal-900/10'
                  : 'text-slate-700 hover:bg-slate-200/50'
              }`}
            >
              <span
                className={`px-2.5 py-0.5 text-xs rounded-full font-extrabold ${
                  activeTab === 'services'
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-200/80 text-slate-700'
                }`}
              >
                {services.length}
              </span>
              <div className="flex items-center gap-3">
                <span>الخدمات والأسعار</span>
                <Sparkles className="w-5 h-5" />
              </div>
            </button>

            <button
              onClick={() => setActiveTab('n8n')}
              className={`w-full flex items-center justify-between px-4 py-3.5 rounded-2xl text-sm font-bold transition-all border ${
                activeTab === 'n8n'
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-md'
                  : 'bg-[#eef1f6] text-slate-800 border-slate-200 hover:bg-slate-200/70'
              }`}
            >
              <span className="px-2.5 py-0.5 text-[11px] rounded-full bg-blue-700 text-white font-bold">
                Webhook
              </span>
              <div className="flex items-center gap-2.5">
                <div className="text-right leading-tight">
                  <div>الربط الذكي (n8n &</div>
                  <div className="text-xs">(AI</div>
                </div>
                <Bot
                  className={`w-5 h-5 ${
                    activeTab === 'n8n' ? 'text-white' : 'text-blue-700'
                  }`}
                />
              </div>
            </button>
          </nav>
        </div>

        {/* الكارت السفلي الداكن في القائمة الجانبية */}
        <div className="mt-6 bg-[#0d2420] text-white p-4 rounded-2xl shadow-lg border border-teal-900/40">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] bg-emerald-500/20 text-emerald-300 px-2.5 py-0.5 rounded-full font-bold">
              نشط
            </span>
            <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
              <span>وكيل الذكاء الاصطناعي n8n</span>
              <Bot className="w-4 h-4" />
            </span>
          </div>
          <p className="text-[11px] text-slate-300 leading-relaxed text-right">
            يمكن للوكيل الذكي تسجيل المرضى، حجز المواعيد، وتأكيدها تلقائياً عبر
            Webhook.
          </p>
        </div>
      </aside>

      {/* ====================================================================
          منطقة المحتوى الرئيسي
      ==================================================================== */}
      <main className="flex-1 p-4 md:p-7 overflow-y-auto space-y-6">
        {/* البانر العلوي الموحد (مطابق للصور 100%) */}
        <div className="bg-[#f8f9f7] rounded-3xl p-6 shadow-sm border border-slate-200/80 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-6">
          {/* العمود الأيمن: عنوان القسم والرابط الفعلي */}
          <div className="flex-1 text-right">
            <div className="flex flex-wrap items-center justify-start gap-3 mb-2">
              <h2 className="text-2xl font-black text-slate-800">
                {currentBannerInfo.title}
              </h2>
              <span className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-[#147a60] border border-emerald-200">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>{currentBannerInfo.badge}</span>
              </span>
            </div>

            <div className="text-xs text-slate-500 font-medium mb-1.5">
              مربوط فعلياً عبر HTTP Request بالرابط:
            </div>
            <div
              onClick={() => handleCopy(currentBannerInfo.url)}
              title="اضغط لنسخ الرابط"
              className="inline-flex items-center gap-2 bg-white hover:bg-slate-50 cursor-pointer px-3.5 py-1.5 rounded-xl border border-slate-200 text-slate-700 font-mono text-xs transition-all"
            >
              <span dir="ltr">{currentBannerInfo.url}</span>
              {copiedText === currentBannerInfo.url ? (
                <Check className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-slate-400" />
              )}
            </div>
          </div>

          {/* العمود الأيسر: الأزرار الأربعة مرتبة كما في الصورة تماماً */}
          <div className="flex flex-col sm:flex-row lg:flex-col gap-2.5 w-full lg:w-52 shrink-0">
            <button
              onClick={() => syncAllFromAPI(true)}
              disabled={isSyncing}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-[#168a5c] hover:bg-[#12704a] text-white text-xs font-extrabold shadow-sm transition-all disabled:opacity-60"
            >
              <span>{currentBannerInfo.syncBtnText}</span>
              <RefreshCw
                className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`}
              />
            </button>

            <button
              onClick={handlePushServicesToAPI}
              disabled={isPushingServices}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-[#2557d6] hover:bg-[#1d46b0] text-white text-xs font-extrabold shadow-sm transition-all disabled:opacity-60"
            >
              <span>إرسال الخدمات للـ API الآن</span>
              <RefreshCw
                className={`w-4 h-4 ${isPushingServices ? 'animate-spin' : ''}`}
              />
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setPatientModal({ open: true, editing: null })}
                className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-[#eef1ee] hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all"
              >
                <span>مريض جديد</span>
                <UserPlus className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={() =>
                  setAppointmentModal({
                    open: true,
                    editing: null,
                    prefill: null,
                  })
                }
                className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-[#147a60] hover:bg-[#0f604b] text-white text-xs font-bold shadow-sm transition-all"
              >
                <span>حجز موعد</span>
                <Calendar className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* ====================================================================
            التبويب 1: لوحة التحكم (Dashboard)
        ==================================================================== */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {/* الكروت الإحصائية الأربعة (نفس الترتيب والألوان في الصورة) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* 1. إجمالي ملفات المرضى */}
              <div className="bg-[#f8f9f7] rounded-3xl p-6 shadow-sm border border-slate-200/80 flex flex-col items-center text-center justify-between">
                <span className="text-xs font-bold text-slate-500 mb-3">
                  إجمالي ملفات المرضى
                </span>
                <div className="flex items-center gap-4 my-1">
                  <span className="text-4xl font-black text-slate-800">
                    {patients.length}
                  </span>
                  <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-[#147a60] flex items-center justify-center">
                    <Users className="w-6 h-6" />
                  </div>
                </div>
                <span className="text-xs text-slate-500 mt-3">
                  مسجلين في قاعدة البيانات
                </span>
              </div>

              {/* 2. المواعيد المؤكدة / الانتظار */}
              <div className="bg-[#f8f9f7] rounded-3xl p-6 shadow-sm border border-slate-200/80 flex flex-col items-center text-center justify-between">
                <span className="text-xs font-bold text-slate-500 mb-2">
                  المواعيد المؤكدة / الانتظار
                </span>
                <div className="flex items-center gap-3 my-1">
                  <div className="text-3xl font-black text-slate-800">
                    {dashboardStats.confirmed}{' '}
                    <span className="text-base font-bold text-amber-600">
                      / {dashboardStats.pending}
                    </span>
                  </div>
                  <div className="w-11 h-11 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                    <Calendar className="w-6 h-6" />
                  </div>
                </div>
                <div className="text-sm font-bold text-amber-600">انتظار</div>
                <span className="text-xs text-slate-500 mt-1">
                  مواعيد اليوم: {dashboardStats.todayCount}
                </span>
              </div>

              {/* 3. الزيارات والمتابعات الطبية */}
              <div className="bg-[#f8f9f7] rounded-3xl p-6 shadow-sm border border-slate-200/80 flex flex-col items-center text-center justify-between">
                <span className="text-xs font-bold text-slate-500 mb-3">
                  الزيارات والمتابعات الطبية
                </span>
                <div className="flex items-center gap-4 my-1">
                  <span className="text-4xl font-black text-slate-800">
                    {visits.length}
                  </span>
                  <div className="w-11 h-11 rounded-2xl bg-teal-50 text-[#147a60] flex items-center justify-center">
                    <Stethoscope className="w-6 h-6" />
                  </div>
                </div>
                <span className="text-xs text-slate-500 mt-3">
                  إجمالي التحصيل: {dashboardStats.totalRevenue} ر.س
                </span>
              </div>

              {/* 4. عمليات وكيل الذكاء الاصطناعي (الكارت الأزرق) */}
              <div className="bg-gradient-to-b from-[#1d56d8] to-[#1542ad] text-white rounded-3xl p-6 shadow-md flex flex-col items-center text-center justify-between">
                <span className="text-xs font-bold text-blue-100 mb-3">
                  عمليات وكيل الذكاء الاصطناعي
                </span>
                <div className="flex items-center gap-4 my-1">
                  <span className="text-4xl font-black">
                    {dashboardStats.aiTotal}
                  </span>
                  <div className="w-11 h-11 rounded-2xl bg-white/15 flex items-center justify-center">
                    <Bot className="w-6 h-6 text-white" />
                  </div>
                </div>
                <span className="text-xs text-blue-100 mt-3">
                  حجوزات الذكاء: {dashboardStats.aiAppointments}
                </span>
              </div>
            </div>

            {/* أحدث حجوزات المواعيد */}
            <div className="bg-[#f8f9f7] rounded-3xl p-6 shadow-sm border border-slate-200/80">
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-extrabold text-base text-slate-800 flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-[#147a60]" />
                  <span>أحدث حجوزات المواعيد</span>
                </h3>
                <button
                  onClick={() => setActiveTab('appointments')}
                  className="text-xs font-bold text-slate-500 hover:text-[#147a60]"
                >
                  &lt; عرض الكل
                </button>
              </div>

              {appointments.length === 0 ? (
                <div className="text-center py-10 text-slate-400 text-sm font-medium">
                  لا توجد مواعيد مسجلة حالياً (العدد في الـ API: 0)
                </div>
              ) : (
                <div className="space-y-3">
                  {appointments.slice(0, 5).map((app) => (
                    <div
                      key={app.id}
                      className="bg-white rounded-2xl p-4 border border-slate-200/70 flex flex-wrap items-center justify-between gap-4"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-100 text-[#147a60] font-black flex items-center justify-center">
                          {String(app.patientName).charAt(0)}
                        </div>
                        <div>
                          <div className="font-bold text-sm text-slate-800">
                            {app.patientName}
                          </div>
                          <div className="text-xs text-slate-500" dir="ltr">
                            {app.phone} • {app.serviceName} ({app.price} ر.س)
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-left text-xs">
                          <div className="font-bold text-slate-700">
                            {app.date}
                          </div>
                          <div className="text-slate-400">{app.time}</div>
                        </div>
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-bold ${
                            app.status === 'مؤكد'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : app.status === 'مكتمل'
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : app.status === 'ملغي'
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}
                        >
                          {app.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ====================================================================
            التبويب 2: ملفات المرضى (Patients - مطابق للصورة رقم 5)
        ==================================================================== */}
        {activeTab === 'patients' && (
          <div className="space-y-6">
            {/* شريط البحث وزر إضافة ملف مريض جديد */}
            <div className="bg-[#f8f9f7] rounded-3xl p-4 shadow-sm border border-slate-200/80 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="relative w-full sm:flex-1">
                <Search className="w-5 h-5 text-slate-400 absolute right-4 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={patientSearch}
                  onChange={(e) => setPatientSearch(e.target.value)}
                  placeholder="ابحث باسم المريض أو رقم الجوال..."
                  className="w-full pr-12 pl-4 py-3.5 rounded-2xl bg-[#eff1ee] border border-slate-200/80 text-sm focus:outline-none focus:border-[#147a60]"
                />
              </div>

              <button
                onClick={() => setPatientModal({ open: true, editing: null })}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-[#147a60] hover:bg-[#0f604b] text-white text-sm font-extrabold shadow-sm transition-all shrink-0"
              >
                <Plus className="w-5 h-5" />
                <span>إضافة ملف مريض جديد</span>
              </button>
            </div>

            {/* شبكة كروت المرضى */}
            {filteredPatients.length === 0 ? (
              <div className="bg-[#f8f9f7] rounded-3xl p-12 text-center border border-slate-200/80">
                <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <h4 className="font-bold text-slate-700 mb-1">
                  لا توجد ملفات مرضى حالياً (العدد: 0)
                </h4>
                <p className="text-xs text-slate-400">
                  يمكنك إضافة مريض جديد أو إرسال مريض عبر بوت n8n ثم الضغط على
                  "تحديث المرضى من الـ API الآن"
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {filteredPatients.map((p) => (
                  <div
                    key={p.id}
                    className="bg-[#f8f9f7] rounded-3xl p-6 shadow-sm border border-slate-200/80 flex flex-col justify-between hover:shadow-md transition-all"
                  >
                    <div className="flex items-start justify-between gap-4 mb-5">
                      {/* بيانات المريض والحرف الأول */}
                      <div className="flex items-center gap-3.5">
                        <div className="w-12 h-12 rounded-2xl bg-[#d8ede4] text-[#147a60] font-black text-lg flex items-center justify-center shrink-0">
                          {String(p.name).trim().charAt(0)}
                        </div>
                        <div>
                          <h3 className="font-extrabold text-lg text-slate-800">
                            {p.name}
                          </h3>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-1">
                            <span
                              className="flex items-center gap-1 font-medium"
                              dir="ltr"
                            >
                              <Phone className="w-3.5 h-3.5 text-[#147a60]" />
                              {p.phone}
                            </span>
                            <span>•</span>
                            <span>
                              {p.age} سنة ({p.gender})
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* بادج وكيل الذكاء الاصطناعي كما في الصورة */}
                      <span className="px-3 py-2 rounded-2xl text-[11px] font-bold bg-[#eaedf8] text-indigo-800 border border-indigo-200/80 text-center leading-snug max-w-[110px]">
                        {p.source}
                      </span>
                    </div>

                    {/* صندوق التاريخ الطبي والملاحظات */}
                    <div className="bg-[#eff1ee] rounded-2xl p-4 border border-slate-200/60 mb-4 text-center">
                      <div className="text-xs font-bold text-slate-500 mb-1">
                        التاريخ الطبي والملاحظات:
                      </div>
                      <p className="text-xs text-slate-700 font-medium leading-relaxed">
                        {p.notes}
                      </p>
                    </div>

                    {/* أزرار التحكم (حجز موعد / تعديل / حذف) */}
                    <div className="flex items-center justify-between pt-3 border-t border-slate-200/70">
                      <button
                        onClick={() =>
                          setAppointmentModal({
                            open: true,
                            editing: null,
                            prefill: { patientName: p.name, phone: p.phone },
                          })
                        }
                        className="text-xs font-extrabold text-[#147a60] hover:underline flex items-center gap-1.5"
                      >
                        <CalendarPlus className="w-4 h-4" />
                        <span>حجز موعد لهذا المريض</span>
                      </button>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() =>
                            setPatientModal({ open: true, editing: p })
                          }
                          className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-600 hover:text-blue-600 text-xs font-bold flex items-center gap-1 transition-all"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>تعديل</span>
                        </button>
                        <button
                          onClick={() => handleDeletePatient(p.id)}
                          className="px-3 py-1.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 hover:bg-rose-100 text-xs font-bold flex items-center gap-1 transition-all"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>حذف</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ====================================================================
            التبويب 3: حجز المواعيد (Appointments - مطابق للصورة رقم 7 و 23)
        ==================================================================== */}
        {activeTab === 'appointments' && (
          <div className="space-y-6">
            {/* شريط فلاتر الحالة وزر حجز موعد جديد */}
            <div className="bg-[#f8f9f7] rounded-3xl p-4 shadow-sm border border-slate-200/80 flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-2">
                {['الكل', 'قيد الانتظار', 'مؤكد', 'مكتمل', 'ملغي'].map(
                  (tab) => (
                    <button
                      key={tab}
                      onClick={() => setAppointmentFilter(tab)}
                      className={`px-4 py-2 rounded-2xl text-xs font-extrabold transition-all ${
                        appointmentFilter === tab
                          ? 'bg-[#147a60] text-white shadow-sm'
                          : 'bg-[#eff1ee] text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {tab}
                    </button>
                  )
                )}
              </div>

              <button
                onClick={() =>
                  setAppointmentModal({
                    open: true,
                    editing: null,
                    prefill: null,
                  })
                }
                className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-[#147a60] hover:bg-[#0f604b] text-white text-xs font-extrabold shadow-sm transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>حجز موعد جديد</span>
              </button>
            </div>

            {/* جدول المواعيد (نفس أعمدة وتصميم صورتك بالضبط) */}
            <div className="bg-[#f8f9f7] rounded-3xl shadow-sm border border-slate-200/80 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200/80 text-slate-600 text-xs font-extrabold bg-[#eff1ee]/60">
                      <th className="py-4 px-5">المريض</th>
                      <th className="py-4 px-5">الخدمة المطلوبة</th>
                      <th className="py-4 px-5">التاريخ والوقت</th>
                      <th className="py-4 px-5">طريقة الحجز</th>
                      <th className="py-4 px-5">الحالة</th>
                      <th className="py-4 px-5">تأكيد / تغيير الحالة</th>
                      <th className="py-4 px-5">إدارة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/60 text-sm">
                    {filteredAppointments.length === 0 ? (
                      <tr>
                        <td
                          colSpan="7"
                          className="py-12 text-center text-slate-400 font-medium"
                        >
                          لا توجد مواعيد حالياً في هذا القسم
                        </td>
                      </tr>
                    ) : (
                      filteredAppointments.map((app) => (
                        <tr
                          key={app.id}
                          className="hover:bg-white/60 transition-all"
                        >
                          {/* المريض */}
                          <td className="py-4 px-5">
                            <div className="font-extrabold text-slate-800">
                              {app.patientName}
                            </div>
                            <div
                              className="text-xs text-slate-500 mt-0.5"
                              dir="ltr"
                            >
                              {app.phone}
                            </div>
                          </td>

                          {/* الخدمة المطلوبة */}
                          <td className="py-4 px-5">
                            <div className="font-bold text-slate-800">
                              {app.serviceName}
                            </div>
                            <div className="text-xs font-extrabold text-[#147a60] mt-0.5">
                              {app.price} ر.س
                            </div>
                          </td>

                          {/* التاريخ والوقت */}
                          <td className="py-4 px-5">
                            <div className="font-extrabold text-slate-800">
                              {app.date}
                            </div>
                            <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                              <Clock className="w-3.5 h-3.5" />
                              <span>{app.time}</span>
                            </div>
                          </td>

                          {/* طريقة الحجز */}
                          <td className="py-4 px-5">
                            <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-2xl text-xs font-bold bg-[#eaedf8] text-indigo-800 border border-indigo-200/80">
                              <Bot className="w-3.5 h-3.5" />
                              <span>{app.source}</span>
                            </span>
                          </td>

                          {/* الحالة */}
                          <td className="py-4 px-5">
                            <span
                              className={`px-3.5 py-1 rounded-full text-xs font-extrabold ${
                                app.status === 'مؤكد'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : app.status === 'مكتمل'
                                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                  : app.status === 'ملغي'
                                  ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                  : 'bg-amber-50 text-amber-700 border border-amber-200'
                              }`}
                            >
                              {app.status}
                            </span>
                          </td>

                          {/* تأكيد / تغيير الحالة */}
                          <td className="py-4 px-5">
                            <div className="flex items-center gap-2">
                              {app.status !== 'مؤكد' && (
                                <button
                                  onClick={() =>
                                    handleStatusUpdate(app, 'مؤكد')
                                  }
                                  className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-extrabold transition-all"
                                >
                                  تأكيد
                                </button>
                              )}
                              {app.status !== 'مكتمل' && (
                                <button
                                  onClick={() =>
                                    handleStatusUpdate(app, 'مكتمل')
                                  }
                                  className="px-3 py-1.5 rounded-xl bg-[#e3f2ed] hover:bg-teal-100 text-[#147a60] text-xs font-extrabold transition-all"
                                >
                                  مكتمل
                                </button>
                              )}
                              {app.status !== 'ملغي' && (
                                <button
                                  onClick={() =>
                                    handleStatusUpdate(app, 'ملغي')
                                  }
                                  className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-extrabold transition-all"
                                >
                                  إلغاء
                                </button>
                              )}
                            </div>
                          </td>

                          {/* إدارة (تعديل وحذف) */}
                          <td className="py-4 px-5">
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() =>
                                  setAppointmentModal({
                                    open: true,
                                    editing: app,
                                    prefill: null,
                                  })
                                }
                                className="p-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:text-blue-600 transition-all"
                                title="تعديل"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteAppointment(app.id)}
                                className="p-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 hover:bg-rose-100 transition-all"
                                title="حذف نهائي"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ====================================================================
            التبويب 4: الزيارات والمتابعة (Visits)
        ==================================================================== */}
        {activeTab === 'visits' && (
          <div className="space-y-6">
            <div className="bg-[#f8f9f7] rounded-3xl p-5 shadow-sm border border-slate-200/80 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="font-extrabold text-base text-slate-800">
                  سجل الزيارات المكتملة والتحصيل المالي
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  أي موعد تضغط أمامه على زر "مكتمل" ينتقل تلقائياً إلى هنا
                  ويُحسب ضمن إجمالي تحصيل العيادة.
                </p>
              </div>
              <button
                onClick={() => setVisitModal({ open: true, editing: null })}
                className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-[#147a60] hover:bg-[#0f604b] text-white text-xs font-extrabold shadow-sm"
              >
                <Plus className="w-4 h-4" />
                <span>تسجيل زيارة جديدة</span>
              </button>
            </div>

            {visits.length === 0 ? (
              <div className="bg-[#f8f9f7] rounded-3xl p-12 text-center border border-slate-200/80">
                <Stethoscope className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <h4 className="font-bold text-slate-700 mb-1">
                  لا توجد زيارات مكتملة حالياً (0)
                </h4>
                <p className="text-xs text-slate-400">
                  اضغط على "مكتمل" أمام أي حجز في قسم حجز المواعيد أو أضف زيارة
                  جديدة يدوياً.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {visits.map((v) => (
                  <div
                    key={v.id}
                    className="bg-[#f8f9f7] rounded-3xl p-6 shadow-sm border border-slate-200/80 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h4 className="font-extrabold text-base text-slate-800">
                            {v.patientName}
                          </h4>
                          <span className="text-xs text-slate-500" dir="ltr">
                            {v.phone} • {v.date}
                          </span>
                        </div>
                        <span className="px-3.5 py-1 rounded-full text-xs font-extrabold bg-emerald-50 text-[#147a60] border border-emerald-200">
                          تم تحصيل: {v.paidAmount} ر.س
                        </span>
                      </div>

                      <div className="bg-[#eff1ee] rounded-2xl p-4 border border-slate-200/60 text-xs space-y-1.5">
                        <div>
                          <span className="font-bold text-slate-500">
                            الخدمة الطبية:{' '}
                          </span>
                          <span className="font-extrabold text-slate-800">
                            {v.serviceName}
                          </span>
                        </div>
                        <div>
                          <span className="font-bold text-slate-500">
                            ملاحظات الطبيب:{' '}
                          </span>
                          <span className="text-slate-700">{v.notes}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 mt-4 pt-3 border-t border-slate-200/60">
                      <button
                        onClick={() =>
                          setVisitModal({ open: true, editing: v })
                        }
                        className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-600 text-xs font-bold flex items-center gap-1"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>تعديل</span>
                      </button>
                      <button
                        onClick={() => handleDeleteVisit(v.id)}
                        className="px-3 py-1.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 text-xs font-bold flex items-center gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>حذف</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ====================================================================
            التبويب 5: الخدمات والأسعار (Services)
        ==================================================================== */}
        {activeTab === 'services' && (
          <div className="space-y-6">
            <div className="bg-[#f8f9f7] rounded-3xl p-5 shadow-sm border border-slate-200/80 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="font-extrabold text-base text-slate-800">
                  قائمة خدمات العيادة والأسعار المعتمدة
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  يمكنك تعديل الأسعار أو إضافة خدمة جديدة ثم الضغط على "إرسال
                  الخدمات للـ API الآن" ليقرأها بوت n8n.
                </p>
              </div>
              <button
                onClick={() => setServiceModal({ open: true, editing: null })}
                className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-[#147a60] hover:bg-[#0f604b] text-white text-xs font-extrabold shadow-sm"
              >
                <Plus className="w-4 h-4" />
                <span>إضافة خدمة جديدة</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {services.map((srv) => (
                <div
                  key={srv.id}
                  className="bg-[#f8f9f7] rounded-3xl p-6 shadow-sm border border-slate-200/80 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-[#147a60] border border-emerald-200">
                          {srv.category}
                        </span>
                        <h4 className="font-extrabold text-lg text-slate-800 mt-2">
                          {srv.name}
                        </h4>
                      </div>
                      <div className="text-left">
                        <div className="text-xl font-black text-[#147a60]">
                          {srv.price} ر.س
                        </div>
                        <div className="text-xs text-slate-400">
                          {srv.duration}
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      {srv.description}
                    </p>
                  </div>

                  <div className="flex items-center justify-end gap-2 mt-4 pt-3 border-t border-slate-200/60">
                    <button
                      onClick={() =>
                        setServiceModal({ open: true, editing: srv })
                      }
                      className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-600 text-xs font-bold flex items-center gap-1"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>تعديل</span>
                    </button>
                    <button
                      onClick={() => handleDeleteService(srv.id)}
                      className="px-3 py-1.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 text-xs font-bold flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>حذف</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ====================================================================
            التبويب 6: الربط الذكي (n8n & AI)
        ==================================================================== */}
        {activeTab === 'n8n' && (
          <div className="space-y-6">
            <div className="bg-[#f8f9f7] rounded-3xl p-6 shadow-sm border border-slate-200/80">
              <h3 className="font-extrabold text-lg text-slate-800 mb-2 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-[#147a60]" />
                <span>روابط الـ API الثلاثة الثابتة الخاصة بك في n8n</span>
              </h3>
              <p className="text-xs text-slate-500 mb-5">
                جميع الروابط التالية تتصل مباشرة بالجداول المستقلة بدون أي أخطاء
                404، وأي تغيير في MockAPI ينعكس فوراً في التطبيق.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  {
                    title: '1. رابط الخدمات (Services)',
                    url: API_ENDPOINTS.SERVICES,
                    ok: apiStatus.servicesOk,
                  },
                  {
                    title: '2. رابط المرضى (Patients)',
                    url: API_ENDPOINTS.PATIENTS,
                    ok: apiStatus.patientsOk,
                  },
                  {
                    title: '3. رابط المواعيد (Appointments)',
                    url: API_ENDPOINTS.APPOINTMENTS,
                    ok: apiStatus.appointmentsOk,
                  },
                ].map((item) => (
                  <div
                    key={item.url}
                    className="bg-white p-4 rounded-2xl border border-slate-200 flex flex-col justify-between gap-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-xs text-slate-800">
                        {item.title}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          item.ok
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-rose-50 text-rose-600'
                        }`}
                      >
                        {item.ok ? 'متصل 200 OK' : 'تحقق من الجدول'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                      <code
                        className="text-[11px] font-mono text-slate-700 truncate"
                        dir="ltr"
                      >
                        {item.url}
                      </code>
                      <button
                        onClick={() => handleCopy(item.url)}
                        className="p-1.5 rounded-lg bg-white border border-slate-200 hover:bg-emerald-50 text-slate-600 shrink-0"
                      >
                        {copiedText === item.url ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ====================================================================
          النافذة المنبثقة: إضافة / تعديل مريض
      ==================================================================== */}
      {patientModal.open && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100">
            <h3 className="font-extrabold text-lg text-slate-800 mb-4">
              {patientModal.editing
                ? 'تعديل بيانات المريض'
                : 'إضافة ملف مريض جديد'}
            </h3>
            <form onSubmit={handleSavePatient} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-600 mb-1.5">
                  اسم
                </label>
                <input
                  name="name"
                  required
                  defaultValue={patientModal.editing?.name || ''}
                  placeholder="مثال: يسي حلمي جاد"
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-[#147a60]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-600 mb-1.5">
                    رقم الجوال
                  </label>
                  <input
                    name="phone"
                    required
                    defaultValue={patientModal.editing?.phone || ''}
                    placeholder="01278479297"
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-[#147a60]"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-600 mb-1.5">
                    العمر
                  </label>
                  <input
                    name="age"
                    required
                    defaultValue={patientModal.editing?.age || '19'}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-[#147a60]"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-600 mb-1.5">
                    النوع
                  </label>
                  <select
                    name="gender"
                    defaultValue={patientModal.editing?.gender || 'ذكر'}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200"
                  >
                    <option value="ذكر">ذكر</option>
                    <option value="أنثى">أنثى</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-600 mb-1.5">
                    طريقة التسجيل
                  </label>
                  <select
                    name="source"
                    defaultValue={
                      patientModal.editing?.source ||
                      'وكيل الذكاء الاصطناعي (n8n)'
                    }
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200"
                  >
                    <option value="وكيل الذكاء الاصطناعي (n8n)">
                      وكيل الذكاء الاصطناعي (n8n)
                    </option>
                    <option value="يدوي - الاستقبال">يدوي - الاستقبال</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block font-bold text-slate-600 mb-1.5">
                  التاريخ الطبي والملاحظات
                </label>
                <textarea
                  name="notes"
                  rows="3"
                  defaultValue={
                    patientModal.editing?.notes || 'تم التسجيل عبر بوت'
                  }
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() =>
                    setPatientModal({ open: false, editing: null })
                  }
                  className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-600 font-bold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-[#147a60] text-white font-extrabold"
                >
                  حفظ في التطبيق والـ API
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ====================================================================
          النافذة المنبثقة: حجز / تعديل موعد
      ==================================================================== */}
      {appointmentModal.open && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100">
            <h3 className="font-extrabold text-lg text-slate-800 mb-4">
              {appointmentModal.editing
                ? 'تعديل بيانات الموعد'
                : 'حجز موعد جديد'}
            </h3>
            <form
              onSubmit={handleSaveAppointment}
              className="space-y-4 text-xs"
            >
              <div>
                <label className="block font-bold text-slate-600 mb-1.5">
                  اسم المريض
                </label>
                <select
  name="patientName"
  required
  defaultValue={appointmentModal.editing?.patientName || appointmentModal.prefill?.patientName || ""}
  className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500 text-right"
>
  <option value="" disabled>اختر مريضاً من القائمة...</option>
  {patients.map((patient) => (
    <option key={patient.id} value={patient.name}>
      {patient.name}
    </option>
  ))}
</select>
              </div>
              <div>
                <label className="block font-bold text-slate-600 mb-1.5">
                  رقم الجوال
                </label>
                <input
                  name="phone"
                  required
                  defaultValue={
                    appointmentModal.editing?.phone ||
                    appointmentModal.prefill?.phone ||
                    ''
                  }
                  placeholder="01278479297"
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-600 mb-1.5">
                  الخدمة المطلوبة
                </label>
                <select
                  name="serviceName"
                  defaultValue={
                    appointmentModal.editing?.serviceName || 'كشف عام'
                  }
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200"
                >
                  {services.map((s) => (
                    <option key={s.id} value={s.name}>
                      {s.name} ({s.price} ر.س)
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-600 mb-1.5">
                    التاريخ
                  </label>
                  <input
                    type="date"
                    name="date"
                    required
                    defaultValue={
                      appointmentModal.editing?.date ||
                      new Date().toISOString().split('T')[0]
                    }
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-600 mb-1.5">
                    الوقت
                  </label>
                  <input
                    type="time"
                    name="time"
                    required
                    defaultValue={appointmentModal.editing?.time || '16:00'}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-600 mb-1.5">
                    الحالة
                  </label>
                  <select
                    name="status"
                    defaultValue={appointmentModal.editing?.status || 'مؤكد'}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200"
                  >
                    <option value="مؤكد">مؤكد</option>
                    <option value="قيد الانتظار">قيد الانتظار</option>
                    <option value="مكتمل">مكتمل</option>
                    <option value="ملغي">ملغي</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-600 mb-1.5">
                    طريقة الحجز
                  </label>
                  <select
                    name="source"
                    defaultValue={
                      appointmentModal.editing?.source ||
                      'وكيل الذكاء الاصطناعي (n8n)'
                    }
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200"
                  >
                    <option value="وكيل الذكاء الاصطناعي (n8n)">
                      وكيل الذكاء الاصطناعي (n8n)
                    </option>
                    <option value="يدوي - الاستقبال">يدوي - الاستقبال</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() =>
                    setAppointmentModal({
                      open: false,
                      editing: null,
                      prefill: null,
                    })
                  }
                  className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-600 font-bold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-[#147a60] text-white font-extrabold"
                >
                  حفظ في التطبيق والـ API
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ====================================================================
          النافذة المنبثقة: إضافة / تعديل زيارة
      ==================================================================== */}
      {visitModal.open && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100">
            <h3 className="font-extrabold text-lg text-slate-800 mb-4">
              {visitModal.editing
                ? 'تعديل سجل الزيارة'
                : 'تسجيل زيارة طبية جديدة'}
            </h3>
            <form onSubmit={handleSaveVisit} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-600 mb-1.5">
                  اسم المريض
                </label>
                <input
                  name="patientName"
                  required
                  defaultValue={visitModal.editing?.patientName || ''}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-600 mb-1.5">
                    رقم الهاتف
                  </label>
                  <input
                    name="phone"
                    required
                    defaultValue={visitModal.editing?.phone || ''}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-600 mb-1.5">
                    المبلغ المحصل (ر.س)
                  </label>
                  <input
                    type="number"
                    name="paidAmount"
                    required
                    defaultValue={visitModal.editing?.paidAmount || 150}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-600 mb-1.5">
                    الخدمة المنفذة
                  </label>
                  <input
                    name="serviceName"
                    required
                    defaultValue={visitModal.editing?.serviceName || 'كشف عام'}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-600 mb-1.5">
                    التاريخ
                  </label>
                  <input
                    type="date"
                    name="date"
                    required
                    defaultValue={
                      visitModal.editing?.date ||
                      new Date().toISOString().split('T')[0]
                    }
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200"
                  />
                </div>
              </div>
              <div>
                <label className="block font-bold text-slate-600 mb-1.5">
                  التشخيص والملاحظات
                </label>
                <textarea
                  name="notes"
                  rows="2"
                  defaultValue={visitModal.editing?.notes || ''}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setVisitModal({ open: false, editing: null })}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-600 font-bold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-[#147a60] text-white font-extrabold"
                >
                  حفظ الزيارة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ====================================================================
          النافذة المنبثقة: إضافة / تعديل خدمة
      ==================================================================== */}
      {serviceModal.open && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100">
            <h3 className="font-extrabold text-lg text-slate-800 mb-4">
              {serviceModal.editing ? 'تعديل الخدمة' : 'إضافة خدمة جديدة'}
            </h3>
            <form onSubmit={handleSaveService} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-600 mb-1.5">
                  اسم الخدمة
                </label>
                <input
                  name="name"
                  required
                  defaultValue={serviceModal.editing?.name || ''}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-600 mb-1.5">
                    السعر (ر.س)
                  </label>
                  <input
                    type="number"
                    name="price"
                    required
                    defaultValue={serviceModal.editing?.price || 150}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-600 mb-1.5">
                    المدة
                  </label>
                  <input
                    name="duration"
                    defaultValue={serviceModal.editing?.duration || '30 دقيقة'}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200"
                  />
                </div>
              </div>
              <div>
                <label className="block font-bold text-slate-600 mb-1.5">
                  التصنيف
                </label>
                <select
                  name="category"
                  defaultValue={serviceModal.editing?.category || 'عام'}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200"
                >
                  <option value="عام">عام</option>
                  <option value="تجميلي">تجميلي</option>
                  <option value="علاجي">علاجي</option>
                  <option value="جراحة">جراحة</option>
                </select>
              </div>
              <div>
                <label className="block font-bold text-slate-600 mb-1.5">
                  وصف الخدمة
                </label>
                <textarea
                  name="description"
                  rows="2"
                  defaultValue={serviceModal.editing?.description || ''}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() =>
                    setServiceModal({ open: false, editing: null })
                  }
                  className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-600 font-bold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-[#147a60] text-white font-extrabold"
                >
                  حفظ الخدمة
                </button>
              </div>
            </form>
          </div>
              
        </div>
      )}
    </div>
  );
}
