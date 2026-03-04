import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import {
  Plus, TrendingUp, Wallet, AlertCircle, BarChart2, Bell,
  List, Search, Download, LogOut, User, Settings, Users,
  Edit2, Trash2, X, Check, Filter, Printer,
  Calendar, Tag, DollarSign, FileText, RefreshCw, Eye,
  Lock, Camera, Mail, Phone, Shield, CheckCircle2, Clock,
} from 'lucide-react';
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  parseISO, subMonths, startOfDay, endOfDay,
} from 'date-fns';
import toast from 'react-hot-toast';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line,
} from 'recharts';
import BudgetSplitter from './BudgetSplitter';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Expense {
  id: string;
  item_name: string;
  quantity: number;
  price: number;
  total: number;
  date: string;
  notes: string | null;
  category_id: string;
  categories?: { name: string; color: string | null; icon: string | null };
}

interface Category {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
}

interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'danger' | 'success';
  is_read: boolean;
  created_at: string;
}

const COLORS = ['#6366F1','#F59E0B','#10B981','#3B82F6','#8B5CF6','#EC4899','#14B8A6','#F97316'];

type View = 'dashboard' | 'expenses' | 'reports' | 'budget' | 'splitter' | 'notifications' | 'settings';

const NAV_ITEMS: { id: View; label: string; icon: React.ElementType; badge?: string }[] = [
  { id: 'dashboard',     label: 'Dashboard',       icon: BarChart2  },
  { id: 'expenses',      label: 'My Expenses',      icon: List       },
  { id: 'budget',        label: 'Budget',           icon: Wallet     },
  { id: 'reports',       label: 'Reports',          icon: TrendingUp },
  { id: 'splitter',      label: 'Budget Splitter',  icon: Users      },
  { id: 'notifications', label: 'Notifications',    icon: Bell       },
  { id: 'settings',      label: 'Settings',         icon: Settings   },
];

const EMPTY_FORM = {
  item_name: '', quantity: '1', price: '',
  category_id: '', date: format(new Date(), 'yyyy-MM-dd'), notes: '',
};

const PROFILE_FORM_EMPTY = { full_name: '', phone: '', avatar_url: '' };

