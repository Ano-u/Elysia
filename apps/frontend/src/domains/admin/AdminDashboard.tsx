import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApi } from '../../lib/api';
import { LiquidCard } from '../../components/ui/LiquidCard';

export const AdminDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'moderation' | 'access' | 'risk' | 'bans' | 'appeals' | 'ai'>('moderation');

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 flex p-8">
      {/* Sidebar */}
      <div className="w-64 flex-shrink-0 flex flex-col gap-2 border-r border-slate-200 dark:border-slate-800 pr-4">
        <h2 className="text-xl font-serif mb-6 px-4">治理中心</h2>
        <NavButton active={activeTab === 'moderation'} onClick={() => setActiveTab('moderation')}>审核队列</NavButton>
        <NavButton active={activeTab === 'access'} onClick={() => setActiveTab('access')}>准入申请池</NavButton>
        <NavButton active={activeTab === 'risk'} onClick={() => setActiveTab('risk')}>风控队列</NavButton>
        <NavButton active={activeTab === 'bans'} onClick={() => setActiveTab('bans')}>封禁中心</NavButton>
        <NavButton active={activeTab === 'appeals'} onClick={() => setActiveTab('appeals')}>申诉中心</NavButton>
        <NavButton active={activeTab === 'ai'} onClick={() => setActiveTab('ai')}>AI 审核设置</NavButton>
      </div>

      {/* Main Content */}
      <div className="flex-grow pl-8 overflow-y-auto max-h-screen">
        {activeTab === 'moderation' && <ModerationQueue />}
        {activeTab === 'access' && <AccessApplications />}
        {/* Placeholder for other tabs to keep implementation focused */}
        {activeTab === 'risk' && <div className="p-8 opacity-50">风控队列开发中...</div>}
        {activeTab === 'bans' && <div className="p-8 opacity-50">封禁中心开发中...</div>}
        {activeTab === 'appeals' && <div className="p-8 opacity-50">申诉中心开发中...</div>}
        {activeTab === 'ai' && <AiConfig />}
      </div>
    </div>
  );
};

const NavButton = ({ active, onClick, children }: { active: boolean, onClick: () => void, children: React.ReactNode }) => (
  <button
    onClick={onClick}
    className={`px-4 py-2.5 rounded-xl text-left transition-all ${
      active
        ? 'bg-slate-200 dark:bg-slate-800 font-medium'
        : 'hover:bg-slate-100 dark:hover:bg-slate-800/50 text-slate-600 dark:text-slate-400'
    }`}
  >
    {children}
  </button>
);

// --- Sub-components ---

const ModerationQueue = () => {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['admin-moderation-queue'],
    queryFn: () => fetchApi<{items: Record<string, unknown>[]}>('/api/admin/moderation/queue')
  });

  const decisionMutation = useMutation({
    mutationFn: ({ id, decision }: { id: string, decision: string }) =>
      fetchApi(`/api/admin/moderation/records/${id}/decision`, {
        method: 'POST',
        body: JSON.stringify({ decision, note: 'Admin action' })
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-moderation-queue'] })
  });

  if (isLoading) return <div>加载中...</div>;

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium mb-4">待审核记录</h3>
      {data?.items?.length === 0 ? (
        <div className="text-slate-500">队列为空</div>
      ) : (
        <div className="grid gap-4">
          {data?.items?.map(item => {
            const typedItem = item as { id: string; queue_type: string; target_id: string; reason: string };
            return (
            <LiquidCard key={typedItem.id} className="p-4 flex flex-col gap-4">
               <div>
                 <span className="text-xs bg-slate-200 dark:bg-slate-700 px-2 py-1 rounded">{typedItem.queue_type}</span>
                 <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">Target ID: {typedItem.target_id}</p>
                 <p className="mt-2">{typedItem.reason}</p>
               </div>
               <div className="flex gap-2">
                 <button onClick={() => decisionMutation.mutate({ id: typedItem.target_id, decision: 'approve' })} className="px-3 py-1 bg-green-500/10 text-green-600 rounded">通过</button>
                 <button onClick={() => decisionMutation.mutate({ id: typedItem.target_id, decision: 'reject' })} className="px-3 py-1 bg-red-500/10 text-red-600 rounded">驳回</button>
                 <button onClick={() => decisionMutation.mutate({ id: typedItem.target_id, decision: 'needs_changes' })} className="px-3 py-1 bg-yellow-500/10 text-yellow-600 rounded">要求修改</button>
               </div>
            </LiquidCard>
            );
          })}
        </div>
      )}
    </div>
  );
};

