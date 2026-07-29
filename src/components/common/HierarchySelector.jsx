import React, { useState, useEffect, useRef } from 'react';
import { Building2, MapPin, Hospital, Calendar, Layers, Lock } from 'lucide-react';
import invoke from '../../api/tauriApi';
import { useGlobalApp } from '../../context/useGlobalApp';
import AutoComplete from '../ui/AutoComplete';

const ENGLISH_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const MonthInput = ({ value, onChange }) => {
  const inputRef = useRef();
  
  const formatMonth = (monthStr) => {
    if (!monthStr) return '';
    const [year, month] = monthStr.split('-');
    if (!year || !month) return monthStr;
    const monthIndex = parseInt(month, 10) - 1;
    if (monthIndex < 0 || monthIndex > 11) return monthStr;
    return `${ENGLISH_MONTHS[monthIndex]} ${year}`;
  };

  return (
    <div 
      className="flex items-center gap-3 p-2 px-4 rounded-2xl bg-[var(--color-bg)] border border-[var(--color-border)] shadow-sm cursor-pointer hover:border-[var(--color-primary)] transition-all relative group"
      onClick={() => inputRef.current?.showPicker()}
    >
      <Calendar size={18} className="text-[var(--color-primary)] group-hover:scale-110 transition-transform" />
      <span className="text-sm font-black text-[var(--color-text)]">
        {formatMonth(value) || '--------'}
      </span>
      <input
        ref={inputRef}
        type="month"
        value={value}
        onChange={onChange}
        className="absolute top-0 left-0 w-0 h-0 opacity-0 pointer-events-none"
      />
    </div>
  );
};

