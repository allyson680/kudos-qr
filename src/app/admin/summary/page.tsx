'use client';
import { useEffect, useState } from 'react';

type TodayRow = {
  time: string;
  project: string;
  voterCode: string;
  voterName: string;
  targetCode: string;
  targetName: string;
  company: string;
};
type MonthTotal = {
  companyId: string;
  companyName: string;
  project: string;
  count: number;
};

export default function AdminSummary() {
  const [loading, setLoading] = useState(true);
  const [votingOpen, setVotingOpen] = useState<boolean | null>(null);
  const [todayKey, setTodayKey] = useState('');
  const [monthKey, setMonthKey] = useState('');
  const [todayRows, setTodayRows] = useState<TodayRow[]>([]);
  const [monthTotals, setMonthTotals] = useState<MonthTotal[]>([]);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/summary');
      const json = await res.json();
      setVotingOpen(json.votingOpen);
      setTodayKey(json.todayKey);
      setMonthKey(json.monthKey);
      setTodayRows(json.todayRows || []);
      setMonthTotals(json.monthTotals || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Admin Summary</h1>
        <button onClick={load} className="px-3 py-2 border rounded">Refresh</button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="border rounded p-4">
          <div className="text-sm text-gray-500">Voting window</div>
          <div className="text-lg">{votingOpen === null ? '—' : (votingOpen ? 'OPEN' : 'CLOSED')}</div>
        </div>
        <div className="border rounded p-4">
          <div className="text-sm text-gray-500">Today</div>
          <div className="text-lg">{todayKey || '—'}</div>
        </div>
        <div className="border rounded p-4">
          <div className="text-sm text-gray-500">Month</div>
          <div className="text-lg">{monthKey || '—'}</div>
        </div>
      </div>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Today’s Votes ({todayRows.length})</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full border text-sm">
            <thead className="bg-gray-50">
  <tr>
    <th className="border px-2 py-1 text-left">Time</th>
    <th className="border px-2 py-1 text-left">Proj</th>
    <th className="border px-2 py-1 text-left">Voter</th>
    <th className="border px-2 py-1 text-left">Voter Company</th>
    <th className="border px-2 py-1 text-left">Target</th>
    <th className="border px-2 py-1 text-left">Target Company</th>
  </tr>
</thead>
          <tbody>
  {todayRows.map((r, i) => (
    <tr key={i}>
      <td className="border px-2 py-1">{new Date(r.time).toLocaleTimeString()}</td>
      <td className="border px-2 py-1">{r.project}</td>
      <td className="border px-2 py-1">{r.voterName || r.voterCode}</td>
      <td className="border px-2 py-1">{r.voterCompany}</td>
      <td className="border px-2 py-1">{r.targetName || r.targetCode}</td>
      <td className="border px-2 py-1">{r.targetCompany}</td>
    </tr>
  ))}
  {todayRows.length === 0 && (
    <tr>
      <td className="border px-2 py-2 text-center text-gray-500" colSpan={6}>
        No votes today.
      </td>
    </tr>
  )}
</tbody>

          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">This Month by Company</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full border text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="border px-2 py-1 text-left">Project</th>
                <th className="border px-2 py-1 text-left">Company</th>
                <th className="border px-2 py-1 text-right">Votes</th>
              </tr>
            </thead>
            <tbody>
            {monthTotals.map((m, i) => (
              <tr key={i}>
                <td className="border px-2 py-1">{m.project}</td>
                <td className="border px-2 py-1">{m.companyName}</td>
                <td className="border px-2 py-1 text-right">{m.count}</td>
              </tr>
            ))}
            {monthTotals.length === 0 && (
              <tr><td className="border px-2 py-2 text-center text-gray-500" colSpan={3}>No votes this month.</td></tr>
            )}
            </tbody>
          </table>
        </div>
      </section>

      {loading && <div className="text-sm text-gray-500">Loading…</div>}
    </main>
  );
}