const AccessApplications = () => {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['admin-access-apps'],
    queryFn: () => fetchApi<{items: Record<string, unknown>[]}>('/api/admin/access/applications')
  });

  const actionMutation = useMutation({
    mutationFn: ({ id, action }: { id: string, action: 'approve'|'reject' }) =>
      fetchApi(`/api/admin/access/applications/${id}/${action}`, {
        method: 'POST',
        body: JSON.stringify({ note: 'Admin action' })
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-access-apps'] })
  });

  if (isLoading) return <div>加载中...</div>;

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium mb-4">准入申请</h3>
      <div className="grid gap-4">
        {/* Placeholder rendering */}
        {data?.items?.map(item => {
           const typedItem = item as { id: string; essay: string };
           return (
           <LiquidCard key={typedItem.id} className="p-4">
              <p className="whitespace-pre-wrap mb-4">{typedItem.essay}</p>
              <div className="flex gap-2">
                <button onClick={() => actionMutation.mutate({ id: typedItem.id, action: 'approve' })} className="px-3 py-1 bg-green-500/10 text-green-600 rounded">通过</button>
                <button onClick={() => actionMutation.mutate({ id: typedItem.id, action: 'reject' })} className="px-3 py-1 bg-red-500/10 text-red-600 rounded">驳回</button>
              </div>
           </LiquidCard>
           );
        })}
      </div>
    </div>
  );
};

const AiConfig = () => {
  const [config, setConfig] = useState({
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    endpointType: 'completions',
    model: 'gpt-4o-mini',
    isEnabled: false
  });

  const saveMutation = useMutation({
    mutationFn: () => fetchApi('/api/admin/ai-review/config', {
      method: 'PUT',
      body: JSON.stringify(config)
    })
  });

  const scanMutation = useMutation({
    mutationFn: () => fetchApi('/api/admin/ai-review/scan-recent', { method: 'POST' })
  });

  return (
    <div className="max-w-xl space-y-6">
       <h3 className="text-lg font-medium mb-4">AI 审核配置</h3>
       <div className="space-y-4">
         <div>
           <label className="block text-sm mb-1">Base URL</label>
           <input value={config.baseUrl} onChange={e => setConfig({...config, baseUrl: e.target.value})} className="w-full bg-white/50 dark:bg-black/20 border border-slate-200 dark:border-slate-700 rounded p-2" />
         </div>
         <div>
           <label className="block text-sm mb-1">API Key (留空表示不修改)</label>
           <input type="password" value={config.apiKey} onChange={e => setConfig({...config, apiKey: e.target.value})} className="w-full bg-white/50 dark:bg-black/20 border border-slate-200 dark:border-slate-700 rounded p-2" />
         </div>
         <div>
           <label className="block text-sm mb-1">Model</label>
           <input value={config.model} onChange={e => setConfig({...config, model: e.target.value})} className="w-full bg-white/50 dark:bg-black/20 border border-slate-200 dark:border-slate-700 rounded p-2" />
         </div>
         <div className="flex gap-4 pt-4">
           <button onClick={() => saveMutation.mutate()} className="px-4 py-2 bg-slate-900 text-white rounded">保存配置</button>
           <button onClick={() => scanMutation.mutate()} className="px-4 py-2 bg-pink-500 text-white rounded">手动扫描最近1小时</button>
         </div>
       </div>
    </div>
  );
};
