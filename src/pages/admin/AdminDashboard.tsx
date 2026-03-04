import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import {
  Users, DollarSign, TrendingUp, Settings, Tag, LogOut,
  Activity, AlertTriangle, Download, Plus, Edit2,
  Trash2, Search, X, BookOpen, Wifi, Database, Lock, Unlock,
  Menu, Bell, Shield, Eye, UserPlus, RefreshCw, CheckCircle,
  PieChart as PieChartIcon, FileText, Printer,
  UserX, UserCheck, Key, ChevronDown, ChevronUp,
  CreditCard, Clock
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, parseISO, startOfWeek, endOfWeek } from 'date-fns';
import toast from 'react-hot-toast';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend, AreaChart, Area
} from 'recharts';
import AdminSetupGuide from './AdminSetupGuide';
import FullDatabaseSQL from './FullDatabaseSQL';
import logo from '../../assets/logo.svg';

interface Profile {
  id: string; email: string; full_name: string | null; role: 'admin' | 'user';
  is_active: boolean; monthly_budget: number | null; created_at: string;
}
interface Expense {
  id: string; item_name: string; quantity: number; price: number; total: number;
  date: string; notes: string | null; category_id: string; user_id: string;
  categories?: { name: string; icon: string | null; color: string | null };
  profiles?: { full_name: string | null; email: string };
}
interface Category { id: string; name: string; icon: string | null; color: string | null; is_active?: boolean; }
interface Notification { id: string; user_id: string; title: string; message: string; type: 'warning' | 'info' | 'danger' | 'success'; is_read: boolean; created_at: string; }

const COLORS = ['#6366F1','#F59E0B','#10B981','#3B82F6','#8B5CF6','#EC4899','#14B8A6','#F97316','#EF4444','#84CC16'];
type View = 'overview' | 'users' | 'expenses' | 'categories' | 'reports' | 'budget' | 'notifications' | 'settings' | 'guide' | 'sql';

const SECRET_SEQ  = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown'];
const SECRET_NAME = '↑ ↑ ↓ ↓';

