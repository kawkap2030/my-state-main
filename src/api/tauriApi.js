// Tauri API helper
// In desktop mode, uses Tauri invoke; in web mode, uses mock data

const isTauri = () => {
  return window.__TAURI_INTERNALS__ !== undefined;
};

// ── Auto-backup ONLY for destructive operations ────────────────
// Routine save/delete on individual items does NOT trigger backup
// to avoid accumulation. Only high-impact operations do.
const CRITICAL_PREFIXES = ['clear_', 'restore_', 'reset_'];

let _backupInFlight = false;

async function maybeBackup(cmd) {
  if (!isTauri()) return;
  if (!CRITICAL_PREFIXES.some((p) => cmd.startsWith(p))) return;
  if (cmd === 'auto_backup' || _backupInFlight) return;

  _backupInFlight = true;
  try {
    const { invoke: tauriInvoke } = await import('@tauri-apps/api/core');
    // Await the backup so it completes before the save starts
    await tauriInvoke('auto_backup', { maxBackups: 30 });
  } catch {
    // Backup failure must never block the save
  } finally {
    _backupInFlight = false;
  }
}

export async function invoke(cmd, args = {}) {
  // Sequential auto-backup before critical commands
  await maybeBackup(cmd);

  if (isTauri()) {
    const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
    return tauriInvoke(cmd, args);
  }
  // Mock data for web development
  console.warn(`[Tauri Mock] Calling command: ${cmd}`, args);
  return mockData(cmd, args);
}

let mockBranches = [
  { id: 1, name: "الفرع الرئيسي" },
  { id: 2, name: "الفرع الشمالي" },
  { id: 3, name: "الفرع الجنوبي" },
];
let mockAreas = [
  { id: 1, name: "المنطقة الأولى", branch_id: 1 },
  { id: 2, name: "المنطقة الثانية", branch_id: 1 },
  { id: 3, name: "المنطقة الثالثة", branch_id: 2 },
];
let mockClinics = [
  { id: 1, name: "عيادة الباطنية", area_id: 1 },
  { id: 2, name: "عيادة الأطفال", area_id: 1 },
  { id: 3, name: "عيادة الأسنان", area_id: 2 },
];

let mockDrugUnits = [
  { id: 1, name: "شريط" },
  { id: 2, name: "علبة" },
  { id: 3, name: "أمبول" },
  { id: 4, name: "فيال" },
];

let mockDrugCategories = [
  { id: 1, name: "مضادات حيوية" },
  { id: 2, name: "مسكنات" },
  { id: 3, name: "أدوية القلب" },
  { id: 4, name: "أدوية السكري" },
];

let mockDrugs = [
  {
    id: 1,
    name: "بانادول",
    scientific_name: "Paracetamol",
    category_id: 2,
    unit: "شريط",
  },
  {
    id: 2,
    name: "أوجمنتين",
    scientific_name: "Amoxicillin",
    category_id: 1,
    unit: "علبة",
  },
];

let mockInsulinUnits = [
  { id: 1, name: "وحدة" },
  { id: 2, name: "مل" },
];

let mockInsulinCategories = [
  { id: 1, name: "إنسولين مائي" },
  { id: 2, name: "إنسولين معكر" },
  { id: 3, name: "إنسولين مختلط" },
];

let mockInsulinTypes = [
  { id: 1, name: "حقن" },
  { id: 2, name: "قلم" },
];

let mockInsulinCodes = [
  {
    id: 1,
    code: 101,
    name: "إنسولين هيمولين ر",
    unit: "وحدة",
    type: "حقن",
    category: "إنسولين مائي",
  },
  {
    id: 2,
    code: 102,
    name: "إنسولين لانتوس",
    unit: "مل",
    type: "قلم",
    category: "إنسولين معكر",
  },
];

let mockSupplyCategories = [];

let mockSupplies = [];

let mockJudicialPatients = [
  {
    id: 1,
    name: "أحمد محمد علي",
    diagnosis: "فشل كلوي",
    court_ruling_date: "2024-01-01",
    clinic_id: 1,
    area_id: 1,
  },
];

let mockJudicialMedicines = [{ id: 1, name: "دواء قضائي 1", unit: "أمبول" }];



let nextId = 1000;

