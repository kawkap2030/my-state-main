use rusqlite::Connection;

fn main() {
    let conn = Connection::open(\"target/debug/medicine_dispenser.db\").unwrap();
    let tables = vec![
        \"detailed_drug_dispensed\",
        \"drug_groups\",
        \"insulin_dispensed\",
        \"judicial_dispensed\",
        \"medical_tickets\",
        \"monthly_drugs_dispensed\",
        \"monthly_supplies_dispensed\",
    ];
    let mut all_months = std::collections::HashSet::new();

    for table in tables {
        let query = format!(\"SELECT DISTINCT dispense_month FROM {} WHERE dispense_month IS NOT NULL AND dispense_month != ''\", table);
        if let Ok(mut stmt) = conn.prepare(&query) {
            if let Ok(rows) = stmt.query_map([], |row| row.get::<_, String>(0)) {
                for row in rows {
                    if let Ok(raw_month) = row {
                        println!(\"Found raw month in {}: '{}'\", table, raw_month);
                        let cleaned = raw_month.trim().replace('/', \"-\");
                        let parts: Vec<&str> = cleaned.split('-').collect();
                        if parts.len() >= 2 {
                            let year = parts[0];
                            let month = parts[1];
                            if year.len() == 4 && (month.len() == 1 || month.len() == 2) {
                                let m_num = month.parse::<i32>().unwrap_or(0);
                                if m_num >= 1 && m_num <= 12 {
                                    let normalized = format!(\"{}-{:02}\", year, m_num);
                                    all_months.insert(normalized);
                                }
                            }
                        }
                    } else {
                        println!(\"Failed to read raw month as string in {}\", table);
                    }
                }
            } else {
                println!(\"Failed to query_map for {}\", table);
            }
        } else {
            println!(\"Failed to prepare query for {}\", table);
        }
    }
    
    println!(\"Final months: {:?}\", all_months);
}
