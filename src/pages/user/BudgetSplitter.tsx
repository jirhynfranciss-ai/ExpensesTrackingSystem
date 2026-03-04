import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import {
  Users, Plus, Trash2, Edit2, Check, X, Calculator,
  ChevronDown, ChevronUp, Copy, Share2, RefreshCw,
  UserPlus, AlertCircle, CheckCircle2
} from 'lucide-react';
import toast from 'react-hot-toast';

interface SplitMember {
  id: string;
  name: string;
  share_percent: number;
  share_amount: number;
  has_paid: boolean;
  color: string;
}

interface SplitGroup {
  id: string;
  name: string;
  total_budget: number;
  description: string | null;
  members: SplitMember[];
  created_at: string;
}

const MEMBER_COLORS = [
  '#6366F1', '#F59E0B', '#10B981', '#3B82F6',
  '#8B5CF6', '#EC4899', '#14B8A6', '#F97316',
  '#EF4444', '#84CC16'
];

const DEFAULT_GROUP: Omit<SplitGroup, 'id' | 'created_at'> = {
  name: '',
  total_budget: 0,
  description: '',
  members: [],
};

export default function BudgetSplitter() {
  const { profile } = useAuth();
  const [groups, setGroups] = useState<SplitGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editGroup, setEditGroup] = useState<SplitGroup | null>(null);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [form, setForm] = useState(DEFAULT_GROUP);
  const [newMemberName, setNewMemberName] = useState('');
  const [splitMode, setSplitMode] = useState<'equal' | 'custom'>('equal');
  const [saving, setSaving] = useState(false);

  // ── Fetch split groups from Supabase ──────────────────────────────────────
  const fetchGroups = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('split_groups')
        .select('*')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setGroups((data as SplitGroup[]) ?? []);
    } catch {
      // Table may not exist yet — show empty state gracefully
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => { fetchGroups(); }, [fetchGroups]);

  // ── Split logic ───────────────────────────────────────────────────────────
  const recalcEqual = (members: SplitMember[], total: number): SplitMember[] => {
    if (members.length === 0) return members;
    const pct = parseFloat((100 / members.length).toFixed(4));
    const amt = total / members.length;
    return members.map((m, i) => ({
      ...m,
      share_percent: i === members.length - 1
        ? parseFloat((100 - pct * (members.length - 1)).toFixed(4))
        : pct,
      share_amount: parseFloat(amt.toFixed(2)),
    }));
  };

  const recalcCustom = (members: SplitMember[], total: number): SplitMember[] => {
    return members.map(m => ({
      ...m,
      share_amount: parseFloat(((m.share_percent / 100) * total).toFixed(2)),
    }));
  };

  const recalc = (members: SplitMember[], total: number, mode: 'equal' | 'custom') =>
    mode === 'equal' ? recalcEqual(members, total) : recalcCustom(members, total);

  // ── Add member ────────────────────────────────────────────────────────────
  const addMember = () => {
    const name = newMemberName.trim();
    if (!name) { toast.error('Enter a name.'); return; }
    if (form.members.some(m => m.name.toLowerCase() === name.toLowerCase())) {
      toast.error('Member already exists.'); return;
    }
    const newMember: SplitMember = {
      id: crypto.randomUUID(),
      name,
      share_percent: 0,
      share_amount: 0,
      has_paid: false,
      color: MEMBER_COLORS[form.members.length % MEMBER_COLORS.length],
    };
    const updated = recalc([...form.members, newMember], form.total_budget, splitMode);
    setForm(f => ({ ...f, members: updated }));
    setNewMemberName('');
  };

  // ── Remove member ─────────────────────────────────────────────────────────
  const removeMember = (id: string) => {
    const updated = recalc(
      form.members.filter(m => m.id !== id),
      form.total_budget,
      splitMode
    );
    setForm(f => ({ ...f, members: updated }));
  };

  // ── Update custom share percent ───────────────────────────────────────────
  const updatePercent = (id: string, pct: number) => {
    const updated = form.members.map(m =>
      m.id === id ? { ...m, share_percent: pct, share_amount: parseFloat(((pct / 100) * form.total_budget).toFixed(2)) } : m
    );
    setForm(f => ({ ...f, members: updated }));
  };

  // ── Toggle paid ───────────────────────────────────────────────────────────
  const togglePaid = (memberId: string, groupId: string) => {
    setGroups(prev => prev.map(g => {
      if (g.id !== groupId) return g;
      return {
        ...g,
        members: g.members.map(m =>
          m.id === memberId ? { ...m, has_paid: !m.has_paid } : m
        ),
      };
    }));
    // Persist
    const group = groups.find(g => g.id === groupId);
    if (!group) return;
    const updatedMembers = group.members.map(m =>
      m.id === memberId ? { ...m, has_paid: !m.has_paid } : m
    );
    supabase.from('split_groups').update({ members: updatedMembers }).eq('id', groupId).then(({ error }) => {
      if (error) toast.error('Could not save payment status.');
    });
  };

  // ── Total percent check ───────────────────────────────────────────────────
  const totalPercent = form.members.reduce((s, m) => s + m.share_percent, 0);
  const percentOk = splitMode === 'equal' || Math.abs(totalPercent - 100) < 0.1;

  // ── Save group ────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!profile) return;
    if (!form.name.trim()) { toast.error('Group name is required.'); return; }
    if (form.total_budget <= 0) { toast.error('Total budget must be greater than 0.'); return; }
    if (form.members.length < 2) { toast.error('Add at least 2 members to split the budget.'); return; }
    if (!percentOk) { toast.error(`Percentages must total 100%. Currently: ${totalPercent.toFixed(1)}%`); return; }

    setSaving(true);
    try {
      const payload = {
        user_id: profile.id,
        name: form.name.trim(),
        total_budget: form.total_budget,
        description: form.description?.trim() || null,
        members: form.members,
      };

      let error;
      if (editGroup) {
        ({ error } = await supabase.from('split_groups').update(payload).eq('id', editGroup.id));
      } else {
        ({ error } = await supabase.from('split_groups').insert(payload));
      }

      if (error) throw error;
      toast.success(editGroup ? 'Group updated!' : 'Budget split created!');
      setShowModal(false);
      setEditGroup(null);
      setForm(DEFAULT_GROUP);
      setSplitMode('equal');
      fetchGroups();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save';
      if (msg.includes('does not exist') || msg.includes('42P01')) {
        toast.error('Run the Database SQL Step 3 first to create the split_groups table.');
      } else {
        toast.error(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  // ── Delete group ──────────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    if (!confirm('Delete this budget split group?')) return;
    const { error } = await supabase.from('split_groups').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Group deleted!');
    fetchGroups();
  };

  // ── Open edit ─────────────────────────────────────────────────────────────
  const openEdit = (group: SplitGroup) => {
    setEditGroup(group);
    setForm({
      name: group.name,
      total_budget: group.total_budget,
      description: group.description ?? '',
      members: group.members,
    });
    // Detect mode
    const isEqual = group.members.every(
      (m, _, arr) => Math.abs(m.share_percent - arr[0].share_percent) < 0.1
    );
    setSplitMode(isEqual ? 'equal' : 'custom');
    setShowModal(true);
  };

  // ── Copy summary ──────────────────────────────────────────────────────────
  const copySummary = (group: SplitGroup) => {
    const lines = [
      `📊 Budget Split: ${group.name}`,
      `💰 Total: ₱${group.total_budget.toLocaleString('en', { minimumFractionDigits: 2 })}`,
      `👥 ${group.members.length} members`,
      '',
      ...group.members.map(m =>
        `• ${m.name}: ₱${m.share_amount.toFixed(2)} (${m.share_percent.toFixed(1)}%) ${m.has_paid ? '✅ Paid' : '⏳ Pending'}`
      ),
    ];
    navigator.clipboard.writeText(lines.join('\n'));
    toast.success('Summary copied to clipboard!');
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  const openNew = () => {
    setEditGroup(null);
    setForm(DEFAULT_GROUP);
    setSplitMode('equal');
    setNewMemberName('');
    setShowModal(true);
  };

  const totalPaid = (group: SplitGroup) =>
    group.members.filter(m => m.has_paid).reduce((s, m) => s + m.share_amount, 0);

  const totalPending = (group: SplitGroup) =>
    group.members.filter(m => !m.has_paid).reduce((s, m) => s + m.share_amount, 0);

  // ── Modal total budget change ─────────────────────────────────────────────
  const handleBudgetChange = (val: string) => {
    const total = parseFloat(val) || 0;
    const updated = recalc(form.members, total, splitMode);
    setForm(f => ({ ...f, total_budget: total, members: updated }));
  };

  const handleModeChange = (mode: 'equal' | 'custom') => {
    setSplitMode(mode);
    const updated = recalc(form.members, form.total_budget, mode);
    setForm(f => ({ ...f, members: updated }));
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-600" />
            Budget Splitter
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Divide a budget among multiple people — set who pays what
          </p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          New Split
        </button>
      </div>

      {/* Groups list */}
      {loading ? (
        <div className="text-center py-16">
          <RefreshCw className="w-8 h-8 text-indigo-400 mx-auto animate-spin mb-3" />
          <p className="text-gray-400 text-sm">Loading groups...</p>
        </div>
      ) : groups.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 shadow-sm text-center">
          <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Users className="w-8 h-8 text-indigo-400" />
          </div>
          <p className="font-semibold text-gray-700 mb-1">No budget splits yet</p>
          <p className="text-gray-400 text-sm mb-5">
            Create a split to divide expenses among friends, family, or groupmates.
          </p>
          <button
            onClick={openNew}
            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Create First Split
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map(group => {
            const paid = totalPaid(group);
            const pending = totalPending(group);
            const paidPct = group.total_budget > 0 ? (paid / group.total_budget) * 100 : 0;
            const isExpanded = expandedGroup === group.id;

            return (
              <div key={group.id} className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
                {/* Group header */}
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-gray-800 text-lg truncate">{group.name}</h3>
                      {group.description && (
                        <p className="text-sm text-gray-500 mt-0.5 truncate">{group.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => copySummary(group)}
                        title="Copy summary"
                        className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => openEdit(group)}
                        title="Edit"
                        className="p-2 rounded-lg hover:bg-indigo-50 text-gray-400 hover:text-indigo-600 transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(group.id)}
                        title="Delete"
                        className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Stats row */}
                  <div className="grid grid-cols-3 gap-3 mt-4">
                    <div className="bg-indigo-50 rounded-xl p-3 text-center">
                      <p className="text-xs text-indigo-500 mb-0.5">Total Budget</p>
                      <p className="font-bold text-indigo-700 text-sm">
                        ₱{group.total_budget.toLocaleString('en', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                    <div className="bg-green-50 rounded-xl p-3 text-center">
                      <p className="text-xs text-green-500 mb-0.5">Paid</p>
                      <p className="font-bold text-green-700 text-sm">
                        ₱{paid.toLocaleString('en', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                    <div className="bg-amber-50 rounded-xl p-3 text-center">
                      <p className="text-xs text-amber-500 mb-0.5">Pending</p>
                      <p className="font-bold text-amber-700 text-sm">
                        ₱{pending.toLocaleString('en', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="mt-3">
                    <div className="flex justify-between text-xs text-gray-400 mb-1">
                      <span>{group.members.filter(m => m.has_paid).length} of {group.members.length} paid</span>
                      <span>{paidPct.toFixed(0)}% collected</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div
                        className="h-2 rounded-full bg-green-500 transition-all duration-500"
                        style={{ width: `${Math.min(paidPct, 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* Member avatar row */}
                  <div className="flex items-center gap-2 mt-3">
                    <div className="flex -space-x-2">
                      {group.members.slice(0, 6).map(m => (
                        <div
                          key={m.id}
                          title={`${m.name} — ₱${m.share_amount.toFixed(2)}`}
                          className="w-8 h-8 rounded-full border-2 border-white flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                          style={{ backgroundColor: m.color }}
                        >
                          {m.name[0].toUpperCase()}
                        </div>
                      ))}
                      {group.members.length > 6 && (
                        <div className="w-8 h-8 rounded-full border-2 border-white bg-gray-200 flex items-center justify-center text-gray-600 text-xs font-bold">
                          +{group.members.length - 6}
                        </div>
                      )}
                    </div>
                    <span className="text-xs text-gray-400">{group.members.length} member{group.members.length !== 1 ? 's' : ''}</span>
                  </div>

                  {/* Expand toggle */}
                  <button
                    onClick={() => setExpandedGroup(isExpanded ? null : group.id)}
                    className="w-full mt-3 flex items-center justify-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium py-1"
                  >
                    {isExpanded ? <><ChevronUp className="w-3 h-3" /> Hide details</> : <><ChevronDown className="w-3 h-3" /> View member breakdown</>}
                  </button>
                </div>

                {/* Expanded member list */}
                {isExpanded && (
                  <div className="border-t border-gray-100 bg-gray-50">
                    <div className="p-5 space-y-2">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                        Member Breakdown — tap to mark paid/unpaid
                      </p>
                      {group.members.map(m => (
                        <div
                          key={m.id}
                          className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all cursor-pointer select-none ${
                            m.has_paid
                              ? 'bg-green-50 border-green-200'
                              : 'bg-white border-gray-100 hover:border-indigo-200'
                          }`}
                          onClick={() => togglePaid(m.id, group.id)}
                        >
                          <div
                            className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                            style={{ backgroundColor: m.color }}
                          >
                            {m.name[0].toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-gray-800 text-sm truncate">{m.name}</p>
                            <p className="text-xs text-gray-500">
                              {m.share_percent.toFixed(1)}% of total
                            </p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="font-bold text-gray-800 text-sm">
                              ₱{m.share_amount.toLocaleString('en', { minimumFractionDigits: 2 })}
                            </p>
                            <span className={`text-xs font-medium ${m.has_paid ? 'text-green-600' : 'text-amber-500'}`}>
                              {m.has_paid ? '✅ Paid' : '⏳ Pending'}
                            </span>
                          </div>
                        </div>
                      ))}

                      {/* Summary */}
                      <div className="mt-3 pt-3 border-t border-gray-200 flex justify-between text-sm">
                        <span className="text-gray-500 font-medium">Total collected</span>
                        <span className="font-bold text-green-600">
                          ₱{paid.toLocaleString('en', { minimumFractionDigits: 2 })} / ₱{group.total_budget.toLocaleString('en', { minimumFractionDigits: 2 })}
                        </span>
                      </div>

                      {/* Share button */}
                      <button
                        onClick={() => copySummary(group)}
                        className="w-full mt-2 flex items-center justify-center gap-2 border border-indigo-200 text-indigo-600 hover:bg-indigo-50 py-2.5 rounded-xl text-sm font-medium transition-colors"
                      >
                        <Share2 className="w-4 h-4" />
                        Copy & Share Summary
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Create / Edit Modal ─────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">
            {/* Modal header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="font-bold text-gray-800 text-lg flex items-center gap-2">
                <Calculator className="w-5 h-5 text-indigo-600" />
                {editGroup ? 'Edit Budget Split' : 'New Budget Split'}
              </h2>
              <button
                onClick={() => { setShowModal(false); setEditGroup(null); }}
                className="p-2 rounded-lg hover:bg-gray-100 text-gray-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Name */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                  Group Name <span className="text-red-500">*</span>
                </label>
                <input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Bahay Bills, Barkada Trip, School Project"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>

              {/* Description */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                  Description <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  value={form.description ?? ''}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="e.g. Monthly utilities split among housemates"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>

              {/* Total Budget */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                  Total Budget (₱) <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-semibold">₱</span>
                  <input
                    type="number"
                    value={form.total_budget || ''}
                    onChange={e => handleBudgetChange(e.target.value)}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    className="w-full border border-gray-200 rounded-xl pl-8 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                </div>
              </div>

              {/* Split Mode */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">
                  How to Split?
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => handleModeChange('equal')}
                    className={`p-3 rounded-xl border-2 text-sm font-medium transition-all ${
                      splitMode === 'equal'
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    <div className="text-lg mb-1">⚖️</div>
                    Equal Split
                    <div className="text-xs font-normal text-gray-500 mt-0.5">Same amount each</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleModeChange('custom')}
                    className={`p-3 rounded-xl border-2 text-sm font-medium transition-all ${
                      splitMode === 'custom'
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    <div className="text-lg mb-1">🎯</div>
                    Custom Split
                    <div className="text-xs font-normal text-gray-500 mt-0.5">Set % per person</div>
                  </button>
                </div>
              </div>

              {/* Add members */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                  Members <span className="text-red-500">*</span>
                  <span className="text-gray-400 font-normal ml-1">(min. 2)</span>
                </label>
                <div className="flex gap-2 mb-3">
                  <div className="relative flex-1">
                    <UserPlus className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      value={newMemberName}
                      onChange={e => setNewMemberName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addMember()}
                      placeholder="Enter member name..."
                      className="w-full border border-gray-200 rounded-xl pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={addMember}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
                  >
                    Add
                  </button>
                </div>

                {/* Member list */}
                {form.members.length === 0 ? (
                  <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center">
                    <Users className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-gray-400 text-sm">No members yet. Add at least 2 people.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {/* Percent warning */}
                    {splitMode === 'custom' && (
                      <div className={`flex items-center gap-2 p-2.5 rounded-lg text-xs font-medium ${
                        percentOk ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
                      }`}>
                        {percentOk
                          ? <><CheckCircle2 className="w-3.5 h-3.5" /> Total: {totalPercent.toFixed(1)}% ✓</>
                          : <><AlertCircle className="w-3.5 h-3.5" /> Total: {totalPercent.toFixed(1)}% — must equal 100%</>
                        }
                      </div>
                    )}

                    {form.members.map(m => (
                      <div
                        key={m.id}
                        className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100"
                      >
                        {/* Avatar */}
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                          style={{ backgroundColor: m.color }}
                        >
                          {m.name[0].toUpperCase()}
                        </div>

                        {/* Name */}
                        <span className="font-medium text-gray-800 text-sm flex-1 min-w-0 truncate">
                          {m.name}
                        </span>

                        {/* Percent input (custom) or display (equal) */}
                        {splitMode === 'custom' ? (
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <input
                              type="number"
                              value={m.share_percent}
                              onChange={e => updatePercent(m.id, parseFloat(e.target.value) || 0)}
                              min="0"
                              max="100"
                              step="0.1"
                              className="w-16 border border-gray-200 rounded-lg px-2 py-1 text-xs text-center focus:outline-none focus:ring-2 focus:ring-indigo-300"
                            />
                            <span className="text-xs text-gray-400">%</span>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-500 flex-shrink-0">
                            {m.share_percent.toFixed(1)}%
                          </span>
                        )}

                        {/* Amount */}
                        <span className="font-bold text-indigo-600 text-sm flex-shrink-0 w-24 text-right">
                          ₱{m.share_amount.toLocaleString('en', { minimumFractionDigits: 2 })}
                        </span>

                        {/* Remove */}
                        <button
                          type="button"
                          onClick={() => removeMember(m.id)}
                          className="text-gray-300 hover:text-red-500 transition-colors flex-shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}

                    {/* Summary */}
                    {form.members.length >= 2 && form.total_budget > 0 && (
                      <div className="mt-2 p-3 bg-indigo-50 rounded-xl border border-indigo-100">
                        <div className="flex justify-between text-sm">
                          <span className="text-indigo-700 font-medium">Total Budget:</span>
                          <span className="font-bold text-indigo-700">
                            ₱{form.total_budget.toLocaleString('en', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm mt-1">
                          <span className="text-indigo-600">Split among:</span>
                          <span className="font-semibold text-indigo-600">{form.members.length} people</span>
                        </div>
                        {splitMode === 'equal' && (
                          <div className="flex justify-between text-sm mt-1">
                            <span className="text-indigo-600">Each person pays:</span>
                            <span className="font-bold text-indigo-800">
                              ₱{(form.total_budget / form.members.length).toLocaleString('en', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Modal footer */}
            <div className="p-6 border-t border-gray-100 flex gap-3">
              <button
                onClick={() => { setShowModal(false); setEditGroup(null); }}
                className="flex-1 border border-gray-200 py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !percentOk}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2"
              >
                {saving ? (
                  <><RefreshCw className="w-4 h-4 animate-spin" /> Saving...</>
                ) : (
                  <><Check className="w-4 h-4" />{editGroup ? 'Update Split' : 'Create Split'}</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
