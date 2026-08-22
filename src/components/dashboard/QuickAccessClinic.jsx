import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Navigation, Calendar, Building2, MapPin, Hospital, ExternalLink, ShoppingCart, Syringe } from 'lucide-react';
import Card from '../ui/Card';
import invoke from '../../api/tauriApi';
import { useGlobalApp } from '../../context/useGlobalApp';

const QuickAccessClinic = ({ branchId, dispenseMonth }) => {
  const navigate = useNavigate();
  const { workspaceMode } = useGlobalApp();
  
  const [activeTab, setActiveTab] = useState('drugs'); // 'drugs' or 'insulin'
  const [branches, setBranches] = useState([]);
  const [areas, setAreas] = useState([]);
  const [clinics, setClinics] = useState([]);
  
  const [formData, setFormData] = useState({
    branch: branchId || '',
    area: '',
    clinic: '',
    date: dispenseMonth ? `${dispenseMonth}-01` : new Date().toISOString().split('T')[0]
  });

  // Sync formData when props change
  useEffect(() => {
    const t = setTimeout(() => {
      setFormData(prev => ({
        ...prev,
        branch: branchId || prev.branch,
        date: dispenseMonth ? `${dispenseMonth}-01` : prev.date
      }));
    }, 0);
    return () => clearTimeout(t);
  }, [branchId, dispenseMonth]);

  // Load branches on mount
  useEffect(() => {
    invoke('get_branches').then(setBranches).catch(console.error);
  }, []);

  // Load areas when branch changes
  useEffect(() => {
    if (formData.branch) {
      invoke('get_areas', { branchId: parseInt(formData.branch) })
        .then(data => { 
          setAreas(data); 
          setFormData(f => ({...f, area: '', clinic: ''})); 
        })
        .catch(console.error);
    } else {
      const t = setTimeout(() => {
        setAreas([]); setFormData(f => ({...f, area: '', clinic: ''}));
      }, 0);
      return () => clearTimeout(t);
    }
  }, [formData.branch]);

  // Load clinics when area changes
  useEffect(() => {
    if (formData.area) {
      invoke('get_clinics', { areaId: parseInt(formData.area) })
        .then(data => { setClinics(data); setFormData(f => ({...f, clinic: ''})); })
        .catch(console.error);
    } else {
      const t = setTimeout(() => {
        setClinics([]); setFormData(f => ({...f, clinic: ''}));
      }, 0);
      return () => clearTimeout(t);
    }
  }, [formData.area]);

  const handleOpenDispensing = () => {
    const targetPath = activeTab === 'drugs' 
      ? '/transactions/drug-dispensing' 
      : '/transactions/insulin-dispensing';

    navigate(targetPath, { 
      state: { 
        branchId: formData.branch,
        areaId: formData.area,
        clinicId: formData.clinic,
        dispenseMonth: formData.date.substring(0, 7)
      } 
    });
  };

  // Determine if button should be enabled based on mode
  const isFormValid = () => {
    if (!formData.branch) return false;
    if (workspaceMode === 'areas' && !formData.area) return false;
    if (workspaceMode === 'clinics' && !formData.clinic) return false;
    return true;
  };

  return (
    <Card className="border-t-4 border-t-primary overflow-hidden">
      {/* Mini Tabs Header */}
      <div className="flex border-b border-slate-100 mb-6 -mx-6">
        <button 
          onClick={() => setActiveTab('drugs')}
          className={`flex-1 py-3 text-xs font-bold flex items-center justify-center gap-2 transition-all ${activeTab === 'drugs' ? 'bg-primary/5 text-primary border-b-2 border-primary' : 'text-slate-400 hover:text-slate-600'}`}
        >
          <ShoppingCart size={14} />
          منصرف أدوية
        </button>
        <button 
          onClick={() => setActiveTab('insulin')}
          className={`flex-1 py-3 text-xs font-bold flex items-center justify-center gap-2 transition-all ${activeTab === 'insulin' ? 'bg-sky-50 text-sky-600 border-b-2 border-sky-600' : 'text-slate-400 hover:text-slate-600'}`}
        >
          <Syringe size={14} />
          منصرف إنسولين
        </button>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${activeTab === 'drugs' ? 'bg-primary/10 text-primary' : 'bg-sky-100 text-sky-600'}`}>
            <Navigation size={18} />
          </div>
          <h2 className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>الوصول السريع</h2>
        </div>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-500 uppercase">
          {workspaceMode === 'branches' ? 'فروع' : workspaceMode === 'areas' ? 'مناطق' : 'عيادات'}
        </span>
      </div>

      <div className="space-y-5">
        <div>
          <label className="field-label !mb-1.5 flex items-center gap-1.5 text-xs font-bold text-slate-500">
            <Building2 size={14} /> الفرع الرئيسي
          </label>
          <select 
            className="neu-select py-3"
            value={formData.branch}
            onChange={(e) => setFormData({...formData, branch: e.target.value})}
          >
            <option value="">-- اختر الفرع --</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>

        {(workspaceMode === 'areas' || workspaceMode === 'clinics') && (
          <div className="animate-in fade-in slide-in-from-top-2 duration-300">
            <label className="field-label !mb-1.5 flex items-center gap-1.5 text-xs font-bold text-slate-500">
              <MapPin size={14} /> المنطقة الإحصائية
            </label>
            <select 
              className="neu-select py-3"
              value={formData.area}
              onChange={(e) => setFormData({...formData, area: e.target.value})}
              disabled={!formData.branch}
            >
              <option value="">-- اختر المنطقة --</option>
              {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        )}

        {(workspaceMode === 'clinics') && (
          <div className="animate-in fade-in slide-in-from-top-2 duration-300">
            <label className="field-label !mb-1.5 flex items-center gap-1.5 text-xs font-bold text-slate-500">
              <Hospital size={14} /> العيادة / الوحدة
            </label>
            <select 
              className="neu-select py-3"
              value={formData.clinic}
              onChange={(e) => setFormData({...formData, clinic: e.target.value})}
              disabled={!formData.area}
            >
              <option value="">-- اختر العيادة --</option>
              {clinics.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}

        <div>
          <label className="field-label !mb-1.5 flex items-center gap-1.5 text-xs font-bold text-slate-500">
             شهر المنصرف
          </label>
          <div 
            className="neu-input py-2 flex items-center gap-3 cursor-pointer"
            onClick={(e) => {
              const input = e.currentTarget.querySelector('input');
              if (input && input.showPicker) {
                try { input.showPicker(); } catch (_) {}
              }
            }}
          >
            <Calendar size={18} className="text-[var(--color-primary-light)]" />
            <input 
              type="month" 
              className="bg-transparent border-none outline-none w-full text-sm font-bold cursor-pointer" 
              style={{ colorScheme: 'light dark' }}
              value={formData.date.substring(0, 7)}
              onChange={(e) => setFormData({...formData, date: e.target.value + '-01'})}
            />
          </div>
        </div>

        <button 
          className={`w-full mt-4 group disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 p-4 rounded-xl font-bold transition-all shadow-md ${activeTab === 'drugs' ? 'neu-btn-primary' : 'bg-sky-600 text-white hover:bg-sky-700'}`}
          onClick={handleOpenDispensing}
          disabled={!isFormValid()}
        >
          <ExternalLink size={18} className="transition-transform group-hover:translate-x-[-4px]" />
          <span>فتح شاشة {activeTab === 'drugs' ? 'صرف الأدوية' : 'صرف الإنسولين'}</span>
        </button>
      </div>
    </Card>
  );
};


export default QuickAccessClinic;