export default function AdminDashboard() {
  const { profile: adminProfile, signOut } = useAuth();
  const [view, setView] = useState<View>('overview');
  const [users, setUsers] = useState<Profile[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [onlineCount, setOnlineCount] = useState(0);
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [searchUser, setSearchUser] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterMin, setFilterMin] = useState('');
  const [filterMax, setFilterMax] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [expenseSortBy, setExpenseSortBy] = useState<'date'|'total'|'name'>('date');
  const [expenseSortDir, setExpenseSortDir] = useState<'asc'|'desc'>('desc');

  // Modals
  const [showCatModal, setShowCatModal] = useState(false);
  const [editCat, setEditCat] = useState<Category | null>(null);
  const [catForm, setCatForm] = useState({ name: '', icon: '', color: '#6366F1' });
  const [showUserModal, setShowUserModal] = useState(false);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [editUser, setEditUser] = useState<Profile | null>(null);
  const [userForm, setUserForm] = useState({ full_name: '', email: '', role: 'user', monthly_budget: '', is_active: true });
  const [addUserForm, setAddUserForm] = useState({ full_name: '', email: '', password: '', role: 'user', monthly_budget: '' });
  const [addUserLoading, setAddUserLoading] = useState(false);
  const [showUserDetail, setShowUserDetail] = useState<Profile | null>(null);
  const [showNotifModal, setShowNotifModal] = useState(false);
  const [notifTarget, setNotifTarget] = useState<Profile | null>(null);
  const [notifMessage, setNotifMessage] = useState('');
  const [notifType, setNotifType] = useState<'warning'|'info'|'danger'>('warning');
  const [mobileMenu, setMobileMenu] = useState(false);
  const [devUnlocked, setDevUnlocked] = useState(false);
  const [reportMonth, setReportMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [selectedBudgetUser, setSelectedBudgetUser] = useState<string>('all');
  const [userRoleFilter, setUserRoleFilter] = useState<'all'|'admin'|'user'>('all');
  const [userStatusFilter, setUserStatusFilter] = useState<'all'|'active'|'inactive'>('all');

  // Secret shortcut
  const seqBuf = useRef<string[]>([]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) return;
      const tag = (e.target as HTMLElement)?.tagName ?? '';
      if (['INPUT','TEXTAREA','SELECT'].includes(tag)) return;
      seqBuf.current = [...seqBuf.current, e.key].slice(-SECRET_SEQ.length);
      if (seqBuf.current.join(',') === SECRET_SEQ.join(',')) {
        seqBuf.current = [];
        setDevUnlocked(prev => {
          const next = !prev;
          toast(next ? '🔓 Developer tools unlocked!' : '🔒 Developer tools hidden.', { icon: next ? '🛠️' : '🔒', duration: 3000 });
          if (!next) setView(v => (v === 'guide' || v === 'sql') ? 'overview' : v);
          return next;
        });
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, []);

  // Triple-tap lock icon
  const tapCount = useRef(0);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleLockTap = () => {
    tapCount.current += 1;
    if (tapTimer.current) clearTimeout(tapTimer.current);
    if (tapCount.current >= 3) {
      tapCount.current = 0;
      setDevUnlocked(prev => {
        const next = !prev;
        toast(next ? '🔓 Dev tools unlocked!' : '🔒 Dev tools hidden.', { duration: 3000 });
        if (!next) setView(v => (v === 'guide' || v === 'sql') ? 'overview' : v);
        return next;
      });
    } else {
      tapTimer.current = setTimeout(() => { tapCount.current = 0; }, 700);
    }
  };

  // Fetch all data
  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const [{ data: u }, { data: e }, { data: c }, { data: n }] = await Promise.all([
        supabase.from('profiles').select('*').order('created_at', { ascending: false }),
        supabase.from('expenses').select('*, categories(name, icon, color), profiles(full_name, email)').order('date', { ascending: false }),
        supabase.from('categories').select('*').order('name'),
        supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(100),
      ]);
      if (u) setUsers(u as Profile[]);
      if (e) setExpenses(e as Expense[]);
      if (c) setCategories(c as Category[]);
      if (n && Array.isArray(n)) setNotifications(n as Notification[]);
    } catch (_) {}
    if (!silent) setLoading(false);
    else setRefreshing(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Realtime presence
  useEffect(() => {
    if (!adminProfile?.id) return;
    const channel = supabase.channel('spendwise-online', {
      config: { presence: { key: adminProfile.id } },
    });
    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const ids = Object.keys(state);
        setOnlineUsers(ids);
        setOnlineCount(ids.length);
      })
      .on('presence', { event: 'join' }, ({ newPresences }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const keys = newPresences.map((p: any) => p.key as string);
        setOnlineUsers(prev => { const u = [...new Set([...prev,...keys])]; setOnlineCount(u.length); return u; });
      })
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const keys = leftPresences.map((p: any) => p.key as string);
        setOnlineUsers(prev => { const u = prev.filter(id => !keys.includes(id)); setOnlineCount(u.length); return u; });
      })
      .subscribe(async status => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ user_id: adminProfile.id, email: adminProfile.email, role: 'admin', online_at: new Date().toISOString() });
        }
      });
    return () => { supabase.removeChannel(channel); };
  }, [adminProfile]);

  // ── Computed ──────────────────────────────────────────────────────────────
  const now        = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd   = endOfMonth(now);
  const weekStart  = startOfWeek(now);
  const weekEnd    = endOfWeek(now);

  const totalExpenses  = expenses.reduce((s, e) => s + e.total, 0);
  const monthExpenses  = expenses.filter(e => { const d = parseISO(e.date); return d >= monthStart && d <= monthEnd; }).reduce((s, e) => s + e.total, 0);
  const weekExpenses   = expenses.filter(e => { const d = parseISO(e.date); return d >= weekStart && d <= weekEnd; }).reduce((s, e) => s + e.total, 0);
  const activeUsers    = users.filter(u => u.is_active).length;

  const getUserMonthSpend = (userId: string, month?: Date) => {
    const ms = startOfMonth(month ?? now);
    const me = endOfMonth(month ?? now);
    return expenses.filter(e => e.user_id === userId && parseISO(e.date) >= ms && parseISO(e.date) <= me).reduce((s, e) => s + e.total, 0);
  };

  const overBudgetList = users.filter(u => {
    if (!u.monthly_budget) return false;
    return getUserMonthSpend(u.id) > u.monthly_budget;
  });

  const nearBudgetList = users.filter(u => {
    if (!u.monthly_budget) return false;
    const spent = getUserMonthSpend(u.id);
    return spent >= u.monthly_budget * 0.8 && spent <= u.monthly_budget;
  });

  const unusualSpenders = users.filter(u => {
    if (!u.monthly_budget) return false;
    return getUserMonthSpend(u.id) > u.monthly_budget * 1.5;
  });

  const catPie = categories.map((c, i) => ({
    name: c.name, icon: c.icon,
    value: expenses.filter(e => e.category_id === c.id).reduce((s, e) => s + e.total, 0),
    fill: c.color ?? COLORS[i % COLORS.length],
  })).filter(d => d.value > 0).sort((a, b) => b.value - a.value);

  const monthlyBar = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    return {
      name: format(d, 'MMM'),
      total: expenses.filter(e => { const ed = parseISO(e.date); return ed >= startOfMonth(d) && ed <= endOfMonth(d); }).reduce((s, e) => s + e.total, 0),
      users: new Set(expenses.filter(e => { const ed = parseISO(e.date); return ed >= startOfMonth(d) && ed <= endOfMonth(d); }).map(e => e.user_id)).size,
    };
  });

  // Filtered expenses
  const filteredExpenses = expenses
    .filter(e => {
      const matchDate = filterDate ? e.date === filterDate : true;
      const matchCat  = filterCat  ? e.category_id === filterCat : true;
      const matchMin  = filterMin  ? e.total >= parseFloat(filterMin) : true;
      const matchMax  = filterMax  ? e.total <= parseFloat(filterMax) : true;
      const matchUser = filterUser ? e.user_id === filterUser : true;
      return matchDate && matchCat && matchMin && matchMax && matchUser;
    })
    .sort((a, b) => {
      if (expenseSortBy === 'date') return expenseSortDir === 'desc' ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date);
      if (expenseSortBy === 'total') return expenseSortDir === 'desc' ? b.total - a.total : a.total - b.total;
      return expenseSortDir === 'desc' ? b.item_name.localeCompare(a.item_name) : a.item_name.localeCompare(b.item_name);
    });

  const filteredUsers = users.filter(u => {
    const matchSearch = u.email.toLowerCase().includes(searchUser.toLowerCase()) || (u.full_name ?? '').toLowerCase().includes(searchUser.toLowerCase());
    const matchRole   = userRoleFilter === 'all' || u.role === userRoleFilter;
    const matchStatus = userStatusFilter === 'all' || (userStatusFilter === 'active' ? u.is_active : !u.is_active);
    return matchSearch && matchRole && matchStatus;
  });

  // Per-user expense data for budget view
  const usersWithBudgetData = users.map(u => {
    const spent   = getUserMonthSpend(u.id);
    const budget  = u.monthly_budget ?? 0;
    const pct     = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;
    const over    = budget > 0 && spent > budget;
    const near    = budget > 0 && pct >= 80 && !over;
    return { ...u, spent, budget, pct, over, near };
  });

  // Report month expenses
  const [reportY, reportM] = reportMonth.split('-').map(Number);
  const reportStart = startOfMonth(new Date(reportY, reportM - 1));
  const reportEnd   = endOfMonth(new Date(reportY, reportM - 1));
  const reportExpenses = expenses.filter(e => { const d = parseISO(e.date); return d >= reportStart && d <= reportEnd; });
  const reportTotal    = reportExpenses.reduce((s, e) => s + e.total, 0);
  const reportCatData  = categories.map((c, i) => ({
    name: c.name, icon: c.icon,
    value: reportExpenses.filter(e => e.category_id === c.id).reduce((s, e) => s + e.total, 0),
    fill: COLORS[i % COLORS.length],
  })).filter(d => d.value > 0).sort((a, b) => b.value - a.value);
  const reportUserData = users.map(u => ({
    name: u.full_name ?? u.email,
    email: u.email,
    total: reportExpenses.filter(e => e.user_id === u.id).reduce((s, e) => s + e.total, 0),
    count: reportExpenses.filter(e => e.user_id === u.id).length,
  })).filter(d => d.total > 0).sort((a, b) => b.total - a.total);

  // Unread notifications count
  const unreadNotif = notifications.filter(n => !n.is_read).length;

  // ── CRUD ──────────────────────────────────────────────────────────────────
  const handleSaveCat = async () => {
    if (!catForm.name.trim()) { toast.error('Category name required.'); return; }
    if (editCat) {
      const { error } = await supabase.from('categories').update({ name: catForm.name, icon: catForm.icon || null, color: catForm.color }).eq('id', editCat.id);
      if (error) { toast.error(error.message); return; }
      toast.success('Category updated!');
    } else {
      const { error } = await supabase.from('categories').insert({ name: catForm.name, icon: catForm.icon || null, color: catForm.color, created_by: adminProfile?.id });
      if (error) { toast.error(error.message); return; }
      toast.success('Category added!');
    }
    setShowCatModal(false); setEditCat(null); setCatForm({ name: '', icon: '', color: '#6366F1' });
    fetchData(true);
  };

  const handleDeleteCat = async (id: string) => {
    if (expenses.some(e => e.category_id === id)) { toast.error('Cannot delete — category has linked expenses.'); return; }
    if (!confirm('Delete this category? This cannot be undone.')) return;
    await supabase.from('categories').delete().eq('id', id);
    toast.success('Category deleted!'); fetchData(true);
  };

  const handleSaveUser = async () => {
    if (!editUser) return;
    const { error } = await supabase.from('profiles').update({
      full_name: userForm.full_name || null,
      role: userForm.role as 'admin' | 'user',
      monthly_budget: parseFloat(userForm.monthly_budget) || null,
      is_active: userForm.is_active,
    }).eq('id', editUser.id);
    if (error) { toast.error(error.message); return; }
    toast.success('User updated!'); setShowUserModal(false); setEditUser(null); fetchData(true);
  };

  const handleAddUser = async () => {
    if (!addUserForm.email || !addUserForm.password) { toast.error('Email and password are required.'); return; }
    if (addUserForm.password.length < 6) { toast.error('Password must be at least 6 characters.'); return; }
    setAddUserLoading(true);
    try {
      // Create user via Supabase Auth Admin API (requires service_role key, show instructions if fails)
      const { data, error } = await supabase.auth.admin.createUser({
        email: addUserForm.email,
        password: addUserForm.password,
        email_confirm: true,
        user_metadata: { full_name: addUserForm.full_name },
      });
      if (error) throw error;
      if (data.user) {
        await supabase.from('profiles').upsert({
          id: data.user.id,
          email: addUserForm.email,
          full_name: addUserForm.full_name || null,
          role: addUserForm.role as 'admin' | 'user',
          monthly_budget: parseFloat(addUserForm.monthly_budget) || null,
          is_active: true,
        });
      }
      toast.success(`User ${addUserForm.email} created!`);
      setShowAddUserModal(false);
      setAddUserForm({ full_name: '', email: '', password: '', role: 'user', monthly_budget: '' });
      fetchData(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create user';
      if (msg.includes('not allowed') || msg.includes('service_role') || msg.includes('admin')) {
        toast.error('Admin user creation requires service_role key. Use Supabase Dashboard → Authentication → Users → Invite User instead.', { duration: 6000 });
      } else {
        toast.error(msg);
      }
    } finally {
      setAddUserLoading(false);
    }
  };

  const handleDeleteUser = async (u: Profile) => {
    if (u.id === adminProfile?.id) { toast.error("You can't delete your own account!"); return; }
    if (!confirm(`Permanently delete ${u.full_name ?? u.email}? All their expenses will also be deleted. This cannot be undone!`)) return;
    const { error } = await supabase.from('profiles').delete().eq('id', u.id);
    if (error) { toast.error(error.message); return; }
    toast.success('User deleted!'); fetchData(true);
  };

  const handleToggleActive = async (u: Profile) => {
    if (u.id === adminProfile?.id) { toast.error("You can't deactivate your own account!"); return; }
    const { error } = await supabase.from('profiles').update({ is_active: !u.is_active }).eq('id', u.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`User ${!u.is_active ? 'activated' : 'deactivated'}!`); fetchData(true);
  };

  const handleResetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
    if (error) { toast.error(error.message); return; }
    toast.success(`Password reset email sent to ${email}`);
  };

  const handleSendNotification = async () => {
    if (!notifTarget || !notifMessage.trim()) { toast.error('Select user and enter message.'); return; }
    const { error } = await supabase.from('notifications').insert({
      user_id: notifTarget.id,
      title: notifType === 'danger' ? '🚨 Alert' : notifType === 'warning' ? '⚠️ Warning' : 'ℹ️ Info',
      message: notifMessage.trim(),
      type: notifType,
      is_read: false,
    });
    if (error) {
      if (error.message.includes('does not exist') || error.message.includes('42P01')) {
        toast.error('Run the Database SQL Step 3 first to create the notifications table.', { duration: 5000 });
      } else { toast.error(error.message); }
      return;
    }
    toast.success(`Notification sent to ${notifTarget.full_name ?? notifTarget.email}!`);
    setShowNotifModal(false); setNotifMessage(''); setNotifTarget(null); fetchData(true);
  };

  const handleSendBudgetWarnings = async () => {
    const targets = [...overBudgetList, ...nearBudgetList];
    if (targets.length === 0) { toast('No users need budget warnings right now.', { icon: 'ℹ️' }); return; }
    let sent = 0;
    for (const u of targets) {
      const spent = getUserMonthSpend(u.id);
      const isOver = u.monthly_budget && spent > u.monthly_budget;
      const title = isOver ? '🚨 Budget Exceeded!' : '⚠️ Budget Warning';
      const msg = isOver
        ? `You have exceeded your monthly budget of ₱${u.monthly_budget?.toFixed(2)}. You've spent ₱${spent.toFixed(2)} this month.`
        : `You have used ${((spent / (u.monthly_budget ?? 1)) * 100).toFixed(0)}% of your ₱${u.monthly_budget?.toFixed(2)} monthly budget.`;
      const { error } = await supabase.from('notifications').insert({
        user_id: u.id, title, message: msg, type: isOver ? 'danger' : 'warning', is_read: false,
      });
      if (!error) sent++;
    }
    toast.success(`Sent ${sent} budget warning${sent !== 1 ? 's' : ''}!`);
    fetchData(true);
  };

  const exportCSV = (data: Expense[] = filteredExpenses) => {
    const rows = [
      ['Date','User Email','User Name','Item','Category','Qty','Price','Total','Notes'],
      ...data.map(e => [
        e.date, e.profiles?.email ?? '', e.profiles?.full_name ?? '', e.item_name,
        e.categories?.name ?? '', e.quantity, e.price, e.total, e.notes ?? '',
      ]),
    ];
    const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const a = document.createElement('a'); a.href = 'data:text/csv,' + encodeURIComponent(csv);
    a.download = `spendwise-expenses-${format(now,'yyyy-MM-dd')}.csv`; a.click();
    toast.success('CSV exported!');
  };

  const exportReportPDF = () => {
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`
      <html><head><title>SpendWise Report - ${reportMonth}</title>
      <style>
        body{font-family:system-ui,sans-serif;padding:32px;color:#111}
        h1{color:#4f46e5;margin-bottom:4px}
        h2{color:#374151;font-size:16px;margin-top:24px;border-bottom:2px solid #e5e7eb;padding-bottom:8px}
        table{width:100%;border-collapse:collapse;margin-top:12px;font-size:13px}
        th{background:#f9fafb;text-align:left;padding:8px 12px;font-size:12px;color:#6b7280;border-bottom:2px solid #e5e7eb}
        td{padding:8px 12px;border-bottom:1px solid #f3f4f6}
        tr:hover td{background:#f9fafb}
        .stat{display:inline-block;background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:12px 20px;margin:6px;min-width:140px}
        .stat-val{font-size:22px;font-weight:700;color:#1d4ed8}
        .stat-label{font-size:11px;color:#6b7280;margin-top:2px}
        .footer{margin-top:32px;font-size:11px;color:#9ca3af;text-align:center}
        @media print{button{display:none}}
      </style></head><body>
      <h1>SpendWise Report</h1>
      <p style="color:#6b7280;margin-top:0">Period: <strong>${format(reportStart,'MMMM yyyy')}</strong> &nbsp;|&nbsp; Generated: ${format(now,'MMM d, yyyy h:mm a')}</p>

      <div>
        <div class="stat"><div class="stat-val">₱${reportTotal.toLocaleString('en',{minimumFractionDigits:2})}</div><div class="stat-label">Total Expenses</div></div>
        <div class="stat"><div class="stat-val">${reportExpenses.length}</div><div class="stat-label">Transactions</div></div>
        <div class="stat"><div class="stat-val">${reportUserData.length}</div><div class="stat-label">Active Users</div></div>
        <div class="stat"><div class="stat-val">${reportCatData[0]?.name ?? '—'}</div><div class="stat-label">Top Category</div></div>
      </div>

      <h2>Category Breakdown</h2>
      <table><thead><tr><th>Category</th><th>Amount</th><th>Transactions</th><th>% of Total</th></tr></thead><tbody>
        ${reportCatData.map(c => `<tr><td>${c.icon ?? ''} ${c.name}</td><td>₱${c.value.toLocaleString('en',{minimumFractionDigits:2})}</td><td>${reportExpenses.filter(e=>categories.find(cat=>cat.name===c.name)?.id===e.category_id).length}</td><td>${reportTotal?(c.value/reportTotal*100).toFixed(1):0}%</td></tr>`).join('')}
      </tbody></table>

      <h2>User Summary</h2>
      <table><thead><tr><th>Name</th><th>Email</th><th>Total Spent</th><th>Transactions</th></tr></thead><tbody>
        ${reportUserData.map(u => `<tr><td>${u.name}</td><td>${u.email}</td><td>₱${u.total.toLocaleString('en',{minimumFractionDigits:2})}</td><td>${u.count}</td></tr>`).join('')}
      </tbody></table>

      <h2>All Transactions</h2>
      <table><thead><tr><th>Date</th><th>User</th><th>Item</th><th>Category</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead><tbody>
        ${reportExpenses.map(e=>`<tr><td>${e.date}</td><td>${e.profiles?.full_name??e.profiles?.email??''}</td><td>${e.item_name}</td><td>${e.categories?.icon??''} ${e.categories?.name??''}</td><td>${e.quantity}</td><td>₱${e.price.toFixed(2)}</td><td>₱${e.total.toFixed(2)}</td></tr>`).join('')}
      </tbody></table>

      <div class="footer">SpendWise Expense Tracking System &mdash; Confidential Report</div>
      <script>window.onload=()=>window.print();<\/script>
      </body></html>
    `);
    win.document.close();
  };

  // ── Nav ───────────────────────────────────────────────────────────────────
  type NavItem = { id: View; label: string; icon: React.ElementType; badge?: string; badgeColor?: string; secret?: boolean; dot?: number };
  const allNav: NavItem[] = [
    { id: 'overview',      label: 'Overview',        icon: Activity },
    { id: 'users',         label: 'Users',            icon: Users,         badge: users.length.toString(), badgeColor: 'bg-blue-500 text-white' },
    { id: 'expenses',      label: 'Expenses',         icon: DollarSign },
    { id: 'categories',    label: 'Categories',       icon: Tag },
    { id: 'budget',        label: 'Budget Oversight', icon: CreditCard,    dot: overBudgetList.length },
    { id: 'notifications', label: 'Notifications',    icon: Bell,          dot: unreadNotif },
    { id: 'reports',       label: 'Reports',          icon: TrendingUp },
    { id: 'settings',      label: 'Settings',         icon: Settings },
    { id: 'guide',         label: 'Setup Guide',      icon: BookOpen,      badge: '!', badgeColor: 'bg-amber-400 text-amber-900', secret: true },
    { id: 'sql',           label: 'Database SQL',     icon: Database,      badge: 'SQL', badgeColor: 'bg-green-400 text-green-900', secret: true },
  ];
  const navItems = allNav.filter(item => !item.secret || devUnlocked);

  const viewLabel: Record<View, string> = {
    overview: 'Dashboard Overview', users: 'User Management', expenses: 'Expense Monitoring',
    categories: 'Category Management', budget: 'Budget Oversight', notifications: 'Notifications',
    reports: 'Reports & Analytics', settings: 'System Settings',
    guide: '📋 Setup & Connection Guide', sql: '🗄️ Full Database SQL',
  };

  // ── Sidebar ───────────────────────────────────────────────────────────────
  const Sidebar = () => (
    <aside className={`fixed inset-y-0 left-0 z-40 w-64 bg-gray-950 text-white flex flex-col transform transition-transform duration-200 ${mobileMenu ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}>
      <div className="p-4 border-b border-gray-800">
        <div className="flex items-center gap-3 mb-4">
          <img src={logo} alt="SpendWise" className="w-9 h-9 rounded-xl flex-shrink-0" />
          <div className="min-w-0">
            <p className="font-bold text-white text-sm">SpendWise</p>
            <p className="text-xs text-indigo-400 font-medium">Admin Panel</p>
          </div>
        </div>
        <div className="bg-gray-900 rounded-xl p-3 border border-gray-800">
          <p className="text-xs text-gray-500 truncate mb-1">{adminProfile?.email}</p>
          <div className="flex items-center gap-2">
            <div className="relative flex-shrink-0">
              <Wifi className="w-3.5 h-3.5 text-emerald-400" />
              <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
            </div>
            <span className="text-sm font-bold text-emerald-300">{onlineCount}</span>
            <span className="text-xs text-emerald-500">user{onlineCount !== 1 ? 's' : ''} online</span>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {navItems.map(item => (
          <button key={item.id} onClick={() => { setView(item.id); setMobileMenu(false); }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
              view === item.id
                ? item.id === 'guide' ? 'bg-amber-500 text-white' : item.id === 'sql' ? 'bg-emerald-700 text-white' : 'bg-indigo-600 text-white'
                : 'text-gray-400 hover:bg-gray-900 hover:text-white'
            }`}>
            <item.icon className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1 text-left">{item.label}</span>
            {item.dot !== undefined && item.dot > 0 && (
              <span className="w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center font-bold flex-shrink-0">{item.dot > 9 ? '9+' : item.dot}</span>
            )}
            {item.badge && !item.dot && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${item.badgeColor}`}>{item.badge}</span>
            )}
          </button>
        ))}
      </nav>

      <div className="p-3 border-t border-gray-800 space-y-0.5">
        <button onClick={signOut} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-400 hover:bg-gray-900 hover:text-white transition-all">
          <LogOut className="w-4 h-4" /> Sign Out
        </button>
        <button onClick={handleLockTap} title="Tap 3× to toggle developer tools"
          className={`w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs transition-all select-none ${devUnlocked ? 'text-amber-400/70 hover:text-amber-300' : 'text-gray-800 hover:text-gray-600'}`}>
          {devUnlocked ? <><Unlock className="w-3 h-3" /> Dev tools visible</> : <><Lock className="w-3 h-3 opacity-30" /> · · ·</>}
        </button>
      </div>
    </aside>
  );

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar />
      {mobileMenu && <div className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={() => setMobileMenu(false)} />}

      <div className="flex-1 lg:ml-64 flex flex-col min-h-screen">
        {/* Topbar */}
        <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-20 shadow-sm">
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileMenu(true)} className="lg:hidden p-2 rounded-xl hover:bg-gray-100">
              <Menu className="w-5 h-5 text-gray-600" />
            </button>
            <h1 className="font-bold text-gray-800 text-sm sm:text-base">{viewLabel[view]}</h1>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => fetchData(true)} disabled={refreshing}
              className="p-2 rounded-xl hover:bg-gray-100 text-gray-500 transition-colors" title="Refresh data">
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-indigo-500' : ''}`} />
            </button>
            <button onClick={() => setView('notifications')}
              className="relative p-2 rounded-xl hover:bg-gray-100 text-gray-500">
              <Bell className="w-4 h-4" />
              {unreadNotif > 0 && <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />}
            </button>
            <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl">
              <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
              <span className="text-xs font-semibold text-emerald-700">{onlineCount} online</span>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6 space-y-5">
          {loading && !['guide','sql'].includes(view) ? (
            <div className="flex items-center justify-center py-32">
              <div className="text-center">
                <div className="w-10 h-10 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin mx-auto mb-3" />
                <p className="text-gray-400 text-sm">Loading data…</p>
              </div>
            </div>
          ) : (
            <>
              {/* ── OVERVIEW ─────────────────────────────────────────────── */}
              {view === 'overview' && (
                <>
                  {/* Online users strip */}
                  {onlineCount > 0 && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3 flex items-center gap-3">
                      <div className="w-2.5 h-2.5 bg-emerald-400 rounded-full animate-pulse flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-semibold text-emerald-800">{onlineCount} user{onlineCount !== 1 ? 's' : ''} currently online</span>
                        <p className="text-xs text-emerald-600 truncate mt-0.5">
                          {onlineUsers.map(id => users.find(u => u.id === id)).filter(Boolean).map(u => u!.full_name ?? u!.email).slice(0, 6).join(', ')}
                          {onlineUsers.length > 6 ? ` +${onlineUsers.length - 6} more` : ''}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Stats */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {[
                      { label: 'Total Users', value: users.length, sub: `${activeUsers} active · ${onlineCount} online`, icon: Users, color: 'bg-blue-50 text-blue-600', border: 'border-blue-100', onClick: () => setView('users') },
                      { label: 'Total Expenses', value: `₱${totalExpenses.toLocaleString('en',{minimumFractionDigits:2})}`, sub: `${expenses.length} transactions`, icon: DollarSign, color: 'bg-indigo-50 text-indigo-600', border: 'border-indigo-100', onClick: () => setView('expenses') },
                      { label: 'This Month', value: `₱${monthExpenses.toLocaleString('en',{minimumFractionDigits:2})}`, sub: `₱${weekExpenses.toFixed(2)} this week`, icon: TrendingUp, color: 'bg-emerald-50 text-emerald-600', border: 'border-emerald-100', onClick: () => setView('reports') },
                      { label: 'Over Budget', value: overBudgetList.length, sub: `${nearBudgetList.length} near limit`, icon: AlertTriangle, color: 'bg-red-50 text-red-600', border: 'border-red-100', onClick: () => setView('budget') },
                    ].map(c => (
                      <button key={c.label} onClick={c.onClick} className={`bg-white rounded-2xl p-5 shadow-sm border ${c.border} flex items-start gap-3 hover:shadow-md transition-shadow text-left w-full`}>
                        <div className={`w-10 h-10 rounded-xl ${c.color} flex items-center justify-center flex-shrink-0`}><c.icon className="w-5 h-5" /></div>
                        <div className="min-w-0">
                          <p className="text-xs text-gray-400 truncate">{c.label}</p>
                          <p className="text-lg font-bold text-gray-800 truncate">{c.value}</p>
                          <p className="text-xs text-gray-400">{c.sub}</p>
                        </div>
                      </button>
                    ))}
                  </div>

                  {/* Unusual spending alert */}
                  {unusualSpenders.length > 0 && (
                    <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-red-600" />
                          <h3 className="font-semibold text-red-800 text-sm">Unusual Spending Detected ({unusualSpenders.length})</h3>
                        </div>
                        <button onClick={handleSendBudgetWarnings} className="text-xs bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg font-medium flex items-center gap-1">
                          <Bell className="w-3 h-3" />Send Warnings
                        </button>
                      </div>
                      {unusualSpenders.map(u => {
                        const spent = getUserMonthSpend(u.id);
                        return (
                          <div key={u.id} className="flex items-center justify-between py-1.5 border-b border-red-100 last:border-0">
                            <p className="text-sm text-red-700"><strong>{u.full_name ?? u.email}</strong> — ₱{spent.toFixed(2)} spent vs ₱{u.monthly_budget?.toFixed(2)} budget</p>
                            <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold">{((spent / (u.monthly_budget ?? 1)) * 100).toFixed(0)}%</span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Charts */}
                  <div className="grid lg:grid-cols-2 gap-4">
                    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                      <h3 className="font-semibold text-gray-700 mb-4 text-sm">Monthly Expenses (6 Mo.)</h3>
                      <ResponsiveContainer width="100%" height={220}>
                        <AreaChart data={monthlyBar}>
                          <defs>
                            <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#6366F1" stopOpacity={0.15} />
                              <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" />
                          <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                          <YAxis tick={{ fontSize: 12 }} />
                          <Tooltip formatter={(v: unknown) => `₱${(v as number).toFixed(2)}`} />
                          <Area type="monotone" dataKey="total" stroke="#6366F1" fill="url(#colorTotal)" strokeWidth={2} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                      <h3 className="font-semibold text-gray-700 mb-4 text-sm">Category Breakdown</h3>
                      {catPie.length === 0 ? <p className="text-gray-300 text-sm text-center py-16">No expense data yet</p> : (
                        <ResponsiveContainer width="100%" height={220}>
                          <PieChart>
                            <Pie data={catPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} labelLine={false}>
                              {catPie.map((d, i) => <Cell key={i} fill={d.fill} />)}
                            </Pie>
                            <Tooltip formatter={(v: unknown) => `₱${(v as number).toFixed(2)}`} />
                          </PieChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>

                  {/* Recent transactions */}
                  <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold text-gray-700 text-sm">Recent Transactions</h3>
                      <button onClick={() => setView('expenses')} className="text-xs text-indigo-600 hover:underline">View all →</button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead><tr className="border-b border-gray-100 text-gray-400 text-xs">
                          {['Date','User','Item','Category','Total'].map(h => <th key={h} className="text-left pb-2 pr-4 font-semibold">{h}</th>)}
                        </tr></thead>
                        <tbody className="divide-y divide-gray-50">
                          {expenses.slice(0, 10).map(e => (
                            <tr key={e.id} className="hover:bg-gray-50/50">
                              <td className="py-2.5 pr-4 text-gray-400 text-xs whitespace-nowrap">{e.date}</td>
                              <td className="py-2.5 pr-4 text-gray-600 text-xs">{e.profiles?.full_name ?? e.profiles?.email}</td>
                              <td className="py-2.5 pr-4 font-medium text-gray-800">{e.item_name}</td>
                              <td className="py-2.5 pr-4"><span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full text-xs">{e.categories?.icon} {e.categories?.name}</span></td>
                              <td className="py-2.5 font-semibold text-indigo-600">₱{e.total.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}

              {/* ── USERS ─────────────────────────────────────────────────── */}
              {view === 'users' && (
                <>
                  {/* Toolbar */}
                  <div className="flex flex-wrap gap-3 items-center">
                    <div className="relative flex-1 min-w-48">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input value={searchUser} onChange={e => setSearchUser(e.target.value)} placeholder="Search name or email…"
                        className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white" />
                    </div>
                    <select value={userRoleFilter} onChange={e => setUserRoleFilter(e.target.value as 'all'|'admin'|'user')}
                      className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300">
                      <option value="all">All Roles</option>
                      <option value="admin">Admin</option>
                      <option value="user">User</option>
                    </select>
                    <select value={userStatusFilter} onChange={e => setUserStatusFilter(e.target.value as 'all'|'active'|'inactive')}
                      className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300">
                      <option value="all">All Status</option>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                    <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 px-3 py-2.5 rounded-xl">
                      <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                      <span className="text-sm font-medium text-emerald-700">{onlineCount} online</span>
                    </div>
                    <button onClick={() => setShowAddUserModal(true)}
                      className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors shadow-sm">
                      <UserPlus className="w-4 h-4" />Add User
                    </button>
                  </div>

                  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead><tr className="bg-gray-50 border-b border-gray-100">
                          {['User','Email','Role','Budget / Spent','Status','Online','Joined','Actions'].map(h => (
                            <th key={h} className="text-left px-4 py-3 text-gray-500 font-semibold text-xs whitespace-nowrap">{h}</th>
                          ))}
                        </tr></thead>
                        <tbody className="divide-y divide-gray-50">
                          {filteredUsers.map(u => {
                            const isOnline   = onlineUsers.includes(u.id);
                            const monthSpent = getUserMonthSpend(u.id);
                            const overBudget = u.monthly_budget && monthSpent > u.monthly_budget;
                            const nearBudget = u.monthly_budget && !overBudget && monthSpent >= u.monthly_budget * 0.8;
                            return (
                              <tr key={u.id} className={`hover:bg-gray-50 transition-colors ${isOnline ? 'bg-emerald-50/30' : ''}`}>
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2.5">
                                    <div className="relative flex-shrink-0">
                                      <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 font-bold text-sm flex items-center justify-center">
                                        {(u.full_name ?? u.email)[0]?.toUpperCase()}
                                      </div>
                                      {isOnline && <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-400 border-2 border-white rounded-full" />}
                                    </div>
                                    <div>
                                      <p className="font-medium text-gray-800 text-sm">{u.full_name ?? '—'}</p>
                                      {overBudget && <span className="text-xs text-red-500 font-medium">⚠ Over budget</span>}
                                      {nearBudget && <span className="text-xs text-amber-500 font-medium">⚡ Near limit</span>}
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-gray-500 text-xs">{u.email}</td>
                                <td className="px-4 py-3">
                                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>{u.role}</span>
                                </td>
                                <td className="px-4 py-3 text-xs">
                                  {u.monthly_budget ? (
                                    <div>
                                      <p className={`font-medium ${overBudget ? 'text-red-600' : nearBudget ? 'text-amber-600' : 'text-gray-700'}`}>₱{monthSpent.toFixed(2)} / ₱{u.monthly_budget.toFixed(2)}</p>
                                      <div className="w-20 bg-gray-100 rounded-full h-1.5 mt-1">
                                        <div className={`h-1.5 rounded-full ${overBudget ? 'bg-red-500' : nearBudget ? 'bg-amber-400' : 'bg-green-500'}`}
                                          style={{ width: `${Math.min(100, (monthSpent / u.monthly_budget) * 100)}%` }} />
                                      </div>
                                    </div>
                                  ) : <span className="text-gray-400">No budget set</span>}
                                </td>
                                <td className="px-4 py-3">
                                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${u.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                    {u.is_active ? 'Active' : 'Inactive'}
                                  </span>
                                </td>
                                <td className="px-4 py-3">
                                  <span className={`flex items-center gap-1 text-xs font-medium ${isOnline ? 'text-emerald-600' : 'text-gray-400'}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-400' : 'bg-gray-300'}`} />
                                    {isOnline ? 'Online' : 'Offline'}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">{format(parseISO(u.created_at), 'MMM d, yyyy')}</td>
                                <td className="px-4 py-3">
                                  <div className="flex gap-1.5 flex-wrap">
                                    <button onClick={() => setShowUserDetail(u)} className="flex items-center gap-1 text-xs text-blue-600 hover:bg-blue-50 px-2 py-1 rounded-lg transition-colors font-medium">
                                      <Eye className="w-3 h-3" />View
                                    </button>
                                    <button onClick={() => { setEditUser(u); setUserForm({ full_name: u.full_name ?? '', email: u.email, role: u.role, monthly_budget: u.monthly_budget?.toString() ?? '', is_active: u.is_active }); setShowUserModal(true); }}
                                      className="flex items-center gap-1 text-xs text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded-lg transition-colors font-medium">
                                      <Edit2 className="w-3 h-3" />Edit
                                    </button>
                                    <button onClick={() => handleToggleActive(u)} className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-colors font-medium ${u.is_active ? 'text-amber-600 hover:bg-amber-50' : 'text-emerald-600 hover:bg-emerald-50'}`}>
                                      {u.is_active ? <><UserX className="w-3 h-3" />Deactivate</> : <><UserCheck className="w-3 h-3" />Activate</>}
                                    </button>
                                    <button onClick={() => handleResetPassword(u.email)} className="flex items-center gap-1 text-xs text-gray-500 hover:bg-gray-100 px-2 py-1 rounded-lg transition-colors font-medium">
                                      <Key className="w-3 h-3" />Reset Pwd
                                    </button>
                                    <button onClick={() => { setNotifTarget(u); setShowNotifModal(true); }} className="flex items-center gap-1 text-xs text-purple-600 hover:bg-purple-50 px-2 py-1 rounded-lg transition-colors font-medium">
                                      <Bell className="w-3 h-3" />Notify
                                    </button>
                                    {u.id !== adminProfile?.id && (
                                      <button onClick={() => handleDeleteUser(u)} className="flex items-center gap-1 text-xs text-red-500 hover:bg-red-50 px-2 py-1 rounded-lg transition-colors font-medium">
                                        <Trash2 className="w-3 h-3" />Delete
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                          {filteredUsers.length === 0 && (
                            <tr><td colSpan={8} className="text-center py-10 text-gray-400 text-sm">No users found.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}

              {/* ── EXPENSES ──────────────────────────────────────────────── */}
              {view === 'expenses' && (
                <>
                  <div className="flex flex-wrap gap-3 items-center">
                    <select value={filterUser} onChange={e => setFilterUser(e.target.value)}
                      className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300">
                      <option value="">All Users</option>
                      {users.map(u => <option key={u.id} value={u.id}>{u.full_name ?? u.email}</option>)}
                    </select>
                    <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
                      className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300">
                      <option value="">All Categories</option>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                    </select>
                    <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)}
                      className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                    <input type="number" value={filterMin} onChange={e => setFilterMin(e.target.value)} placeholder="Min ₱"
                      className="w-24 border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                    <input type="number" value={filterMax} onChange={e => setFilterMax(e.target.value)} placeholder="Max ₱"
                      className="w-24 border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                    <button onClick={() => { setFilterDate(''); setFilterCat(''); setFilterMin(''); setFilterMax(''); setFilterUser(''); }}
                      className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-xl px-3 py-2.5 bg-white hover:bg-gray-50">
                      <X className="w-3 h-3" />Clear
                    </button>
                    <button onClick={() => exportCSV()} className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2.5 text-sm hover:bg-gray-50 bg-white font-medium">
                      <Download className="w-4 h-4" />CSV
                    </button>
                  </div>

                  <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
                    {/* Sort bar */}
                    <div className="flex items-center gap-4 px-4 py-3 border-b border-gray-100">
                      <span className="text-xs text-gray-400 font-medium">Sort by:</span>
                      {(['date','total','name'] as const).map(s => (
                        <button key={s} onClick={() => { if (expenseSortBy === s) setExpenseSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setExpenseSortBy(s); setExpenseSortDir('desc'); } }}
                          className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg transition-colors ${expenseSortBy === s ? 'bg-indigo-50 text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}>
                          {s.charAt(0).toUpperCase() + s.slice(1)}
                          {expenseSortBy === s && (expenseSortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                        </button>
                      ))}
                      <span className="ml-auto text-xs text-gray-400">{filteredExpenses.length} records</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead><tr className="bg-gray-50 border-b border-gray-100">
                          {['Date','User','Item','Category','Qty','Price','Total','Notes'].map(h => (
                            <th key={h} className="text-left px-4 py-3 text-gray-500 font-semibold text-xs whitespace-nowrap">{h}</th>
                          ))}
                        </tr></thead>
                        <tbody className="divide-y divide-gray-50">
                          {filteredExpenses.map(e => (
                            <tr key={e.id} className="hover:bg-gray-50 transition-colors">
                              <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">{e.date}</td>
                              <td className="px-4 py-3 text-gray-600 text-xs whitespace-nowrap">{e.profiles?.full_name ?? e.profiles?.email}</td>
                              <td className="px-4 py-3 font-medium text-gray-800">{e.item_name}</td>
                              <td className="px-4 py-3"><span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full text-xs whitespace-nowrap">{e.categories?.icon} {e.categories?.name}</span></td>
                              <td className="px-4 py-3 text-gray-600">{e.quantity}</td>
                              <td className="px-4 py-3 text-gray-600 whitespace-nowrap">₱{e.price.toFixed(2)}</td>
                              <td className="px-4 py-3 font-semibold text-indigo-600 whitespace-nowrap">₱{e.total.toFixed(2)}</td>
                              <td className="px-4 py-3 text-gray-400 text-xs max-w-xs truncate">{e.notes ?? '—'}</td>
                            </tr>
                          ))}
                          {filteredExpenses.length === 0 && <tr><td colSpan={8} className="text-center py-10 text-gray-400 text-sm">No expenses found.</td></tr>}
                        </tbody>
                        {filteredExpenses.length > 0 && (
                          <tfoot><tr className="bg-indigo-50 border-t border-indigo-100">
                            <td colSpan={6} className="px-4 py-3 font-semibold text-indigo-700 text-sm">Total ({filteredExpenses.length} items)</td>
                            <td className="px-4 py-3 font-bold text-indigo-700">₱{filteredExpenses.reduce((s, e) => s + e.total, 0).toFixed(2)}</td>
                            <td />
                          </tr></tfoot>
                        )}
                      </table>
                    </div>
                  </div>
                </>
              )}

              {/* ── CATEGORIES ────────────────────────────────────────────── */}
              {view === 'categories' && (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-500">{categories.length} categories · {expenses.length} total expenses</p>
                    <button onClick={() => { setEditCat(null); setCatForm({ name: '', icon: '', color: '#6366F1' }); setShowCatModal(true); }}
                      className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium shadow-sm transition-colors">
                      <Plus className="w-4 h-4" />Add Category
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    {categories.map(c => {
                      const expCount = expenses.filter(e => e.category_id === c.id).length;
                      const expTotal = expenses.filter(e => e.category_id === c.id).reduce((s, e) => s + e.total, 0);
                      return (
                        <div key={c.id} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex flex-col gap-3">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0" style={{ background: (c.color ?? '#6366F1') + '22' }}>
                              {c.icon ?? '📦'}
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-gray-800 text-sm truncate">{c.name}</p>
                              <p className="text-xs text-gray-400">{expCount} expense{expCount !== 1 ? 's' : ''}</p>
                              <p className="text-xs font-semibold text-indigo-600">₱{expTotal.toLocaleString('en',{minimumFractionDigits:2})}</p>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => { setEditCat(c); setCatForm({ name: c.name, icon: c.icon ?? '', color: c.color ?? '#6366F1' }); setShowCatModal(true); }}
                              className="flex-1 flex items-center justify-center gap-1 border border-gray-200 rounded-lg py-1.5 text-xs hover:bg-gray-50 transition-colors">
                              <Edit2 className="w-3 h-3" />Edit
                            </button>
                            <button onClick={() => handleDeleteCat(c.id)}
                              className="flex-1 flex items-center justify-center gap-1 border border-red-100 text-red-500 rounded-lg py-1.5 text-xs hover:bg-red-50 transition-colors">
                              <Trash2 className="w-3 h-3" />Delete
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    {categories.length === 0 && <div className="col-span-4 text-center py-16 text-gray-400 text-sm">No categories yet. Add one above.</div>}
                  </div>
                </>
              )}

              {/* ── BUDGET OVERSIGHT ──────────────────────────────────────── */}
              {view === 'budget' && (
                <div className="space-y-5">
                  {/* Summary row */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {[
                      { label: 'With Budget Set', value: users.filter(u => u.monthly_budget).length, color: 'bg-blue-50 text-blue-700' },
                      { label: 'Over Budget', value: overBudgetList.length, color: 'bg-red-50 text-red-700' },
                      { label: 'Near Limit (80%+)', value: nearBudgetList.length, color: 'bg-amber-50 text-amber-700' },
                      { label: 'Within Budget', value: users.filter(u => u.monthly_budget && getUserMonthSpend(u.id) < u.monthly_budget * 0.8).length, color: 'bg-green-50 text-green-700' },
                    ].map(c => (
                      <div key={c.label} className={`${c.color} rounded-2xl p-4 text-center`}>
                        <p className="text-3xl font-bold">{c.value}</p>
                        <p className="text-xs mt-1 font-medium">{c.label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Send warnings */}
                  {(overBudgetList.length > 0 || nearBudgetList.length > 0) && (
                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-amber-800 text-sm">
                          {overBudgetList.length} over budget · {nearBudgetList.length} near limit
                        </p>
                        <p className="text-xs text-amber-600">Send budget warning notifications to affected users</p>
                      </div>
                      <button onClick={handleSendBudgetWarnings} className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors">
                        <Bell className="w-4 h-4" />Send Warnings
                      </button>
                    </div>
                  )}

                  {/* Filter */}
                  <div className="flex gap-3">
                    <select value={selectedBudgetUser} onChange={e => setSelectedBudgetUser(e.target.value)}
                      className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300">
                      <option value="all">All Users</option>
                      <option value="over">Over Budget Only</option>
                      <option value="near">Near Limit Only</option>
                      <option value="nobudget">No Budget Set</option>
                    </select>
                  </div>

                  {/* Users budget list */}
                  <div className="space-y-3">
                    {usersWithBudgetData
                      .filter(u => {
                        if (selectedBudgetUser === 'over') return u.over;
                        if (selectedBudgetUser === 'near') return u.near;
                        if (selectedBudgetUser === 'nobudget') return !u.monthly_budget;
                        return true;
                      })
                      .map(u => (
                        <div key={u.id} className={`bg-white rounded-2xl p-5 shadow-sm border ${u.over ? 'border-red-200' : u.near ? 'border-amber-200' : 'border-gray-100'}`}>
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0 ${u.over ? 'bg-red-500' : u.near ? 'bg-amber-500' : 'bg-indigo-500'}`}>
                                {(u.full_name ?? u.email)[0].toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className="font-semibold text-gray-800">{u.full_name ?? u.email}</p>
                                <p className="text-xs text-gray-400">{u.email}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {u.over && <span className="bg-red-100 text-red-700 text-xs px-2 py-1 rounded-full font-bold">🚨 Over Budget</span>}
                              {u.near && <span className="bg-amber-100 text-amber-700 text-xs px-2 py-1 rounded-full font-bold">⚡ Near Limit</span>}
                              {!u.monthly_budget && <span className="bg-gray-100 text-gray-500 text-xs px-2 py-1 rounded-full">No budget set</span>}
                              <button onClick={() => { setNotifTarget(u); setNotifType(u.over ? 'danger' : 'warning'); setNotifMessage(u.over ? `🚨 You've exceeded your ₱${u.monthly_budget?.toFixed(2)} monthly budget! Current: ₱${u.spent.toFixed(2)}` : `⚠️ You've used ${u.pct.toFixed(0)}% of your ₱${u.monthly_budget?.toFixed(2)} budget.`); setShowNotifModal(true); }}
                                className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-purple-600 transition-colors">
                                <Bell className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                          {u.monthly_budget ? (
                            <div className="mt-4">
                              <div className="flex justify-between text-sm mb-1.5">
                                <span className="text-gray-500">₱{u.spent.toLocaleString('en',{minimumFractionDigits:2})} spent</span>
                                <span className={`font-semibold ${u.over ? 'text-red-600' : u.near ? 'text-amber-600' : 'text-green-600'}`}>
                                  {u.over ? `₱${(u.spent - u.budget).toFixed(2)} over` : `₱${(u.budget - u.spent).toFixed(2)} left`}
                                </span>
                              </div>
                              <div className="w-full bg-gray-100 rounded-full h-3">
                                <div className={`h-3 rounded-full transition-all ${u.over ? 'bg-red-500' : u.near ? 'bg-amber-400' : 'bg-green-500'}`}
                                  style={{ width: `${Math.min(u.pct, 100)}%` }} />
                              </div>
                              <div className="flex justify-between text-xs text-gray-400 mt-1">
                                <span>0</span>
                                <span>{u.pct.toFixed(0)}% used</span>
                                <span>₱{u.budget.toLocaleString('en',{minimumFractionDigits:2})}</span>
                              </div>
                            </div>
                          ) : (
                            <p className="text-sm text-gray-400 mt-3 italic">This user has not set a monthly budget yet.</p>
                          )}
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* ── NOTIFICATIONS ─────────────────────────────────────────── */}
              {view === 'notifications' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-500">{notifications.length} notifications · {unreadNotif} unread</p>
                    <div className="flex gap-3">
                      <button onClick={handleSendBudgetWarnings} className="flex items-center gap-2 border border-amber-300 text-amber-700 hover:bg-amber-50 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors">
                        <AlertTriangle className="w-4 h-4" />Send Budget Warnings
                      </button>
                      <button onClick={() => { setNotifTarget(null); setNotifMessage(''); setNotifType('info'); setShowNotifModal(true); }}
                        className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors shadow-sm">
                        <Plus className="w-4 h-4" />New Notification
                      </button>
                    </div>
                  </div>

                  {notifications.length === 0 ? (
                    <div className="bg-white rounded-2xl p-12 shadow-sm border border-gray-100 text-center">
                      <Bell className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                      <p className="text-gray-500 font-medium">No notifications yet</p>
                      <p className="text-sm text-gray-400 mt-1">Send budget warnings or custom messages to users</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {notifications.map(n => {
                        const targetUser = users.find(u => u.id === n.user_id);
                        return (
                          <div key={n.id} className={`bg-white rounded-xl p-4 shadow-sm border ${n.type === 'danger' ? 'border-red-200' : n.type === 'warning' ? 'border-amber-200' : 'border-blue-200'} flex items-start gap-3`}>
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${n.type === 'danger' ? 'bg-red-100 text-red-600' : n.type === 'warning' ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'}`}>
                              {n.type === 'danger' ? <AlertTriangle className="w-4 h-4" /> : n.type === 'warning' ? <AlertTriangle className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-semibold text-gray-800 text-sm">{targetUser?.full_name ?? targetUser?.email ?? 'Unknown'}</span>
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${n.type === 'danger' ? 'bg-red-100 text-red-700' : n.type === 'warning' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>{n.type}</span>
                                {!n.is_read && <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">unread</span>}
                              </div>
                              <p className="text-sm text-gray-600">{n.message}</p>
                              <p className="text-xs text-gray-400 mt-1">{format(parseISO(n.created_at), 'MMM d, yyyy h:mm a')}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ── REPORTS ───────────────────────────────────────────────── */}
              {view === 'reports' && (
                <div className="space-y-5">
                  {/* Period selector */}
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="text-sm font-medium text-gray-700">Report Period:</label>
                    <input type="month" value={reportMonth} onChange={e => setReportMonth(e.target.value)}
                      className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                    <div className="flex gap-2 ml-auto">
                      <button onClick={() => exportCSV(reportExpenses)} className="flex items-center gap-2 border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-white hover:bg-gray-50 font-medium">
                        <Download className="w-4 h-4" />Export CSV
                      </button>
                      <button onClick={exportReportPDF} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium shadow-sm">
                        <Printer className="w-4 h-4" />Export PDF
                      </button>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {[
                      { label: 'Total Expenses', value: `₱${reportTotal.toLocaleString('en',{minimumFractionDigits:2})}`, icon: DollarSign, color: 'text-indigo-600 bg-indigo-50' },
                      { label: 'Transactions', value: reportExpenses.length, icon: FileText, color: 'text-blue-600 bg-blue-50' },
                      { label: 'Active Users', value: reportUserData.length, icon: Users, color: 'text-emerald-600 bg-emerald-50' },
                      { label: 'Top Category', value: reportCatData[0]?.name ?? '—', icon: PieChartIcon, color: 'text-purple-600 bg-purple-50' },
                    ].map(c => (
                      <div key={c.label} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl ${c.color} flex items-center justify-center flex-shrink-0`}><c.icon className="w-5 h-5" /></div>
                        <div className="min-w-0">
                          <p className="text-xs text-gray-400">{c.label}</p>
                          <p className="text-lg font-bold text-gray-800 truncate">{c.value}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Charts */}
                  <div className="grid lg:grid-cols-2 gap-4">
                    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                      <h3 className="font-semibold text-gray-700 mb-4 text-sm">6-Month Trend</h3>
                      <ResponsiveContainer width="100%" height={240}>
                        <BarChart data={monthlyBar}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" />
                          <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                          <YAxis tick={{ fontSize: 12 }} />
                          <Tooltip formatter={(v: unknown) => `₱${(v as number).toFixed(2)}`} />
                          <Bar dataKey="total" fill="#6366F1" radius={[4,4,0,0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                      <h3 className="font-semibold text-gray-700 mb-4 text-sm">Category Breakdown</h3>
                      {reportCatData.length === 0 ? <p className="text-gray-400 text-sm text-center py-16">No data for this period.</p> : (
                        <ResponsiveContainer width="100%" height={240}>
                          <PieChart>
                            <Pie data={reportCatData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90}>
                              {reportCatData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                            </Pie>
                            <Tooltip formatter={(v: unknown) => `₱${(v as number).toFixed(2)}`} />
                            <Legend wrapperStyle={{ fontSize: 11 }} />
                          </PieChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>

                  {/* Category table */}
                  <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                    <h3 className="font-semibold text-gray-700 mb-4 text-sm">Category Performance</h3>
                    {reportCatData.length === 0 ? <p className="text-gray-400 text-sm">No data.</p> : (
                      <div className="space-y-3">
                        {reportCatData.map((d, i) => (
                          <div key={d.name} className="flex items-center gap-3">
                            <span className="text-lg">{d.icon ?? '📦'}</span>
                            <div className="flex-1">
                              <div className="flex justify-between text-sm mb-1">
                                <span className="font-medium text-gray-700">{d.name}</span>
                                <span className="font-bold text-gray-800">₱{d.value.toLocaleString('en',{minimumFractionDigits:2})}</span>
                              </div>
                              <div className="w-full bg-gray-100 rounded-full h-2">
                                <div className="h-2 rounded-full" style={{ width: `${reportTotal ? (d.value / reportTotal * 100) : 0}%`, background: COLORS[i % COLORS.length] }} />
                              </div>
                            </div>
                            <span className="text-xs text-gray-400 w-12 text-right">{reportTotal ? (d.value / reportTotal * 100).toFixed(1) : 0}%</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Top spenders */}
                  <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                    <h3 className="font-semibold text-gray-700 mb-4 text-sm">Top Spenders — {format(reportStart, 'MMMM yyyy')}</h3>
                    {reportUserData.length === 0 ? <p className="text-gray-400 text-sm">No spending data for this period.</p> : (
                      <div className="space-y-3">
                        {reportUserData.slice(0, 10).map((u, i) => (
                          <div key={u.email} className="flex items-center gap-3">
                            <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-gray-800 text-sm truncate">{u.name}</p>
                              <p className="text-xs text-gray-400 truncate">{u.email} · {u.count} transactions</p>
                            </div>
                            <span className="font-bold text-indigo-600 text-sm">₱{u.total.toLocaleString('en',{minimumFractionDigits:2})}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── SETTINGS ──────────────────────────────────────────────── */}
              {view === 'settings' && (
                <div className="max-w-2xl space-y-4">
                  <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                    <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2"><Shield className="w-4 h-4 text-indigo-600" /> System Information</h3>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { label: 'Total Users', value: users.length }, { label: 'Active Users', value: activeUsers },
                        { label: 'Currently Online', value: onlineCount }, { label: 'Total Expenses', value: expenses.length },
                        { label: 'Categories', value: categories.length }, { label: 'Over Budget', value: overBudgetList.length },
                        { label: 'Near Budget Limit', value: nearBudgetList.length }, { label: 'App Version', value: 'SpendWise v1.0' },
                      ].map(r => (
                        <div key={r.label} className="flex justify-between items-center py-2 px-3 bg-gray-50 rounded-xl">
                          <span className="text-sm text-gray-500">{r.label}</span>
                          <span className="text-sm font-bold text-gray-800">{r.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                    <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2"><Activity className="w-4 h-4 text-emerald-600" /> Quick Actions</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <button onClick={() => fetchData(true)} className="flex items-center gap-2 border border-gray-200 rounded-xl p-3 hover:bg-gray-50 text-sm font-medium text-gray-700 transition-colors">
                        <RefreshCw className="w-4 h-4 text-indigo-500" />Refresh All Data
                      </button>
                      <button onClick={() => exportCSV()} className="flex items-center gap-2 border border-gray-200 rounded-xl p-3 hover:bg-gray-50 text-sm font-medium text-gray-700 transition-colors">
                        <Download className="w-4 h-4 text-green-500" />Export All Expenses
                      </button>
                      <button onClick={handleSendBudgetWarnings} className="flex items-center gap-2 border border-amber-200 rounded-xl p-3 hover:bg-amber-50 text-sm font-medium text-amber-700 transition-colors">
                        <Bell className="w-4 h-4" />Send Budget Warnings
                      </button>
                      <button onClick={() => window.open('https://supabase.com/dashboard', '_blank')} className="flex items-center gap-2 border border-gray-200 rounded-xl p-3 hover:bg-gray-50 text-sm font-medium text-gray-700 transition-colors">
                        <Database className="w-4 h-4 text-green-600" />Open Supabase Dashboard
                      </button>
                    </div>
                  </div>

                  <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-5">
                    <p className="text-indigo-800 font-bold text-sm mb-2">🛠️ Developer Tools (Hidden by Default)</p>
                    <p className="text-indigo-700 text-xs mb-4 leading-relaxed">Setup Guide and Database SQL tabs are hidden from the sidebar. Reveal with:</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-white rounded-xl p-3 border border-indigo-100">
                        <p className="text-indigo-800 font-semibold text-xs mb-2">⌨️ Arrow Keys</p>
                        <div className="flex items-center gap-1 flex-wrap">
                          {SECRET_NAME.split(' ').map((k, i) => <kbd key={i} className="bg-gray-900 text-green-400 px-2 py-1 rounded-lg text-sm font-mono shadow">{k}</kbd>)}
                        </div>
                      </div>
                      <div className="bg-white rounded-xl p-3 border border-indigo-100">
                        <p className="text-indigo-800 font-semibold text-xs mb-1">🔒 Sidebar Button</p>
                        <p className="text-indigo-600 text-xs">Triple-tap the <strong>· · ·</strong> at the bottom of the sidebar</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-700">
                    <strong className="block mb-1 text-amber-800">📦 Database Backup</strong>
                    Supabase Dashboard → <strong>Database → Backups</strong> to download or schedule backups.
                  </div>
                  <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-sm text-blue-700">
                    <strong className="block mb-1 text-blue-800">🔄 Database Restore</strong>
                    Supabase Dashboard → <strong>Database → Backups → Restore</strong> to restore from a backup.
                  </div>
                </div>
              )}

              {view === 'guide' && <AdminSetupGuide />}
              {view === 'sql' && <FullDatabaseSQL />}
            </>
          )}
        </main>
      </div>

      {/* ── Category Modal ── */}
      {showCatModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h2 className="font-bold text-gray-800 text-lg mb-5">{editCat ? 'Edit Category' : 'New Category'}</h2>
            <div className="space-y-4">
              <div><label className="text-sm text-gray-600 mb-1 block font-medium">Name *</label>
                <input value={catForm.name} onChange={e => setCatForm(f => ({ ...f, name: e.target.value }))} autoFocus
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" placeholder="e.g. Food" /></div>
              <div><label className="text-sm text-gray-600 mb-1 block font-medium">Icon (emoji)</label>
                <input value={catForm.icon} onChange={e => setCatForm(f => ({ ...f, icon: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" placeholder="🍔" /></div>
              <div><label className="text-sm text-gray-600 mb-1 block font-medium">Color</label>
                <input type="color" value={catForm.color} onChange={e => setCatForm(f => ({ ...f, color: e.target.value }))}
                  className="h-10 w-full rounded-xl border border-gray-200 p-1 cursor-pointer" /></div>
              {catForm.name && catForm.icon && (
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-2xl" style={{ background: catForm.color + '22' }}>{catForm.icon}</div>
                  <span className="font-medium text-gray-800">{catForm.name}</span>
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => { setShowCatModal(false); setEditCat(null); }} className="flex-1 border border-gray-200 py-2.5 rounded-xl text-sm hover:bg-gray-50">Cancel</button>
              <button onClick={handleSaveCat} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-xl text-sm font-medium">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit User Modal ── */}
      {showUserModal && editUser && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h2 className="font-bold text-gray-800 text-lg mb-1">Edit User</h2>
            <p className="text-gray-400 text-xs mb-5">{editUser.email}</p>
            <div className="space-y-4">
              <div><label className="text-sm text-gray-600 mb-1 block font-medium">Full Name</label>
                <input value={userForm.full_name} onChange={e => setUserForm(f => ({ ...f, full_name: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" /></div>
              <div><label className="text-sm text-gray-600 mb-1 block font-medium">Role</label>
                <select value={userForm.role} onChange={e => setUserForm(f => ({ ...f, role: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
                  <option value="user">User</option><option value="admin">Admin</option>
                </select></div>
              <div><label className="text-sm text-gray-600 mb-1 block font-medium">Monthly Budget (₱)</label>
                <input type="number" value={userForm.monthly_budget} onChange={e => setUserForm(f => ({ ...f, monthly_budget: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" placeholder="0.00" /></div>
              <div className="flex items-center gap-3">
                <input type="checkbox" id="is_active_chk" checked={userForm.is_active} onChange={e => setUserForm(f => ({ ...f, is_active: e.target.checked }))} className="w-4 h-4 accent-indigo-600" />
                <label htmlFor="is_active_chk" className="text-sm text-gray-600 font-medium">Account Active</label>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => { setShowUserModal(false); setEditUser(null); }} className="flex-1 border border-gray-200 py-2.5 rounded-xl text-sm hover:bg-gray-50">Cancel</button>
              <button onClick={handleSaveUser} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-xl text-sm font-medium">Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add User Modal ── */}
      {showAddUserModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h2 className="font-bold text-gray-800 text-lg mb-1 flex items-center gap-2"><UserPlus className="w-5 h-5 text-indigo-600" />Add New User</h2>
            <p className="text-gray-400 text-xs mb-5">Create a user account directly from the admin panel.</p>
            <div className="space-y-4">
              <div><label className="text-sm text-gray-600 mb-1 block font-medium">Full Name</label>
                <input value={addUserForm.full_name} onChange={e => setAddUserForm(f => ({ ...f, full_name: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" placeholder="John Doe" /></div>
              <div><label className="text-sm text-gray-600 mb-1 block font-medium">Email *</label>
                <input type="email" value={addUserForm.email} onChange={e => setAddUserForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" placeholder="user@email.com" /></div>
              <div><label className="text-sm text-gray-600 mb-1 block font-medium">Password *</label>
                <input type="password" value={addUserForm.password} onChange={e => setAddUserForm(f => ({ ...f, password: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" placeholder="Min. 6 characters" /></div>
              <div><label className="text-sm text-gray-600 mb-1 block font-medium">Role</label>
                <select value={addUserForm.role} onChange={e => setAddUserForm(f => ({ ...f, role: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
                  <option value="user">User</option><option value="admin">Admin</option>
                </select></div>
              <div><label className="text-sm text-gray-600 mb-1 block font-medium">Monthly Budget (₱)</label>
                <input type="number" value={addUserForm.monthly_budget} onChange={e => setAddUserForm(f => ({ ...f, monthly_budget: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" placeholder="Optional" /></div>
            </div>
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl">
              <p className="text-xs text-amber-700"><strong>Note:</strong> If creation fails, use <strong>Supabase Dashboard → Authentication → Users → Invite User</strong> instead.</p>
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={() => { setShowAddUserModal(false); setAddUserForm({ full_name: '', email: '', password: '', role: 'user', monthly_budget: '' }); }} className="flex-1 border border-gray-200 py-2.5 rounded-xl text-sm hover:bg-gray-50">Cancel</button>
              <button onClick={handleAddUser} disabled={addUserLoading} className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2">
                {addUserLoading ? <><RefreshCw className="w-4 h-4 animate-spin" />Creating…</> : <><CheckCircle className="w-4 h-4" />Create User</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── User Detail Modal ── */}
      {showUserDetail && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="font-bold text-gray-800 flex items-center gap-2"><Eye className="w-5 h-5 text-blue-600" />User Details</h2>
              <button onClick={() => setShowUserDetail(null)} className="p-2 rounded-lg hover:bg-gray-100"><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Profile */}
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-indigo-100 text-indigo-700 font-bold text-2xl flex items-center justify-center flex-shrink-0">
                  {(showUserDetail.full_name ?? showUserDetail.email)[0].toUpperCase()}
                </div>
                <div>
                  <p className="text-xl font-bold text-gray-800">{showUserDetail.full_name ?? 'No name'}</p>
                  <p className="text-gray-500 text-sm">{showUserDetail.email}</p>
                  <div className="flex gap-2 mt-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${showUserDetail.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>{showUserDetail.role}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${showUserDetail.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{showUserDetail.is_active ? 'Active' : 'Inactive'}</span>
                    {onlineUsers.includes(showUserDetail.id) && <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-100 text-emerald-700">🟢 Online</span>}
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-3">
                {(() => {
                  const userExp = expenses.filter(e => e.user_id === showUserDetail.id);
                  const monthSpent = getUserMonthSpend(showUserDetail.id);
                  return [
                    { label: 'Total Expenses', value: `₱${userExp.reduce((s,e) => s+e.total,0).toLocaleString('en',{minimumFractionDigits:2})}` },
                    { label: 'Transactions', value: userExp.length },
                    { label: 'This Month', value: `₱${monthSpent.toLocaleString('en',{minimumFractionDigits:2})}` },
                    { label: 'Monthly Budget', value: showUserDetail.monthly_budget ? `₱${showUserDetail.monthly_budget.toFixed(2)}` : 'Not set' },
                  ].map(c => (
                    <div key={c.label} className="bg-gray-50 rounded-xl p-3">
                      <p className="text-xs text-gray-400">{c.label}</p>
                      <p className="font-bold text-gray-800 text-sm">{c.value}</p>
                    </div>
                  ));
                })()}
              </div>

              {/* Recent expenses */}
              <div>
                <p className="font-semibold text-gray-700 text-sm mb-3">Recent Expenses</p>
                <div className="space-y-2">
                  {expenses.filter(e => e.user_id === showUserDetail.id).slice(0, 5).map(e => (
                    <div key={e.id} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
                      <div>
                        <p className="text-sm font-medium text-gray-800">{e.item_name}</p>
                        <p className="text-xs text-gray-400">{e.categories?.name} · {e.date}</p>
                      </div>
                      <span className="font-semibold text-indigo-600 text-sm">₱{e.total.toFixed(2)}</span>
                    </div>
                  ))}
                  {expenses.filter(e => e.user_id === showUserDetail.id).length === 0 && (
                    <p className="text-gray-400 text-sm text-center py-4">No expenses yet</p>
                  )}
                </div>
              </div>

              {/* Joined */}
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <Clock className="w-3.5 h-3.5" />Joined {format(parseISO(showUserDetail.created_at), 'MMMM d, yyyy')}
              </div>
            </div>
            <div className="p-4 border-t border-gray-100 flex gap-2">
              <button onClick={() => { setShowUserDetail(null); setEditUser(showUserDetail); setUserForm({ full_name: showUserDetail.full_name ?? '', email: showUserDetail.email, role: showUserDetail.role, monthly_budget: showUserDetail.monthly_budget?.toString() ?? '', is_active: showUserDetail.is_active }); setShowUserModal(true); }}
                className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-xl text-sm font-medium">
                <Edit2 className="w-4 h-4" />Edit User
              </button>
              <button onClick={() => { setShowUserDetail(null); setNotifTarget(showUserDetail); setShowNotifModal(true); }}
                className="flex-1 flex items-center justify-center gap-2 border border-purple-200 text-purple-700 hover:bg-purple-50 py-2.5 rounded-xl text-sm font-medium">
                <Bell className="w-4 h-4" />Send Notification
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Notification Modal ── */}
      {showNotifModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h2 className="font-bold text-gray-800 text-lg mb-1 flex items-center gap-2"><Bell className="w-5 h-5 text-purple-600" />Send Notification</h2>
            <p className="text-gray-400 text-xs mb-5">The user will see this in their notifications.</p>
            <div className="space-y-4">
              <div><label className="text-sm text-gray-600 mb-1 block font-medium">To *</label>
                <select value={notifTarget?.id ?? ''} onChange={e => setNotifTarget(users.find(u => u.id === e.target.value) ?? null)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
                  <option value="">Select user…</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.full_name ?? u.email}</option>)}
                </select></div>
              <div><label className="text-sm text-gray-600 mb-1 block font-medium">Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['info','warning','danger'] as const).map(t => (
                    <button key={t} onClick={() => setNotifType(t)} className={`py-2 rounded-xl text-xs font-medium border-2 transition-all ${notifType === t ? (t === 'danger' ? 'border-red-500 bg-red-50 text-red-700' : t === 'warning' ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-blue-500 bg-blue-50 text-blue-700') : 'border-gray-200 text-gray-500'}`}>
                      {t === 'danger' ? '🚨 Danger' : t === 'warning' ? '⚠️ Warning' : 'ℹ️ Info'}
                    </button>
                  ))}
                </div></div>
              <div><label className="text-sm text-gray-600 mb-1 block font-medium">Message *</label>
                <textarea value={notifMessage} onChange={e => setNotifMessage(e.target.value)} rows={3}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
                  placeholder="Enter your message…" /></div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => { setShowNotifModal(false); setNotifTarget(null); setNotifMessage(''); }} className="flex-1 border border-gray-200 py-2.5 rounded-xl text-sm hover:bg-gray-50">Cancel</button>
              <button onClick={handleSendNotification} className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2">
                <Bell className="w-4 h-4" />Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
