import React, { useState, useEffect, useRef } from 'react';
import { Building2, MapPin, Hospital, Layers, Lock } from 'lucide-react';
import invoke from '../../api/tauriApi';
import { useGlobalApp } from '../../context/useGlobalApp';
import AutoComplete from '../ui/AutoComplete';
import MonthInput from '../ui/MonthInput';

const HierarchySelector = ({ 
  onSelectionChange, 
  onChange,
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

  // ── One-way sync from externally-changed initial props ───────────
  const lastAppliedInitialRef = useRef({ branch: initialBranch, area: initialArea, clinic: initialClinic, month: initialMonth });

  useEffect(() => {
    const t = setTimeout(() => {
      const last = lastAppliedInitialRef.current;
      if (initialBranch !== undefined && String(initialBranch ?? '') !== String(last.branch ?? '')) {
        setSelectedBranch(initialBranch);
      }
      if (initialArea !== undefined && String(initialArea ?? '') !== String(last.area ?? '')) {
        setSelectedArea(initialArea);
      }
      if (initialClinic !== undefined && String(initialClinic ?? '') !== String(last.clinic ?? '')) {
        setSelectedClinic(initialClinic);
      }
      if (initialMonth !== undefined && String(initialMonth ?? '') !== String(last.month ?? '')) {
        setDispenseMonth(initialMonth);
      }
      lastAppliedInitialRef.current = { branch: initialBranch, area: initialArea, clinic: initialClinic, month: initialMonth };
    }, 0);
    return () => clearTimeout(t);
  }, [initialBranch, initialArea, initialClinic, initialMonth]);

  // ── Ref-based callbacks to avoid dependency cycles ──────────────
  const workspaceModeRef = useRef(workspaceMode);
  useEffect(() => { workspaceModeRef.current = workspaceMode; });

  const updateHierarchyRef = useRef(updateActiveHierarchy);
  useEffect(() => { updateHierarchyRef.current = updateActiveHierarchy; });

  const onSelectionChangeRef = useRef(onSelectionChange);
  useEffect(() => { onSelectionChangeRef.current = onSelectionChange; });

  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; });

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
        
        // If locked, force workspace mode (Unless Exception is Active) — read via ref so
        // setting the mode doesn't re-trigger this effect (avoids an extra fetch cycle).
        if (level && !isIsolationExceptionActive) {
          const mode = level === 'branch' ? 'branches' : level === 'area' ? 'areas' : 'clinics';
          if (workspaceModeRef.current !== mode) {
            setWorkspaceMode(mode);
          }
        }
      } catch (err) {
        console.error('Failed to fetch isolation rule:', err);
      }
    };
    fetchLock();
  }, [selectedBranch, dispenseMonth, setLockedLevel, setWorkspaceMode, isIsolationExceptionActive]);

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

  // Fire the parent callback ONLY when the actual selection changes — NOT when the
  // branches/areas/clinics lists finish loading (previously each list load re-fired
  // onSelectionChange → parent re-render → new props → cascading renders and failed loads).
  useEffect(() => {
    const payload = {
      level: workspaceMode === 'branches' ? 'branch' : workspaceMode === 'areas' ? 'area' : 'clinic',
      branchId: selectedBranch ? parseInt(selectedBranch) : null,
      areaId: selectedArea ? parseInt(selectedArea) : null,
      clinicId: selectedClinic ? parseInt(selectedClinic) : null,
      dispenseMonth,
    };
    if (onSelectionChangeRef.current) {
      onSelectionChangeRef.current(payload);
    }
    if (onChangeRef.current) {
      onChangeRef.current({
        branchId: selectedBranch ? String(selectedBranch) : '',
        areaId: selectedArea ? String(selectedArea) : '',
        clinicId: selectedClinic ? String(selectedClinic) : '',
        dispenseMonth,
      });
    }
  }, [workspaceMode, selectedBranch, selectedArea, selectedClinic, dispenseMonth]);

  // Update global context names (print/exports) — separate effect so list loading never
  // triggers the parent callback.
  useEffect(() => {
    const bName = branches.find(b => String(b.id) === String(selectedBranch))?.name || '';
    const aName = areas.find(a => String(a.id) === String(selectedArea))?.name || '';
    const cName = clinics.find(c => String(c.id) === String(selectedClinic))?.name || '';
    
    setHierarchyNamesRef.current({
      branch: bName,
      area: aName,
      clinic: cName
    });
  }, [selectedBranch, selectedArea, selectedClinic, branches, areas, clinics]);

  return (
    <div className={`neu-card ${compact ? 'p-4 md:p-5' : 'p-6 md:p-8'}`} dir="rtl">
      {/* Header Info */}
      <div className={`flex flex-col md:flex-row md:items-center justify-between gap-4 flex-wrap ${compact ? 'mb-4' : 'mb-6'}`}>
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
            className="w-auto shrink-0"
          />
        )}
      </div>

      <div className={`w-full h-[1px] bg-[var(--color-border)] opacity-50 ${compact ? 'mb-4' : 'mb-8'}`}></div>

      {/* Selectors Grid — wraps into multiple rows when the container is narrow
          (e.g. a 25% sidebar) so boxes never shrink below a usable width. */}
      <div className="flex flex-col md:flex-row flex-wrap gap-4 md:gap-6">
        {/* Branch - Always visible */}
        <div className="flex-1 min-w-[200px] space-y-2">
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
          <div className="flex-1 min-w-[200px] space-y-2 animate-fadeIn">
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
          <div className="flex-1 min-w-[200px] space-y-2 animate-fadeIn">
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