const HierarchySelector = ({ 
  onSelectionChange, 
  initialBranch, 
  initialArea, 
  initialClinic, 
  initialMonth,
  compact = false,
  hideMonth = false
}) => {
  const { 
    workspaceMode, 
    setWorkspaceMode, 
    lockedLevel, 
    setLockedLevel, 
    setHierarchyNames,
    activeHierarchy,
    updateActiveHierarchy,
    isIsolationExceptionActive
  } = useGlobalApp();
  
  const [branches, setBranches] = useState([]);
  const [areas, setAreas] = useState([]);
  const [clinics, setClinics] = useState([]);
  
  // Initialize from props OR global context OR defaults
  const [selectedBranch, setSelectedBranch] = useState(initialBranch !== undefined ? initialBranch : activeHierarchy.branchId);
  const [selectedArea, setSelectedArea] = useState(initialArea !== undefined ? initialArea : activeHierarchy.areaId);
  const [selectedClinic, setSelectedClinic] = useState(initialClinic !== undefined ? initialClinic : activeHierarchy.clinicId);
  const [dispenseMonth, setDispenseMonth] = useState(initialMonth !== undefined ? initialMonth : activeHierarchy.dispenseMonth);

  // Sync with initial props ONLY IF they are explicitly provided (e.g. from a deep link or direct navigation state)
  // Use setTimeout to defer state updates — satisfies react-hooks/set-state-in-effect
  useEffect(() => {
    const t = setTimeout(() => {
      if (initialBranch !== undefined && String(initialBranch ?? '') !== String(selectedBranch ?? '')) {
        setSelectedBranch(initialBranch);
      }
      if (initialArea !== undefined && String(initialArea ?? '') !== String(selectedArea ?? '')) {
        setSelectedArea(initialArea);
      }
      if (initialClinic !== undefined && String(initialClinic ?? '') !== String(selectedClinic ?? '')) {
        setSelectedClinic(initialClinic);
      }
      if (initialMonth !== undefined && String(initialMonth ?? '') !== String(dispenseMonth ?? '')) {
        setDispenseMonth(initialMonth);
      }
    }, 0);
    return () => clearTimeout(t);
  }, [initialBranch, initialArea, initialClinic, initialMonth, selectedBranch, selectedArea, selectedClinic, dispenseMonth]);

  // ── Ref-based callbacks to avoid dependency cycles ──────────────
  const updateHierarchyRef = useRef(updateActiveHierarchy);
  useEffect(() => { updateHierarchyRef.current = updateActiveHierarchy; });

  const onSelectionChangeRef = useRef(onSelectionChange);
  useEffect(() => { onSelectionChangeRef.current = onSelectionChange; });

  const setHierarchyNamesRef = useRef(setHierarchyNames);
  useEffect(() => { setHierarchyNamesRef.current = setHierarchyNames; });

  // Push updates to global context whenever internal state changes
  useEffect(() => {
    updateHierarchyRef.current({
      branchId: selectedBranch,
      areaId: selectedArea,
      clinicId: selectedClinic,
      dispenseMonth
    });
  }, [selectedBranch, selectedArea, selectedClinic, dispenseMonth]);

  // Fetch Month Isolation Lock
  useEffect(() => {
    const fetchLock = async () => {
      if (!selectedBranch || !dispenseMonth) {
        setLockedLevel(null);
        return;
      }
      try {
        const level = await invoke('get_month_isolation_rule', {
          branchId: parseInt(selectedBranch),
          dispenseMonth: dispenseMonth
        });
        setLockedLevel(level);
        
        // If locked, force workspace mode (Unless Exception is Active)
        if (level && !isIsolationExceptionActive) {
          const mode = level === 'branch' ? 'branches' : level === 'area' ? 'areas' : 'clinics';
          if (workspaceMode !== mode) {
            setWorkspaceMode(mode);
          }
        }
      } catch (err) {
        console.error('Failed to fetch isolation rule:', err);
      }
    };
    fetchLock();
  }, [selectedBranch, dispenseMonth, setLockedLevel, setWorkspaceMode, workspaceMode, isIsolationExceptionActive]);

  // Clear sub-levels when mode changes to prevent data overlap
  useEffect(() => {
    const t = setTimeout(() => {
      if (workspaceMode === 'branches') {
        setSelectedArea('');
        setSelectedClinic('');
      } else if (workspaceMode === 'areas') {
        setSelectedClinic('');
      }
    }, 0);
    return () => clearTimeout(t);
  }, [workspaceMode]);

  useEffect(() => {
    invoke('get_branches').then(data => setBranches(data)).catch(console.error);
  }, []);

  useEffect(() => {
    if (selectedBranch) {
      invoke('get_areas', { branchId: parseInt(selectedBranch) })
        .then(data => { 
          setAreas(data); 
          setSelectedArea(prev => {
            if (prev && data.some(a => a.id.toString() === prev.toString())) return prev;
            setSelectedClinic('');
            setClinics([]);
            return '';
          });
        })
        .catch(console.error);
    } else {
      const t = setTimeout(() => {
        setAreas([]); setSelectedArea(''); setClinics([]); setSelectedClinic('');
      }, 0);
      return () => clearTimeout(t);
    }
  }, [selectedBranch]);

  useEffect(() => {
    if (selectedArea) {
      invoke('get_clinics', { areaId: parseInt(selectedArea) })
        .then(data => { 
          setClinics(data); 
          setSelectedClinic(prev => {
            if (prev && data.some(c => c.id.toString() === prev.toString())) return prev;
            return '';
          });
        })
        .catch(console.error);
    } else {
      const t = setTimeout(() => {
        setClinics([]); setSelectedClinic('');
      }, 0);
      return () => clearTimeout(t);
    }
  }, [selectedArea]);

  useEffect(() => {
    if (onSelectionChangeRef.current) {
      onSelectionChangeRef.current({
        level: workspaceMode === 'branches' ? 'branch' : workspaceMode === 'areas' ? 'area' : 'clinic',
        branchId: selectedBranch ? parseInt(selectedBranch) : null,
        areaId: selectedArea ? parseInt(selectedArea) : null,
        clinicId: selectedClinic ? parseInt(selectedClinic) : null,
        dispenseMonth,
      });
    }

    // Update global context for print/exports
    const bName = branches.find(b => String(b.id) === String(selectedBranch))?.name || '';
    const aName = areas.find(a => String(a.id) === String(selectedArea))?.name || '';
    const cName = clinics.find(c => String(c.id) === String(selectedClinic))?.name || '';
    
    setHierarchyNamesRef.current({
      branch: bName,
      area: aName,
      clinic: cName
    });
  }, [workspaceMode, selectedBranch, selectedArea, selectedClinic, dispenseMonth, branches, areas, clinics]);

  return (
    <div className={`neu-card ${compact ? 'p-4 md:p-5' : 'p-6 md:p-8'}`} dir="rtl">
      {/* Header Info */}
      <div className={`flex flex-col md:flex-row md:items-center justify-between gap-4 ${compact ? 'mb-4' : 'mb-6'}`}>
        <div className="flex items-center gap-3">
          <div className="w-1.5 h-8 rounded-full bg-[var(--color-primary)]" />
          <div>
            <h2 className="text-xl font-black text-[var(--color-text)]">نطاق العمل الحالي</h2>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-[10px] font-bold text-[var(--color-primary)] uppercase tracking-widest leading-none">
                وضع العرض: {
                  workspaceMode === 'branches' ? 'تجميعي فروع' : 
                  workspaceMode === 'areas' ? 'تجميعي مناطق' : 'تفصيلي عيادات'
                }
              </p>
              {lockedLevel && (
                <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 border border-emerald-100 animate-in fade-in zoom-in duration-300">
                  <Lock size={10} />
                  <span className="text-[9px] font-black uppercase">مستوى مؤمن</span>
                </div>
              )}
            </div>
          </div>
        </div>
        
        {/* Month Selector - Always visible unless hidden */}
        {!hideMonth && (
          <MonthInput 
            value={dispenseMonth}
            onChange={(e) => setDispenseMonth(e.target.value)}
          />
        )}
      </div>

      <div className={`w-full h-[1px] bg-[var(--color-border)] opacity-50 ${compact ? 'mb-4' : 'mb-8'}`}></div>

      {/* Selectors Grid */}
      <div className="flex flex-col md:flex-row gap-6">
        {/* Branch - Always visible */}
        <div className="flex-1 space-y-2">
          <AutoComplete
            value={selectedBranch}
            onChange={setSelectedBranch}
            options={branches}
            label="الفرع الرئيسي"
            icon={Building2}
            placeholder="ابحث عن فرع..."
          />
        </div>

        {/* Area - Visible in Area or Clinic mode */}
        {(workspaceMode === 'areas' || workspaceMode === 'clinics') && (
          <div className="flex-1 space-y-2 animate-fadeIn">
            <AutoComplete
              value={selectedArea}
              onChange={setSelectedArea}
              options={areas}
              label="المنطقة الإحصائية"
              icon={MapPin}
              placeholder="ابحث عن منطقة..."
              disabled={!selectedBranch}
            />
          </div>
        )}

        {/* Clinic - Only in Clinic mode */}
        {workspaceMode === 'clinics' && (
          <div className="flex-1 space-y-2 animate-fadeIn">
            <AutoComplete
              value={selectedClinic}
              onChange={setSelectedClinic}
              options={clinics}
              label="العيادة / الوحدة"
              icon={Hospital}
              placeholder="ابحث عن عيادة..."
              disabled={!selectedArea}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default HierarchySelector;