// ─────────────────────────────────────────────────────────────────────────────
export default function UserDashboard() {
  const { profile, signOut, refreshProfile } = useAuth();

  // ── Core state ─────────────────────────────────────────────────────────────
  const [view,            setView]            = useState<View>('dashboard');
  const [expenses,        setExpenses]        = useState<Expense[]>([]);
  const [categories,      setCategories]      = useState<Category[]>([]);
  const [notifications,   setNotifications]   = useState<Notification[]>([]);
  const [loading,         setLoading]         = useState(true);
  const [mobileMenu,      setMobileMenu]      = useState(false);

  // ── Expense modal ──────────────────────────────────────────────────────────
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [editExpense,      setEditExpense]      = useState<Expense | null>(null);
  const [form,             setForm]             = useState(EMPTY_FORM);
  const [savingExpense,    setSavingExpense]    = useState(false);

  // ── Expense detail modal ───────────────────────────────────────────────────
  const [viewExpense,      setViewExpense]      = useState<Expense | null>(null);

  // ── Filters ────────────────────────────────────────────────────────────────
  const [searchTerm,      setSearchTerm]      = useState('');
  const [filterCategory,  setFilterCategory]  = useState('');
  const [filterFrom,      setFilterFrom]      = useState('');
  const [filterTo,        setFilterTo]        = useState('');
  const [filterMonth,     setFilterMonth]     = useState(format(new Date(), 'yyyy-MM'));
  const [sortBy,          setSortBy]          = useState<'date'|'total'|'name'>('date');
  const [sortDir,         setSortDir]         = useState<'asc'|'desc'>('desc');
  const [showFilters,     setShowFilters]     = useState(false);

  // ── Budget ─────────────────────────────────────────────────────────────────
  const [budget,          setBudget]          = useState(profile?.monthly_budget?.toString() ?? '');
  const [savingBudget,    setSavingBudget]    = useState(false);

  // ── Settings / Profile ─────────────────────────────────────────────────────
  const [profileForm,     setProfileForm]     = useState(PROFILE_FORM_EMPTY);
  const [savingProfile,   setSavingProfile]   = useState(false);
  const [showPwModal,     setShowPwModal]     = useState(false);
  const [pwForm,          setPwForm]          = useState({ current: '', newPw: '', confirm: '' });
  const [savingPw,        setSavingPw]        = useState(false);
  const [showPw,          setShowPw]          = useState(false);

  // ── Reports ────────────────────────────────────────────────────────────────
  const [reportMonth,     setReportMonth]     = useState(format(new Date(), 'yyyy-MM'));

  const mounted = useRef(true);

  // ── Fetch all data ─────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const [{ data: exp }, { data: cats }, { data: notifs }] = await Promise.all([
        supabase
          .from('expenses')
          .select('*, categories(name, color, icon)')
          .eq('user_id', profile.id)
          .order('date', { ascending: false })
          .order('created_at', { ascending: false }),
        supabase.from('categories').select('*').order('name'),
        supabase
          .from('notifications')
          .select('*')
          .eq('user_id', profile.id)
          .order('created_at', { ascending: false })
          .limit(50),
      ]);
      if (mounted.current) {
        if (exp)    setExpenses(exp as Expense[]);
        if (cats)   setCategories(cats as Category[]);
        if (notifs) setNotifications(notifs as Notification[]);
      }
    } catch { /* graceful */ }
    finally { if (mounted.current) setLoading(false); }
  }, [profile]);

  useEffect(() => {
    mounted.current = true;
    fetchData();
    return () => { mounted.current = false; };
  }, [fetchData]);

  // ── Sync profile form ──────────────────────────────────────────────────────
  useEffect(() => {
    if (profile) {
      setProfileForm({
        full_name:  profile.full_name  ?? '',
        phone:      (profile as unknown as Record<string,string>).phone ?? '',
        avatar_url: profile.avatar_url ?? '',
      });
      setBudget(profile.monthly_budget?.toString() ?? '');
    }
  }, [profile]);

  // ── Realtime presence & notifications ──────────────────────────────────────
  useEffect(() => {
    if (!profile?.id) return;

    // Presence channel
    const presenceCh = supabase.channel('spendwise-presence', {
      config: { presence: { key: profile.id } },
    });
    presenceCh.subscribe(async (s) => {
      if (s === 'SUBSCRIBED') {
        await presenceCh.track({
          user_id:   profile.id,
          email:     profile.email,
          full_name: profile.full_name,
          role:      profile.role,
          online_at: new Date().toISOString(),
        });
      }
    });

    // Realtime: listen for new notifications from admin
    const notifCh = supabase
      .channel(`notifications-${profile.id}`)
      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'notifications',
          filter: `user_id=eq.${profile.id}`,
        },
        (payload) => {
          const n = payload.new as Notification;
          setNotifications(prev => [n, ...prev]);
          // Show a toast for incoming admin notification
          const icons: Record<string, string> = {
            info: 'ℹ️', warning: '⚠️', danger: '🚨', success: '✅',
          };
          toast(
            `${icons[n.type] ?? '🔔'} ${n.title}: ${n.message}`,
            {
              duration: 6000,
              style: {
                background: n.type === 'danger'  ? '#FEE2E2' :
                            n.type === 'warning' ? '#FEF3C7' :
                            n.type === 'success' ? '#D1FAE5' : '#EEF2FF',
                color: '#1e1b4b',
              },
            }
          );
        }
      )
      .subscribe();

    // Realtime: listen for expense changes
    const expCh = supabase
      .channel(`expenses-${profile.id}`)
      .on(
        'postgres_changes',
        {
          event:  '*',
          schema: 'public',
          table:  'expenses',
          filter: `user_id=eq.${profile.id}`,
        },
        () => { fetchData(); }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(presenceCh);
      supabase.removeChannel(notifCh);
      supabase.removeChannel(expCh);
    };
  }, [profile, fetchData]);

  // ── Derived values ─────────────────────────────────────────────────────────
  const now        = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd   = endOfMonth(now);
  const weekStart  = startOfWeek(now);
  const weekEnd    = endOfWeek(now);

  const totalAll   = expenses.reduce((s, e) => s + e.total, 0);
  const totalMonth = expenses
    .filter(e => { const d = parseISO(e.date); return d >= monthStart && d <= monthEnd; })
    .reduce((s, e) => s + e.total, 0);
  const totalWeek  = expenses
    .filter(e => { const d = parseISO(e.date); return d >= weekStart && d <= weekEnd; })
    .reduce((s, e) => s + e.total, 0);
  const totalDay   = expenses
    .filter(e => { const d = parseISO(e.date); return d >= startOfDay(now) && d <= endOfDay(now); })
    .reduce((s, e) => s + e.total, 0);

  const remaining  = (profile?.monthly_budget ?? 0) - totalMonth;
  const budgetPct  = profile?.monthly_budget
    ? Math.min(100, (totalMonth / profile.monthly_budget) * 100)
    : 0;

  const unreadCount = notifications.filter(n => !n.is_read).length;

  // ── Filtered & sorted expenses ─────────────────────────────────────────────
  const filtered = expenses
    .filter(e => {
      const matchSearch = e.item_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (e.categories?.name ?? '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchCat  = filterCategory ? e.category_id === filterCategory : true;
      const matchFrom = filterFrom ? e.date >= filterFrom : true;
      const matchTo   = filterTo   ? e.date <= filterTo   : true;
      return matchSearch && matchCat && matchFrom && matchTo;
    })
    .sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'date')  cmp = a.date.localeCompare(b.date);
      if (sortBy === 'total') cmp = a.total - b.total;
      if (sortBy === 'name')  cmp = a.item_name.localeCompare(b.item_name);
      return sortDir === 'desc' ? -cmp : cmp;
    });

  // ── Charts data ────────────────────────────────────────────────────────────
  const pieData = categories
    .map(c => ({
      name:  c.name,
      value: expenses.filter(e => e.category_id === c.id).reduce((s, e) => s + e.total, 0),
    }))
    .filter(d => d.value > 0)
    .sort((a, b) => b.value - a.value);

  const monthlyBar = Array.from({ length: 6 }, (_, i) => {
    const d     = subMonths(now, 5 - i);
    const start = startOfMonth(d);
    const end   = endOfMonth(d);
    return {
      name:  format(d, 'MMM'),
      total: expenses
        .filter(e => { const ed = parseISO(e.date); return ed >= start && ed <= end; })
        .reduce((s, e) => s + e.total, 0),
    };
  });

  // Report month data
  const [rYear, rMonth] = reportMonth.split('-').map(Number);
  const rStart  = startOfMonth(new Date(rYear, rMonth - 1));
  const rEnd    = endOfMonth(new Date(rYear, rMonth - 1));
  const rExpenses = expenses.filter(e => {
    const d = parseISO(e.date); return d >= rStart && d <= rEnd;
  });
  const rTotal  = rExpenses.reduce((s, e) => s + e.total, 0);
  const rByCategory = categories
    .map(c => ({
      name:  c.name,
      icon:  c.icon ?? '',
      value: rExpenses.filter(e => e.category_id === c.id).reduce((s, e) => s + e.total, 0),
    }))
    .filter(d => d.value > 0)
    .sort((a, b) => b.value - a.value);

  // Daily line chart for budget view
  const dailyData = Array.from({ length: new Date(rYear, rMonth, 0).getDate() }, (_, i) => {
    const day = String(i + 1).padStart(2, '0');
    const dateStr = `${reportMonth}-${day}`;
    return {
      day: i + 1,
      total: expenses.filter(e => e.date === dateStr).reduce((s, e) => s + e.total, 0),
    };
  });

  // ── Handlers: Expenses ─────────────────────────────────────────────────────
  const handleSaveExpense = async () => {
    if (!profile) { toast.error('Not signed in.'); return; }
    if (!form.item_name.trim()) { toast.error('Item name is required.'); return; }
    if (!form.price || parseFloat(form.price) <= 0) { toast.error('Price must be greater than 0.'); return; }
    if (!form.category_id) { toast.error('Please select a category.'); return; }
    if (!form.date) { toast.error('Date is required.'); return; }

    setSavingExpense(true);
    try {
      const qty   = Math.max(0.01, parseFloat(form.quantity) || 1);
      const price = parseFloat(form.price);

      // ⚠️ IMPORTANT: Do NOT include 'total' in the payload.
      // The 'total' column is GENERATED ALWAYS AS (quantity * price) STORED
      // in PostgreSQL. Supabase will auto-compute it — sending it manually
      // causes "column total can only be updated to DEFAULT" error.
      const payload = {
        user_id:     profile.id,
        item_name:   form.item_name.trim(),
        quantity:    qty,
        price:       price,
        category_id: form.category_id,
        date:        form.date,
        notes:       form.notes.trim() || null,
      };

      if (editExpense) {
        const { error } = await supabase
          .from('expenses')
          .update(payload)
          .eq('id', editExpense.id)
          .eq('user_id', profile.id); // extra safety — only update own
        if (error) throw error;
        toast.success('✅ Expense updated!');
      } else {
        const { error } = await supabase
          .from('expenses')
          .insert(payload);
        if (error) throw error;

        // Auto-check budget after adding
        const addedTotal = qty * price;
        const newMonthTotal = totalMonth + addedTotal;
        if (profile.monthly_budget && profile.monthly_budget > 0) {
          const pct = (newMonthTotal / profile.monthly_budget) * 100;
          if (pct >= 100) {
            toast.error('🚨 You have exceeded your monthly budget!', { duration: 6000 });
          } else if (pct >= 80) {
            toast(`⚠️ You've used ${pct.toFixed(0)}% of your monthly budget!`, { duration: 5000 });
          }
        }
        toast.success('✅ Expense added!');
      }

      setShowExpenseModal(false);
      setEditExpense(null);
      setForm(EMPTY_FORM);
      await fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // Provide friendly messages for common DB errors
      if (msg.includes('generated') || msg.includes('DEFAULT')) {
        toast.error('Database schema issue: run Step 3 of the Database SQL to fix the expenses table.');
      } else if (msg.includes('foreign key') || msg.includes('category_id')) {
        toast.error('Invalid category selected. Please pick a valid category.');
      } else if (msg.includes('violates check constraint')) {
        toast.error('Invalid value: quantity must be > 0 and price must be ≥ 0.');
      } else if (msg.includes('not-null') || msg.includes('null value')) {
        toast.error('Missing required field. Fill in all required fields.');
      } else if (msg.includes('permission') || msg.includes('policy')) {
        toast.error('Permission denied. Make sure you are signed in and the database RLS is set up correctly.');
      } else {
        toast.error(`Failed to save: ${msg}`);
      }
    } finally {
      setSavingExpense(false);
    }
  };

  const handleDeleteExpense = async (id: string) => {
    if (!confirm('Delete this expense?')) return;
    const { error } = await supabase.from('expenses').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Expense deleted!');
    fetchData();
  };

  const openEditExpense = (e: Expense) => {
    setEditExpense(e);
    setForm({
      item_name:   e.item_name,
      quantity:    e.quantity.toString(),
      price:       e.price.toString(),
      category_id: e.category_id,
      date:        e.date,
      notes:       e.notes ?? '',
    });
    setShowExpenseModal(true);
  };

  const openAddExpense = () => {
    setEditExpense(null);
    setForm({ ...EMPTY_FORM, category_id: categories[0]?.id ?? '', date: format(new Date(), 'yyyy-MM-dd') });
    setShowExpenseModal(true);
  };

  // ── Handlers: Budget ───────────────────────────────────────────────────────
  const saveBudget = async () => {
    if (!profile) return;
    setSavingBudget(true);
    const val = parseFloat(budget);
    const { error } = await supabase
      .from('profiles')
      .update({ monthly_budget: isNaN(val) ? null : val })
      .eq('id', profile.id);
    setSavingBudget(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Budget saved!');
    refreshProfile();
  };

  // ── Handlers: Notifications ────────────────────────────────────────────────
  const markRead = async (id: string) => {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  };

  const markAllRead = async () => {
    if (!profile) return;
    await supabase.from('notifications')
      .update({ is_read: true })
      .eq('user_id', profile.id)
      .eq('is_read', false);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    toast.success('All marked as read!');
  };

  const deleteNotif = async (id: string) => {
    await supabase.from('notifications').delete().eq('id', id);
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  // ── Handlers: Profile ──────────────────────────────────────────────────────
  const saveProfile = async () => {
    if (!profile) return;
    setSavingProfile(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name:  profileForm.full_name.trim() || null,
        avatar_url: profileForm.avatar_url.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', profile.id);
    setSavingProfile(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Profile updated!');
    refreshProfile();
  };

  const changePassword = async () => {
    if (!pwForm.newPw) { toast.error('Enter a new password.'); return; }
    if (pwForm.newPw.length < 8) { toast.error('Password must be at least 8 characters.'); return; }
    if (pwForm.newPw !== pwForm.confirm) { toast.error('Passwords do not match.'); return; }
    setSavingPw(true);
    const { error } = await supabase.auth.updateUser({ password: pwForm.newPw });
    setSavingPw(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Password changed successfully!');
    setShowPwModal(false);
    setPwForm({ current: '', newPw: '', confirm: '' });
  };

  // ── Export helpers ─────────────────────────────────────────────────────────
  const exportCSV = (data: Expense[], filename = 'expenses') => {
    const rows = [
      ['Date','Item','Category','Qty','Price','Total','Notes'],
      ...data.map(e => [
        e.date, e.item_name, e.categories?.name ?? '',
        e.quantity, e.price.toFixed(2), e.total.toFixed(2), e.notes ?? '',
      ]),
    ];
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const a   = document.createElement('a');
    a.href     = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = `${filename}-${format(new Date(),'yyyy-MM-dd')}.csv`;
    a.click();
    toast.success('CSV exported!');
  };

  const printReport = () => {
    const content = `
      <html><head><title>SpendWise Report - ${reportMonth}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; color: #1f2937; }
        h1 { color: #4f46e5; } h2 { color: #374151; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px; }
        table { width: 100%; border-collapse: collapse; margin: 16px 0; }
        th { background: #f3f4f6; padding: 10px; text-align: left; font-size: 13px; }
        td { padding: 8px 10px; border-bottom: 1px solid #f9fafb; font-size: 13px; }
        .total { font-weight: bold; color: #4f46e5; }
        .summary { display: flex; gap: 16px; margin: 16px 0; }
        .card { background: #f3f4f6; border-radius: 8px; padding: 12px 16px; flex: 1; }
        .card p { margin: 0; font-size: 12px; color: #6b7280; }
        .card h3 { margin: 4px 0 0; font-size: 20px; color: #4f46e5; }
        @media print { body { padding: 0; } }
      </style></head><body>
      <h1>SpendWise Expense Report</h1>
      <p><strong>User:</strong> ${profile?.full_name ?? profile?.email}</p>
      <p><strong>Period:</strong> ${format(rStart, 'MMMM yyyy')}</p>
      <p><strong>Generated:</strong> ${format(new Date(), 'PPP p')}</p>
      <div class="summary">
        <div class="card"><p>Total Expenses</p><h3>₱${rTotal.toFixed(2)}</h3></div>
        <div class="card"><p>Transactions</p><h3>${rExpenses.length}</h3></div>
        <div class="card"><p>Monthly Budget</p><h3>₱${profile?.monthly_budget?.toFixed(2) ?? 'Not set'}</h3></div>
        <div class="card"><p>Remaining</p><h3>₱${profile?.monthly_budget ? (profile.monthly_budget - rTotal).toFixed(2) : '—'}</h3></div>
      </div>
      <h2>Category Breakdown</h2>
      <table><tr><th>Category</th><th>Amount</th><th>%</th></tr>
        ${rByCategory.map(c => `<tr><td>${c.icon} ${c.name}</td><td>₱${c.value.toFixed(2)}</td><td>${rTotal ? ((c.value/rTotal)*100).toFixed(1) : 0}%</td></tr>`).join('')}
      </table>
      <h2>All Expenses</h2>
      <table><tr><th>Date</th><th>Item</th><th>Category</th><th>Qty</th><th>Price</th><th>Total</th><th>Notes</th></tr>
        ${rExpenses.map(e => `<tr><td>${e.date}</td><td>${e.item_name}</td><td>${e.categories?.name ?? ''}</td><td>${e.quantity}</td><td>₱${e.price.toFixed(2)}</td><td class="total">₱${e.total.toFixed(2)}</td><td>${e.notes ?? ''}</td></tr>`).join('')}
        <tr><td colspan="5" style="font-weight:bold;padding-top:12px;">TOTAL</td><td class="total" style="padding-top:12px;">₱${rTotal.toFixed(2)}</td><td></td></tr>
      </table>
      </body></html>
    `;
    const w = window.open('', '_blank');
    if (w) { w.document.write(content); w.document.close(); w.print(); }
  };

  // ── Sort handler ───────────────────────────────────────────────────────────
  const handleSort = (col: 'date'|'total'|'name') => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('desc'); }
  };

  const SortIcon = ({ col }: { col: 'date'|'total'|'name' }) =>
    sortBy === col
      ? <span className="ml-1 text-indigo-500">{sortDir === 'desc' ? '↓' : '↑'}</span>
      : <span className="ml-1 text-gray-300">↕</span>;

  // ── Notification badge color ───────────────────────────────────────────────
  const notifColor = (type: string) => ({
    info:    'bg-blue-50 border-blue-200 text-blue-700',
    warning: 'bg-amber-50 border-amber-200 text-amber-700',
    danger:  'bg-red-50 border-red-200 text-red-700',
    success: 'bg-green-50 border-green-200 text-green-700',
  }[type] ?? 'bg-gray-50 border-gray-200 text-gray-700');

  const notifIcon = (type: string) => ({
    info:    'ℹ️', warning: '⚠️', danger: '🚨', success: '✅',
  }[type] ?? '🔔');

  // view label
  const viewLabel: Record<View, string> = {
    dashboard:     'Dashboard',
    expenses:      'My Expenses',
    budget:        'Budget Management',
    reports:       'Reports & Analytics',
    splitter:      'Budget Splitter',
    notifications: 'Notifications',
    settings:      'Settings',
  };

  const calcTotal = parseFloat(form.price || '0') * parseFloat(form.quantity || '1');

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 flex">

      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 bg-gradient-to-b from-indigo-900 to-indigo-950 text-white flex flex-col
        transform transition-transform duration-300
        ${mobileMenu ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}>

        {/* Logo + profile */}
        <div className="p-5 border-b border-indigo-800">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 bg-indigo-400 rounded-lg flex items-center justify-center">
              <DollarSign className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-white tracking-tight">SpendWise</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-indigo-500 flex items-center justify-center text-lg font-bold flex-shrink-0 ring-2 ring-indigo-400">
              {profile?.avatar_url
                ? <img src={profile.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                : (profile?.full_name?.[0]?.toUpperCase() ?? 'U')
              }
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm truncate">{profile?.full_name ?? 'User'}</p>
              <p className="text-xs text-indigo-300 truncate">{profile?.email}</p>
              <span className="inline-block mt-0.5 bg-indigo-600 text-indigo-200 text-xs px-1.5 py-0.5 rounded-full">
                User
              </span>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              onClick={() => { setView(item.id); setMobileMenu(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all
                ${view === item.id
                  ? 'bg-white/20 text-white shadow-sm'
                  : 'text-indigo-300 hover:bg-white/10 hover:text-white'}`}
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1 text-left">{item.label}</span>
              {item.id === 'notifications' && unreadCount > 0 && (
                <span className="bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
              {item.id === 'splitter' && (
                <span className="bg-indigo-500 text-white text-xs px-1.5 py-0.5 rounded-full">NEW</span>
              )}
            </button>
          ))}
        </nav>

        {/* Budget summary in sidebar */}
        {profile?.monthly_budget && (
          <div className="mx-3 mb-3 p-3 bg-white/10 rounded-xl">
            <p className="text-xs text-indigo-300 mb-1">Monthly Budget</p>
            <div className="w-full bg-indigo-800 rounded-full h-1.5 mb-1">
              <div
                className={`h-1.5 rounded-full transition-all ${budgetPct >= 100 ? 'bg-red-400' : budgetPct >= 80 ? 'bg-amber-400' : 'bg-green-400'}`}
                style={{ width: `${Math.min(budgetPct, 100)}%` }}
              />
            </div>
            <p className="text-xs text-indigo-300">
              ₱{totalMonth.toFixed(0)} / ₱{profile.monthly_budget.toFixed(0)}
            </p>
          </div>
        )}

        {/* Sign out */}
        <div className="p-3 border-t border-indigo-800">
          <button
            onClick={signOut}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-indigo-300 hover:bg-white/10 hover:text-white transition-colors"
          >
            <LogOut className="w-4 h-4" />Sign Out
          </button>
        </div>
      </aside>

      {/* Mobile overlay */}
      {mobileMenu && (
        <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setMobileMenu(false)} />
      )}

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <div className="flex-1 lg:ml-64 flex flex-col min-w-0">

        {/* Topbar */}
        <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-20 gap-3 shadow-sm">
          <button onClick={() => setMobileMenu(true)} className="lg:hidden p-2 rounded-lg hover:bg-gray-100">
            <div className="space-y-1">
              <div className="w-5 h-0.5 bg-gray-600"/>
              <div className="w-5 h-0.5 bg-gray-600"/>
              <div className="w-5 h-0.5 bg-gray-600"/>
            </div>
          </button>

          <h1 className="font-bold text-gray-800 flex-1 text-lg">{viewLabel[view]}</h1>

          <div className="flex items-center gap-2">
            {/* Notification bell */}
            <button
              onClick={() => setView('notifications')}
              className="relative p-2 rounded-lg hover:bg-gray-100 text-gray-500"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {/* Add expense button */}
            {(view === 'expenses' || view === 'dashboard') && (
              <button
                onClick={openAddExpense}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-xl text-sm font-medium transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Add Expense</span>
              </button>
            )}
          </div>
        </header>

        {/* ── Page content ────────────────────────────────────────────────── */}
        <main className="flex-1 p-4 lg:p-6 overflow-x-hidden">

          {/* ── DASHBOARD ────────────────────────────────────────────────── */}
          {view === 'dashboard' && (
            <div className="space-y-5">
              {/* Budget alert from admin or auto */}
              {profile?.monthly_budget && budgetPct >= 80 && (
                <div className={`flex items-center gap-3 p-4 rounded-xl border ${
                  budgetPct >= 100
                    ? 'bg-red-50 border-red-200 text-red-700'
                    : 'bg-amber-50 border-amber-200 text-amber-700'
                }`}>
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-sm">
                      {budgetPct >= 100 ? '🚨 Budget Exceeded!' : '⚠️ Budget Warning'}
                    </p>
                    <p className="text-sm">
                      {budgetPct >= 100
                        ? `You are ₱${Math.abs(remaining).toFixed(2)} over your monthly budget.`
                        : `You've used ${budgetPct.toFixed(0)}% of your ₱${profile.monthly_budget.toFixed(2)} budget.`}
                    </p>
                  </div>
                </div>
              )}

              {/* Unread notifications banner */}
              {unreadCount > 0 && (
                <div
                  className="flex items-center gap-3 p-4 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 cursor-pointer hover:bg-indigo-100 transition-colors"
                  onClick={() => setView('notifications')}
                >
                  <Bell className="w-5 h-5 flex-shrink-0" />
                  <p className="text-sm font-medium flex-1">
                    You have <strong>{unreadCount}</strong> unread notification{unreadCount !== 1 ? 's' : ''} from admin.
                  </p>
                  <span className="text-xs text-indigo-500">View →</span>
                </div>
              )}

              {/* Stat cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: 'Today',      value: totalDay,   color: 'text-blue-600',   bg: 'bg-blue-50',   icon: Calendar },
                  { label: 'This Week',  value: totalWeek,  color: 'text-purple-600', bg: 'bg-purple-50', icon: Calendar },
                  { label: 'This Month', value: totalMonth, color: 'text-indigo-600', bg: 'bg-indigo-50', icon: Wallet   },
                  { label: 'All Time',   value: totalAll,   color: 'text-gray-700',   bg: 'bg-gray-100',  icon: TrendingUp },
                ].map(c => (
                  <div key={c.label} className={`${c.bg} rounded-2xl p-4`}>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs text-gray-500">{c.label}</p>
                      <c.icon className={`w-4 h-4 ${c.color} opacity-60`} />
                    </div>
                    <p className={`text-xl font-bold ${c.color}`}>
                      ₱{c.value.toLocaleString('en', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                ))}
              </div>

              {/* Budget progress */}
              {profile?.monthly_budget ? (
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                  <div className="flex justify-between mb-2">
                    <span className="font-semibold text-gray-700">Monthly Budget</span>
                    <span className={`text-sm font-medium ${remaining < 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {remaining < 0
                        ? `₱${Math.abs(remaining).toFixed(2)} over`
                        : `₱${remaining.toFixed(2)} remaining`}
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-3">
                    <div
                      className={`h-3 rounded-full transition-all duration-700 ${
                        budgetPct >= 100 ? 'bg-red-500' : budgetPct >= 80 ? 'bg-amber-400' : 'bg-green-500'
                      }`}
                      style={{ width: `${Math.min(budgetPct, 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>₱{totalMonth.toFixed(2)} spent</span>
                    <span>{budgetPct.toFixed(0)}% used</span>
                    <span>₱{profile.monthly_budget.toFixed(2)} limit</span>
                  </div>
                </div>
              ) : (
                <div
                  className="bg-white rounded-2xl p-5 shadow-sm border border-dashed border-indigo-200 cursor-pointer hover:border-indigo-400 transition-colors"
                  onClick={() => setView('budget')}
                >
                  <div className="flex items-center gap-3 text-indigo-500">
                    <Wallet className="w-8 h-8 opacity-50" />
                    <div>
                      <p className="font-semibold">Set your monthly budget</p>
                      <p className="text-sm text-gray-400">Track your spending against a goal</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Charts */}
              <div className="grid lg:grid-cols-2 gap-4">
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                  <h3 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
                    <BarChart2 className="w-4 h-4 text-indigo-500" />6-Month Trend
                  </h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={monthlyBar}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip formatter={(v: unknown) => `₱${(v as number).toFixed(2)}`} />
                      <Bar dataKey="total" fill="#6366F1" radius={[4,4,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                  <h3 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
                    <Tag className="w-4 h-4 text-indigo-500" />By Category
                  </h3>
                  {pieData.length === 0
                    ? <p className="text-gray-400 text-sm text-center py-8">No expenses yet</p>
                    : (
                      <ResponsiveContainer width="100%" height={200}>
                        <PieChart>
                          <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} labelLine={false}>
                            {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                          </Pie>
                          <Tooltip formatter={(v: unknown) => `₱${(v as number).toFixed(2)}`} />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    )}
                </div>
              </div>

              {/* Recent expenses */}
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-gray-700 flex items-center gap-2">
                    <List className="w-4 h-4 text-indigo-500" />Recent Expenses
                  </h3>
                  <button onClick={() => setView('expenses')} className="text-xs text-indigo-600 hover:underline">
                    View all →
                  </button>
                </div>
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <RefreshCw className="w-5 h-5 text-indigo-400 animate-spin" />
                  </div>
                ) : expenses.length === 0 ? (
                  <div className="text-center py-6">
                    <Wallet className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                    <p className="text-gray-400 text-sm">No expenses yet.</p>
                    <button onClick={openAddExpense} className="mt-2 text-indigo-600 text-sm underline">
                      Add your first expense
                    </button>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {expenses.slice(0, 5).map(e => (
                      <div
                        key={e.id}
                        className="flex items-center justify-between py-2.5 px-2 rounded-xl hover:bg-gray-50 cursor-pointer transition-colors"
                        onClick={() => setViewExpense(e)}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-sm">
                            {e.categories?.icon ?? '💳'}
                          </div>
                          <div>
                            <p className="font-medium text-gray-800 text-sm">{e.item_name}</p>
                            <p className="text-xs text-gray-400">{e.categories?.name} · {e.date}</p>
                          </div>
                        </div>
                        <span className="font-bold text-indigo-600 text-sm">₱{e.total.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Quick actions */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Add Expense',    icon: Plus,       onClick: openAddExpense,               color: 'bg-indigo-600 text-white hover:bg-indigo-700' },
                  { label: 'Set Budget',     icon: Wallet,     onClick: () => setView('budget'),       color: 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50' },
                  { label: 'View Reports',   icon: TrendingUp, onClick: () => setView('reports'),      color: 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50' },
                  { label: 'Split Budget',   icon: Users,      onClick: () => setView('splitter'),     color: 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50' },
                ].map(a => (
                  <button
                    key={a.label}
                    onClick={a.onClick}
                    className={`${a.color} rounded-xl p-4 flex flex-col items-center gap-2 transition-colors shadow-sm text-sm font-medium`}
                  >
                    <a.icon className="w-5 h-5" />
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── EXPENSES ──────────────────────────────────────────────────── */}
          {view === 'expenses' && (
            <div className="space-y-4">
              {/* Filters bar */}
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                <div className="flex flex-wrap gap-3">
                  <div className="relative flex-1 min-w-48">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      placeholder="Search by item or category..."
                      className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                  </div>
                  <button
                    onClick={() => setShowFilters(f => !f)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm border transition-colors ${showFilters ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                  >
                    <Filter className="w-4 h-4" />Filters
                    {(filterCategory || filterFrom || filterTo) && (
                      <span className="w-2 h-2 rounded-full bg-indigo-500 ml-1" />
                    )}
                  </button>
                  <button
                    onClick={() => exportCSV(filtered)}
                    className="flex items-center gap-2 border border-gray-200 rounded-xl px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors text-gray-600"
                  >
                    <Download className="w-4 h-4" />Export
                  </button>
                </div>

                {showFilters && (
                  <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap gap-3">
                    <select
                      value={filterCategory}
                      onChange={e => setFilterCategory(e.target.value)}
                      className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    >
                      <option value="">All Categories</option>
                      {categories.map(c => (
                        <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                      ))}
                    </select>
                    <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)}
                      className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                    <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)}
                      className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                    {(filterCategory || filterFrom || filterTo) && (
                      <button
                        onClick={() => { setFilterCategory(''); setFilterFrom(''); setFilterTo(''); }}
                        className="flex items-center gap-1 text-sm text-red-500 hover:text-red-700 px-2"
                      >
                        <X className="w-3.5 h-3.5" />Clear filters
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Summary strip */}
              {filtered.length > 0 && (
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 text-center">
                    <p className="text-xs text-gray-400">Items</p>
                    <p className="font-bold text-gray-800">{filtered.length}</p>
                  </div>
                  <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 text-center">
                    <p className="text-xs text-gray-400">Total</p>
                    <p className="font-bold text-indigo-600">₱{filtered.reduce((s,e) => s+e.total, 0).toFixed(2)}</p>
                  </div>
                  <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 text-center">
                    <p className="text-xs text-gray-400">Average</p>
                    <p className="font-bold text-gray-800">₱{(filtered.reduce((s,e) => s+e.total, 0) / filtered.length).toFixed(2)}</p>
                  </div>
                </div>
              )}

              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <RefreshCw className="w-6 h-6 text-indigo-400 animate-spin" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="bg-white rounded-2xl p-12 shadow-sm text-center border border-gray-100">
                  <Wallet className="w-12 h-12 mx-auto mb-3 text-gray-200" />
                  <p className="text-gray-500 font-medium">No expenses found.</p>
                  <button onClick={openAddExpense} className="mt-3 text-indigo-600 text-sm underline">Add one now</button>
                </div>
              ) : (
                <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                          <th className="text-left px-4 py-3 text-gray-500 font-semibold cursor-pointer hover:text-gray-700 whitespace-nowrap" onClick={() => handleSort('date')}>
                            Date <SortIcon col="date" />
                          </th>
                          <th className="text-left px-4 py-3 text-gray-500 font-semibold cursor-pointer hover:text-gray-700" onClick={() => handleSort('name')}>
                            Item <SortIcon col="name" />
                          </th>
                          <th className="text-left px-4 py-3 text-gray-500 font-semibold whitespace-nowrap">Category</th>
                          <th className="text-left px-4 py-3 text-gray-500 font-semibold">Qty</th>
                          <th className="text-left px-4 py-3 text-gray-500 font-semibold whitespace-nowrap">Price</th>
                          <th className="text-left px-4 py-3 text-gray-500 font-semibold cursor-pointer hover:text-gray-700 whitespace-nowrap" onClick={() => handleSort('total')}>
                            Total <SortIcon col="total" />
                          </th>
                          <th className="text-left px-4 py-3 text-gray-500 font-semibold">Notes</th>
                          <th className="px-4 py-3" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {filtered.map(e => (
                          <tr key={e.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">{e.date}</td>
                            <td className="px-4 py-3">
                              <button onClick={() => setViewExpense(e)} className="font-medium text-gray-800 hover:text-indigo-600 text-left">
                                {e.item_name}
                              </button>
                            </td>
                            <td className="px-4 py-3">
                              <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full text-xs whitespace-nowrap">
                                {e.categories?.icon} {e.categories?.name}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-gray-600">{e.quantity}</td>
                            <td className="px-4 py-3 text-gray-600 whitespace-nowrap">₱{e.price.toFixed(2)}</td>
                            <td className="px-4 py-3 font-bold text-indigo-600 whitespace-nowrap">₱{e.total.toFixed(2)}</td>
                            <td className="px-4 py-3 text-gray-400 max-w-[120px] truncate">{e.notes ?? '—'}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1">
                                <button onClick={() => setViewExpense(e)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600">
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => openEditExpense(e)} className="p-1.5 rounded-lg hover:bg-indigo-50 text-gray-400 hover:text-indigo-600">
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => handleDeleteExpense(e.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-indigo-50 border-t border-indigo-100">
                          <td colSpan={5} className="px-4 py-3 font-bold text-indigo-700 text-sm">
                            Total ({filtered.length} item{filtered.length !== 1 ? 's' : ''})
                          </td>
                          <td className="px-4 py-3 font-bold text-indigo-700 text-sm">
                            ₱{filtered.reduce((s,e) => s+e.total, 0).toFixed(2)}
                          </td>
                          <td colSpan={2} />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── BUDGET ────────────────────────────────────────────────────── */}
          {view === 'budget' && (
            <div className="space-y-5 max-w-2xl">
              {/* Set budget */}
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                <h3 className="font-bold text-gray-800 mb-1 flex items-center gap-2">
                  <Wallet className="w-5 h-5 text-indigo-500" />Set Monthly Budget
                </h3>
                <p className="text-sm text-gray-500 mb-4">
                  Set your spending limit. You'll get a warning at 80% and an alert at 100%.
                </p>
                <div className="flex gap-3">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-sm">₱</span>
                    <input
                      type="number"
                      value={budget}
                      onChange={e => setBudget(e.target.value)}
                      placeholder="e.g. 5000"
                      min="0" step="0.01"
                      className="w-full border border-gray-200 rounded-xl pl-8 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                  </div>
                  <button
                    onClick={saveBudget}
                    disabled={savingBudget}
                    className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center gap-2"
                  >
                    {savingBudget ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Save
                  </button>
                </div>
              </div>

              {/* Current budget status */}
              {profile?.monthly_budget && (
                <>
                  <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                    <h3 className="font-bold text-gray-800 mb-4">This Month's Status</h3>
                    <div className="grid grid-cols-3 gap-4 mb-5">
                      <div className="text-center">
                        <p className="text-xs text-gray-400 mb-1">Budget</p>
                        <p className="text-2xl font-bold text-gray-800">₱{profile.monthly_budget.toFixed(2)}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-gray-400 mb-1">Spent</p>
                        <p className="text-2xl font-bold text-indigo-600">₱{totalMonth.toFixed(2)}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-gray-400 mb-1">Remaining</p>
                        <p className={`text-2xl font-bold ${remaining < 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {remaining < 0 ? '-' : ''}₱{Math.abs(remaining).toFixed(2)}
                        </p>
                      </div>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-4 mb-2">
                      <div
                        className={`h-4 rounded-full transition-all duration-700 ${budgetPct >= 100 ? 'bg-red-500' : budgetPct >= 80 ? 'bg-amber-400' : 'bg-green-500'}`}
                        style={{ width: `${Math.min(budgetPct, 100)}%` }}
                      />
                    </div>
                    <p className="text-sm text-center text-gray-500">
                      {budgetPct.toFixed(1)}% of budget used this month
                    </p>

                    {budgetPct >= 100 && (
                      <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm font-medium flex items-center gap-2">
                        <AlertCircle className="w-4 h-4" />
                        Budget exceeded by ₱{Math.abs(remaining).toFixed(2)}!
                      </div>
                    )}
                    {budgetPct >= 80 && budgetPct < 100 && (
                      <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-700 text-sm font-medium flex items-center gap-2">
                        <AlertCircle className="w-4 h-4" />
                        Warning: Only ₱{remaining.toFixed(2)} left for this month!
                      </div>
                    )}
                  </div>

                  {/* Daily spending chart */}
                  <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-bold text-gray-800">Daily Spending</h3>
                      <input
                        type="month"
                        value={filterMonth}
                        onChange={e => setFilterMonth(e.target.value)}
                        className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                      />
                    </div>
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={dailyData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip formatter={(v: unknown) => `₱${(v as number).toFixed(2)}`} labelFormatter={l => `Day ${l}`} />
                        <Line type="monotone" dataKey="total" stroke="#6366F1" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </>
              )}

              {/* Spending by category this month */}
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                <h3 className="font-bold text-gray-800 mb-4">Spending by Category (This Month)</h3>
                {pieData.length === 0 ? (
                  <p className="text-gray-400 text-sm text-center py-4">No spending this month</p>
                ) : (
                  <div className="space-y-3">
                    {pieData.map((d, i) => (
                      <div key={d.name}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="font-medium text-gray-700">{d.name}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-gray-500">{totalAll ? ((d.value/totalAll)*100).toFixed(1) : 0}%</span>
                            <span className="font-bold text-gray-800">₱{d.value.toFixed(2)}</span>
                          </div>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-2">
                          <div
                            className="h-2 rounded-full"
                            style={{
                              width: `${totalAll ? (d.value/totalAll)*100 : 0}%`,
                              background: COLORS[i % COLORS.length],
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── REPORTS ───────────────────────────────────────────────────── */}
          {view === 'reports' && (
            <div className="space-y-5">
              {/* Controls */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <label className="text-sm font-medium text-gray-600">Report Period:</label>
                  <input
                    type="month"
                    value={reportMonth}
                    onChange={e => setReportMonth(e.target.value)}
                    className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => exportCSV(rExpenses, `report-${reportMonth}`)}
                    className="flex items-center gap-2 border border-gray-200 rounded-xl px-4 py-2 text-sm hover:bg-gray-50 transition-colors text-gray-600"
                  >
                    <Download className="w-4 h-4" />Export CSV
                  </button>
                  <button
                    onClick={printReport}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-4 py-2 text-sm font-medium transition-colors"
                  >
                    <Printer className="w-4 h-4" />Print / PDF
                  </button>
                </div>
              </div>

              {/* Summary cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: 'Total Expenses',  value: `₱${rTotal.toFixed(2)}`,          color: 'text-indigo-600', bg: 'bg-indigo-50' },
                  { label: 'Transactions',    value: rExpenses.length,                  color: 'text-blue-600',   bg: 'bg-blue-50'   },
                  { label: 'Monthly Budget',  value: profile?.monthly_budget ? `₱${profile.monthly_budget.toFixed(2)}` : 'Not set', color: 'text-gray-700', bg: 'bg-gray-100' },
                  { label: 'Remaining',       value: profile?.monthly_budget ? `₱${(profile.monthly_budget - rTotal).toFixed(2)}` : '—', color: remaining < 0 ? 'text-red-600' : 'text-green-600', bg: remaining < 0 ? 'bg-red-50' : 'bg-green-50' },
                ].map(c => (
                  <div key={c.label} className={`${c.bg} rounded-2xl p-5 shadow-sm`}>
                    <p className="text-xs text-gray-400 mb-1">{c.label}</p>
                    <p className={`text-xl font-bold ${c.color}`}>{c.value}</p>
                  </div>
                ))}
              </div>

              {/* Monthly bar chart */}
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                <h3 className="font-semibold text-gray-700 mb-4">Monthly Summary (Last 6 Months)</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={monthlyBar}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip formatter={(v: unknown) => `₱${(v as number).toFixed(2)}`} />
                    <Bar dataKey="total" fill="#6366F1" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Category breakdown */}
              <div className="grid lg:grid-cols-2 gap-4">
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                  <h3 className="font-semibold text-gray-700 mb-4">Category Breakdown</h3>
                  {rByCategory.length === 0 ? (
                    <p className="text-gray-400 text-sm text-center py-6">No data for this period</p>
                  ) : (
                    <div className="space-y-3">
                      {rByCategory.map((d, i) => (
                        <div key={d.name}>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="font-medium text-gray-700">{d.icon} {d.name}</span>
                            <div className="flex gap-2 items-center">
                              <span className="text-gray-400 text-xs">{rTotal ? ((d.value/rTotal)*100).toFixed(1) : 0}%</span>
                              <span className="font-bold text-gray-800">₱{d.value.toFixed(2)}</span>
                            </div>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-2">
                            <div className="h-2 rounded-full" style={{ width: `${rTotal ? (d.value/rTotal)*100 : 0}%`, background: COLORS[i % COLORS.length] }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                  <h3 className="font-semibold text-gray-700 mb-4">All Expenses — {format(rStart, 'MMMM yyyy')}</h3>
                  {rExpenses.length === 0 ? (
                    <p className="text-gray-400 text-sm text-center py-6">No expenses for this period</p>
                  ) : (
                    <div className="space-y-1 max-h-72 overflow-y-auto">
                      {rExpenses.map(e => (
                        <div key={e.id} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-gray-50">
                          <div>
                            <p className="text-sm font-medium text-gray-800">{e.item_name}</p>
                            <p className="text-xs text-gray-400">{e.categories?.name} · {e.date}</p>
                          </div>
                          <span className="font-bold text-indigo-600 text-sm">₱{e.total.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {rExpenses.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between">
                      <span className="text-sm font-semibold text-gray-700">Total</span>
                      <span className="font-bold text-indigo-600">₱{rTotal.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── BUDGET SPLITTER ───────────────────────────────────────────── */}
          {view === 'splitter' && <BudgetSplitter />}

          {/* ── NOTIFICATIONS ─────────────────────────────────────────────── */}
          {view === 'notifications' && (
            <div className="space-y-4 max-w-2xl">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-bold text-gray-800 flex items-center gap-2">
                    <Bell className="w-5 h-5 text-indigo-500" />Notifications
                  </h2>
                  <p className="text-sm text-gray-500 mt-0.5">Messages from admin and system alerts</p>
                </div>
                {unreadCount > 0 && (
                  <button
                    onClick={markAllRead}
                    className="text-sm text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1"
                  >
                    <CheckCircle2 className="w-4 h-4" />Mark all read
                  </button>
                )}
              </div>

              {notifications.length === 0 ? (
                <div className="bg-white rounded-2xl p-12 shadow-sm text-center border border-gray-100">
                  <Bell className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                  <p className="text-gray-500 font-medium">No notifications yet</p>
                  <p className="text-gray-400 text-sm mt-1">Admin messages and budget alerts will appear here</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {notifications.map(n => (
                    <div
                      key={n.id}
                      className={`p-4 rounded-2xl border-2 transition-all ${notifColor(n.type)} ${!n.is_read ? 'shadow-sm' : 'opacity-75'}`}
                    >
                      <div className="flex items-start gap-3">
                        <span className="text-xl flex-shrink-0">{notifIcon(n.type)}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-semibold text-sm">{n.title}</p>
                              <p className="text-sm mt-0.5 opacity-90">{n.message}</p>
                            </div>
                            {!n.is_read && (
                              <span className="w-2.5 h-2.5 rounded-full bg-current opacity-80 flex-shrink-0 mt-1" />
                            )}
                          </div>
                          <div className="flex items-center justify-between mt-2">
                            <p className="text-xs opacity-60 flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {format(new Date(n.created_at), 'MMM d, yyyy · h:mm a')}
                            </p>
                            <div className="flex gap-2">
                              {!n.is_read && (
                                <button onClick={() => markRead(n.id)} className="text-xs font-medium hover:underline opacity-80">
                                  Mark read
                                </button>
                              )}
                              <button onClick={() => deleteNotif(n.id)} className="text-xs font-medium hover:underline opacity-60">
                                Dismiss
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── SETTINGS ──────────────────────────────────────────────────── */}
          {view === 'settings' && (
            <div className="space-y-5 max-w-lg">
              {/* Profile */}
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <User className="w-5 h-5 text-indigo-500" />Profile Information
                </h3>

                {/* Avatar */}
                <div className="flex items-center gap-4 mb-5">
                  <div className="relative">
                    <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center text-2xl font-bold text-indigo-600 ring-4 ring-indigo-50 overflow-hidden">
                      {profileForm.avatar_url
                        ? <img src={profileForm.avatar_url} alt="" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        : (profile?.full_name?.[0]?.toUpperCase() ?? 'U')
                      }
                    </div>
                    <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-indigo-600 rounded-full flex items-center justify-center">
                      <Camera className="w-3 h-3 text-white" />
                    </div>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-800">{profile?.full_name}</p>
                    <p className="text-sm text-gray-500">{profile?.email}</p>
                    <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                      profile?.is_active ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                    }`}>
                      {profile?.is_active ? '● Active' : '● Inactive'}
                    </span>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-gray-600 mb-1.5 block flex items-center gap-1">
                      <User className="w-3.5 h-3.5" />Full Name
                    </label>
                    <input
                      value={profileForm.full_name}
                      onChange={e => setProfileForm(f => ({ ...f, full_name: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                      placeholder="Your full name"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600 mb-1.5 block flex items-center gap-1">
                      <Mail className="w-3.5 h-3.5" />Email
                    </label>
                    <input
                      value={profile?.email ?? ''}
                      disabled
                      className="w-full border border-gray-100 bg-gray-50 rounded-xl px-4 py-2.5 text-sm text-gray-400 cursor-not-allowed"
                    />
                    <p className="text-xs text-gray-400 mt-1">Email cannot be changed here</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600 mb-1.5 block flex items-center gap-1">
                      <Camera className="w-3.5 h-3.5" />Avatar URL
                    </label>
                    <input
                      value={profileForm.avatar_url}
                      onChange={e => setProfileForm(f => ({ ...f, avatar_url: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                      placeholder="https://..."
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600 mb-1.5 block flex items-center gap-1">
                      <Phone className="w-3.5 h-3.5" />Phone (optional)
                    </label>
                    <input
                      value={profileForm.phone}
                      onChange={e => setProfileForm(f => ({ ...f, phone: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                      placeholder="+63 9XX XXX XXXX"
                    />
                  </div>
                </div>

                <div className="flex gap-3 mt-5">
                  <button
                    onClick={() => refreshProfile()}
                    className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    Reset
                  </button>
                  <button
                    onClick={saveProfile}
                    disabled={savingProfile}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    {savingProfile ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Save Profile
                  </button>
                </div>
              </div>

              {/* Security */}
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <Shield className="w-5 h-5 text-indigo-500" />Security
                </h3>
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                  <div className="flex items-center gap-3">
                    <Lock className="w-5 h-5 text-gray-500" />
                    <div>
                      <p className="font-medium text-gray-800 text-sm">Password</p>
                      <p className="text-xs text-gray-400">Last updated: unknown</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowPwModal(true)}
                    className="text-sm text-indigo-600 font-medium hover:text-indigo-800"
                  >
                    Change →
                  </button>
                </div>
              </div>

              {/* Account info */}
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-indigo-500" />Account Info
                </h3>
                <div className="space-y-3 text-sm">
                  {[
                    { label: 'User ID',       value: profile?.id?.slice(0,8) + '...' },
                    { label: 'Role',          value: profile?.role },
                    { label: 'Member Since',  value: profile?.created_at ? format(new Date(profile.created_at), 'PPP') : '—' },
                    { label: 'Total Expenses',value: `${expenses.length} records` },
                    { label: 'Total Spent',   value: `₱${totalAll.toFixed(2)}` },
                    { label: 'Budget',        value: profile?.monthly_budget ? `₱${profile.monthly_budget.toFixed(2)}/month` : 'Not set' },
                  ].map(row => (
                    <div key={row.label} className="flex justify-between items-center py-1.5 border-b border-gray-50 last:border-0">
                      <span className="text-gray-500">{row.label}</span>
                      <span className="font-medium text-gray-800">{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Danger zone */}
              <div className="bg-red-50 rounded-2xl p-5 border border-red-100">
                <h3 className="font-bold text-red-700 mb-2 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />Sign Out
                </h3>
                <p className="text-sm text-red-600 mb-3">
                  Sign out from this device. Your data will remain safe.
                </p>
                <button
                  onClick={signOut}
                  className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
                >
                  <LogOut className="w-4 h-4" />Sign Out Now
                </button>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ── Add / Edit Expense Modal ───────────────────────────────────────── */}
      {showExpenseModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="font-bold text-gray-800 text-lg flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-indigo-500" />
                {editExpense ? 'Edit Expense' : 'Add Expense'}
              </h2>
              <button onClick={() => { setShowExpenseModal(false); setEditExpense(null); }} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-600 mb-1.5 block">Item Name *</label>
                <input
                  value={form.item_name}
                  onChange={e => setForm(f => ({ ...f, item_name: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  placeholder="e.g. Lunch, Bus fare..."
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-600 mb-1.5 block">Quantity</label>
                  <input
                    type="number"
                    value={form.quantity}
                    onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    min="0.01" step="0.01"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600 mb-1.5 block">Price (₱) *</label>
                  <input
                    type="number"
                    value={form.price}
                    onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    min="0" step="0.01"
                    placeholder="0.00"
                  />
                </div>
              </div>

              {/* Auto-calculation */}
              {form.price && form.quantity && (
                <div className="bg-indigo-50 rounded-xl px-4 py-3 border border-indigo-100">
                  <p className="text-sm font-semibold text-indigo-700">
                    {form.quantity} × ₱{form.price} ={' '}
                    <span className="text-lg">₱{calcTotal.toFixed(2)}</span>
                  </p>
                  <p className="text-xs text-indigo-400 mt-0.5">Total = Quantity × Price (auto-calculated)</p>
                </div>
              )}

              <div>
                <label className="text-sm font-medium text-gray-600 mb-1.5 block">Category *</label>
                <select
                  value={form.category_id}
                  onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                >
                  <option value="">Select category</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-600 mb-1.5 block">Date</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-600 mb-1.5 block">Notes (optional)</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
                  rows={2}
                  placeholder="Any additional info..."
                />
              </div>
            </div>
            <div className="p-5 border-t border-gray-100 flex gap-3">
              <button
                onClick={() => { setShowExpenseModal(false); setEditExpense(null); }}
                className="flex-1 border border-gray-200 py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveExpense}
                disabled={savingExpense}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2"
              >
                {savingExpense ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {editExpense ? 'Update' : 'Save Expense'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Expense Detail Modal ───────────────────────────────────────────── */}
      {viewExpense && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="font-bold text-gray-800">Expense Details</h2>
              <button onClick={() => setViewExpense(null)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="text-center">
                <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center text-2xl mx-auto mb-2">
                  {viewExpense.categories?.icon ?? '💳'}
                </div>
                <p className="font-bold text-xl text-gray-800">{viewExpense.item_name}</p>
                <p className="text-2xl font-bold text-indigo-600 mt-1">₱{viewExpense.total.toFixed(2)}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
                {[
                  { label: 'Category', value: `${viewExpense.categories?.icon ?? ''} ${viewExpense.categories?.name ?? '—'}` },
                  { label: 'Date',     value: viewExpense.date },
                  { label: 'Quantity', value: viewExpense.quantity },
                  { label: 'Price',    value: `₱${viewExpense.price.toFixed(2)}` },
                  { label: 'Total',    value: `₱${viewExpense.total.toFixed(2)}` },
                  { label: 'Notes',    value: viewExpense.notes ?? '—' },
                ].map(row => (
                  <div key={row.label} className="flex justify-between">
                    <span className="text-gray-500">{row.label}</span>
                    <span className="font-medium text-gray-800">{row.value}</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => { setViewExpense(null); openEditExpense(viewExpense); }}
                  className="flex-1 flex items-center justify-center gap-2 border border-indigo-200 text-indigo-600 hover:bg-indigo-50 py-2.5 rounded-xl text-sm font-medium"
                >
                  <Edit2 className="w-4 h-4" />Edit
                </button>
                <button
                  onClick={() => { setViewExpense(null); handleDeleteExpense(viewExpense.id); }}
                  className="flex-1 flex items-center justify-center gap-2 border border-red-200 text-red-500 hover:bg-red-50 py-2.5 rounded-xl text-sm font-medium"
                >
                  <Trash2 className="w-4 h-4" />Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Change Password Modal ──────────────────────────────────────────── */}
      {showPwModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="font-bold text-gray-800 flex items-center gap-2">
                <Lock className="w-5 h-5 text-indigo-500" />Change Password
              </h2>
              <button onClick={() => setShowPwModal(false)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-600 mb-1.5 block">New Password</label>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={pwForm.newPw}
                    onChange={e => setPwForm(f => ({ ...f, newPw: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    placeholder="Min. 8 characters"
                  />
                  <button
                    onClick={() => setShowPw(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                </div>
                {pwForm.newPw && pwForm.newPw.length < 8 && (
                  <p className="text-xs text-red-500 mt-1">Password must be at least 8 characters</p>
                )}
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600 mb-1.5 block">Confirm Password</label>
                <input
                  type={showPw ? 'text' : 'password'}
                  value={pwForm.confirm}
                  onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  placeholder="Repeat password"
                />
                {pwForm.confirm && pwForm.newPw !== pwForm.confirm && (
                  <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
                )}
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowPwModal(false)} className="flex-1 border border-gray-200 py-2.5 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
                  Cancel
                </button>
                <button
                  onClick={changePassword}
                  disabled={savingPw || pwForm.newPw.length < 8 || pwForm.newPw !== pwForm.confirm}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2"
                >
                  {savingPw ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                  Change Password
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Dropdown filter close on outside click */}
      {showFilters && (
        <div className="fixed inset-0 z-10" onClick={() => setShowFilters(false)} style={{ pointerEvents: 'none' }} />
      )}
    </div>
  );
}