function mockData(cmd, args) {
  // Support both camelCase and snake_case for parameters in mock data
  const branch_id = args.branch_id || args.branchId;
  const area_id = args.area_id || args.areaId;

  switch (cmd) {
    // Auth (web/dev mock)
    case "login": {
      const username = args.username || "";
      const password = args.passwordHash || args.password || "";
      const mockUsers = [
        { id: 1, username: "admin", password: "admin", role: "admin" },
        { id: 2, username: "user", password: "user", role: "data_entry" },
        { id: 3, username: "viewer", password: "viewer", role: "viewer" },
      ];
      const found = mockUsers.find(
        (u) => u.username === username && u.password === password
      );
      if (!found) {
        return Promise.reject("بيانات الدخول غير صحيحة");
      }
      return { id: found.id, username: found.username, role: found.role };
    }
    case "get_users":
      return [
        { id: 1, username: "admin", role: "admin" },
        { id: 2, username: "user", role: "data_entry" },
        { id: 3, username: "viewer", role: "viewer" },
      ];

    case "get_branches":
      return mockBranches;
    case "get_areas":
      return mockAreas.filter(a => a.branch_id === branch_id);
    case "get_clinics":
      return mockClinics.filter(c => c.area_id === area_id);

    // CRUD - Branches
    case "add_branch":
      { const b = { id: ++nextId, name: args.name }; mockBranches.push(b); return b; }
    case "update_branch":
      { const b = mockBranches.find(x => x.id === args.id); if (b) b.name = args.name; return { success: true }; }
    case "delete_branch":
      { mockBranches = mockBranches.filter(x => x.id !== args.id); return { success: true }; }
    case "bulk_add_branches":
      {
        const names = args.names || []; let added = 0; let skipped = 0;
        for (const n of names) {
          if (n.trim()) {
            if (mockBranches.some(b => b.name === n.trim())) { skipped++; }
            else { mockBranches.push({ id: ++nextId, name: n.trim() }); added++; }
          }
        }
        return { added, skipped };
      }

    // CRUD - Areas
    case "add_area":
      { const a = { id: ++nextId, name: args.name, branch_id: branch_id }; mockAreas.push(a); return a; }
    case "update_area":
      { const a = mockAreas.find(x => x.id === args.id); if (a) { a.name = args.name; a.branch_id = branch_id; } return { success: true }; }
    case "delete_area":
      { mockAreas = mockAreas.filter(x => x.id !== args.id); return { success: true }; }
    case "bulk_add_areas":
      {
        const names = args.names || []; const bId = parseInt(branch_id); let added = 0; let skipped = 0;
        for (const n of names) {
          if (n.trim()) {
            if (mockAreas.some(a => a.name === n.trim() && a.branch_id === bId)) { skipped++; }
            else { mockAreas.push({ id: ++nextId, name: n.trim(), branch_id: bId }); added++; }
          }
        }
        return { added, skipped };
      }

    // CRUD - Clinics
    case "add_clinic":
      { const c = { id: ++nextId, name: args.name, area_id: area_id }; mockClinics.push(c); return c; }
    case "update_clinic":
      { const c = mockClinics.find(x => x.id === args.id); if (c) { c.name = args.name; c.area_id = area_id; } return { success: true }; }
    case "delete_clinic":
      { mockClinics = mockClinics.filter(x => x.id !== args.id); return { success: true }; }
    case "bulk_add_clinics":
      {
        const names = args.names || []; const aId = parseInt(area_id); let added = 0; let skipped = 0;
        for (const n of names) {
          if (n.trim()) {
            if (mockClinics.some(c => c.name === n.trim() && c.area_id === aId)) { skipped++; }
            else { mockClinics.push({ id: ++nextId, name: n.trim(), area_id: aId }); added++; }
          }
        }
        return { added, skipped };
      }

    // Master Data - Drug Units
    case "get_drug_units":
      return mockDrugUnits;
    case "add_drug_unit":
      { 
        if (mockDrugUnits.some(u => u.name === args.name)) return Promise.reject("هذه الوحدة موجودة بالفعل");
        const u = { id: ++nextId, name: args.name }; mockDrugUnits.push(u); return u; 
      }
    case "update_drug_unit":
      { 
        if (mockDrugUnits.some(u => u.name === args.name && u.id !== args.id)) return Promise.reject("هذه الوحدة موجودة بالفعل");
        const u = mockDrugUnits.find(x => x.id === args.id); if (u) u.name = args.name; return { success: true }; 
      }
    case "delete_drug_unit":
      { mockDrugUnits = mockDrugUnits.filter(x => x.id !== args.id); return { success: true }; }
    case "bulk_add_drug_units":
      { 
        const names = args.names || []; let added = 0; let skipped = 0; 
        for (const n of names) { 
          if (n.trim()) { 
            if (mockDrugUnits.some(u => u.name === n.trim())) { skipped++; }
            else { mockDrugUnits.push({ id: ++nextId, name: n.trim() }); added++; }
          } 
        } 
        return { added, skipped }; 
      }

    // Master Data - Drug Categories
    case "get_drug_categories":
      return mockDrugCategories;
    case "add_drug_category":
      { 
        if (mockDrugCategories.some(c => c.name === args.name)) return Promise.reject("هذا التصنيف موجود بالفعل");
        const c = { id: ++nextId, name: args.name }; mockDrugCategories.push(c); return c; 
      }
    case "update_drug_category":
      { 
        if (mockDrugCategories.some(c => c.name === args.name && c.id !== args.id)) return Promise.reject("هذا التصنيف موجود بالفعل");
        const c = mockDrugCategories.find(x => x.id === args.id); if (c) c.name = args.name; return { success: true }; 
      }
    case "delete_drug_category":
      { mockDrugCategories = mockDrugCategories.filter(x => x.id !== args.id); return { success: true }; }
    case "bulk_add_drug_categories":
      { 
        const names = args.names || []; let added = 0; let skipped = 0; 
        for (const n of names) { 
          if (n.trim()) { 
            if (mockDrugCategories.some(c => c.name === n.trim())) { skipped++; }
            else { mockDrugCategories.push({ id: ++nextId, name: n.trim() }); added++; }
          } 
        } 
        return { added, skipped }; 
      }

    // Master Data - Drugs
    case "get_drugs":
      {
        let res = [...mockDrugs];
        const category_id = args.category_id || args.categoryId;
        if (category_id) res = res.filter(d => d.category_id === category_id);
        if (args.search) res = res.filter(d => d.name.includes(args.search) || d.scientific_name?.includes(args.search));
        return res;
      }
    case "add_drug":
      { 
        const category_id = args.categoryId || args.category_id;
        if (mockDrugs.some(d => d.name === args.name && (d.unit || '') === (args.unit || '') && d.category_id === category_id)) return Promise.reject("هذا الدواء موجود بالفعل بنفس الوحدة والتصنيف");
        const d = { id: ++nextId, name: args.name, scientific_name: args.scientificName || args.scientific_name, category_id, unit: args.unit }; 
        mockDrugs.push(d); 
        return d; 
      }
    case "update_drug":
      { 
        const category_id = args.categoryId || args.category_id;
        if (mockDrugs.some(d => d.name === args.name && (d.unit || '') === (args.unit || '') && d.category_id === category_id && d.id !== args.id)) return Promise.reject("هذا الدواء موجود بالفعل بنفس الوحدة والتصنيف");
        const idx = mockDrugs.findIndex(x => x.id === args.id); 
        if (idx !== -1) mockDrugs[idx] = { ...mockDrugs[idx], name: args.name, scientific_name: args.scientificName || args.scientific_name, category_id, unit: args.unit }; 
        return { success: true }; 
      }
    case "delete_drug":
      { mockDrugs = mockDrugs.filter(x => x.id !== args.id); return { success: true }; }
    case "bulk_add_drugs":
      { 
        const category_id = args.categoryId || args.category_id;
        const names = args.names || []; let added = 0; let skipped = 0; 
        for (const n of names) { 
          if (n.trim()) { 
            if (mockDrugs.some(d => d.name === n.trim() && (d.unit || '') === (args.unit || '') && d.category_id === category_id)) { skipped++; }
            else { mockDrugs.push({ id: ++nextId, name: n.trim(), category_id, unit: args.unit }); added++; }
          } 
        } 
        return { added, skipped }; 
      }

    // Master Data - Insulin
    // Master Data - Insulin Units
    case "get_insulin_units":
      return mockInsulinUnits;
    case "add_insulin_unit":
      { 
        if (mockInsulinUnits.some(u => u.name === args.name)) return Promise.reject("هذه الوحدة موجودة بالفعل");
        const u = { id: ++nextId, name: args.name }; mockInsulinUnits.push(u); return u; 
      }
    case "update_insulin_unit":
      { 
        if (mockInsulinUnits.some(u => u.name === args.name && u.id !== args.id)) return Promise.reject("هذه الوحدة موجودة بالفعل");
        const u = mockInsulinUnits.find(x => x.id === args.id); if (u) u.name = args.name; return { success: true }; 
      }
    case "delete_insulin_unit":
      { mockInsulinUnits = mockInsulinUnits.filter(x => x.id !== args.id); return { success: true }; }
    case "bulk_add_insulin_units":
      { 
        const names = args.names || []; let added = 0; let skipped = 0; 
        for (const n of names) { 
          if (n.trim()) { 
            if (mockInsulinUnits.some(u => u.name === n.trim())) { skipped++; }
            else { mockInsulinUnits.push({ id: ++nextId, name: n.trim() }); added++; }
          } 
        } 
        return { added, skipped }; 
      }

    case "get_insulin_categories":
      return mockInsulinCategories;
    case "add_insulin_category":
      { 
        if (mockInsulinCategories.some(c => c.name === args.name)) return Promise.reject("هذه الفئة موجودة بالفعل");
        const c = { id: ++nextId, name: args.name }; mockInsulinCategories.push(c); return c; 
      }
    case "update_insulin_category":
      { 
        if (mockInsulinCategories.some(c => c.name === args.name && c.id !== args.id)) return Promise.reject("هذه الفئة موجودة بالفعل");
        const c = mockInsulinCategories.find(x => x.id === args.id); if (c) c.name = args.name; return { success: true }; 
      }
    case "delete_insulin_category":
      { mockInsulinCategories = mockInsulinCategories.filter(x => x.id !== args.id); return { success: true }; }
    case "bulk_add_insulin_categories":
      { 
        const names = args.names || []; let added = 0; let skipped = 0; 
        for (const n of names) { 
          if (n.trim()) { 
            if (mockInsulinCategories.some(c => c.name === n.trim())) { skipped++; }
            else { mockInsulinCategories.push({ id: ++nextId, name: n.trim() }); added++; }
          } 
        } 
        return { added, skipped }; 
      }

    case "get_insulin_types":
      return mockInsulinTypes;
    case "add_insulin_type":
      { 
        if (mockInsulinTypes.some(t => t.name === args.name)) return Promise.reject("هذا النوع موجود بالفعل");
        const t = { id: ++nextId, name: args.name }; mockInsulinTypes.push(t); return t; 
      }
    case "update_insulin_type":
      { 
        if (mockInsulinTypes.some(t => t.name === args.name && t.id !== args.id)) return Promise.reject("هذا النوع موجود بالفعل");
        const t = mockInsulinTypes.find(x => x.id === args.id); if (t) t.name = args.name; return { success: true }; 
      }
    case "delete_insulin_type":
      { mockInsulinTypes = mockInsulinTypes.filter(x => x.id !== args.id); return { success: true }; }
    case "bulk_add_insulin_types":
      { 
        const names = args.names || []; let added = 0; let skipped = 0; 
        for (const n of names) { 
          if (n.trim()) { 
            if (mockInsulinTypes.some(t => t.name === n.trim())) { skipped++; }
            else { mockInsulinTypes.push({ id: ++nextId, name: n.trim() }); added++; }
          } 
        } 
        return { added, skipped }; 
      }

    case "get_insulin_codes":
      return mockInsulinCodes;
    case "get_insulin_dispensed":
      return [];
    case "add_insulin_code":
      { 
        const type_id = args.typeId || args.type_id;
        const unit_id = args.unitId || args.unit_id;
        if (mockInsulinCodes.some(i => i.name === args.name && i.type_id === type_id && i.unit_id === unit_id)) return Promise.reject("هذا الصنف موجود بالفعل بنفس النوع والوحدة");
        const i = { id: ++nextId, ...args, type_id, unit_id }; 
        mockInsulinCodes.push(i); 
        return i; 
      }
    case "update_insulin_code":
      { 
        const type_id = args.typeId || args.type_id;
        const unit_id = args.unitId || args.unit_id;
        if (mockInsulinCodes.some(i => i.name === args.name && i.type_id === type_id && i.unit_id === unit_id && i.id !== args.id)) return Promise.reject("هذا الصنف موجود بالفعل بنفس النوع والوحدة");
        const idx = mockInsulinCodes.findIndex(x => x.id === args.id); 
        if (idx !== -1) mockInsulinCodes[idx] = { ...mockInsulinCodes[idx], ...args, type_id, unit_id }; 
        return { success: true }; 
      }
    case "delete_insulin_code":
      { mockInsulinCodes = mockInsulinCodes.filter(x => x.id !== args.id); return { success: true }; }
    case "bulk_add_insulin_codes":
      { 
        const type_id = args.typeId || args.type_id;
        const unit_id = args.unitId || args.unit_id;
        const names = args.names || []; let added = 0; let skipped = 0; 
        for (const n of names) { 
          if (n.trim()) { 
            if (mockInsulinCodes.some(i => i.name === n.trim() && i.type_id === type_id && i.unit_id === unit_id)) { skipped++; }
            else { mockInsulinCodes.push({ id: ++nextId, name: n.trim(), type_id, unit_id }); added++; }
          } 
        } 
        return { added, skipped }; 
      }

    // Master Data - Supplies
    case "get_supply_categories":
      return mockSupplyCategories;
    case "add_supply_category":
      { const c = { id: ++nextId, name: args.name }; mockSupplyCategories.push(c); return c; }
    case "update_supply_category":
      { const c = mockSupplyCategories.find(x => x.id === args.id); if (c) c.name = args.name; return { success: true }; }
    case "delete_supply_category":
      { mockSupplyCategories = mockSupplyCategories.filter(x => x.id !== args.id); return { success: true }; }
    case "bulk_add_supply_categories":
      { 
        const names = args.names || []; let added = 0; let skipped = 0; 
        for (const n of names) { 
          if (n.trim()) { 
            if (mockSupplyCategories.some(c => c.name === n.trim())) { skipped++; }
            else { mockSupplyCategories.push({ id: ++nextId, name: n.trim() }); added++; }
          } 
        } 
        return { added, skipped }; 
      }

    case "get_supplies":
      return mockSupplies;
    case "add_supply":
      { const s = { id: ++nextId, ...args }; mockSupplies.push(s); return s; }
    case "update_supply":
      { const idx = mockSupplies.findIndex(x => x.id === args.id); if (idx !== -1) mockSupplies[idx] = { ...mockSupplies[idx], ...args }; return { success: true }; }
    case "delete_supply":
      { mockSupplies = mockSupplies.filter(x => x.id !== args.id); return { success: true }; }
    case "bulk_add_supplies":
      { 
        const categoryId = args.categoryId || args.category_id;
        const names = args.names || []; let added = 0; let skipped = 0; 
        for (const n of names) { 
          if (n.trim()) { 
            if (mockSupplies.some(s => s.name === n.trim() && s.category_id === categoryId)) { skipped++; }
            else { mockSupplies.push({ id: ++nextId, name: n.trim(), category_id: categoryId, unit: args.unit }); added++; }
          } 
        } 
        return { added, skipped }; 
      }

    // Master Data - Judicial
    case "get_judicial_patients":
      return mockJudicialPatients;
    case "add_judicial_patient":
      { const p = { id: ++nextId, ...args }; mockJudicialPatients.push(p); return p; }
    case "update_judicial_patient":
      { const idx = mockJudicialPatients.findIndex(x => x.id === args.id); if (idx !== -1) mockJudicialPatients[idx] = { ...mockJudicialPatients[idx], ...args }; return { success: true }; }
    case "delete_judicial_patient":
      { mockJudicialPatients = mockJudicialPatients.filter(x => x.id !== args.id); return { success: true }; }

    case "get_judicial_medicines":
      return mockJudicialMedicines;
    case "get_judicial_dispensed":
      return [];
    case "add_judicial_medicine":
      { const m = { id: ++nextId, ...args }; mockJudicialMedicines.push(m); return m; }
    case "update_judicial_medicine":
      { const idx = mockJudicialMedicines.findIndex(x => x.id === args.id); if (idx !== -1) mockJudicialMedicines[idx] = { ...mockJudicialMedicines[idx], ...args }; return { success: true }; }
    case "delete_judicial_medicine":
      { mockJudicialMedicines = mockJudicialMedicines.filter(x => x.id !== args.id); return { success: true }; }
    case "bulk_add_judicial_medicines":
      { 
        const names = args.names || []; let added = 0; let skipped = 0; 
        for (const n of names) { 
          if (n.trim()) { 
            if (mockJudicialMedicines.some(m => m.name === n.trim())) { skipped++; }
            else { mockJudicialMedicines.push({ id: ++nextId, name: n.trim(), unit: args.unit }); added++; }
          } 
        } 
        return { added, skipped }; 
      }
    case "save_patient_pdf":
      { 
        const p = mockJudicialPatients.find(x => x.id === (args.patientId || args.patient_id)); 
        if (p) p.pdf_path = args.pdfPath || args.pdf_path; 
        return { success: true }; 
      }
    case "get_patient_pdf":
      { 
        const p = mockJudicialPatients.find(x => x.id === (args.patientId || args.patient_id)); 
        return p?.pdf_path || null; 
      }

    // Save operations
    case "save_branch_batch_summary":
      return { saved: args.items?.length || 0, skipped: 0, skipped_branches: [] };
    // Tickets Batch Commands
    case "get_tickets_batch_for_branch":
      {
        return mockClinics.map(c => ({
          clinic_id: c.id,
          clinic_name: c.name,
          area_id: c.area_id,
          area_name: mockAreas.find(a => a.id === c.area_id)?.name || 'منطقة',
          branch_id: 1,
          branch_name: 'الفرع الرئيسي',
          morning_56b: 0,
          morning_56c: 0,
          evening_56b: 0,
          evening_56c: 0,
          morning_authority: 0,
          morning_students: 0,
          morning_infants: 0,
          evening_authority: 0,
          evening_students: 0,
          evening_infants: 0,
        }));
      }
    case "save_tickets_batch_bulk":
      return { saved: (args.items || []).length, skipped: 0 };

    case "get_branch_batch_summary":
      {
        const month = args.dispenseMonth;
        return mockBranches.map(b => ({
          id: 0,
          branch_id: b.id,
          branch_name: b.name,
          dispense_month: month,
          drugs_free_authority: 0,
          drugs_free_students: 0,
          drugs_free_infants: 0,
          drugs_free_breadwinner_women: 0,
          drugs_supported_authority_value: 0,
          drugs_supported_authority_patient_share: 0,
          drugs_supported_students_value: 0,
          drugs_supported_students_patient_share: 0,
          drugs_supported_infants_value: 0,
          drugs_supported_infants_patient_share: 0,
        }));
      }

    case "save_monthly_drugs_dispensed":
      return { success: true, id: ++nextId };
    case "get_monthly_drugs_dispensed":
      return null;
    case "save_detailed_drug_dispensed":
      return ++nextId;
    case "get_detailed_drug_dispensed":
      return [];
    case "update_detailed_drug_dispensed":
    case "delete_detailed_drug_dispensed":
      return { success: true };
    case "save_medical_tickets":
    case "get_drug_groups":
      return [];
    case "get_exact_drug_groups":
      return [];
    case "delete_drug_group":
      return { success: true };
    case "save_drug_group_costs_bulk":
      return { saved_count: (args.data || []).length, skipped_names: [] };
    case "save_drug_group_cost":
    case "save_insulin_dispensed":
    case "save_drug_group":
    case "save_judicial_dispensed":
      return { success: true, id: ++nextId };

    case "get_executive_report_summary":
      return {
        total_cost: 156820.50,
        total_cases: 1240,
        drug_cost: 84500.00,
        drug_cases: 750,
        insulin_cost: 41200.50,
        insulin_cases: 380,
        supply_cost: 18450.00,
        judicial_cost: 12670.00,
        judicial_cases: 110,
        free_drugs_cost: 54000.00,
        supported_drugs_cost: 30500.00,
        patient_share: 8450.00,
        tickets_56b: 420,
        tickets_56c: 310,
        top_drugs: [
          { name: "أوجمنتين علبة", cost: 12500, quantity: 250, cases: 180 },
          { name: "بانادول شريط", cost: 8400, quantity: 600, cases: 450 },
          { name: "أملور 5 ملجم", cost: 7200, quantity: 120, cases: 90 },
          { name: "كونكور 5 ملجم", cost: 5800, quantity: 180, cases: 130 },
          { name: "جلافوس ميت", cost: 4900, quantity: 90, cases: 75 }
        ],
        top_insulin: [
          { name: "إنسولين لانتوس", cost: 18500, quantity: 150, cases: 120 },
          { name: "إنسولين هيمولين ر", cost: 11200, quantity: 220, cases: 180 },
          { name: "أبيثرا قلم", cost: 6800, quantity: 80, cases: 60 },
          { name: "ميكستارد 30", cost: 4700, quantity: 95, cases: 70 }
        ],
        comparisons: [
          { label: "المنطقة الأولى", cost: 54200, cases: 410 },
          { label: "المنطقة الثانية", cost: 43100, cases: 350 },
          { label: "المنطقة الثالثة", cost: 59520, cases: 480 }
        ]
      };

    case "get_demographic_report":
      {
        const months = [];
        const start = new Date(args.startMonth + "-01");
        const end = new Date(args.endMonth + "-01");
        let cur = new Date(start);
        while (cur <= end) {
          months.push(cur.toISOString().substring(0, 7));
          cur.setMonth(cur.getMonth() + 1);
        }
        return months.map((m, idx) => ({
          month: m,
          free_authority: 12000 + idx * 800,
          free_students: 8500 + idx * 600,
          free_infants: 4500 + idx * 300,
          free_women: 3200 + idx * 200,
          sup_authority_val: 18000 + idx * 1000,
          sup_authority_share: 3600 + idx * 200,
          sup_students_val: 9500 + idx * 500,
          sup_students_share: 1900 + idx * 100,
          sup_infants_val: 3800 + idx * 200,
          sup_infants_share: 760 + idx * 40,
        }));
      }

    case "get_anomaly_report":
      return {
        clinic_outliers: [
          { clinic_name: "عيادة المنشية", drug_name: "أوجمنتين 625 ملجم", actual_qty: 480, avg_qty: 112, std_dev: 58, deviation_pct: 328.6 },
          { clinic_name: "عيادة العامرية", drug_name: "بانادول شريط", actual_qty: 1250, avg_qty: 380, std_dev: 210, deviation_pct: 228.9 },
          { clinic_name: "عيادة الجمرك", drug_name: "أملور 5 ملجم", actual_qty: 320, avg_qty: 95, std_dev: 48, deviation_pct: 236.8 },
          { clinic_name: "عيادة المحطة", drug_name: "كونكور 5 ملجم", actual_qty: 290, avg_qty: 88, std_dev: 42, deviation_pct: 229.5 },
          { clinic_name: "عيادة سيدي جابر", drug_name: "جلوكوفاج 850 ملجم", actual_qty: 540, avg_qty: 175, std_dev: 95, deviation_pct: 208.6 },
        ],
        ticket_mismatches: [
          { clinic_name: "عيادة المنشية", total_tickets: 48, total_cost: 28400, cost_per_ticket: 591.7, avg_cost_per_ticket: 142.3, deviation_pct: 315.8 },
          { clinic_name: "عيادة الجمرك", total_tickets: 72, total_cost: 31200, cost_per_ticket: 433.3, avg_cost_per_ticket: 142.3, deviation_pct: 204.5 },
          { clinic_name: "عيادة المحطة", total_tickets: 95, total_cost: 36500, cost_per_ticket: 384.2, avg_cost_per_ticket: 142.3, deviation_pct: 170.0 },
          { clinic_name: "عيادة باب شرق", total_tickets: 110, total_cost: 38900, cost_per_ticket: 353.6, avg_cost_per_ticket: 142.3, deviation_pct: 148.5 },
        ],
        surge_drugs: [
          { drug_name: "أوجمنتين 1 جرام", current_cost: 42500, previous_cost: 8200, growth_pct: 418.3 },
          { drug_name: "كريسمين 500 ملجم", current_cost: 18700, previous_cost: 4100, growth_pct: 356.1 },
          { drug_name: "زيثروماكس 500 ملجم", current_cost: 14200, previous_cost: 3800, growth_pct: 273.7 },
          { drug_name: "بروفين 400 ملجم شريط", current_cost: 9800, previous_cost: 2900, growth_pct: 237.9 },
          { drug_name: "نيفيديبين 20 ملجم", current_cost: 7600, previous_cost: 2400, growth_pct: 216.7 },
        ],
      };

    case "get_pivot_data":
      {
        const ds = args.dataSource;
        const start = args.startMonth;
        const end = args.endMonth;
        const months = [];
        const startD = new Date(start + "-01");
        const endD = new Date(end + "-01");
        let cur = new Date(startD);
        while (cur <= endD) {
          months.push(cur.toISOString().substring(0, 7));
          cur.setMonth(cur.getMonth() + 1);
        }

        const data = [];
        for (const m of months) {
          if (ds === "detailed_drugs") {
            data.push(
              { branch: "الفرع الرئيسي", area: "المنطقة الأولى", clinic: "عيادة الباطنية", month: m, drug: "بانادول شريط", category: "مسكنات", qty: 250, cases: 180, cost: 3500 },
              { branch: "الفرع الرئيسي", area: "المنطقة الأولى", clinic: "عيادة الباطنية", month: m, drug: "أوجمنتين علبة", category: "مضادات حيوية", qty: 120, cases: 90, cost: 6000 },
              { branch: "الفرع الرئيسي", area: "المنطقة الأولى", clinic: "عيادة الأطفال", month: m, drug: "بانادول شريط", category: "مسكنات", qty: 150, cases: 110, cost: 2100 },
              { branch: "الفرع الرئيسي", area: "المنطقة الأولى", clinic: "عيادة الأطفال", month: m, drug: "أوجمنتين علبة", category: "مضادات حيوية", qty: 80, cases: 65, cost: 4000 },
              { branch: "الفرع الرئيسي", area: "المنطقة الثانية", clinic: "عيادة الأسنان", month: m, drug: "بانادول شريط", category: "مسكنات", qty: 190, cases: 140, cost: 2660 },
              { branch: "الفرع الشمالي", area: "المنطقة الثالثة", clinic: "عيادة الجلدية", month: m, drug: "كريم ميبو", category: "مراهم", qty: 90, cases: 80, cost: 1800 }
            );
          } else if (ds === "monthly_totals") {
            data.push(
              { branch: "الفرع الرئيسي", area: "المنطقة الأولى", clinic: "عيادة الباطنية", month: m, free_authority: 15000, free_students: 8000, free_infants: 3000, free_women: 1500, supported_authority: 22000, supported_students: 11000, supported_infants: 4000, total_free: 27500, total_supported: 37000, total_cost: 64500 },
              { branch: "الفرع الرئيسي", area: "المنطقة الأولى", clinic: "عيادة الأطفال", month: m, free_authority: 11000, free_students: 6000, free_infants: 9000, free_women: 2000, supported_authority: 18000, supported_students: 7000, supported_infants: 12000, total_free: 28000, total_supported: 37000, total_cost: 65000 },
              { branch: "الفرع الرئيسي", area: "المنطقة الثانية", clinic: "عيادة الأسنان", month: m, free_authority: 5000, free_students: 3000, free_infants: 1000, free_women: 500, supported_authority: 14000, supported_students: 6000, supported_infants: 2000, total_free: 9500, total_supported: 22000, total_cost: 31500 }
            );
          } else if (ds === "insulin") {
            data.push(
              { branch: "الفرع الرئيسي", area: "المنطقة الأولى", clinic: "عيادة الباطنية", month: m, insulin: "إنسولين لانتوس", type: "قلم", category: "إنسولين معكر", qty: 80, cases: 60, cost: 9800 },
              { branch: "الفرع الرئيسي", area: "المنطقة الأولى", clinic: "عيادة الباطنية", month: m, insulin: "إنسولين هيمولين ر", type: "حقن", category: "إنسولين مائي", qty: 120, cases: 95, cost: 6100 },
              { branch: "الفرع الرئيسي", area: "المنطقة الثانية", clinic: "عيادة الأسنان", month: m, insulin: "إنسولين لانتوس", type: "قلم", category: "إنسولين معكر", qty: 30, cases: 25, cost: 3675 }
            );
          } else if (ds === "judicial") {
            data.push(
              { branch: "الفرع الرئيسي", area: "المنطقة الأولى", clinic: "عيادة الباطنية", month: m, patient: "أحمد محمد علي", diagnosis: "فشل كلوي", medicine: "دواء قضائي 1", qty: 15, cost: 3500 },
              { branch: "الفرع الرئيسي", area: "المنطقة الأولى", clinic: "عيادة الباطنية", month: m, patient: "منى محمود حسن", diagnosis: "تصلب متعدد", medicine: "دواء قضائي 2", qty: 30, cost: 12500 },
              { branch: "الفرع الرئيسي", area: "المنطقة الثانية", clinic: "عيادة الأسنان", month: m, patient: "خالد عبد الله", diagnosis: "سرطان دم", medicine: "دواء قضائي 3", qty: 10, cost: 8900 }
            );
          } else if (ds === "supplies") {
            data.push(
              { branch: "الفرع الرئيسي", area: "المنطقة الأولى", clinic: "عيادة الباطنية", month: m, supply: "سرنجات 5سم", category: "مستهلكات", consumer_val: 1200, collective_val: 1800, total_val: 3000 },
              { branch: "الفرع الرئيسي", area: "المنطقة الأولى", clinic: "عيادة الباطنية", month: m, supply: "شاش طبي", category: "شاش وقطن", consumer_val: 600, collective_val: 400, total_val: 1000 },
              { branch: "الفرع الرئيسي", area: "المنطقة الأولى", clinic: "عيادة الأطفال", month: m, supply: "سرنجات 3سم", category: "مستهلكات", consumer_val: 900, collective_val: 1200, total_val: 2100 }
            );
          } else if (ds === "medical_tickets") {
            data.push(
              { branch: "الفرع الرئيسي", area: "المنطقة الأولى", clinic: "عيادة الباطنية", month: m, category: "باطنية", period: "صباحي", tickets_56b: 350, tickets_56c: 210, total_tickets: 560 },
              { branch: "الفرع الرئيسي", area: "المنطقة الأولى", clinic: "عيادة الباطنية", month: m, category: "باطنية", period: "مسائي", tickets_56b: 150, tickets_56c: 120, total_tickets: 270 },
              { branch: "الفرع الرئيسي", area: "المنطقة الأولى", clinic: "عيادة الأطفال", month: m, category: "أطفال", period: "صباحي", tickets_56b: 400, tickets_56c: 180, total_tickets: 580 }
            );
          }
        }
        return data;
      }

    default:
      console.warn(`[Tauri Mock] Command not found: ${cmd}`);
      return { success: true };
  }
}

export default invoke;
