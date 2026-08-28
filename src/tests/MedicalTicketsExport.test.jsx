import { describe, it, expect } from 'vitest';
import { extractCellValue, buildDataMatrix } from '../utils/exportHelpers';

describe('Medical Tickets Export & Aggregation Engine', () => {
  const supportedCategories = ['هيئة', 'طلاب', 'رضع'];

  const ownedExportColumns = [
    { header: 'العيادة/الجهة', accessor: 'name' },
    { header: 'الصنف', accessor: 'category' },
    { header: 'أسبوع 1 - 56ب', accessor: 'w1_56b' },
    { header: 'أسبوع 1 - 56ج', accessor: 'w1_56c' },
    { header: 'أسبوع 2 - 56ب', accessor: 'w2_56b' },
    { header: 'أسبوع 2 - 56ج', accessor: 'w2_56c' },
    { header: 'أسبوع 3 - 56ب', accessor: 'w3_56b' },
    { header: 'أسبوع 3 - 56ج', accessor: 'w3_56c' },
    { header: 'أسبوع 4 - 56ب', accessor: 'w4_56b' },
    { header: 'أسبوع 4 - 56ج', accessor: 'w4_56c' },
    { header: 'إجمالي 56ب', accessor: 'total_56b' },
    { header: 'إجمالي 56ج', accessor: 'total_56c' },
  ];

  const supportedExportColumns = [
    { header: 'العيادة/الجهة', accessor: 'name' },
    ...([1, 2, 3, 4].flatMap(w => supportedCategories.map(c => ({ header: `أسبوع ${w} - ${c}`, accessor: `w${w}_${c}` })))),
    ...supportedCategories.map(c => ({ header: `إجمالي ${c}`, accessor: `total_${c}` })),
    { header: 'الإجمالي العام', accessor: 'total' },
  ];

  it('aggregates owned tickets correctly without zeroing data', () => {
    const mockOwnedRecords = [
      { clinic_id: 1, clinic_name: 'عيادة مدينة نصر', category: 'عام', week_number: 1, ticket_56b_count: 50, ticket_56c_count: 20, is_supported_clinic: 0 },
      { clinic_id: 1, clinic_name: 'عيادة مدينة نصر', category: 'عام', week_number: 2, ticket_56b_count: 45, ticket_56c_count: 15, is_supported_clinic: 0 },
      { clinic_id: 1, clinic_name: 'عيادة مدينة نصر', category: 'عام', week_number: 3, ticket_56b_count: 60, ticket_56c_count: 30, is_supported_clinic: 0 },
      { clinic_id: 1, clinic_name: 'عيادة مدينة نصر', category: 'عام', week_number: 4, ticket_56b_count: 40, ticket_56c_count: 10, is_supported_clinic: 0 },
    ];

    const aggregatedRow = {
      id: 'clinic_1',
      name: 'عيادة مدينة نصر',
      category: 'عام',
      total_56b: 0,
      total_56c: 0,
    };

    [1, 2, 3, 4].forEach((w) => {
      const weekRecs = mockOwnedRecords.filter((r) => r.week_number === w);
      const w56b = weekRecs.reduce((sum, r) => sum + r.ticket_56b_count, 0);
      const w56c = weekRecs.reduce((sum, r) => sum + r.ticket_56c_count, 0);
      aggregatedRow[`w${w}_56b`] = w56b;
      aggregatedRow[`w${w}_56c`] = w56c;
      aggregatedRow.total_56b += w56b;
      aggregatedRow.total_56c += w56c;
    });

    expect(aggregatedRow.w1_56b).toBe(50);
    expect(aggregatedRow.w1_56c).toBe(20);
    expect(aggregatedRow.w2_56b).toBe(45);
    expect(aggregatedRow.w3_56b).toBe(60);
    expect(aggregatedRow.w4_56b).toBe(40);
    expect(aggregatedRow.total_56b).toBe(195);
    expect(aggregatedRow.total_56c).toBe(75);

    // Test matrix extraction
    const { headers, rows } = buildDataMatrix([aggregatedRow], ownedExportColumns);
    expect(headers).toHaveLength(12);
    expect(rows[0]).toEqual([
      'عيادة مدينة نصر',
      'عام',
      '50',
      '20',
      '45',
      '15',
      '60',
      '30',
      '40',
      '10',
      '195',
      '75',
    ]);
  });

  it('aggregates supported tickets correctly across categories', () => {
    const mockSupportedRecords = [
      { clinic_id: 2, clinic_name: 'عيادة المعادي التخصصية', category: 'هيئة', week_number: 1, ticket_56b_count: 10, ticket_56c_count: 5, is_supported_clinic: 1 },
      { clinic_id: 2, clinic_name: 'عيادة المعادي التخصصية', category: 'طلاب', week_number: 1, ticket_56b_count: 20, ticket_56c_count: 0, is_supported_clinic: 1 },
      { clinic_id: 2, clinic_name: 'عيادة المعادي التخصصية', category: 'رضع', week_number: 1, ticket_56b_count: 5, ticket_56c_count: 5, is_supported_clinic: 1 },
      { clinic_id: 2, clinic_name: 'عيادة المعادي التخصصية', category: 'هيئة', week_number: 2, ticket_56b_count: 15, ticket_56c_count: 5, is_supported_clinic: 1 },
    ];

    const data = { id: 'clinic_2', name: 'عيادة المعادي التخصصية', total: 0 };
    [1, 2, 3, 4].forEach((w) => {
      const weekRecs = mockSupportedRecords.filter((r) => r.week_number === w);
      supportedCategories.forEach((cat) => {
        const catRecs = weekRecs.filter((r) => r.category === cat);
        const sum = catRecs.reduce((acc, curr) => acc + curr.ticket_56b_count + curr.ticket_56c_count, 0);
        data[`w${w}_${cat}`] = sum;
        data.total += sum;
        data[`total_${cat}`] = (data[`total_${cat}`] || 0) + sum;
      });
    });

    expect(data.w1_هيئة).toBe(15);
    expect(data.w1_طلاب).toBe(20);
    expect(data.w1_رضع).toBe(10);
    expect(data.w2_هيئة).toBe(20);
    expect(data.w2_طلاب).toBe(0);
    expect(data.w2_رضع).toBe(0);
    expect(data.total_هيئة).toBe(35);
    expect(data.total_طلاب).toBe(20);
    expect(data.total_رضع).toBe(10);
    expect(data.total).toBe(65);

    const { headers, rows } = buildDataMatrix([data], supportedExportColumns);
    expect(headers).toHaveLength(17);
    expect(rows[0][0]).toBe('عيادة المعادي التخصصية');
    expect(rows[0][1]).toBe('15'); // w1_هيئة
    expect(rows[0][2]).toBe('20'); // w1_طلاب
    expect(rows[0][3]).toBe('10'); // w1_رضع
    expect(rows[0][13]).toBe('35'); // total_هيئة
    expect(rows[0][14]).toBe('20'); // total_طلاب
    expect(rows[0][15]).toBe('10'); // total_رضع
    expect(rows[0][16]).toBe('65'); // total
  });

  it('handles empty/zero cells properly without NaN or missing strings', () => {
    const emptyRow = {
      name: 'عيادة تجريبية',
      category: 'عام',
      w1_56b: 0,
      w1_56c: 0,
      w2_56b: 0,
      w2_56c: 0,
      w3_56b: 0,
      w3_56c: 0,
      w4_56b: 0,
      w4_56c: 0,
      total_56b: 0,
      total_56c: 0,
    };

    const val = extractCellValue(emptyRow, ownedExportColumns[2]);
    expect(val).toBe(0);

    const { rows } = buildDataMatrix([emptyRow], ownedExportColumns);
    expect(rows[0][2]).toBe('0');
    expect(rows[0][10]).toBe('0');
  });
});
